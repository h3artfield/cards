import type { StoreInventoryCard } from "../deck-builder/store-inventory-browse";
import type { ClerkDeckList, SpecialistRecommendation } from "./clerk-types";
import { formatClerkResponse } from "./clerk-formatter";
import {
  assertStructuredCardsHaveOracleId,
  buildRegistryFromSpecialist,
  validateFormattedReplyAgainstRegistry,
} from "./allowed-card-registry";
import { buildAnswerPlan, renderDeterministicReply } from "./clerk-answer-plan";
import { validateFormatterOutput } from "./clerk-formatter-guard";
import { routeClerkIntent } from "./clerk-router";
import { runClerkTools } from "./clerk-tools";
import type {
  ClerkOrchestratorContext,
  ClerkVerificationSummary,
  SpecialistResponse,
} from "./clerk-types";
import {
  applyVerifierMinorFixes,
  buildVerifierBlockedReply,
  verifyClerkAnswer,
} from "./clerk-verifier";
import type { VerifierRevisionContext } from "./clerk-verifier";
import { runMtgCommanderSpecialist } from "./specialists/mtg-commander-specialist";
import { runMtgKnowledgeSpecialist } from "./specialists/mtg-knowledge-specialist";
import { runPokemonCompetitiveSpecialist } from "./specialists/pokemon-competitive-specialist";
import { extractCardNamesFromClerkText } from "./clerk-tools/clerk-conversation-cards";
import { isKnowledgeOnlyClerkPath, shouldRunKnowledgeSpecialist } from "./clerk-tools/knowledge-retrieval";
import { isMtgRagEnabled } from "../mtg-rag/constants";
import { isEducationThenInventoryRequest, isRulesQuestion } from "./clerk-tools/clerk-intent";
import { isSemanticFilterActive } from "./clerk-tools/clerk-query-parser";
import { matchSuggestedCardsInInventory } from "./clerk-tools/rag-guided-inventory";
import { loadMagicInventoryMatchPool } from "./clerk-tools/magic-commander-inventory";
import type {
  StoreInventoryColorFilter,
  StoreInventoryGameFilter,
  StoreInventoryTypeFilter,
} from "../deck-builder/store-inventory-browse";
import {
  answerSourceLabel,
  classifyClerkRequest,
  type ClerkAnswerSource,
} from "./clerk-request-classifier";
import { logClerkRequest } from "./clerk-observability";
import { getClerkDataVersions } from "../deck-builder/catalog-sync-state";
import { getCachedStoreInventory } from "../deck-builder/store-inventory-cache";
import type { ClerkDataVersions } from "../deck-builder/types";
import { inferPolicyFromRoute } from "./resolved-clerk-request";
import {
  buildDeterministicClerkRoute,
  shouldSkipLlmRouter,
} from "./clerk-router-deterministic";
import { runSimpleClerkPipeline, type SimpleClerkTrace } from "./simple-clerk/simple-clerk-pipeline";
import { classifySimpleClerkQuestion } from "./simple-clerk/simple-clerk-intent";
import { clerkQueryToBrowseFilterPatch } from "./clerk-tools/clerk-browse-sync";
import type { ClerkBrowseFilterPatch } from "./clerk-tools/clerk-browse-sync";
import { resetLookupBudget } from "./clerk-tools/card-catalog";

export interface StoreClerkInput {
  storeName: string;
  storeSlug: string;
  message: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  storeId: string;
  currentFilters?: {
    game?: StoreInventoryGameFilter;
    color?: StoreInventoryColorFilter;
    cardType?: StoreInventoryTypeFilter;
    q?: string;
  };
}

export interface StoreClerkResponse {
  reply: string;
  searchQuery?: string;
  game?: StoreInventoryGameFilter;
  color?: StoreInventoryColorFilter;
  cardType?: StoreInventoryTypeFilter;
  highlightItemIds: string[];
  suggestedCards: StoreInventoryCard[];
  recommendations?: SpecialistRecommendation[];
  deckList?: ClerkDeckList;
  clearBrowseFilters?: boolean;
  browseFilterPatch?: ClerkBrowseFilterPatch;
  /** Debug routing metadata for future UI tooling */
  routing?: {
    game: string;
    intent: string;
    agents: string[];
  };
  classification?: {
    mode: string;
    answerSource: ClerkAnswerSource;
    answerSourceLabel: string;
    redirectToInventorySearch?: string;
  };
  verification?: ClerkVerificationSummary;
  dataVersions?: ClerkDataVersions;
  commanderOracleId?: string;
  /** Server-side pipeline trace for evaluation and debugging. */
  trace?: SimpleClerkTrace;
}

function summarizeHistory(
  history: StoreClerkInput["history"],
): string {
  return (history ?? [])
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Customer" : "Clerk"}: ${m.text}`)
    .join("\n");
}

async function runSpecialists(input: {
  ctx: ClerkOrchestratorContext;
  route: Awaited<ReturnType<typeof routeClerkIntent>>;
  tools: Awaited<ReturnType<typeof runClerkTools>>;
  verifierRevision?: VerifierRevisionContext;
}): Promise<SpecialistResponse | null> {
  if (
    shouldRunKnowledgeSpecialist({
      question: input.ctx.user_question,
      conversationSummary: input.ctx.conversation_summary,
      mtgRoute:
        input.tools.knowledge?.mtgRoute ?? {
          intent: "rules_question",
          confidence: 0.9,
          entities: {
            commanderNames: [],
            cardNames: [],
            colorIdentities: [],
            formats: [],
            requestedRuleNumbers: [],
          },
          requiresInventory: false,
          requiresKnowledge: true,
        },
      clerkIntent: input.route.intent,
      hasKnowledge: Boolean(input.tools.knowledge),
    })
  ) {
    const mtgRoute =
      input.tools.knowledge?.mtgRoute ?? {
        intent: isRulesQuestion(input.ctx.user_question)
          ? "rules_question"
          : "mixed",
        confidence: 0.9,
        entities: {
          commanderNames: [],
          cardNames: [],
          colorIdentities: [],
          formats: [],
          requestedRuleNumbers: [],
        },
        requiresInventory: false,
        requiresKnowledge: true,
      };
    const knowledge = input.tools.knowledge?.knowledge ?? {
      hits: [],
      intent: mtgRoute.intent,
      corpora: [],
      aliasMatches: 0,
      vectorMatches: 0,
    };

    return runMtgKnowledgeSpecialist({
      ctx: input.ctx,
      mtgRoute,
      knowledge,
      rulesOnly:
        isRulesQuestion(input.ctx.user_question) ||
        mtgRoute.intent === "rules_question",
      ragEnabled: isMtgRagEnabled(),
    });
  }

  if (
    (input.route.intent === "inventory_lookup" ||
      input.route.intent === "price_check") &&
    input.route.required_agents.length === 0
  ) {
    return null;
  }

  const agents = input.route.required_agents;
  if (agents.includes("mtg_commander")) {
    return runMtgCommanderSpecialist(input);
  }
  if (agents.includes("pokemon_competitive")) {
    return runPokemonCompetitiveSpecialist(input);
  }
  return null;
}

const MAX_VERIFIER_REVISIONS = 2;

async function runSpecialistWithVerification(input: {
  ctx: ClerkOrchestratorContext;
  route: Awaited<ReturnType<typeof routeClerkIntent>>;
  tools: Awaited<ReturnType<typeof runClerkTools>>;
}): Promise<{
  specialist: SpecialistResponse | null;
  verification: ClerkVerificationSummary;
}> {
  let specialist = await runSpecialists(input);
  let revisionAttempt = 0;
  let verification = await verifyClerkAnswer({
    ctx: input.ctx,
    route: input.route,
    tools: input.tools,
    specialist,
    revisionAttempt,
  });

  while (verification.status !== "pass" && verification.status !== "soft_block") {
    if (verification.status === "block") break;

    if (specialist) {
      specialist = applyVerifierMinorFixes(specialist, verification);
      verification = await verifyClerkAnswer({
        ctx: input.ctx,
        route: input.route,
        tools: input.tools,
        specialist,
        revisionAttempt,
      });
      if (verification.status === "pass") break;
    }

    if (revisionAttempt >= MAX_VERIFIER_REVISIONS) {
      verification = { ...verification, status: "block" };
      break;
    }

    revisionAttempt += 1;
    specialist = await runSpecialists({
      ...input,
      verifierRevision: {
        attempt: revisionAttempt,
        instructions: verification.revision_instructions,
        blockingIssues: verification.blocking_issues,
      },
    });
    verification = await verifyClerkAnswer({
      ctx: input.ctx,
      route: input.route,
      tools: input.tools,
      specialist,
      revisionAttempt,
    });
  }

  return {
    specialist,
    verification: {
      status: verification.status,
      overall_score: verification.overall_score,
      revision_attempts: revisionAttempt,
      hard_failures: verification.hard_failures,
      warnings: verification.warnings,
    },
  };
}

export async function runStoreClerk(
  input: StoreClerkInput,
): Promise<StoreClerkResponse> {
  const started = Date.now();
  resetLookupBudget(8);
  const conversationSummary = summarizeHistory(input.history);
  const classification = classifyClerkRequest({
    question: input.message,
    conversationSummary,
  });

  const ctx: ClerkOrchestratorContext = {
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    storeName: input.storeName,
    user_question: input.message,
    conversation_summary: conversationSummary,
    currentFilters: input.currentFilters,
  };

  const simpleCategory = classifySimpleClerkQuestion({
    question: input.message,
    conversationSummary,
  });

  let route: Awaited<ReturnType<typeof routeClerkIntent>>;
  let tools: Awaited<ReturnType<typeof runClerkTools>>;
  let specialist: SpecialistResponse | null = null;
  let verification: ClerkVerificationSummary;
  let simpleTrace: SimpleClerkTrace | undefined;

  const simpleResult = await runSimpleClerkPipeline({ ctx });
  if (simpleResult?.handled) {
    route = simpleResult.route;
    tools = simpleResult.tools;
    specialist = simpleResult.specialist;
    simpleTrace = simpleResult.trace;
    const v = await verifyClerkAnswer({
      ctx,
      route,
      tools,
      specialist,
      revisionAttempt: 0,
    });
    verification = {
      status: v.status,
      overall_score: v.overall_score,
      revision_attempts: 0,
      hard_failures: v.hard_failures,
      warnings: v.warnings,
    };
  } else {
    route = shouldSkipLlmRouter({
      question: input.message,
      conversationSummary,
    })
      ? buildDeterministicClerkRoute({ ctx, category: simpleCategory })
      : await routeClerkIntent(ctx);

    if (route.clarification_needed && route.clarification_question) {
      logClerkRequest({
        storeId: input.storeId,
        storeSlug: input.storeSlug,
        question: input.message,
        mode: classification.mode,
        answerSource: classification.answerSource,
        intent: route.intent,
        latencyMs: Date.now() - started,
        redirectToInventorySearch: classification.redirectToInventorySearch,
      });
      return {
        reply: route.clarification_question,
        highlightItemIds: [],
        suggestedCards: [],
        routing: {
          game: route.game,
          intent: route.intent,
          agents: route.required_agents,
        },
        classification: {
          mode: classification.mode,
          answerSource: classification.answerSource,
          answerSourceLabel: answerSourceLabel(classification.answerSource),
          redirectToInventorySearch: classification.redirectToInventorySearch,
        },
      };
    }

    tools = await runClerkTools({
      ctx,
      route,
      parallelKnowledgeInventory:
        classification.mode === "mixed" ||
        isEducationThenInventoryRequest(input.message, conversationSummary),
    });
    const verified = await runSpecialistWithVerification({
      ctx,
      route,
      tools,
    });
    specialist = verified.specialist;
    verification = verified.verification;
  }

  if (simpleTrace) {
    const { getServerLookupTrace } = await import("./clerk-tools/scryfall-lookup-service");
    const lookupTrace = getServerLookupTrace();
    simpleTrace.catalogLookupSources = lookupTrace.catalogLookupSources;
    simpleTrace.liveScryfallCallCount = lookupTrace.liveScryfallCallCount;
    simpleTrace.scryfall429Count = lookupTrace.scryfall429Count;
    simpleTrace.localCatalogHitCount = lookupTrace.localCatalogHitCount;
    simpleTrace.printingCatalogHitCount = lookupTrace.printingCatalogHitCount;
    simpleTrace.crosswalkHitCount = lookupTrace.crosswalkHitCount;
    simpleTrace.cacheHitCount = lookupTrace.cacheHitCount;
    simpleTrace.negativeCacheHitCount = lookupTrace.negativeCacheHitCount;
    simpleTrace.runtimeResolutionCount = lookupTrace.runtimeResolutionCount;
    simpleTrace.unresolvedEntityCount = lookupTrace.unresolvedEntityCount;
    console.info("[clerk] simple pipeline trace", simpleTrace);
  }

  if (verification.status === "block") {
    const blockedReply = buildVerifierBlockedReply({
      ctx,
      route,
      blockingIssues: verification.hard_failures,
    });
    logClerkRequest({
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      question: input.message,
      mode: classification.mode,
      answerSource: classification.answerSource,
      intent: route.intent,
      inventorySearchStrategy: tools.inventorySearchStrategy,
      ragHitCount: tools.knowledge?.knowledge.hits.length,
      verificationStatus: verification.status,
      hardFailures: verification.hard_failures,
      latencyMs: Date.now() - started,
      redirectToInventorySearch: classification.redirectToInventorySearch,
    });
    return {
      reply: blockedReply,
      highlightItemIds: [],
      suggestedCards: [],
      routing: {
        game: route.game,
        intent: route.intent,
        agents: route.required_agents,
      },
      classification: {
        mode: classification.mode,
        answerSource: classification.answerSource,
        answerSourceLabel: answerSourceLabel(classification.answerSource),
        redirectToInventorySearch: classification.redirectToInventorySearch,
      },
      verification,
    };
  }

  const inventoryPool =
    tools.inventoryMatchPool?.length
      ? tools.inventoryMatchPool
      : tools.inventoryByName.length
        ? tools.inventoryByName
        : (tools.inventory?.items ?? []);

  const structuredMissing = assertStructuredCardsHaveOracleId({
    recommendations: specialist?.recommendations,
    deckList: specialist?.deckList,
  });
  if (structuredMissing.length > 0 && specialist?.deckList) {
    console.warn("[clerk] structured cards missing oracle id", structuredMissing);
  }

  const registry = buildRegistryFromSpecialist({
    specialist,
    inventory: inventoryPool,
  });
  const answerPlan = specialist
    ? buildAnswerPlan({ specialist, registry })
    : null;

  const simpleDeterministic =
    Boolean(simpleTrace) &&
    Boolean(specialist?.direct_answer) &&
    simpleCategory !== "complex" &&
    simpleCategory !== "deck_build";

  const formatted: {
    reply: string;
    highlightItemIds: string[];
    skipBrowseSearch?: boolean;
    searchQuery?: string;
    game?: StoreInventoryGameFilter;
    color?: StoreInventoryColorFilter;
    cardType?: StoreInventoryTypeFilter;
  } = simpleDeterministic
    ? {
        reply: specialist!.direct_answer,
        highlightItemIds: (specialist!.recommendations ?? [])
          .map((r) => r.inventoryItemId)
          .filter(Boolean) as string[],
        skipBrowseSearch: true,
      }
    : await formatClerkResponse({
        ctx,
        route,
        tools,
        specialist,
      });

  const registryValidation = validateFormattedReplyAgainstRegistry({
    reply: formatted.reply,
    registry,
    commanderOracleId:
      specialist?.commanderOracleId ?? specialist?.deckList?.commanderOracleId,
    commanderSelectionPolicy: inferPolicyFromRoute({
      routeEntities: route.entities,
      question: input.message,
      conversationSummary,
    }),
  });

  let guardedReply = formatted.reply;
  let formatterGuardFailures = 0;
  let deterministicFallbacks = 0;

  const allowedNames = [...registry.cards.values()].map((c) => c.canonicalName);
  const formatterGuard = validateFormatterOutput({
    reply: guardedReply,
    allowedCardNames: allowedNames,
    lockedCommanderName: specialist?.deckList?.commanderCanonicalName,
  });

  if (!registryValidation.valid && answerPlan) {
    console.warn("[clerk] formatter registry blocked LLM reply", {
      violations: registryValidation.violations,
      unresolved: registryValidation.unresolvedMentions,
    });
    guardedReply = renderDeterministicReply(answerPlan);
    deterministicFallbacks += 1;
  } else if (!formatterGuard.valid && answerPlan) {
    console.warn("[clerk] formatter guard blocked reply", {
      violations: formatterGuard.violations,
    });
    guardedReply = renderDeterministicReply(answerPlan);
    formatterGuardFailures += 1;
    deterministicFallbacks += 1;
  }

  if (simpleTrace) {
    simpleTrace.formatterGuardResult = formatterGuard.valid ? "pass" : "blocked";
    simpleTrace.verifierResult = verification.status;
  }

  const softBlockDisclaimer =
    verification.status === "soft_block"
      ? "\n\n_Note: I couldn't fully verify this against our rule library — treat as general guidance._"
      : "";
  const replyText = guardedReply + softBlockDisclaimer;

  const poolById = new Map(
    inventoryPool.map((c) => [c.inventoryItemId, c]),
  );

  const semanticInventory = isSemanticFilterActive(
    tools.inventory?.query?.semantic,
  );

  let suggestedCards: StoreInventoryCard[] = [];
  const inventoryLookup =
    route.intent === "inventory_lookup" || route.intent === "price_check";
  const educationThenInventory = isEducationThenInventoryRequest(
    input.message,
    conversationSummary,
  );
  const knowledgePath =
    Boolean(tools.knowledge) &&
    shouldRunKnowledgeSpecialist({
      question: input.message,
      conversationSummary,
      mtgRoute: tools.knowledge!.mtgRoute,
      clerkIntent: route.intent,
      hasKnowledge: true,
    });

  if (tools.inventoryByName.length > 0 && (semanticInventory || inventoryLookup)) {
    suggestedCards = tools.inventoryByName;
  } else if (specialist?.recommendations.length) {
    suggestedCards = specialist.recommendations.flatMap((rec) => {
      if (!rec.inventoryItemId) return [];
      const pool = poolById.get(rec.inventoryItemId);
      if (!pool) return [];
      return [
        {
          ...pool,
          qty: Math.min(rec.qty ?? 1, pool.qty),
          colorIdentity: rec.colorIdentity ?? pool.colorIdentity,
        } satisfies StoreInventoryCard,
      ];
    });
  }

  if (suggestedCards.length === 0 && (knowledgePath || educationThenInventory)) {
    const pool =
      tools.inventoryMatchPool ??
      (await loadMagicInventoryMatchPool({
        storeId: input.storeId,
        storeSlug: input.storeSlug,
      }));
    const mentionedNames = extractCardNamesFromClerkText(
      specialist?.direct_answer ?? replyText,
    );
    suggestedCards = matchSuggestedCardsInInventory({
      suggestedNames: mentionedNames,
      pool,
    });
  }

  if (suggestedCards.length === 0 && knowledgePath && inventoryPool.length > 0) {
    const mentionedNames = extractCardNamesFromClerkText(
      specialist?.direct_answer ?? formatted.reply,
    );
    suggestedCards = matchSuggestedCardsInInventory({
      suggestedNames: mentionedNames,
      pool: inventoryPool,
    });
  }

  if (suggestedCards.length === 0) {
    const highlightSet = new Set(formatted.highlightItemIds);
    suggestedCards = inventoryPool.filter((c) =>
      highlightSet.has(c.inventoryItemId),
    );
  }

  if (suggestedCards.length === 0 && formatted.searchQuery) {
    const q = formatted.searchQuery.toLowerCase();
    suggestedCards = inventoryPool
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 12);
  }

  const usedSpecialist =
    route.required_agents.includes("mtg_commander") ||
    route.required_agents.includes("pokemon_competitive");

  if (
    suggestedCards.length === 0 &&
    inventoryPool.length > 0 &&
    !usedSpecialist &&
    !formatted.skipBrowseSearch
  ) {
    suggestedCards = inventoryPool.slice(0, 12);
  }

  if (specialist?.deckList) {
    const deckIds = specialist.deckList.lines
      .map((l) => l.inventoryItemId)
      .filter(Boolean) as string[];
    const deckCards = inventoryPool.filter((c) =>
      deckIds.includes(c.inventoryItemId),
    );
    const cachedInventory = await getCachedStoreInventory(input.storeId);
    const dataVersions = await getClerkDataVersions({
      inventoryItems: cachedInventory,
    });

    return {
      reply: replyText,
      game: specialist.deckList.game === "magic" ? "magic" : "pokemon",
      highlightItemIds: formatted.highlightItemIds,
      suggestedCards: deckCards.length ? deckCards : suggestedCards,
      deckList: specialist.deckList,
      commanderOracleId: specialist.deckList.commanderOracleId,
      clearBrowseFilters: formatted.skipBrowseSearch,
      routing: {
        game: route.game,
        intent: route.intent,
        agents: route.required_agents,
      },
      classification: {
        mode: classification.mode,
        answerSource: classification.answerSource,
        answerSourceLabel: answerSourceLabel(classification.answerSource),
        redirectToInventorySearch: classification.redirectToInventorySearch,
      },
      verification,
      dataVersions,
    };
  }

  const highlightItemIds =
    suggestedCards.length > 0 && knowledgePath
      ? suggestedCards.map((c) => c.inventoryItemId)
      : formatted.highlightItemIds;

  const searchQuery =
    formatted.skipBrowseSearch
      ? undefined
      : (classification.redirectToInventorySearch ?? formatted.searchQuery);

  logClerkRequest({
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    question: input.message,
    mode: classification.mode,
    answerSource: classification.answerSource,
    intent: route.intent,
    inventorySearchStrategy: tools.inventorySearchStrategy,
    ragHitCount: tools.knowledge?.knowledge.hits.length,
    verificationStatus: verification.status,
    hardFailures: verification.hard_failures,
    latencyMs: Date.now() - started,
    redirectToInventorySearch: classification.redirectToInventorySearch,
  });

  const cachedInventory = await getCachedStoreInventory(input.storeId);
  const dataVersions: ClerkDataVersions = await getClerkDataVersions({
    inventoryItems: cachedInventory,
  });

  const browseFilterPatch = clerkQueryToBrowseFilterPatch({
    userQuestion: input.message,
    conversationSummary,
    cardType: tools.inventory?.query?.cardType,
  });

  return {
    reply: replyText,
    searchQuery,
    game: browseFilterPatch.game,
    color: browseFilterPatch.selectedColors[0] as StoreInventoryColorFilter | undefined,
    cardType: browseFilterPatch.cardType,
    browseFilterPatch,
    highlightItemIds,
    suggestedCards,
    recommendations: specialist?.recommendations,
    clearBrowseFilters: false,
    routing: {
      game: route.game,
      intent: route.intent,
      agents: route.required_agents,
    },
    classification: {
      mode: classification.mode,
      answerSource: classification.answerSource,
      answerSourceLabel: answerSourceLabel(classification.answerSource),
      redirectToInventorySearch: classification.redirectToInventorySearch,
    },
    verification,
    dataVersions,
    commanderOracleId: specialist?.commanderOracleId ?? specialist?.deckList?.commanderOracleId,
    trace: simpleTrace,
  };
}
