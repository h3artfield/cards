import { callOpenAiJson } from "../../card-flow-v2/openai-json";
import {
  formatKnowledgeHitsForLlm,
  hybridRetrieveMtgKnowledge,
} from "../../mtg-rag/hybrid-retrieval";
import { isMtgRagEnabled } from "../../mtg-rag/constants";
import type { StoreInventoryCard } from "../../deck-builder/store-inventory-browse";
import { discoverInStockCommanders } from "./commander-recommendations";
import { parseColorFromQuestion } from "./magic-commander-inventory";
import { matchSuggestedCardsInInventory } from "./rag-guided-inventory";
import { translateDeckBuildIntent } from "./deck-build-intent-translator";
import {
  rankThematicCommandersInStock,
  resolveNamedCommanderInStock,
} from "./commander-theme-match";
import { cardCatalogLookupByName } from "./card-catalog";
import {
  buildNoThematicMatchMessage,
  commanderPickFitsIntent,
  hasSpecificDeckBuildIntent,
  offStockCommanderStrategyNote,
  primaryRequestedCardName,
} from "./deck-build-intent-guards";

const DECK_BUILD_PLANNER_PERSONA = `
You plan a Commander deck build for a local game store clerk. The customer wants a full deck built only from in-stock cards.
Output JSON only:
{
  "commanderCandidates": ["Exact Card Name"],
  "strategySummary": "2-3 sentences explaining the game plan"
}

Rules:
- commanderCandidates must be exact English Magic card names (legendary creatures/planeswalkers).
- Pick ONLY from the in-stock commander list provided — never invent names outside that list.
- Rank 1-3 candidates that best fit the customer's translated intent (theme, named commander, strategy).
- Do NOT default to Animar or other generic high-EDHREC picks unless they genuinely fit the theme.
- If none of the in-stock commanders fit the customer's request, return an empty commanderCandidates array.
- strategySummary should explain why the top pick matches what the customer asked for.
`.trim();

export interface DeckBuildPlan {
  commanderName: string;
  strategySummary: string;
  fromRag: boolean;
}

export interface DeckBuildPlanOutcome {
  plan: DeckBuildPlan | null;
  failureMessage?: string;
}

const RAG_PLAN_TIMEOUT_MS = 12_000;

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function unitPrice(c: StoreInventoryCard): number | undefined {
  const p = c.listPrice ?? c.tcgLowPrice;
  return p != null && p > 0 ? p : undefined;
}

function themeScoreForPick(
  pick: { card: StoreInventoryCard; themeScore?: number },
): number {
  return typeof pick.themeScore === "number" ? pick.themeScore : 0;
}

async function resolvePrimaryOffStockPlan(
  intent: Awaited<ReturnType<typeof translateDeckBuildIntent>>,
): Promise<DeckBuildPlan | null> {
  const requestedName = primaryRequestedCardName(intent);
  if (!requestedName) return null;

  const catalog = await cardCatalogLookupByName(requestedName);
  if (catalog && catalog.canBeSoleCommander === false) return null;

  const commanderName = catalog?.name ?? requestedName;
  return {
    commanderName,
    strategySummary: `${intent.strategySummary}\n\n${offStockCommanderStrategyNote(commanderName)}`,
    fromRag: true,
  };
}

async function resolveSuggestedOffStockPlan(
  intent: Awaited<ReturnType<typeof translateDeckBuildIntent>>,
): Promise<DeckBuildPlan | null> {
  for (const name of intent.suggestedCommanders.slice(0, 5)) {
    const catalog = await cardCatalogLookupByName(name);
    if (catalog?.canBeSoleCommander) {
      return {
        commanderName: catalog.name,
        strategySummary: `${intent.strategySummary}\n\n${offStockCommanderStrategyNote(catalog.name)}`,
        fromRag: true,
      };
    }
  }
  return null;
}

/** Intent-aware commander selection for deck builds (themes, named commanders, featured cards). */
export async function planCommanderForDeckBuild(input: {
  question: string;
  conversationSummary: string;
  storeId: string;
  storeSlug: string;
  commanderMaxPrice?: number;
  preferPowerful?: boolean;
}): Promise<DeckBuildPlanOutcome> {
  const intent = await translateDeckBuildIntent({
    question: input.question,
    conversationSummary: input.conversationSummary,
  });

  const color =
    intent.colorHints.length === 1
      ? (intent.colorHints[0] as ReturnType<typeof parseColorFromQuestion>)
      : parseColorFromQuestion(input.question);

  for (const name of [
    intent.namedCommander,
    intent.featuredCard,
    ...intent.suggestedCommanders.slice(0, 3),
  ].filter(Boolean) as string[]) {
    const resolved = await resolveNamedCommanderInStock({
      name,
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      maxPrice: input.commanderMaxPrice,
    });
    if (resolved) {
      return {
        plan: {
          commanderName: resolved.card.name,
          strategySummary: intent.strategySummary,
          fromRag: true,
        },
      };
    }
  }

  if (primaryRequestedCardName(intent)) {
    const primaryPlan = await resolvePrimaryOffStockPlan(intent);
    if (primaryPlan) {
      return { plan: primaryPlan };
    }
  }

  const thematic = await rankThematicCommandersInStock({
    intent,
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    color,
    maxPrice: input.commanderMaxPrice,
    limit: 15,
  });

  const specificIntent = hasSpecificDeckBuildIntent(intent);

  if (specificIntent && thematic.length === 0) {
    return {
      plan: null,
      failureMessage: buildNoThematicMatchMessage(intent),
    };
  }

  const inStockPicks = specificIntent
    ? thematic
    : thematic.length > 0
      ? thematic
      : await discoverInStockCommanders({
          storeId: input.storeId,
          storeSlug: input.storeSlug,
          color,
          maxPrice: input.commanderMaxPrice,
          limit: input.preferPowerful ? 20 : 15,
          allowLiveEdhrec: false,
        });

  if (inStockPicks.length === 0) {
    return {
      plan: null,
      failureMessage: buildNoThematicMatchMessage(intent),
    };
  }

  const stockList = inStockPicks
    .map((pick) => {
      const price = unitPrice(pick.card);
      const themeScore = themeScoreForPick(pick);
      const themeNote =
        themeScore > 0 ? ` · theme fit score ${themeScore}` : "";
      return `- ${pick.card.name}${price != null ? ` ($${price.toFixed(2)})` : ""} — ${pick.reason}${themeNote}`;
    })
    .join("\n");

  let commanderCandidates: string[] = [];
  let strategySummary = intent.strategySummary;

  const llmPlan = await withTimeout(
    (async () => {
      let knowledgeBlock = "";
      if (isMtgRagEnabled()) {
        const rag = await hybridRetrieveMtgKnowledge({
          question: `${intent.userGoal}\n${intent.researchQueries.join(" ")}`,
          intent: "commander_strategy",
          limit: 4,
        });
        if (rag.hits.length > 0) {
          knowledgeBlock = formatKnowledgeHitsForLlm(rag.hits);
        }
      }

      return callOpenAiJson<{
        commanderCandidates?: string[];
        strategySummary?: string;
      }>(DECK_BUILD_PLANNER_PERSONA, [
        {
          type: "text",
          text: [
            `Customer goal: ${intent.userGoal}`,
            intent.namedCommander
              ? `Named commander: ${intent.namedCommander}`
              : "",
            intent.featuredCard ? `Featured card: ${intent.featuredCard}` : "",
            intent.themeKeywords.length
              ? `Themes: ${intent.themeKeywords.join(", ")}`
              : "",
            intent.setOrProduct ? `Set/product: ${intent.setOrProduct}` : "",
            input.commanderMaxPrice != null
              ? `Commander price limit: under $${input.commanderMaxPrice}`
              : "",
            input.preferPowerful
              ? "Customer wants a powerful / optimized commander pick."
              : "",
            intent.suggestedCommanders.length
              ? `Research suggests these commanders: ${intent.suggestedCommanders.join(", ")}`
              : "",
            "",
            "In-stock commanders (choose from this list only):",
            stockList,
            knowledgeBlock ? `\nRetrieved knowledge:\n${knowledgeBlock}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ]);
    })(),
    RAG_PLAN_TIMEOUT_MS,
  );

  if (llmPlan) {
    commanderCandidates = (llmPlan.commanderCandidates ?? [])
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 5);
    strategySummary = llmPlan.strategySummary?.trim() || strategySummary;
  } else if (intent.suggestedCommanders.length > 0 && !specificIntent) {
    commanderCandidates = intent.suggestedCommanders.slice(0, 5);
  }

  if (commanderCandidates.length > 0) {
    const pool = inStockPicks.map((p) => p.card);
    const matched = matchSuggestedCardsInInventory({
      suggestedNames: commanderCandidates,
      pool,
    })[0];
    if (matched) {
      const matchedPick = inStockPicks.find(
        (p) => p.card.inventoryItemId === matched.inventoryItemId,
      );
      const themeScore = matchedPick ? themeScoreForPick(matchedPick) : 0;
      if (
        commanderPickFitsIntent({
          commanderName: matched.name,
          intent,
          themeScore,
        })
      ) {
        return {
          plan: {
            commanderName: matched.name,
            strategySummary:
              strategySummary ||
              `Building around ${matched.name} for ${intent.themeKeywords.join(", ") || "your request"}.`,
            fromRag: true,
          },
        };
      }
    }
  }

  if (thematic.length > 0) {
    const best = thematic[0]!;
    return {
      plan: {
        commanderName: best.card.name,
        strategySummary:
          strategySummary ||
          `${best.card.name} is our best in-stock match for ${intent.themeKeywords.join(", ") || intent.userGoal} — ${best.reason}.`,
        fromRag: true,
      },
    };
  }

  if (specificIntent) {
    const suggestedPlan = await resolveSuggestedOffStockPlan(intent);
    if (suggestedPlan) {
      return { plan: suggestedPlan };
    }
  }

  return {
    plan: null,
    failureMessage: buildNoThematicMatchMessage(intent),
  };
}
