/**
 * Build ProfessorPlanningContext v3 — optional knownMechanicalAffordances, not a whitelist.
 * Wires frozen MTG retrieval stack for preserved RAG evidence (no model execution).
 */
import { buildCanonicalCommandZoneKnowledge } from "../../src/lib/deck-intelligence/canonical-knowledge-service";
import { searchMtgKnowledge, type MtgKnowledgeRetrievalMode } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import type {
  ProfessorPlanningContextV3,
  ProfessorInitialRetrievalAttemptV3,
  SemanticRelationshipV3,
} from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { appendLedgerEntriesFromRagHits, buildProfessorEvidenceLedgerV3 } from "../../src/lib/deck-synthesis/professor-v3-evidence-ledger-v1";
import type { ImplementedMechanismCatalogEntry } from "./phase6a1-implemented-mechanism-catalog-v1";
import type { FrozenOpportunityCase } from "./phase6a1-frozen-semantic-opportunity-v322-loader-v1";
import { formatBracketDevelopmentConstraint } from "./phase6a1-bracket-constraint-v1";
import {
  deriveCrossFactEdgesForCase,
  deriveOpportunitiesForMechanismFacts,
} from "./phase6a1-semantic-opportunity-fact-family-rules-v1";
import type { IndependentCommanderMechanismTruthCase } from "../../src/lib/deck-synthesis/independent-truth-types-v1";
import {
  buildProfessorV3RagEnvironmentIdentityV1,
  classifyProfessorV3RetrievalAttemptStatusV1,
} from "./phase6a1-professor-v3-rag-environment-identity-v1";

export const PROFESSOR_PLAN_CONTEXT_BUILDER_V3_VERSION = "phase6a1-professor-plan-context-builder-v3";

function relationshipsFromOpportunityCase(oppCase?: FrozenOpportunityCase): SemanticRelationshipV3[] {
  if (!oppCase?.crossFactEdges?.length) return [];
  return oppCase.crossFactEdges.map((edge) => ({
    relationshipId: edge.edgeId,
    producerFactIds: edge.producerFactIds,
    consumerFactIds: edge.consumerFactIds,
    relationshipType: edge.relationship,
    causalStatement: edge.causalStatement,
  }));
}

function relationshipsFromTruthSupplied(truthCase: IndependentCommanderMechanismTruthCase): SemanticRelationshipV3[] {
  return (truthCase.crossMemberRelationshipsAsSupplied ?? []).flatMap((rel, index) => {
    const producerFactIds = Array.isArray(rel.producerFactIds) ? (rel.producerFactIds as string[]) : [];
    const consumerFactIds = Array.isArray(rel.consumerFactIds) ? (rel.consumerFactIds as string[]) : [];
    if (!producerFactIds.length || !consumerFactIds.length) return [];
    return [
      {
        relationshipId: String(rel.relationshipId ?? `${truthCase.caseId}-truth-rel-${index + 1}`),
        producerFactIds,
        consumerFactIds,
        relationshipType: String(rel.relationshipType ?? rel.relationship ?? "PRODUCER_TO_CONSUMER"),
        causalStatement: String(rel.causalStatement ?? rel.statement ?? ""),
      },
    ];
  });
}

function loadAuthoritativeSemanticRelationships(args: {
  entry: ImplementedMechanismCatalogEntry;
  oppCase?: FrozenOpportunityCase | null;
}): SemanticRelationshipV3[] {
  const derivedCase = deriveOpportunitiesForMechanismFacts({
    caseId: args.entry.caseId,
    commanders: args.entry.commanders,
    commandZoneConfiguration: args.entry.commandZoneConfiguration,
    facts: args.entry.independentMechanismFacts,
  });
  const derived = deriveCrossFactEdgesForCase({
    caseId: args.entry.caseId,
    facts: args.entry.independentMechanismFacts,
    opportunities: derivedCase.opportunities,
  }).map((edge) => ({
    relationshipId: edge.edgeId,
    producerFactIds: edge.producerFactIds,
    consumerFactIds: edge.consumerFactIds,
    relationshipType: edge.relationship,
    causalStatement: edge.causalStatement,
  }));
  const fromTruth = relationshipsFromTruthSupplied(args.entry);
  const fromOpp = relationshipsFromOpportunityCase(args.oppCase ?? undefined);
  const merged = new Map<string, SemanticRelationshipV3>();
  for (const rel of [...fromTruth, ...derived, ...fromOpp]) merged.set(rel.relationshipId, rel);
  return [...merged.values()];
}

function recordRetrievalAttempt(
  ctx: ProfessorPlanningContextV3,
  attempt: ProfessorInitialRetrievalAttemptV3,
): ProfessorPlanningContextV3 {
  return {
    ...ctx,
    initialRetrievalAttempts: [...(ctx.initialRetrievalAttempts ?? []), attempt],
  };
}

export function appendRetrievalToContext(
  ctx: ProfessorPlanningContextV3,
  args: { tool: string; query: string; mode: string; hits: Awaited<ReturnType<typeof searchMtgKnowledge>>["hits"] },
): ProfessorPlanningContextV3 {
  const ledger = buildProfessorEvidenceLedgerV3(ctx);
  const updatedLedger = appendLedgerEntriesFromRagHits({
    ledger,
    hits: args.hits,
    tool: args.tool,
    query: args.query,
    retrievalMode: args.mode,
  });
  const mergedHits = [...ctx.initialRagEvidence];
  for (const hit of args.hits) {
    const existingIdx = mergedHits.findIndex((h) => h.chunkId === hit.chunkId);
    const stamped = { ...hit, mode: args.mode as MtgKnowledgeRetrievalMode };
    if (existingIdx >= 0) {
      mergedHits[existingIdx] = { ...mergedHits[existingIdx], ...stamped };
      continue;
    }
    mergedHits.push(stamped);
  }
  const supplement = updatedLedger.entries.filter((e) => e.kind === "RAG" || e.kind === "RULES");
  return { ...ctx, initialRagEvidence: mergedHits, evidenceLedgerSupplement: supplement };
}

type SearchMtgKnowledgeImpl = typeof searchMtgKnowledge;

export async function buildProfessorPlanningContextV3(args: {
  entry: ImplementedMechanismCatalogEntry;
  oppCase?: FrozenOpportunityCase | null;
  options?: {
    includeMechanicalAffordances?: boolean;
    maxInitialEvidenceChunks?: number;
    skipKnowledgeRetrieval?: boolean;
    searchMtgKnowledgeImpl?: SearchMtgKnowledgeImpl;
  };
}): Promise<ProfessorPlanningContextV3> {
  const searchImpl = args.options?.searchMtgKnowledgeImpl ?? searchMtgKnowledge;
  const canonical = buildCanonicalCommandZoneKnowledge(args.entry);
  const includeAffordances = args.options?.includeMechanicalAffordances ?? true;
  const maxChunks = args.options?.maxInitialEvidenceChunks ?? 8;
  let ctx: ProfessorPlanningContextV3 = {
    caseId: args.entry.caseId,
    commandZone: {
      configuration: args.entry.commandZoneConfiguration,
      commanders: args.entry.commanders,
      combinedColorIdentity: args.entry.combinedColorIdentity,
      bracket: args.entry.bracket,
    },
    canonicalOracle: canonical.oracleEntries,
    commanderMechanismFacts: args.entry.independentMechanismFacts,
    semanticRelationships: loadAuthoritativeSemanticRelationships({ entry: args.entry, oppCase: args.oppCase }),
    knownMechanicalAffordances: includeAffordances ? (args.oppCase?.opportunities ?? []) : [],
    noActionableFactIds: args.oppCase?.noActionableOpportunities.map((r) => r.factId) ?? [],
    colorIdentity: args.entry.combinedColorIdentity,
    bracket: args.entry.bracket,
    userConstraints: [
      "Professor v3 — strategic synthesis with grounding validator",
      "Precomputed affordances are optional hints, not a strategy whitelist",
      "Canonical Oracle + mechanism facts are authoritative; RAG/rules/research enrich only",
      formatBracketDevelopmentConstraint(args.entry.bracket),
    ],
    initialRagEvidence: [],
    initialResearchEvidence: [],
    rulesConstraints: ["Normal land-play limits apply unless a cited rules ref explicitly grants otherwise"],
  };

  if (!args.options?.skipKnowledgeRetrieval) {
    for (const commander of args.entry.commanders.slice(0, 2)) {
      const query = `${commander} commander strategy enablers payoffs`;
      let primer;
      try {
        primer = await searchImpl({
          query,
          mode: "COMMANDER_PRIMER",
          consumer: "professor_planner",
          commanderName: commander,
          limit: Math.ceil(maxChunks / Math.max(args.entry.commanders.length, 1)),
        });
        ctx = recordRetrievalAttempt(ctx, {
          tool: "searchMtgKnowledge",
          query,
          retrievalMode: "COMMANDER_PRIMER",
          resultCount: primer.hits.length,
          status: classifyProfessorV3RetrievalAttemptStatusV1(primer),
          sourceEnvironmentIdentity: buildProfessorV3RagEnvironmentIdentityV1(primer),
          returnedEvidenceIds: primer.hits.map((h) => h.chunkId),
        });
        ctx = appendRetrievalToContext(ctx, { tool: "searchMtgKnowledge", query, mode: "COMMANDER_PRIMER", hits: primer.hits });
      } catch (error) {
        ctx = recordRetrievalAttempt(ctx, {
          tool: "searchMtgKnowledge",
          query,
          retrievalMode: "COMMANDER_PRIMER",
          resultCount: 0,
          status: "ERROR",
          error: error instanceof Error ? error.message : String(error),
          sourceEnvironmentIdentity: buildProfessorV3RagEnvironmentIdentityV1(),
          returnedEvidenceIds: [],
        });
        throw error;
      }
    }

    const packageQuery = `${args.entry.commanders.join(" ")} deckbuilding packages synergy`;
    let strategy;
    try {
      strategy = await searchImpl({
        query: packageQuery,
        mode: "PACKAGE",
        consumer: "professor_planner",
        resolvedCommanderNames: args.entry.commanders,
        limit: 4,
      });
      ctx = recordRetrievalAttempt(ctx, {
        tool: "searchMtgKnowledge",
        query: packageQuery,
        retrievalMode: "PACKAGE",
        resultCount: strategy.hits.length,
        status: classifyProfessorV3RetrievalAttemptStatusV1(strategy),
        sourceEnvironmentIdentity: buildProfessorV3RagEnvironmentIdentityV1(strategy),
        returnedEvidenceIds: strategy.hits.map((h) => h.chunkId),
      });
      ctx = appendRetrievalToContext(ctx, { tool: "searchMtgKnowledge", query: packageQuery, mode: "PACKAGE", hits: strategy.hits });
    } catch (error) {
      ctx = recordRetrievalAttempt(ctx, {
        tool: "searchMtgKnowledge",
        query: packageQuery,
        retrievalMode: "PACKAGE",
        resultCount: 0,
        status: "ERROR",
        error: error instanceof Error ? error.message : String(error),
        sourceEnvironmentIdentity: buildProfessorV3RagEnvironmentIdentityV1(),
        returnedEvidenceIds: [],
      });
      throw error;
    }
  }

  const deduped = new Map(ctx.initialRagEvidence.map((h) => [h.chunkId, h]));
  ctx.initialRagEvidence = [...deduped.values()].slice(0, maxChunks);
  return ctx;
}

/** Synchronous deterministic builder for fixtures/tests — skips live retrieval. */
export function buildProfessorPlanningContextV3Sync(args: {
  entry: ImplementedMechanismCatalogEntry;
  oppCase?: FrozenOpportunityCase | null;
  options?: { includeMechanicalAffordances?: boolean };
}): ProfessorPlanningContextV3 {
  const canonical = buildCanonicalCommandZoneKnowledge(args.entry);
  const includeAffordances = args.options?.includeMechanicalAffordances ?? true;
  return {
    caseId: args.entry.caseId,
    commandZone: {
      configuration: args.entry.commandZoneConfiguration,
      commanders: args.entry.commanders,
      combinedColorIdentity: args.entry.combinedColorIdentity,
      bracket: args.entry.bracket,
    },
    canonicalOracle: canonical.oracleEntries,
    commanderMechanismFacts: args.entry.independentMechanismFacts,
    semanticRelationships: loadAuthoritativeSemanticRelationships({ entry: args.entry, oppCase: args.oppCase }),
    knownMechanicalAffordances: includeAffordances ? (args.oppCase?.opportunities ?? []) : [],
    noActionableFactIds: args.oppCase?.noActionableOpportunities.map((r) => r.factId) ?? [],
    colorIdentity: args.entry.combinedColorIdentity,
    bracket: args.entry.bracket,
    userConstraints: [
      "Professor v3 — strategic synthesis with grounding validator",
      "Precomputed affordances are optional hints, not a strategy whitelist",
      formatBracketDevelopmentConstraint(args.entry.bracket),
    ],
    initialRagEvidence: [],
    initialResearchEvidence: [],
    rulesConstraints: ["Normal land-play limits apply unless a cited rules ref explicitly grants otherwise"],
  };
}
