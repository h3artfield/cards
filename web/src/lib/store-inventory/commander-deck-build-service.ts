import {
  commanderNameToSlug,
  fetchEdhrecCommanderMeta,
} from "../deck-builder/edhrec-client";
import { validateCommanderDeck } from "../deck-builder/commander-validation";
import type { CatalogCard, StoreDeckCard } from "../deck-builder/types";
import { isMtgRagEnabled } from "../mtg-rag/constants";
import { hybridRetrieveMtgKnowledge } from "../mtg-rag/hybrid-retrieval";
import type { ClerkDeckList } from "./clerk-types";
import {
  isExplicitDeckBuildRequest,
} from "./clerk-tools/clerk-intent";
import {
  deckBudgetNote,
  parseDeckMaxPriceFromConversation,
} from "./clerk-tools/deck-build-context";
import { resolveDeckBuildRequest } from "./resolved-clerk-request";
import {
  runCommanderDeckBuildStage,
} from "./clerk-tools/commander-deck-stages";
import {
  COMMANDER_DECK_BUILD_STAGES,
  createDeckBuildSession,
  type CommanderDeckBuildSession,
} from "./clerk-tools/commander-deck-build-state";
import { cardCatalogLookupByOracleId } from "./clerk-tools/card-catalog";
import { formatEdhrecSampleNote } from "./clerk-tools/commander-eligibility";
import { assessRequestScopedCoverage } from "../deck-builder/catalog-coverage-gates";
import { getCachedStoreInventory } from "../deck-builder/store-inventory-cache";
import { isEnrichableMagicSingle } from "../inventory/magic-items";
import {
  commanderOracleIdRequired,
} from "./commander-oracle-contract";

export interface DeckBuildStepInput {
  storeId: string;
  storeSlug: string;
  message?: string;
  conversationSummary?: string;
  budget?: number;
  strategyPrefix?: string;
  session?: CommanderDeckBuildSession;
}

export interface DeckBuildStepResult {
  session: CommanderDeckBuildSession;
  deckList: ClerkDeckList;
  stageIndex: number;
  stageLabel: string;
  totalStages: number;
  complete: boolean;
  reply: string;
}

function parseBudget(input: {
  message: string;
  conversationSummary?: string;
  explicit?: number;
}): number | undefined {
  if (input.explicit != null && input.explicit > 0) return input.explicit;
  const deckCap = parseDeckMaxPriceFromConversation({
    question: input.message,
    conversationSummary: input.conversationSummary,
  });
  if (deckCap != null) return deckCap;
  const m = input.message.match(/\b(?:under|below|budget|max)\s+\$?\s*(\d+(?:\.\d{2})?)/i);
  return m?.[1] ? Number.parseFloat(m[1]) : undefined;
}

function formatDeckBuildReply(input: {
  commanderName: string;
  deckList: ClerkDeckList;
  complete: boolean;
  stageLabel?: string;
  stageIndex?: number;
  totalStages?: number;
  question: string;
  conversationSummary?: string;
}): string {
  const displayName = input.deckList.commanderCanonicalName ?? input.commanderName;
  const budgetNote = deckBudgetNote({
    question: input.question,
    conversationSummary: input.conversationSummary,
    deckTotal: input.deckList.deckTotal,
  });
  const suffix = budgetNote ? `\n\n${budgetNote}` : "";
  const missing = input.deckList.missingSlots?.length ?? 0;
  const partialNote =
    input.complete && missing > 0
      ? `\n\n${missing} slot${missing === 1 ? "" : "s"} couldn't be filled from current stock — substitutes are marked in the list.`
      : "";

  if (input.complete) {
    return `Built your ${displayName} list — ${input.deckList.mainDeckCount ?? 0}/99 maindeck from stock ($${input.deckList.deckTotal.toFixed(2)}).${partialNote}${suffix}`;
  }
  if (input.stageLabel && input.stageIndex != null && input.totalStages != null) {
    return `Added ${input.stageLabel.toLowerCase()} (${input.stageIndex}/${input.totalStages}) — ${input.deckList.inStockCards} cards so far…${suffix}`;
  }
  return `Done — ${input.deckList.mainDeckCount ?? 0}/99 maindeck cards from stock ($${input.deckList.deckTotal.toFixed(2)}).${suffix}`;
}

async function initSession(input: {
  storeId: string;
  storeSlug: string;
  message: string;
  conversationSummary?: string;
  budget?: number;
}): Promise<CommanderDeckBuildSession> {
  const conversationSummary = input.conversationSummary ?? "";
  const budget = parseBudget({
    message: input.message,
    conversationSummary,
    explicit: input.budget,
  });

  const resolution = await resolveDeckBuildRequest({
    question: input.message,
    conversationSummary,
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    budget,
  });

  if (resolution.failureMessage && !resolution.commanderOracleId) {
    throw new Error(resolution.failureMessage);
  }

  if (!resolution.commanderOracleId) {
    throw new Error(
      "Commander must be selected and canonically resolved before starting a deck build.",
    );
  }

  const {
    resolved,
    commanderName,
    commanderOracleId: lockedCommanderOracleId,
    commanderScryfallId: resolvedScryfallId,
    commanderColorIdentity,
    strategySummary,
  } = resolution;

  commanderOracleIdRequired({
    commanderOracleId: lockedCommanderOracleId,
    context: "Deck build initialization",
  });
  const oracleId = lockedCommanderOracleId;

  const inventoryItems = await getCachedStoreInventory(input.storeId);
  const magicPool = inventoryItems.filter(isEnrichableMagicSingle);

  const commanderCatalog = await cardCatalogLookupByOracleId(oracleId);
  const commanderCanonicalName =
    commanderCatalog?.name ?? commanderName ?? resolved.entities.requestedCommanderName ?? "Commander";
  const commanderColors =
    commanderCatalog?.colorIdentity ?? commanderColorIdentity ?? [];

  const coverage = assessRequestScopedCoverage({
    commanderSelectionPolicy: resolved.commanderSelectionPolicy,
    requestedCommanderName: commanderCanonicalName,
    commanderOracleId: oracleId,
    commanderColors,
    candidatePool: magicPool,
    config: { mode: "warn" },
  });

  if (coverage.hardBlock) {
    throw new Error(coverage.blockReasons.join(" "));
  }
  if (coverage.warnings.length > 0) {
    console.info("[deck-build] request-scoped coverage warnings", {
      requestId: resolved.requestId,
      warnings: coverage.warnings,
      overallOracleIdPct: coverage.overallOracleIdPct,
      roleCoverage: coverage.roleCoverage,
    });
  }

  const slug = commanderNameToSlug(commanderCanonicalName);
  const meta = await fetchEdhrecCommanderMeta(slug);

  let ragNotes: string | undefined;
  if (isMtgRagEnabled() && !strategySummary) {
    try {
      const rag = await hybridRetrieveMtgKnowledge({
        question: `${commanderCanonicalName} commander strategy packages engines`,
        intent: "commander_strategy",
        limit: 4,
      });
      if (rag.hits.length > 0) {
        ragNotes = rag.hits
          .slice(0, 2)
          .map((h) => h.chunk.text.slice(0, 400))
          .join("\n\n");
      }
    } catch {
      /* RAG optional for deck build */
    }
  }

  const sampleNote = formatEdhrecSampleNote(meta?.numDecks);
  let strategy = strategySummary ? `${strategySummary}\n\n` : "";
  strategy += meta
    ? `${commanderCanonicalName} Commander${commanderColors.length ? ` (${commanderColors.join("")})` : ""}. Building from EDHREC staples we have in stock${sampleNote ? ` — ${sampleNote}` : ""}.`
    : `Inventory-only Commander deck around ${commanderCanonicalName}.`;

  if (ragNotes) {
    strategy += `\n\nPrimer notes: ${ragNotes.slice(0, 280)}…`;
  }

  return createDeckBuildSession({
    resolvedRequestId: resolved.requestId,
    commanderSelectionPolicy: resolved.commanderSelectionPolicy,
    commanderOracleId: oracleId,
    commanderName: commanderCanonicalName,
    commanderColors,
    commanderScryfallId:
      resolvedScryfallId ?? commanderCatalog?.scryfallId,
    budget,
    strategy,
    edhrecRecommendations: meta?.recommendations ?? [],
    ragNotes,
  });
}

function sessionToDeckList(session: CommanderDeckBuildSession): ClerkDeckList {
  const lines = session.lines;
  const inStockCards = lines.filter((l) => l.inStock).reduce((s, l) => s + l.qty, 0);
  const deckTotal = lines
    .filter((l) => l.inStock && l.lineTotal != null)
    .reduce((s, l) => s + (l.lineTotal ?? 0), 0);

  const deckCards: StoreDeckCard[] = [];
  if (session.commanderScryfallId) {
    deckCards.push({
      scryfallId: session.commanderScryfallId,
      qty: 1,
      board: "commander",
    });
  }

  const catalogById = new Map<string, CatalogCard>();

  const validation =
    session.stageIndex >= COMMANDER_DECK_BUILD_STAGES.length &&
    session.commanderScryfallId &&
    deckCards.length
      ? validateCommanderDeck({
          commanderId: session.commanderScryfallId,
          cards: deckCards,
          catalogById,
        })
      : null;

  const mainTarget = 99;
  const complete =
    session.mainCount === mainTarget &&
    session.missingSlots.length === 0 &&
    (validation?.valid ?? false);

  const stage = COMMANDER_DECK_BUILD_STAGES[session.stageIndex];

  return {
    game: "magic",
    format: "Commander",
    archetype: session.commanderName,
    commanderOracleId: session.commanderOracleId,
    commanderCanonicalName: session.commanderName,
    commanderColorIdentity: session.commanderColors,
    strategy: session.strategy,
    totalCards: lines.reduce((s, l) => s + l.qty, 0),
    targetCards: 100,
    inStockCards,
    deckTotal,
    budget: session.budget,
    withinBudget: session.budget == null || deckTotal <= session.budget,
    lines,
    missingSlots: session.missingSlots,
    complete,
    mainDeckCount: session.mainCount,
    validationIssues: validation?.issues.map((i) => i.message) ?? [],
    buildProgress: {
      stageIndex: session.stageIndex,
      stageLabel: stage?.label ?? "Complete",
      totalStages: COMMANDER_DECK_BUILD_STAGES.length,
      building: session.stageIndex < COMMANDER_DECK_BUILD_STAGES.length,
    },
  };
}

export async function runDeckBuildStep(
  input: DeckBuildStepInput,
): Promise<DeckBuildStepResult> {
  let session = input.session;

  if (!session) {
    if (!input.message?.trim()) {
      throw new Error(
        "message is required to start a deck build — production paths cannot use free-form commanderName.",
      );
    }
    if (!isExplicitDeckBuildRequest(input.message)) {
      throw new Error("This endpoint is for explicit full deck build requests only.");
    }
    const budget =
      input.budget ??
      parseBudget({
        message: input.message,
        conversationSummary: input.conversationSummary,
      });
    session = await initSession({
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      message: input.message,
      conversationSummary: input.conversationSummary,
      budget,
    });
  }

  commanderOracleIdRequired({
    commanderOracleId: session.commanderOracleId,
    context: "Deck build stage",
  });

  if (session.stageIndex >= COMMANDER_DECK_BUILD_STAGES.length) {
    const deckList = sessionToDeckList(session);
    return {
      session,
      deckList,
      stageIndex: session.stageIndex,
      stageLabel: "Complete",
      totalStages: COMMANDER_DECK_BUILD_STAGES.length,
      complete: true,
      reply: formatDeckBuildReply({
        commanderName: session.commanderName,
        deckList,
        complete: true,
        question: input.message ?? "",
        conversationSummary: input.conversationSummary,
      }),
    };
  }

  const stage = COMMANDER_DECK_BUILD_STAGES[session.stageIndex]!;
  session = await runCommanderDeckBuildStage({
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    session,
    stageId: stage.id,
  });

  session = { ...session, stageIndex: session.stageIndex + 1 };

  const deckList = sessionToDeckList(session);
  const complete = session.stageIndex >= COMMANDER_DECK_BUILD_STAGES.length;
  const reply = formatDeckBuildReply({
    commanderName: session.commanderName,
    deckList,
    complete,
    stageLabel: stage.label,
    stageIndex: session.stageIndex,
    totalStages: COMMANDER_DECK_BUILD_STAGES.length,
    question: input.message ?? "",
    conversationSummary: input.conversationSummary,
  });

  return {
    session,
    deckList,
    stageIndex: session.stageIndex - 1,
    stageLabel: stage.label,
    totalStages: COMMANDER_DECK_BUILD_STAGES.length,
    complete,
    reply,
  };
}
