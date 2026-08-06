import type {
  ClerkOrchestratorContext,
  ClerkRouterResult,
  SpecialistRecommendation,
  SpecialistResponse,
} from "../clerk-types";
import type { ClerkToolResults } from "../clerk-tools";
import { lookupEmbeddedClerkKnowledge } from "../../mtg-rag/embedded-clerk-knowledge";
import {
  parseCommanderSortFromQuestion,
} from "../clerk-tools/commander-recommendations";
import {
  formatVerifiedCommanderAnswer,
  getVerifiedCommanderCandidates,
  resolveCommanderColorConstraints,
} from "../clerk-tools/get-verified-commander-candidates";
import { parseCommanderMaxPrice } from "../clerk-tools/commander-context";
import { parseCommanderMaxPriceFromConversation } from "../clerk-tools/deck-build-context";
import {
  loadMagicInventoryMatchPool,
} from "../clerk-tools/magic-commander-inventory";
import { buildDeterministicClerkRoute } from "../clerk-router-deterministic";
import { runClerkTools } from "../clerk-tools";
import {
  classifySimpleClerkQuestion,
  extractCardPhraseFromFactQuestion,
  type SimpleClerkCategory,
} from "./simple-clerk-intent";
import { answerCardFactQuestion } from "./simple-card-fact";
import { answerRulesQuestion } from "./simple-rules";
import { answerMixedEducationInventory } from "./simple-mixed";
import { renderSimpleInventoryReply } from "./simple-inventory-reply";
import { runMtgKnowledgeSpecialist } from "../specialists/mtg-knowledge-specialist";
import { isMtgRagEnabled } from "../../mtg-rag/constants";
import { isRulesQuestion } from "../clerk-tools/clerk-intent";
import { resolveCardNameControlled } from "../clerk-tools/controlled-card-name-resolution";
import { inventorySearchMultiple } from "../clerk-tools/inventory-search";
import { getServerLookupTrace } from "../clerk-tools/scryfall-lookup-service";

function emptyClerkTools(): ClerkToolResults {
  return {
    inventory: null,
    inventoryByName: [],
    inventoryMatchPool: [],
    catalog: [],
  };
}

export interface SimpleClerkTrace {
  originalQuestion: string;
  resolvedIntent: SimpleClerkCategory;
  resolvedEntities: Array<{ name: string; oracleId?: string }>;
  toolsInvoked: string[];
  inventoryFilters?: Record<string, unknown>;
  knowledgeSources: string[];
  candidateCards: Array<{ name: string; oracleId?: string; rejected?: boolean; reason?: string }>;
  verifierResult?: string;
  formatterGuardResult?: string;
  pipeline: "simple";
  commanderSelectionPolicy?: string;
  commanderCandidateCountBeforeFiltering?: number;
  commanderRejectionReasons?: string[];
  commanderThemeKeywords?: string[];
  knowledgeResult?: { answered: boolean; source?: string };
  inventoryResult?: { matchCount: number; total?: number };
  joinResult?: { combined: boolean };
  catalogLookupSources?: string[];
  liveScryfallCallCount?: number;
  scryfall429Count?: number;
  localCatalogHitCount?: number;
  printingCatalogHitCount?: number;
  crosswalkHitCount?: number;
  cacheHitCount?: number;
  negativeCacheHitCount?: number;
  runtimeResolutionCount?: number;
  unresolvedEntityCount?: number;
  misspellingResolution?: Array<{ query: string; confidence?: number; margin?: number; resolved?: string }>;
}

export interface SimpleClerkPipelineResult {
  handled: boolean;
  route: ClerkRouterResult;
  tools: ClerkToolResults;
  specialist: SpecialistResponse | null;
  trace: SimpleClerkTrace;
}

function cardFactToSpecialist(
  answer: NonNullable<Awaited<ReturnType<typeof answerCardFactQuestion>>>,
): SpecialistResponse {
  if ("ambiguous" in answer) {
    return {
      direct_answer: answer.message,
      recommendations: [],
      inventory_queries: [],
      missing_information: ["card identity"],
      warnings: [],
      confidence: 0.6,
    };
  }

  return {
    direct_answer: `${answer.directAnswer}\n\n${answer.reason}`,
    recommendations: [
      {
        card_name: answer.canonicalName,
        oracleId: answer.oracleId,
        reason: answer.reason,
        colorIdentity: answer.colorIdentity,
      },
    ],
    inventory_queries: [],
    missing_information: [],
    warnings: [],
    confidence: 0.95,
    commanderOracleId: undefined,
  };
}

export async function runSimpleClerkPipeline(input: {
  ctx: ClerkOrchestratorContext;
}): Promise<SimpleClerkPipelineResult | null> {
  const category = classifySimpleClerkQuestion({
    question: input.ctx.user_question,
    conversationSummary: input.ctx.conversation_summary,
  });

  if (category === "complex" || category === "deck_build") {
    return null;
  }

  const trace: SimpleClerkTrace = {
    originalQuestion: input.ctx.user_question,
    resolvedIntent: category,
    resolvedEntities: [],
    toolsInvoked: [],
    knowledgeSources: [],
    candidateCards: [],
    pipeline: "simple",
  };

  const route = buildDeterministicClerkRoute({
    ctx: input.ctx,
    category,
  });

  if (category === "card_fact") {
    const fact = extractCardPhraseFromFactQuestion(input.ctx.user_question);
    if (!fact) return null;

    trace.toolsInvoked.push("entity_resolver", "canonical_oracle");
    const answer = await answerCardFactQuestion({
      question: input.ctx.user_question,
      kind: fact.kind,
      cardPhrase: fact.cardPhrase,
      conversationSummary: input.ctx.conversation_summary,
    });

    if (!answer) {
      return {
        handled: true,
        route,
        tools: emptyClerkTools(),
        specialist: {
          direct_answer: `I couldn't identify the card "${fact.cardPhrase}". Please check the spelling or give the full name.`,
          recommendations: [],
          inventory_queries: [],
          missing_information: ["card identity"],
          warnings: [],
          confidence: 0.4,
        },
        trace,
      };
    }

    if (!("ambiguous" in answer)) {
      trace.resolvedEntities.push({
        name: answer.canonicalName,
        oracleId: answer.oracleId,
      });
    }

    return {
      handled: true,
      route,
      tools: emptyClerkTools(),
      specialist: cardFactToSpecialist(answer),
      trace,
    };
  }

  if (category === "terminology") {
    trace.toolsInvoked.push("embedded_glossary");
    const hits = lookupEmbeddedClerkKnowledge(input.ctx.user_question);
    if (hits.length > 0) {
      trace.knowledgeSources.push(hits[0]!.chunk.citationLabel);
      const text = hits[0]!.chunk.text.split("\n").slice(0, 6).join("\n");
      return {
        handled: true,
        route,
        tools: emptyClerkTools(),
        specialist: {
          direct_answer: text,
          recommendations: [],
          inventory_queries: [],
          missing_information: [],
          warnings: [],
          confidence: 0.92,
        },
        trace,
      };
    }
    return null;
  }

  if (category === "rules_legality") {
    trace.toolsInvoked.push("rules_retrieval", "entity_resolver");
    const rulesAnswer = await answerRulesQuestion({
      question: input.ctx.user_question,
      conversationSummary: input.ctx.conversation_summary,
    });
    if (rulesAnswer) {
      trace.knowledgeSources.push(...rulesAnswer.knowledgeSources);
      for (const oid of rulesAnswer.oracleIds) {
        trace.resolvedEntities.push({ name: "", oracleId: oid });
      }
      return {
        handled: true,
        route,
        tools: emptyClerkTools(),
        specialist: {
          direct_answer: rulesAnswer.directAnswer,
          recommendations: [],
          inventory_queries: [],
          missing_information: [],
          warnings: [],
          confidence: 0.93,
        },
        trace,
      };
    }
  }

  const tools = await runClerkTools({
    ctx: input.ctx,
    route,
    parallelKnowledgeInventory: category === "mixed_education_inventory",
  });

  trace.toolsInvoked.push(...route.required_tools);
  if (tools.inventory?.query) {
    trace.inventoryFilters = tools.inventory.query as unknown as Record<string, unknown>;
  }

  if (category === "commander_recommendation") {
    trace.toolsInvoked.push("getVerifiedCommanderCandidates");
    trace.commanderSelectionPolicy = "verified_commander_candidates";
    const inventory =
      tools.inventoryMatchPool?.length
        ? tools.inventoryMatchPool
        : await loadMagicInventoryMatchPool({
            storeId: input.ctx.storeId,
            storeSlug: input.ctx.storeSlug,
          });

    const maxPrice =
      route.constraints.max_price ??
      parseCommanderMaxPriceFromConversation({
        question: input.ctx.user_question,
        conversationSummary: input.ctx.conversation_summary,
      }) ??
      parseCommanderMaxPrice(input.ctx.user_question);

    const { colorFilter, colorContainsAny } = resolveCommanderColorConstraints(
      input.ctx.user_question,
    );
    const sort = parseCommanderSortFromQuestion(input.ctx.user_question);
    const audit = await getVerifiedCommanderCandidates({
      storeId: input.ctx.storeId,
      storeSlug: input.ctx.storeSlug,
      inventory,
      colorFilter,
      colorContainsAny,
      inventoryOnly: true,
      maxPrice,
      sort,
      limit: sort === "price_asc" || sort === "price_desc" ? 1 : 10,
      themeQuestion: input.ctx.user_question,
      allowLiveEdhrec: sort === "popularity",
    });
    const picks = audit.accepted;

    trace.commanderCandidateCountBeforeFiltering = audit.candidateCountBeforeFiltering;
    trace.commanderThemeKeywords = audit.themeKeywords;
    trace.commanderRejectionReasons = [
      ...new Set(audit.rejected.map((r) => r.reason)),
    ];

    for (const pick of picks) {
      trace.candidateCards.push({
        name: pick.card.name,
        oracleId: pick.oracleId,
      });
    }
    for (const rej of audit.rejected.slice(0, 20)) {
      trace.candidateCards.push({
        name: rej.name,
        oracleId: rej.oracleId,
        rejected: true,
        reason: rej.reason,
      });
    }

    const recommendations: SpecialistRecommendation[] = picks
      .filter((p) => p.oracleId?.trim())
      .map((pick) => ({
        card_name: pick.card.name,
        oracleId: pick.oracleId,
        scryfallId: pick.card.scryfallId,
        inventoryItemId: pick.card.inventoryItemId,
        qty: 1,
        price: pick.card.listPrice ?? pick.card.tcgLowPrice,
        reason: pick.reason,
        colorIdentity: pick.colorIdentity,
      }));

    return {
      handled: true,
      route,
      tools,
      specialist: {
        direct_answer: formatVerifiedCommanderAnswer({
          picks,
          color: colorFilter,
          maxPrice,
          sort,
          themeKeywords: audit.themeKeywords,
        }),
        recommendations,
        inventory_queries: [],
        missing_information: picks.length ? [] : ["commander in stock"],
        warnings: [],
        confidence: picks.length ? 0.9 : 0.45,
      },
      trace,
    };
  }

  if (category === "mixed_education_inventory") {
    trace.toolsInvoked.push("embedded_glossary", "inventory_search");
    const items =
      tools.inventoryByName.length > 0
        ? tools.inventoryByName
        : (tools.inventory?.items ?? []);
    const mixed = answerMixedEducationInventory({
      question: input.ctx.user_question,
      items,
      total: tools.inventory?.total,
    });
    if (mixed) {
      trace.knowledgeSources.push(mixed.educationSource);
      trace.knowledgeResult = {
        answered: mixed.knowledgeResult.answered,
        source: mixed.knowledgeResult.source,
      };
      trace.inventoryResult = {
        matchCount: mixed.inventoryResult.matchCount,
        total: mixed.inventoryResult.total,
      };
      trace.joinResult = mixed.joinResult;
      for (const oid of mixed.inventoryOracleIds) {
        trace.resolvedEntities.push({ name: "", oracleId: oid });
      }
      const recommendations: SpecialistRecommendation[] = mixed.inventoryItems
        .filter((c) => c.oracleId?.trim())
        .slice(0, 12)
        .map((c) => ({
          card_name: c.name,
          oracleId: c.oracleId!,
          scryfallId: c.scryfallId,
          inventoryItemId: c.inventoryItemId,
          qty: c.qty,
          price: c.listPrice ?? c.tcgLowPrice,
          reason: "Verified in-stock listing",
          colorIdentity: c.colorIdentity,
        }));
      return {
        handled: true,
        route,
        tools,
        specialist: {
          direct_answer: mixed.directAnswer,
          recommendations,
          inventory_queries: [],
          missing_information: [],
          warnings: [],
          confidence: 0.9,
        },
        trace,
      };
    }
  }

  if (category === "rules_legality" || category === "mixed_education_inventory") {
    trace.toolsInvoked.push("knowledge_retrieval");
    if (tools.knowledge?.knowledge.hits.length) {
      trace.knowledgeSources.push(
        ...tools.knowledge.knowledge.hits.slice(0, 3).map((h) => h.chunk.citationLabel),
      );
    }

    const fact = extractCardPhraseFromFactQuestion(input.ctx.user_question);
    if (fact) {
      const cardAnswer = await answerCardFactQuestion({
        question: input.ctx.user_question,
        kind: fact.kind,
        cardPhrase: fact.cardPhrase,
        conversationSummary: input.ctx.conversation_summary,
      });
      if (cardAnswer && !("ambiguous" in cardAnswer)) {
        trace.resolvedEntities.push({
          name: cardAnswer.canonicalName,
          oracleId: cardAnswer.oracleId,
        });
        if (category === "rules_legality") {
          return {
            handled: true,
            route,
            tools,
            specialist: cardFactToSpecialist(cardAnswer),
            trace,
          };
        }
      }
    }

    if (tools.knowledge && isMtgRagEnabled()) {
      const specialist = await runMtgKnowledgeSpecialist({
        ctx: input.ctx,
        mtgRoute: tools.knowledge.mtgRoute,
        knowledge: tools.knowledge.knowledge,
        rulesOnly: isRulesQuestion(input.ctx.user_question),
        ragEnabled: true,
      });
      return { handled: true, route, tools, specialist, trace };
    }
  }

  if (category === "inventory_lookup") {
    trace.toolsInvoked.push("inventory_search");
    let items =
      tools.inventoryByName.length > 0
        ? tools.inventoryByName
        : (tools.inventory?.items ?? []);

    let misspellingCanonical: string | undefined;
    if (items.length === 0) {
      const namePatterns = [
        /\b(?:do you have|got any|have any)\s+(.+?)\??\s*$/i,
        /\bhow much is\s+(.+?)\??\s*$/i,
      ];
      for (const pattern of namePatterns) {
        const match = input.ctx.user_question.match(pattern);
        const phrase = match?.[1]?.trim().replace(/\?$/, "");
        if (!phrase || phrase.length > 60) continue;
        const resolved = await resolveCardNameControlled(phrase);
        if (resolved.status === "resolved" && resolved.canonicalName) {
          misspellingCanonical = resolved.canonicalName;
          trace.toolsInvoked.push("controlled_misspelling_resolution");
          trace.misspellingResolution = [
            {
              query: phrase,
              confidence: resolved.confidence,
              margin: resolved.margin,
              resolved: resolved.canonicalName,
            },
          ];
          const retry = await inventorySearchMultiple({
            storeId: input.ctx.storeId,
            storeSlug: input.ctx.storeSlug,
            cardNames: [resolved.canonicalName],
            game: "magic",
          });
          if (retry.items.length > 0) {
            items = retry.items;
            break;
          }
        }
      }
    }

    const lookupTrace = getServerLookupTrace();
    trace.catalogLookupSources = lookupTrace.catalogLookupSources;
    trace.liveScryfallCallCount = lookupTrace.liveScryfallCallCount;
    trace.scryfall429Count = lookupTrace.scryfall429Count;
    trace.localCatalogHitCount = lookupTrace.localCatalogHitCount;
    trace.printingCatalogHitCount = lookupTrace.printingCatalogHitCount;
    trace.crosswalkHitCount = lookupTrace.crosswalkHitCount;
    trace.cacheHitCount = lookupTrace.cacheHitCount;
    trace.negativeCacheHitCount = lookupTrace.negativeCacheHitCount;
    trace.runtimeResolutionCount = lookupTrace.runtimeResolutionCount;
    trace.unresolvedEntityCount = lookupTrace.unresolvedEntityCount;

    const deterministic = renderSimpleInventoryReply({
      question: input.ctx.user_question,
      conversationSummary: input.ctx.conversation_summary,
      items,
      total: tools.inventory?.total,
      resolvedCardName: misspellingCanonical,
    });
    if (deterministic) {
      const recommendations: SpecialistRecommendation[] = items
        .filter((c) => c.oracleId?.trim())
        .slice(0, 12)
        .map((c) => ({
          card_name: c.name,
          oracleId: c.oracleId!,
          scryfallId: c.scryfallId,
          inventoryItemId: c.inventoryItemId,
          qty: c.qty,
          price: c.listPrice ?? c.tcgLowPrice,
          reason: "Verified in-stock listing",
          colorIdentity: c.colorIdentity,
        }));
      return {
        handled: true,
        route,
        tools,
        specialist: {
          direct_answer: deterministic,
          recommendations,
          inventory_queries: [],
          missing_information: [],
          warnings: [],
          confidence: 0.92,
        },
        trace,
      };
    }
    return {
      handled: true,
      route,
      tools,
      specialist: null,
      trace,
    };
  }

  return {
    handled: true,
    route,
    tools,
    specialist: null,
    trace,
  };
}
