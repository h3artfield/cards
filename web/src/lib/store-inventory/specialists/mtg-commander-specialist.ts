import { callOpenAiJson } from "../../card-flow-v2/openai-json";
import {
  commanderNameToSlug,
  fetchEdhrecCommanderMeta,
} from "../../deck-builder/edhrec-client";
import { runDeckBuildStep } from "../commander-deck-build-service";
import {
  discoverInStockCommanders,
  formatCommanderPickAnswer,
} from "../clerk-tools/commander-recommendations";
import {
  isConcreteCommanderName,
  parseCommanderFromMessage,
  parseCommanderMaxPrice,
} from "../clerk-tools/commander-context";
import {
  resolveDeckBuildRequest,
} from "../resolved-clerk-request";
import type { CommanderEntityCandidate } from "../entity-candidate-resolution";
import {
  parseCommanderMaxPriceFromConversation,
} from "../clerk-tools/deck-build-context";
import { isExplicitDeckBuildRequest } from "../clerk-tools/clerk-intent";
import {
  buildInventoryNameIndex,
  findInventoryExactMatch,
  findInventoryMatch,
  parseColorFromQuestion,
} from "../clerk-tools/magic-commander-inventory";
import { resolveInventoryOracleId } from "../inventory-oracle-resolver";
import { MTG_COMMANDER_AGENT_PERSONA } from "../knowledge/mtg-commander-agent";
import type {
  ClerkOrchestratorContext,
  ClerkRouterResult,
  SpecialistResponse,
} from "../clerk-types";
import type { ClerkToolResults } from "../clerk-tools";
import type { VerifierRevisionContext } from "../clerk-verifier";
import type { StoreInventoryCard } from "../../deck-builder/store-inventory-browse";

function parseMaxPriceFromQuestion(q: string): number | undefined {
  const patterns = [
    /\bunder\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
    /\bunder\s+(\d+(?:\.\d{2})?)\s*\$/i,
    /\bbelow\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
    /\bfor\s+under\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
  ];
  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match?.[1]) return Number.parseFloat(match[1]);
  }
  return undefined;
}

function resolveCommanderName(
  ctx: ClerkOrchestratorContext,
  route: ClerkRouterResult,
  deckBuildOnly: boolean,
): string | undefined {
  const candidates = [
    route.entities.commander,
    route.entities.featured_card,
    route.entities.card_names[0],
    parseCommanderFromMessage({
      question: ctx.user_question,
      conversationSummary: ctx.conversation_summary,
      deckBuildOnly,
    }),
  ];

  for (const candidate of candidates) {
    if (candidate && isConcreteCommanderName(candidate)) return candidate;
  }
  return undefined;
}

function unitPrice(c: StoreInventoryCard): number | undefined {
  const p = c.listPrice ?? c.tcgLowPrice;
  return p != null && p > 0 ? p : undefined;
}

function toRecommendation(
  pick: Awaited<ReturnType<typeof discoverInStockCommanders>>[number],
) {
  return {
    card_name: pick.card.name,
    scryfallId: pick.card.scryfallId,
    inventoryItemId: pick.card.inventoryItemId,
    qty: pick.card.qty,
    price: unitPrice(pick.card),
    reason: pick.reason,
    imageProxyUrl: pick.card.imageProxyUrl,
    colorIdentity: pick.colorIdentity,
  };
}

function formatAmbiguousCandidates(candidates: CommanderEntityCandidate[]): string {
  const lines = candidates.slice(0, 6).map((c, i) => {
    const colors =
      c.colorIdentity.length > 0 ? ` [${c.colorIdentity.join("")}]` : "";
    return `${i + 1}. **${c.canonicalName}**${colors} — ${c.identifyingText}`;
  });
  return lines.join("\n");
}

async function recommendThemedCommanders(input: {
  ctx: ClerkOrchestratorContext;
  storeId: string;
  inventory: StoreInventoryCard[];
  maxPrice?: number;
  themeLabel?: string;
}): Promise<SpecialistResponse> {
  const color = parseColorFromQuestion(input.ctx.user_question);
  const picks = await discoverInStockCommanders({
    storeId: input.storeId,
    storeSlug: input.ctx.storeSlug,
    inventory: input.inventory,
    color,
    maxPrice: input.maxPrice,
    limit: 10,
    allowLiveEdhrec: true,
  });

  const themeNote = input.themeLabel
    ? ` for a **${input.themeLabel}** deck`
    : "";

  return {
    direct_answer:
      picks.length > 0
        ? `Here are commander options${themeNote} from stock — pick one and I'll build the 99:\n\n${formatCommanderPickAnswer({ picks, color, maxPrice: input.maxPrice })}`
        : `I couldn't find in-stock commanders${themeNote}. Name a specific commander or broaden your search.`,
    recommendations: picks
      .map((pick) => {
        const oracleId = pick.card.oracleId?.trim();
        if (!oracleId) return null;
        return {
          ...toRecommendation(pick),
          oracleId,
        };
      })
      .filter(Boolean) as SpecialistResponse["recommendations"],
    inventory_queries: [],
    missing_information: picks.length > 0 ? ["commander choice"] : ["commander in stock"],
    warnings: [],
    confidence: picks.length > 0 ? 0.85 : 0.45,
  };
}

async function buildCommanderDeckResponse(input: {
  ctx: ClerkOrchestratorContext;
  commanderOracleId: string;
  budget?: number;
}): Promise<SpecialistResponse> {
  let session: Awaited<ReturnType<typeof runDeckBuildStep>>["session"] | undefined;
  let step: Awaited<ReturnType<typeof runDeckBuildStep>>;

  do {
    step = await runDeckBuildStep({
      storeId: input.ctx.storeId,
      storeSlug: input.ctx.storeSlug,
      message: input.ctx.user_question,
      conversationSummary: input.ctx.conversation_summary,
      budget: input.budget,
      session,
    });
    session = step.session;
  } while (!step.complete);

  const deckList = step.deckList;

  const completeNote = deckList.complete
    ? "This is a validated 100-card Commander list (1 commander + 99 maindeck) using only cards we have in stock."
    : `Partial list — ${deckList.mainDeckCount ?? 0}/99 maindeck cards from stock. Missing pieces are marked below.`;

  const validationNote =
    deckList.validationIssues && deckList.validationIssues.length > 0
      ? `\n\nValidation notes: ${deckList.validationIssues.slice(0, 3).join("; ")}`
      : "";

  const direct_answer = `${deckList.strategy}

${completeNote} Store total for in-stock cards: $${deckList.deckTotal.toFixed(2)}.${validationNote}`;

  const recommendations = deckList.lines
    .filter((l) => l.oracleId && l.inventoryItemId)
    .slice(0, 12)
    .map((l) => ({
      card_name: l.name,
      oracleId: l.oracleId,
      scryfallId: l.scryfallId,
      inventoryItemId: l.inventoryItemId,
      qty: l.qty,
      price: l.listPrice,
      reason: l.substituteNote ?? l.slot,
      imageProxyUrl: l.imageProxyUrl,
    }));

  return {
    direct_answer,
    recommendations,
    inventory_queries: [
      {
        card_name: deckList.commanderCanonicalName ?? deckList.archetype,
        quantity_needed: 1,
      },
    ],
    missing_information: deckList.complete ? [] : ["some deck slots"],
    warnings: deckList.missingSlots,
    confidence: deckList.complete ? 0.92 : 0.7,
    deckList,
    commanderOracleId: input.commanderOracleId,
    resolvedRequestId: session.resolvedRequestId,
  };
}

async function answerFromInventoryTools(input: {
  ctx: ClerkOrchestratorContext;
  route: ClerkRouterResult;
  inventory: StoreInventoryCard[];
}): Promise<SpecialistResponse | null> {
  if (input.inventory.length === 0) return null;

  const payload = {
    customer_question: input.ctx.user_question,
    route: {
      format: input.route.format,
      intent: input.route.intent,
      constraints: input.route.constraints,
    },
    inventory: input.inventory.slice(0, 40).map((c) => ({
      inventoryItemId: c.inventoryItemId,
      name: c.name,
      qty: c.qty,
      price: c.listPrice ?? c.tcgLowPrice,
      setName: c.setName,
      colorIdentity: c.colorIdentity,
      typeLine: c.typeLine,
      cmc: c.cmc,
      oracleTags: c.oracleTags,
      keywords: c.keywords,
      isCommander: c.isCommander,
    })),
    inventory_total: input.inventory.length,
  };

  const raw = await callOpenAiJson<{
    direct_answer?: string;
    recommendations?: Array<{
      card_name?: string;
      inventoryItemId?: string;
      qty?: number;
      price?: number;
      reason?: string;
    }>;
    missing_information?: string[];
    warnings?: string[];
    confidence?: number;
  }>(MTG_COMMANDER_AGENT_PERSONA, [
    { type: "text", text: JSON.stringify(payload, null, 2) },
  ]);

  const byId = new Map(input.inventory.map((c) => [c.inventoryItemId, c]));
  const recommendations = (
    await Promise.all(
      (raw.recommendations ?? []).map(async (rec) => {
        const pool = rec.inventoryItemId ? byId.get(rec.inventoryItemId) : undefined;
        if (!pool) return null;

        let oracleId = pool.oracleId?.trim();
        if (!oracleId) {
          const resolved = await resolveInventoryOracleId({
            id: pool.inventoryItemId,
            storeId: input.ctx.storeId,
            displayName: pool.name,
            acquiredAt: "",
            category: "magic",
            setName: pool.setName,
            cardNumber: pool.cardNumber,
            catalogScryfallId: pool.scryfallId,
          });
          oracleId = resolved.oracleId;
        }
        if (!oracleId) return null;

        return {
          card_name: pool.name,
          oracleId,
          scryfallId: pool.scryfallId,
          inventoryItemId: pool.inventoryItemId,
          qty: Math.min(rec.qty ?? 1, pool.qty),
          price: pool.listPrice ?? rec.price,
          reason: rec.reason ?? "Matches your request",
          imageProxyUrl: pool.imageProxyUrl,
          colorIdentity: pool.colorIdentity,
        };
      }),
    )
  ).filter(Boolean) as SpecialistResponse["recommendations"];

  if (!raw.direct_answer?.trim() && recommendations.length === 0) return null;

  return {
    direct_answer:
      raw.direct_answer?.trim() ??
      `I found ${input.inventory.length} matching cards in stock.`,
    recommendations,
    inventory_queries: [],
    missing_information: raw.missing_information ?? [],
    warnings: raw.warnings ?? [],
    confidence: raw.confidence ?? 0.85,
  };
}

export async function runMtgCommanderSpecialist(input: {
  ctx: ClerkOrchestratorContext;
  route: ClerkRouterResult;
  tools: ClerkToolResults;
  verifierRevision?: VerifierRevisionContext;
}): Promise<SpecialistResponse> {
  const { route, tools, ctx, verifierRevision } = input;
  const inventory =
    tools.inventoryMatchPool?.length
      ? tools.inventoryMatchPool
      : tools.inventoryByName;
  const maxPrice =
    route.constraints.max_price ??
    route.constraints.budget ??
    parseMaxPriceFromQuestion(ctx.user_question);
  const commanderMaxPrice =
    parseCommanderMaxPriceFromConversation({
      question: ctx.user_question,
      conversationSummary: ctx.conversation_summary,
    }) ?? parseCommanderMaxPrice(ctx.user_question);
  const deckBudget =
    route.constraints.budget ??
    (commanderMaxPrice ? undefined : maxPrice);
  const explicitDeckBuild = isExplicitDeckBuildRequest(
    ctx.user_question,
    ctx.conversation_summary,
  );
  const commanderName = resolveCommanderName(
    ctx,
    route,
    route.intent === "build_deck" || explicitDeckBuild,
  );
  const forceDeckBuild =
    verifierRevision?.instructions.some(
      (i) =>
        i.includes("99 maindeck") ||
        i.includes("complete deck") ||
        i.includes("100-card"),
    ) ?? false;

  if ((route.intent === "build_deck" || forceDeckBuild) && explicitDeckBuild) {
    const resolution = await resolveDeckBuildRequest({
      question: ctx.user_question,
      conversationSummary: ctx.conversation_summary,
      storeId: ctx.storeId,
      storeSlug: ctx.storeSlug,
      budget: deckBudget,
    });

    if (
      resolution.failureCode === "alternatives_required" &&
      resolution.resolved.commanderSelectionPolicy === "user_must_choose"
    ) {
      const theme =
        resolution.resolved.entities.archetypes.join(", ") || "themed";
      return recommendThemedCommanders({
        ctx,
        storeId: ctx.storeId,
        inventory,
        maxPrice,
        themeLabel: theme,
      });
    }

    if (resolution.failureCode === "commander_ambiguous") {
      const candidates = resolution.commanderCandidates ?? [];
      return {
        direct_answer:
          resolution.failureMessage ??
          `Several commanders match your request:\n\n${formatAmbiguousCandidates(candidates)}`,
        recommendations: candidates.slice(0, 6).map((c) => ({
          card_name: c.canonicalName,
          oracleId: c.oracleId,
          scryfallId: c.scryfallId,
          reason: c.identifyingText,
          colorIdentity: c.colorIdentity,
        })),
        inventory_queries: [],
        missing_information: ["commander choice"],
        warnings: [],
        confidence: 0.7,
      };
    }

    if (resolution.failureMessage && !resolution.commanderOracleId) {
      const budgetNote =
        commanderMaxPrice != null ? ` under $${commanderMaxPrice}` : "";
      const unresolved =
        resolution.failureCode === "requested_commander_unresolved";
      return {
        direct_answer:
          resolution.failureMessage ??
          (unresolved
            ? "The requested commander could not be canonically verified. Please check the spelling or try another name."
            : `I couldn't find a legal commander in stock${budgetNote} that fits your request.`),
        recommendations: [],
        inventory_queries: [],
        missing_information: unresolved
          ? ["canonical commander identity"]
          : ["commander in stock"],
        warnings: [],
        confidence: 0.45,
      };
    }

    if (!resolution.commanderOracleId) {
      return {
        direct_answer:
          "The requested commander could not be canonically verified (no Oracle ID). I can't build a deck until the commander identity is confirmed.",
        recommendations: [],
        inventory_queries: [],
        missing_information: ["canonical commander identity"],
        warnings: [],
        confidence: 0.4,
      };
    }

    const previewNote =
      resolution.deckBuildMode === "preview_theorycraft"
        ? `\n\n${resolution.resolved.strategySummary ?? ""}`
        : "";

    const deckResponse = await buildCommanderDeckResponse({
      ctx,
      commanderOracleId: resolution.commanderOracleId,
      budget: deckBudget,
    });

    if (previewNote.trim()) {
      deckResponse.direct_answer = `${previewNote.trim()}\n\n${deckResponse.direct_answer}`;
    }

    return deckResponse;
  }

  if (route.intent === "recommendation" && !route.entities.commander) {
    return recommendThemedCommanders({
      ctx,
      storeId: ctx.storeId,
      inventory,
      maxPrice,
    });
  }

  if (commanderName && route.intent === "recommendation") {
    const index = buildInventoryNameIndex(inventory);
    const inStockCommander = findInventoryExactMatch(index, commanderName)
      ?? findInventoryMatch(index, commanderName);

    if (!inStockCommander) {
      const slug = commanderNameToSlug(commanderName);
      const meta = await fetchEdhrecCommanderMeta(slug);
      if (!meta) {
        return {
          direct_answer: `I couldn't find EDHREC data for ${commanderName}. Try another name or ask what's in stock.`,
          recommendations: [],
          inventory_queries: [],
          missing_information: [],
          warnings: [],
          confidence: 0.4,
        };
      }
    }
  }

  if (route.intent === "build_deck" && !explicitDeckBuild) {
    return {
      direct_answer:
        "I can help you find specific cards in stock. If you want a full 100-card list built from inventory, say “build me a complete Commander deck around [commander]”.",
      recommendations: [],
      inventory_queries: [],
      missing_information: [],
      warnings: [],
      confidence: 0.8,
    };
  }

  if (route.intent === "build_deck") {
    return recommendThemedCommanders({
      ctx,
      storeId: ctx.storeId,
      inventory,
      maxPrice,
    });
  }

  if (
    route.intent === "inventory_lookup" ||
    route.intent === "price_check" ||
    tools.inventoryByName.length > 0
  ) {
    const inventoryAnswer = await answerFromInventoryTools({
      ctx,
      route,
      inventory: tools.inventoryByName.length ? tools.inventoryByName : inventory,
    });
    if (inventoryAnswer) return inventoryAnswer;
  }

  return {
    direct_answer: "Happy to help with Commander — what are you looking for?",
    recommendations: [],
    inventory_queries: [],
    missing_information: [],
    warnings: [],
    confidence: 0.5,
  };
}
