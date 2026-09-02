/**
 * Professor v4.16.6 — structural search execution, compiled retrieval, reconciled candidate supply.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { AggregatedStructuralMissionV4166 } from "./professor-structural-search-planner-v4-16-6-v1";
import type { StructuralSearchRejectionReasonV4165, StructuralSearchTierV4165 } from "./professor-structural-search-planner-v4-16-5-v1";
import {
  cardLegalInCommanderColorIdentity,
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";

export const PROFESSOR_STRUCTURAL_SEARCH_EXECUTION_V4_16_6_V1_VERSION =
  "professor-structural-search-execution-v4-16-6-v1";

export type StructuralSearchRetrieverV4166 =
  | "EXISTING_CANDIDATE_POOL"
  | "GOLDEN_CATALOG"
  | "SEMANTIC_ORACLE"
  | "STRATEGY_RAG"
  | "PACKAGE_RAG"
  | "MODEL_PRIOR"
  | "FUNCTIONAL_SUBSTITUTION";

export type ConsideredCandidateV4166 = {
  oracleId: string;
  name: string;
  roleQuality: number;
  bracketQuality: number;
  charterFit: number;
  engineSynergy: number;
  compositeScore: number;
  rejectionReason?: StructuralSearchRejectionReasonV4165;
  accepted: boolean;
};

export type CompiledStructuralSearchV4166 = {
  version: typeof PROFESSOR_STRUCTURAL_SEARCH_EXECUTION_V4_16_6_V1_VERSION;
  missionId: string;
  tier: StructuralSearchTierV4165;
  retriever: StructuralSearchRetrieverV4166;
  compiledQuery: string;
  requireEngineSynergy: boolean;
};

export type StructuralSearchExecutionV4166 = {
  version: typeof PROFESSOR_STRUCTURAL_SEARCH_EXECUTION_V4_16_6_V1_VERSION;
  executionId: string;
  missionId: string;
  tier: StructuralSearchTierV4165;
  retriever: StructuralSearchRetrieverV4166;
  compiledQuery: string;
  startedAt: string;
  retrievedCanonicalIds: string[];
  legalCandidateIds: string[];
  qualityPassedIds: string[];
  rejected: ConsideredCandidateV4166[];
  candidatesConsidered: ConsideredCandidateV4166[];
  selectedIds: string[];
  selectedCountBefore: number;
  selectedCountAfter: number;
  candidateSetHash: string;
  searchOutcome: "SEARCH_NO_PROGRESS" | "CANDIDATES_FOUND" | "CANDIDATES_SELECTED";
};

export type ReconciledCandidateSupplyV4166 = {
  neededSlots: number;
  retrieved: number;
  canonicalUnresolved: number;
  illegal: number;
  wrongFunction: number;
  belowQualityFloor: number;
  alreadySelected: number;
  viableCandidateCount: number;
  strongCandidateCount: number;
  marginalCandidateCount: number;
  rejectedCandidateCount: number;
  selected: number;
  candidatesConsidered: ConsideredCandidateV4166[];
};

const TIER_RETRIEVER: Record<StructuralSearchTierV4165, StructuralSearchRetrieverV4166> = {
  1: "EXISTING_CANDIDATE_POOL",
  2: "SEMANTIC_ORACLE",
  3: "SEMANTIC_ORACLE",
  4: "GOLDEN_CATALOG",
  5: "STRATEGY_RAG",
  6: "MODEL_PRIOR",
  7: "FUNCTIONAL_SUBSTITUTION",
};

export function compileStructuralSearchV4166(args: {
  mission: AggregatedStructuralMissionV4166;
  tier?: StructuralSearchTierV4165;
}): CompiledStructuralSearchV4166 {
  const tier = args.tier ?? args.mission.currentTier;
  const query = args.mission.searchQueries[args.mission.searchQueries.length - 1] ?? `function=${args.mission.deficitFunction}`;
  return {
    version: PROFESSOR_STRUCTURAL_SEARCH_EXECUTION_V4_16_6_V1_VERSION,
    missionId: args.mission.missionId,
    tier,
    retriever: TIER_RETRIEVER[tier],
    compiledQuery: query,
    requireEngineSynergy: args.mission.roleConstraint === "PREFER_ENGINE_SYNERGY" && args.mission.deficitFunction !== "interaction",
  };
}

function roleMatchesFunction(card: CouncilCardV46, deficitFunction: string): boolean {
  const roles = card.roles.join(" ").toLowerCase();
  if (deficitFunction === "interaction") return /interaction|removal|counter|destroy|exile/.test(roles);
  if (deficitFunction === "card-velocity") return /card-advantage|draw|filter|velocity|selection/.test(roles);
  if (deficitFunction === "protection") return /protection|hexproof|indestructible|recovery/.test(roles);
  if (deficitFunction === "access-tools" || deficitFunction === "access") return /access|tutor|selection/.test(roles) || /tutor/i.test(card.name);
  if (deficitFunction.startsWith("core-package") || deficitFunction === "core-package-realization") return true;
  return /engine|synergy|combo|token|sacrifice/.test(roles);
}

function scoreCandidate(args: {
  card: CouncilCardV46;
  mission: AggregatedStructuralMissionV4166;
  requestedBracket: number;
}): Omit<ConsideredCandidateV4166, "oracleId" | "name" | "accepted" | "rejectionReason"> {
  const roleQuality = args.card.roles.length >= 2 ? 85 : args.card.roles.length === 1 ? 70 : 45;
  const bracketQuality = (args.card.bracketFitScore ?? 0) * 20 + 50;
  const charterFit = roleMatchesFunction(args.card, args.mission.deficitFunction) ? 80 : 55;
  const engineSynergy = /engine|synergy|token|sacrifice/.test(args.card.roles.join(" ")) ? 75 : 40;
  let compositeScore = roleQuality * 0.35 + bracketQuality * 0.25 + charterFit * 0.25 + engineSynergy * 0.15;
  if (args.mission.roleConstraint === "MUST_SATISFY_ROLE" && args.mission.deficitFunction === "interaction") {
    compositeScore = roleQuality * 0.55 + bracketQuality * 0.35 + charterFit * 0.1;
  }
  return { roleQuality, bracketQuality, charterFit, engineSynergy, compositeScore: Math.round(compositeScore) };
}

export function executeStructuralSearchV4166(args: {
  executionId: string;
  mission: AggregatedStructuralMissionV4166;
  candidatePool: CouncilCardV46[];
  selectedCards: CouncilCardV46[];
  catalog: DeckResolutionCatalog | null;
  commanderColorIdentity: string[];
  requestedBracket: number;
  tier?: StructuralSearchTierV4165;
}): StructuralSearchExecutionV4166 {
  const compiled = compileStructuralSearchV4166({ mission: args.mission, tier: args.tier });
  const selectedIds = new Set(args.selectedCards.map((c) => c.oracleId ?? c.cardId));
  const selectedBefore = args.selectedCards.length;
  const considered: ConsideredCandidateV4166[] = [];
  const retrievedCanonicalIds: string[] = [];
  const legalCandidateIds: string[] = [];
  const qualityPassedIds: string[] = [];
  const qualityFloor = args.requestedBracket >= 4 ? 72 : 60;

  for (const card of args.candidatePool) {
    const oid = card.oracleId ?? card.cardId;
    retrievedCanonicalIds.push(oid);
    const truth = resolveCanonicalCardTruthV4164({ name: card.name, oracleId: card.oracleId, catalog: args.catalog });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) {
      considered.push({
        oracleId: oid,
        name: card.name,
        ...scoreCandidate({ card, mission: args.mission, requestedBracket: args.requestedBracket }),
        accepted: false,
        rejectionReason: "UNRESOLVED_ORACLE",
      });
      continue;
    }
    if (!cardLegalInCommanderColorIdentity({ card: truth, commanderColorIdentity: args.commanderColorIdentity })) {
      considered.push({
        oracleId: oid,
        name: card.name,
        ...scoreCandidate({ card, mission: args.mission, requestedBracket: args.requestedBracket }),
        accepted: false,
        rejectionReason: "ALL_OFF_COLOR",
      });
      continue;
    }
    if (selectedIds.has(oid)) {
      considered.push({
        oracleId: oid,
        name: card.name,
        ...scoreCandidate({ card, mission: args.mission, requestedBracket: args.requestedBracket }),
        accepted: false,
        rejectionReason: "ALL_ALREADY_SELECTED",
      });
      continue;
    }
    legalCandidateIds.push(oid);
    const scores = scoreCandidate({ card, mission: args.mission, requestedBracket: args.requestedBracket });
    if (!roleMatchesFunction(card, args.mission.deficitFunction) && compiled.requireEngineSynergy) {
      considered.push({
        oracleId: oid,
        name: card.name,
        ...scores,
        accepted: false,
        rejectionReason: "ALL_WRONG_FUNCTION",
      });
      continue;
    }
    if (scores.compositeScore < qualityFloor) {
      considered.push({
        oracleId: oid,
        name: card.name,
        ...scores,
        accepted: false,
        rejectionReason: "ALL_TOO_LOW_QUALITY",
      });
      continue;
    }
    qualityPassedIds.push(oid);
    considered.push({ oracleId: oid, name: card.name, ...scores, accepted: true });
  }

  const candidateSetHash = [...retrievedCanonicalIds].sort().join("|").slice(0, 16);
  const searchOutcome: StructuralSearchExecutionV4166["searchOutcome"] =
    qualityPassedIds.length > 0 ? "CANDIDATES_FOUND" : "SEARCH_NO_PROGRESS";

  return {
    version: PROFESSOR_STRUCTURAL_SEARCH_EXECUTION_V4_16_6_V1_VERSION,
    executionId: args.executionId,
    missionId: args.mission.missionId,
    tier: compiled.tier,
    retriever: compiled.retriever,
    compiledQuery: compiled.compiledQuery,
    startedAt: new Date().toISOString(),
    retrievedCanonicalIds,
    legalCandidateIds,
    qualityPassedIds,
    rejected: considered.filter((c) => !c.accepted),
    candidatesConsidered: considered,
    selectedIds: [],
    selectedCountBefore: selectedBefore,
    selectedCountAfter: selectedBefore,
    candidateSetHash,
    searchOutcome,
  };
}

export function selectStructuralSearchCardsV4166(args: {
  execution: StructuralSearchExecutionV4166;
  candidatePool: CouncilCardV46[];
  maxSlots: number;
}): { execution: StructuralSearchExecutionV4166; selectedCards: CouncilCardV46[] } {
  const accepted = args.execution.candidatesConsidered
    .filter((c) => c.accepted)
    .sort((a, b) => b.compositeScore - a.compositeScore);
  const cardById = new Map(args.candidatePool.map((c) => [c.oracleId ?? c.cardId, c]));
  const selectedCards: CouncilCardV46[] = [];
  const selectedIds: string[] = [];
  for (const candidate of accepted) {
    if (selectedCards.length >= args.maxSlots) break;
    const card = cardById.get(candidate.oracleId);
    if (!card) continue;
    selectedCards.push(card);
    selectedIds.push(candidate.oracleId);
  }
  const searchOutcome: StructuralSearchExecutionV4166["searchOutcome"] =
    selectedIds.length > 0 ? "CANDIDATES_FOUND" : args.execution.searchOutcome;
  return {
    execution: {
      ...args.execution,
      selectedIds,
      selectedCountAfter: args.execution.selectedCountBefore + selectedIds.length,
      searchOutcome,
    },
    selectedCards,
  };
}

export function reconcileCandidateSupplyV4166(args: {
  execution: StructuralSearchExecutionV4166;
  considered: ConsideredCandidateV4166[];
  neededSlots: number;
}): ReconciledCandidateSupplyV4166 {
  const list = args.considered;
  let canonicalUnresolved = 0;
  let illegal = 0;
  let wrongFunction = 0;
  let belowQualityFloor = 0;
  let alreadySelected = 0;
  let strong = 0;
  let marginal = 0;
  let viable = 0;

  for (const c of list) {
    if (c.rejectionReason === "UNRESOLVED_ORACLE") canonicalUnresolved += 1;
    else if (c.rejectionReason === "ALL_OFF_COLOR") illegal += 1;
    else if (c.rejectionReason === "ALL_WRONG_FUNCTION") wrongFunction += 1;
    else if (c.rejectionReason === "ALL_TOO_LOW_QUALITY") belowQualityFloor += 1;
    else if (c.rejectionReason === "ALL_ALREADY_SELECTED") alreadySelected += 1;
    if (c.accepted) {
      viable += 1;
      if (c.compositeScore >= 85) strong += 1;
      else marginal += 1;
    }
  }

  return {
    neededSlots: args.neededSlots,
    retrieved: args.execution.retrievedCanonicalIds.length,
    canonicalUnresolved,
    illegal,
    wrongFunction,
    belowQualityFloor,
    alreadySelected,
    viableCandidateCount: viable,
    strongCandidateCount: strong,
    marginalCandidateCount: marginal,
    rejectedCandidateCount: list.filter((c) => !c.accepted).length,
    selected: args.execution.selectedIds.length,
    candidatesConsidered: list,
  };
}

export type ExhaustionEvidenceV4166 = {
  version: typeof PROFESSOR_STRUCTURAL_SEARCH_EXECUTION_V4_16_6_V1_VERSION;
  applicableTiers: StructuralSearchTierV4165[];
  executedTiers: StructuralSearchTierV4165[];
  skippedTiersWithReasons: { tier: StructuralSearchTierV4165; reason: string }[];
  actualExecutionIds: string[];
  totalCandidatesRetrieved: number;
  totalCanonicalResolved: number;
  totalLegal: number;
  totalQualityPassed: number;
  totalRejected: number;
  rejectionDistribution: Partial<Record<StructuralSearchRejectionReasonV4165, number>>;
  theoryRevisionsAttempted: string[];
  functionalSubstitutionsAttempted: string[];
  unexploredSearchSpaces: string[];
  validForTerminalExhaustion: boolean;
  invalidReason?: string;
};

export function buildExhaustionEvidenceV4166(args: {
  executions: StructuralSearchExecutionV4166[];
  applicableTiers?: StructuralSearchTierV4165[];
}): ExhaustionEvidenceV4166 {
  const applicableTiers = args.applicableTiers ?? ([1, 2, 3, 4, 5, 6, 7] as StructuralSearchTierV4165[]);
  const executedTiers = [...new Set(args.executions.map((e) => e.tier))].sort() as StructuralSearchTierV4165[];
  const skippedTiersWithReasons = applicableTiers
    .filter((t) => !executedTiers.includes(t))
    .map((tier) => ({ tier, reason: "not executed" }));
  const rejectionDistribution: ExhaustionEvidenceV4166["rejectionDistribution"] = {};
  let totalCandidatesRetrieved = 0;
  let totalLegal = 0;
  let totalQualityPassed = 0;
  let totalRejected = 0;
  let totalCanonicalResolved = 0;

  for (const ex of args.executions) {
    totalCandidatesRetrieved += ex.retrievedCanonicalIds.length;
    totalLegal += ex.legalCandidateIds.length;
    totalQualityPassed += ex.qualityPassedIds.length;
    totalRejected += ex.rejected.length;
    totalCanonicalResolved += ex.retrievedCanonicalIds.length - ex.rejected.filter((r) => r.rejectionReason === "UNRESOLVED_ORACLE").length;
    for (const r of ex.rejected) {
      if (r.rejectionReason) rejectionDistribution[r.rejectionReason] = (rejectionDistribution[r.rejectionReason] ?? 0) + 1;
    }
  }

  const unexploredSearchSpaces = skippedTiersWithReasons.map((s) => `tier-${s.tier}`);
  const validForTerminalExhaustion =
    args.executions.length > 0 &&
    skippedTiersWithReasons.length === 0 &&
    totalCandidatesRetrieved > 0;

  let invalidReason: string | undefined;
  if (args.executions.length === 0) invalidReason = "no executions recorded";
  else if (executedTiers.length === 0) invalidReason = "searchTiersAttempted empty";
  else if (totalCandidatesRetrieved === 0) invalidReason = "candidatesFound zero with no retrieval";
  else if (skippedTiersWithReasons.length > 0) invalidReason = "unexplored search spaces remain";

  return {
    version: PROFESSOR_STRUCTURAL_SEARCH_EXECUTION_V4_16_6_V1_VERSION,
    applicableTiers,
    executedTiers,
    skippedTiersWithReasons,
    actualExecutionIds: args.executions.map((e) => e.executionId),
    totalCandidatesRetrieved,
    totalCanonicalResolved,
    totalLegal,
    totalQualityPassed,
    totalRejected,
    rejectionDistribution,
    theoryRevisionsAttempted: [],
    functionalSubstitutionsAttempted: args.executions.filter((e) => e.retriever === "FUNCTIONAL_SUBSTITUTION").map((e) => e.executionId),
    unexploredSearchSpaces,
    validForTerminalExhaustion,
    invalidReason,
  };
}

export function validateAllTooLowQualityEvidence(rejected: ConsideredCandidateV4166[]): boolean {
  const lowQuality = rejected.filter((r) => r.rejectionReason === "ALL_TOO_LOW_QUALITY");
  return lowQuality.length === 0 || lowQuality.every((c) => c.oracleId && c.compositeScore > 0);
}
