/**
 * Professor Council Assembly v4.7 — needs-driven discovery, profile-based snapshots.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { ProfessorV41ConversationLoopResultV1 } from "./professor-v4-1-conversation-loop-v1";
import type { ProfessorDeckListEntryV43 } from "./professor-brew-deck-list-v4-3-v1";
import {
  ASSEMBLY_STOP_TARGET_V46,
  CHECKPOINT_THRESHOLDS_V46,
  CUT_REVIEW_THRESHOLD_V46,
  INITIAL_BATCH_TARGET_V46,
  buildBracketBuildPolicyV46,
  maybeRunCheckpointV46,
  runCheckpointCouncilV46,
  runCutReviewV46,
  type BracketBuildPolicyV46,
  type CardDecisionV46,
  type CouncilCardV46,
  type DeckSnapshotV46,
  type ProfessorCouncilStateV46,
} from "./professor-council-assembly-v4-6-v1";
import type { CouncilBrewContextV45, CouncilTurnV45, DeckCharterV45, ProfessorCouncilStateV45 } from "./professor-council-state-v4-5-v1";
import {
  ASSEMBLY_STRUCTURAL_TARGET_V47,
  COMMANDER_DECK_LIBRARY_SIZE_V47,
  COMMANDER_DECK_TOTAL_CARDS_V47,
  INITIAL_BATCH_TARGET_V47,
  type DeckBuildPhaseV47,
  type LegalityGateResultV47,
} from "./professor-deck-completion-v4-7-v1";
import {
  buildInitialDeckNeedsV47,
  deriveDeckNeedsFromSnapshotV47,
  type DeckNeedV47,
} from "./professor-deck-needs-v4-7-v1";
import {
  discoverCandidatesV47,
  ensureCandidateSupplyV47,
  forceEmergencyCandidateRefillV47,
  sanitizeCandidatePoolV47,
  type CandidateDiscoveryReportV47,
  type CandidatePoolByNeedV47,
} from "./professor-candidate-discovery-v4-7-v1";
import {
  buildFunctionalCardProfileV47,
  roleCoverageFromProfiles,
  type FunctionalCardProfileV47,
} from "./professor-functional-profile-v4-7-v1";
import {
  assessCanonicalDeckLegalityV4161,
  candidatePassesSingletonPrefilterV4161,
  isCardAvailableForSingletonAddV4161,
  selectedCanonicalMatchKeysV4161,
  type CanonicalLegalityAssessmentV4161,
} from "./professor-canonical-legality-v4-16-1-v1";
import type { BracketBuildPlanV49 } from "./professor-bracket-build-plan-v4-9-v1";
import { analyzeBracketGapV49, type BracketGapAnalysisV49 } from "./professor-bracket-gap-analysis-v4-9-v1";
import { bracketPowerWeightV49 } from "./professor-bracket-policy-v4-9-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import type { BracketPowerDecisionV410 } from "./professor-bracket-power-decision-v4-10-v1";
import type { BracketSearchComparisonV410 } from "./professor-bracket-candidate-scoring-v4-10-v1";
import type { BracketUpgradeMissionV410 } from "./professor-bracket-upgrade-mission-v4-10-v1";
import { analyzeBracketGapV410, type BracketGapAnalysisV410 } from "./professor-bracket-gap-analysis-v4-10-v1";
import { scoreCandidateForBracketV410 } from "./professor-bracket-candidate-scoring-v4-10-v1";
import { runCheckpointCouncilV410 } from "./professor-bracket-checkpoint-v4-10-v1";
import type { BracketConstructionContractV416 } from "./professor-bracket-construction-contract-v4-16-v1";
import type { BracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import type { BracketPowerSearchReportV416, BracketPowerSearchHistoryV416 } from "./professor-bracket-power-search-mission-v4-16-v1";
import type { ManaPlanV416 } from "./professor-mana-plan-v4-16-v1";
import type { BracketReadinessV416 } from "./professor-bracket-readiness-v4-16-v1";
import {
  buildInitialDeckNeedsV416,
  buildWinArchitectureDeckNeedsV416,
  inferWinArchitectureFromCharterV416,
} from "./professor-deck-needs-v4-16-v1";
import { evaluateBracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import {
  executeBracketPowerSearchMissionV416,
  planPowerSearchMissionsV416,
} from "./professor-bracket-power-search-mission-v4-16-v1";
import { buildManaPlanV416, resolveStructuralTargetV416, recomputeManaPlanV416 } from "./professor-mana-plan-v4-16-v1";
import { assessBracketReadinessV416 } from "./professor-bracket-readiness-v4-16-v1";
import { evaluateBracketPowerUtilizationV4161, type BracketPowerUtilizationV4161 } from "./professor-bracket-power-utilization-v4-16-1-v1";
import { assessB4WinReadinessV4161, type B4WinReadinessV4161 } from "./professor-b4-win-readiness-v4-16-1-v1";
import type { MutationRecordV4161 } from "./professor-mutation-integrity-v4-16-1-v1";
import { countGameChangersInDeckV4162, buildGameChangerReviewStateV4162 } from "./professor-game-changer-registry-v4-16-2-v1";
import { assessBracketReadinessQualityV4162 } from "./professor-bracket-readiness-quality-v4-16-2-v1";
import type { GameChangerReviewStateV4162 } from "./professor-game-changer-registry-v4-16-2-v1";
import { assessDeckSlotBudgetV4163, type DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import { buildAccessArchitectureV4163, type AccessArchitectureV4163 } from "./professor-access-architecture-v4-16-3-v1";
import {
  assessBracketPowerAssessmentV4163,
  type BracketPowerAssessmentV4163,
} from "./professor-bracket-power-assessment-v4-16-3-v1";
import { rankOpportunityCostCandidatesV4163, type OpportunityCostReportV4163 } from "./professor-opportunity-cost-v4-16-3-v1";
import {
  adaptOpportunityCostV4164ToV4163,
  rankOpportunityCostCandidatesV4164,
  type OpportunityCostReportV4164,
} from "./professor-opportunity-cost-v4-16-4-v1";
import {
  adaptWinReadinessV4164ToV4161,
  assessVerifiedWinLineV4164,
  type B4WinReadinessV4164,
} from "./professor-verified-win-line-v4-16-4-v1";
import {
  buildAccessArchitectureV4165,
  type AccessArchitectureV4165,
} from "./professor-verified-access-route-v4-16-5-v1";
import type { AccessArchitectureV4164 } from "./professor-verified-access-route-v4-16-4-v1";
import {
  buildStructuralCompletionPlanV4164,
  buildStructuralExhaustionAuditV4164,
  updateStructuralBuildTelemetryV4164,
  type StructuralBuildTelemetryV4164,
  type StructuralCompletionPlanV4164,
  type StructuralExhaustionAuditV4164,
} from "./professor-structural-completion-v4-16-4-v1";
import {
  updateStructuralBuildTelemetryV4165,
  type StructuralBuildTelemetryV4165,
} from "./professor-structural-build-telemetry-v4-16-5-v1";
import {
  shouldRunStructuralResearchV4166,
  structuralBuildPhaseForTelemetryV4166,
  updateStructuralBuildTelemetryV4166,
  type StructuralBuildTelemetryV4166,
} from "./professor-structural-build-telemetry-v4-16-6-v1";
import {
  recordBuildControlDecisionV41661,
  resolveProfessorBuildControlV41661,
} from "./professor-build-control-v4-16-6-1-v1";
import {
  resolveProfessorNextActionV41662,
  updateClosureExecutionStateV41662,
} from "./professor-next-action-dispatch-v4-16-6-2-v1";
import {
  assessStrategicProgressV41662,
  enrichTheoryRealizationGovernanceV41662,
} from "./professor-strategic-progress-v4-16-6-2-v1";
import { compileMissionForDispatchV41662 } from "./professor-structural-research-pass-v4-16-6-2-v1";
import {
  executeStructuralSearchV4166,
  selectStructuralSearchCardsV4166,
} from "./professor-structural-search-execution-v4-16-6-v1";
import { assessTheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";
import type { StructuralCompletionPlanV4165 } from "./professor-structural-search-planner-v4-16-5-v1";
import type { StructuralCompletionPlanV4166 } from "./professor-structural-search-planner-v4-16-6-v1";
import { buildStructuralCompletionPlanV4166 } from "./professor-structural-search-planner-v4-16-6-v1";
import { resolveCanonicalCardTruthV4164 } from "./professor-canonical-card-truth-v4-16-4-v1";
import {
  runPreFinalQualityCriticV4163,
  type PreFinalQualityCriticReportV4163,
} from "./professor-pre-final-quality-critic-v4-16-3-v1";

export const PROFESSOR_COUNCIL_ASSEMBLY_V4_7_V1_VERSION = "professor-council-assembly-v4-7-v1";

export type ProfessorCouncilStateV47 = Omit<ProfessorCouncilStateV46, "version"> & {
  version: typeof PROFESSOR_COUNCIL_ASSEMBLY_V4_7_V1_VERSION;
  buildPhase: DeckBuildPhaseV47;
  deckNeeds: DeckNeedV47[];
  candidatesByNeed: CandidatePoolByNeedV47;
  functionalProfiles: Record<string, FunctionalCardProfileV47>;
  discoveryReports: CandidateDiscoveryReportV47[];
  legalityGate: LegalityGateResultV47 | null;
  targetTotalCards: number;
  bracketBuildPlan: BracketBuildPlanV49 | null;
  bracketPowerPlanV410?: BracketPowerPlanV410 | null;
  bracketPowerDecisionV410?: BracketPowerDecisionV410 | null;
  searchComparisonTelemetryV410?: BracketSearchComparisonV410[];
  bracketUpgradeMissionV410?: BracketUpgradeMissionV410 | null;
  bracketUpgradeMissionV411?: import("./professor-bracket-upgrade-mission-v4-11-v1").BracketUpgradeMissionV411 | null;
  bracketConstructionContractV416?: BracketConstructionContractV416 | null;
  manaPlanV416?: ManaPlanV416 | null;
  bracketPowerPortfolioV416?: BracketPowerPortfolioV416 | null;
  bracketPowerSearchReportsV416?: BracketPowerSearchReportV416[];
  bracketReadinessV416?: BracketReadinessV416 | null;
  highDeficitCheckpointStreakV416?: number;
  winArchitectureLockedV416?: boolean;
  canonicalLegalityV4161?: CanonicalLegalityAssessmentV4161 | null;
  bracketPowerUtilizationV4161?: BracketPowerUtilizationV4161 | null;
  b4WinReadinessV4161?: B4WinReadinessV4161 | null;
  mutationRecordsV4161?: MutationRecordV4161[];
  bracketPowerSearchHistoryV416?: BracketPowerSearchHistoryV416 | null;
  gameChangerReviewStateV4162?: GameChangerReviewStateV4162 | null;
  bracketResearchExhaustedV4162?: boolean;
  bracketResearchPassCountV4162?: number;
  preFinalQualityCriticV4162?: import("./professor-pre-final-quality-critic-v4-16-2-v1").PreFinalQualityCriticReportV4162 | null;
  bracketReadinessQualityV4162?: import("./professor-bracket-readiness-quality-v4-16-2-v1").BracketReadinessQualityV4162 | null;
  deckSlotBudgetV4163?: DeckSlotBudgetV4163 | null;
  accessArchitectureV4163?: AccessArchitectureV4163 | null;
  bracketPowerAssessmentV4163?: BracketPowerAssessmentV4163 | null;
  opportunityCostV4163?: OpportunityCostReportV4163 | null;
  opportunityCostV4164?: OpportunityCostReportV4164 | null;
  preFinalQualityCriticV4163?: PreFinalQualityCriticReportV4163 | null;
  accessArchitectureV4164?: AccessArchitectureV4164 | null;
  accessArchitectureV4165?: AccessArchitectureV4165 | null;
  b4WinReadinessV4164?: B4WinReadinessV4164 | null;
  structuralCompletionPlanV4164?: StructuralCompletionPlanV4164 | null;
  structuralCompletionPlanV4165?: import("./professor-structural-search-planner-v4-16-5-v1").StructuralCompletionPlanV4165 | null;
  structuralCompletionPlanV4166?: StructuralCompletionPlanV4166 | null;
  structuralBuildTelemetryV4164?: StructuralBuildTelemetryV4164 | null;
  structuralBuildTelemetryV4165?: import("./professor-structural-build-telemetry-v4-16-5-v1").StructuralBuildTelemetryV4165 | null;
  structuralBuildTelemetryV4166?: StructuralBuildTelemetryV4166 | null;
  structuralExhaustionAuditV4164?: StructuralExhaustionAuditV4164 | null;
  professorBuildControlV41661?: import("./professor-build-control-v4-16-6-1-v1").ProfessorBuildControlV41661 | null;
  buildControlDecisionLogV41661?: import("./professor-build-control-v4-16-6-1-v1").BuildControlDecisionV41661[];
  strategicProgressV41662?: import("./professor-strategic-progress-v4-16-6-2-v1").StrategicProgressV41662 | null;
  theoryRealizationGovernanceV41662?: import("./professor-strategic-progress-v4-16-6-2-v1").TheoryRealizationGovernanceV41662[];
  closureExecutionStateV41662?: import("./professor-next-action-dispatch-v4-16-6-2-v1").ClosureExecutionStateV41662 | null;
  professorNextActionV41662?: import("./professor-next-action-dispatch-v4-16-6-2-v1").ProfessorNextActionDecisionV41662 | null;
};

function countSnapshotTutors(selected: CouncilCardV46[]): number {
  return selected.filter((c) =>
    /tutor|diabolic|demonic|vampiric|imperial seal|gamble|worldly|enlightened|mystical|personal tutor|recruiter|survival of the fittest|finale of devastation|fabricate|merchant scroll|wishclaw|spellseeker|tribute mage|isochron scepter/i.test(
      c.name,
    ),
  ).length;
}

function computeAvgManaValueV47(args: {
  selected: CouncilCardV46[];
  catalog: DeckResolutionCatalog | null;
}): number {
  const nonlands = args.selected.filter((c) => c.category !== "land");
  if (nonlands.length === 0) return 0;
  let total = 0;
  let counted = 0;
  for (const card of nonlands) {
    const golden = card.oracleId && args.catalog ? args.catalog.byOracleId.get(card.oracleId) : null;
    const mv = golden?.manaValue ?? card.manaValue;
    if (typeof mv === "number" && Number.isFinite(mv)) {
      total += mv;
      counted++;
    }
  }
  return counted > 0 ? Math.round((total / counted) * 100) / 100 : 0;
}

function countRampNonLand(selected: CouncilCardV46[], profiles: FunctionalCardProfileV47[]): number {
  const profileByOracle = new Map(profiles.map((p) => [p.oracleId, p]));
  return selected.filter((c) => {
    if (c.category === "land") return false;
    const prof = c.oracleId ? profileByOracle.get(c.oracleId) : null;
    return prof?.roles.includes("ramp") ?? c.roles.includes("ramp");
  }).length;
}
export function profileMapForSelected(
  selected: CouncilCardV46[],
  catalog: DeckResolutionCatalog | null,
  existing: Record<string, FunctionalCardProfileV47>,
): Record<string, FunctionalCardProfileV47> {
  const next = { ...existing };
  for (const card of selected) {
    if (!card.oracleId || next[card.oracleId]) continue;
    const golden = catalog?.byOracleId.get(card.oracleId);
    if (golden) next[card.oracleId] = buildFunctionalCardProfileV47(golden);
  }
  return next;
}

function resolveProfilesForSelectedV414(args: {
  selected: CouncilCardV46[];
  catalog: DeckResolutionCatalog | null;
  functionalProfiles: Record<string, FunctionalCardProfileV47>;
}): FunctionalCardProfileV47[] {
  const profiles: FunctionalCardProfileV47[] = [];
  for (const card of args.selected) {
    if (card.oracleId && args.catalog) {
      const golden = args.catalog.byOracleId.get(card.oracleId);
      if (golden) {
        profiles.push(buildFunctionalCardProfileV47(golden));
        continue;
      }
    }
    if (card.oracleId && args.functionalProfiles[card.oracleId]) {
      profiles.push(args.functionalProfiles[card.oracleId]!);
      continue;
    }
    if (card.roles.length > 0 && card.category !== "land") {
      profiles.push({
        oracleId: card.oracleId ?? card.cardId,
        name: card.name,
        exactOracleText: "",
        typeLine: "",
        manaValue: 0,
        colorIdentity: [],
        roles: card.roles.filter((r): r is FunctionalRoleV47 =>
          [
            "ramp", "card-advantage", "interaction", "protection", "recovery", "proliferate",
            "counter-engine", "counter-payoff", "lifegain-enabler", "lifegain-payoff",
            "sacrifice-outlet", "token-generation", "finisher", "legendary", "land",
          ].includes(r as FunctionalRoleV47),
        ),
        mechanics: [],
        eventsProduced: [],
        eventsConsumed: [],
        resourcesProduced: [],
        resourcesConsumed: [],
        cardTypes: [],
        roleCompressionScore: card.roles.length,
      });
    }
  }
  return profiles;
}

/** Recompute snapshot from canonical selected cards + oracle profiles — never incrementally patch totals. */
export function computeDeckSnapshotV47(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog | null;
}): DeckSnapshotV46 {
  const selected = args.state.selectedCards;
  const profiles = resolveProfilesForSelectedV414({
    selected,
    catalog: args.catalog,
    functionalProfiles: args.state.functionalProfiles,
  });

  const roleCoverage = roleCoverageFromProfiles(profiles);
  const nonlands = selected.filter((c) => c.category !== "land");
  const dep = { high: 0, medium: 0, low: 0 };
  for (const card of nonlands) dep[card.commanderDependence === "HIGH" ? "high" : card.commanderDependence === "MEDIUM" ? "medium" : "low"]++;

  const lifegainEnablerCount = roleCoverage["lifegain-enabler"] ?? 0;
  const lifegainPayoffCount = roleCoverage["lifegain-payoff"] ?? 0;
  const cardAdvantageCoverage = roleCoverage["card-advantage"] ?? 0;
  const interactionCoverage = roleCoverage["interaction"] ?? 0;
  const protectionCoverage = roleCoverage["protection"] ?? 0;
  const rampNonLandCount = countRampNonLand(selected, profiles);
  const tutorCount = countSnapshotTutors(selected);
  const avgManaValue = computeAvgManaValueV47({ selected, catalog: args.catalog });
  const rampCoverage = rampNonLandCount;
  const proliferateCount = roleCoverage["proliferate"] ?? 0;
  const counterEngineCount = roleCoverage["counter-engine"] ?? 0;
  const counterPayoffCount = roleCoverage["counter-payoff"] ?? 0;

  const weaknesses: string[] = [];
  const charter = args.state.deckCharter;
  const relationship = charter?.commanderRelationship ?? "Harmony";

  if (lifegainEnablerCount >= 4 && lifegainPayoffCount + cardAdvantageCoverage < 2) {
    weaknesses.push("Many lifegain enablers but few payoffs converting life into cards or durable advantage");
  }
  if (counterEngineCount + proliferateCount >= 6 && counterPayoffCount < 2) {
    weaknesses.push("Many counter producers but few payoffs for high counter density");
  }
  if (cardAdvantageCoverage < 2 && nonlands.length >= 10) {
    weaknesses.push("Card advantage coverage is thin for deck size");
  }
  if (interactionCoverage < 1 && nonlands.length >= 10) {
    weaknesses.push("Interaction suite not yet established");
  }
  if (protectionCoverage < 1 && nonlands.length >= 10) {
    weaknesses.push("Protection/recovery not yet established");
  }
  if (relationship === "Harmony" && dep.high > dep.low + dep.medium) {
    weaknesses.push("Commander dependence is high relative to Harmony target");
  }

  const underused: string[] = [];
  if (lifegainEnablerCount >= 3 && lifegainPayoffCount === 0) underused.push("life_gain");
  if (counterEngineCount >= 4 && counterPayoffCount === 0) underused.push("counter_density");

  const baseResearchQuestion =
    weaknesses[0]?.includes("card advantage")
      ? `Search for card-advantage engines aligned to ${charter?.primaryStrategy ?? "the charter"}.`
      : weaknesses[0]?.includes("counter")
        ? "Search for payoffs that reward the counter density this deck already produces."
        : weaknesses[0]
          ? `Primary gap: ${weaknesses[0]} — search catalog for multifunction replacements.`
          : charter
            ? `Hold course on ${charter.deckIdentity.slice(0, 80)} — next picks should compress roles for ${charter.primaryStrategy.slice(0, 60)}.`
            : "Search for the next multifunction candidate that advances the current deck snapshot.";

  const snapshotBase: DeckSnapshotV46 = {
    snapshotId: `snap-v47-r${args.state.assemblyRevision}-${selected.length}`,
    revision: args.state.assemblyRevision,
    cardCount: selected.length,
    nonlandCount: nonlands.length,
    landCount: selected.length - nonlands.length,
    targetCount: args.state.targetTotalCards,
    selectedCardsSummary: selected.map((c) => ({
      name: c.name,
      roles: c.oracleId && args.state.functionalProfiles[c.oracleId] ? args.state.functionalProfiles[c.oracleId]!.roles : c.roles,
      status: c.status,
    })),
    roleCoverage,
    engineCoverage: {},
    packageCoverage: {},
    commanderDependenceDistribution: dep,
    independentEngineCoverage: dep.low + dep.medium,
    interactionCoverage,
    protectionCoverage,
    recoveryCoverage: roleCoverage["recovery"] ?? 0,
    cardAdvantageCoverage,
    rampCoverage,
    lifegainEnablerCount,
    lifegainPayoffCount,
    legendaryPayoffCount: roleCoverage["legendary"] ?? 0,
    semanticResourcesProduced: underused,
    semanticResourcesConsumed: [],
    underusedResources: underused,
    redundancyClusters: [],
    lowConnectionCards: selected.filter((c) => (c.oracleId ? args.state.functionalProfiles[c.oracleId]?.roles.length ?? 0 : c.roles.length) <= 1).map((c) => c.name),
    highRoleCompressionCards: selected.filter((c) => (c.oracleId ? (args.state.functionalProfiles[c.oracleId]?.roles.length ?? 0) : c.roles.length) >= 3).map((c) => c.name),
    unresolvedVerification: selected.filter((c) => !c.oracleVerified).map((c) => c.name),
    weaknesses,
    charterAlignment: charter ? [`Building toward: ${charter.deckIdentity.slice(0, 100)}`] : [],
    bracketAlignment: args.state.bracketBuildPlan
      ? [`Target B${args.state.bracketBuildPlan.targetBracket}`, ...args.state.bracketBuildPlan.powerPlanSummary.slice(0, 2)]
      : args.state.bracketBuildPolicy
        ? [args.state.bracketBuildPolicy.comboExpectation]
        : [],
    userIntentAlignment: charter ? [charter.commanderRelationship, charter.playStyle] : [],
    researchQuestion: baseResearchQuestion,
  };

  const finisherCount = roleCoverage["finisher"] ?? 0;
  const gameChangerCount = countGameChangersInDeckV4162({
    selectedCards: args.state.selectedCards,
    catalog: args.catalog,
  });
  const bracketGapAnalysis = analyzeBracketGapV410({
    plan: args.state.bracketBuildPlan,
    powerPlan: args.state.bracketPowerPlanV410 ?? null,
    snapshot: snapshotBase,
    gameChangerCount,
    tutorCount,
    finisherCount,
  });

  return {
    ...snapshotBase,
    avgManaValue,
    rampNonLandCount,
    tutorCount,
    researchQuestion: bracketGapAnalysis?.checkpointQuestion ?? baseResearchQuestion,
    bracketGapAnalysis,
  };
}

function scoreForBatch(
  card: CouncilCardV46,
  snapshot: DeckSnapshotV46,
  charter: DeckCharterV45,
  bracketPlan: BracketBuildPlanV49 | null,
  powerPlan: BracketPowerPlanV410 | null = null,
): number {
  if (powerPlan && bracketPlan) {
    const pseudoProfile: FunctionalCardProfileV47 = {
      oracleId: card.oracleId ?? card.cardId,
      name: card.name,
      exactOracleText: card.oracleSummary ?? "",
      typeLine: card.typeLine ?? "",
      manaValue: card.manaValue ?? 3,
      colorIdentity: [],
      roles: card.roles as FunctionalCardProfileV47["roles"],
      mechanics: [],
      eventsProduced: [],
      eventsConsumed: [],
      resourcesProduced: [],
      resourcesConsumed: [],
      cardTypes: [],
      roleCompressionScore: card.roles.length,
    };
    const breakdown = scoreCandidateForBracketV410({
      profile: pseudoProfile,
      bracket: bracketPlan.targetBracket,
      powerPlan,
    });
    let score = breakdown.finalScore;
    if (snapshot.weaknesses.some((w) => w.includes("card advantage")) && card.roles.includes("card-advantage")) score += 3;
    if (charter.commanderRelationship === "Harmony" && card.worksWithoutCommander === "HIGH") score += 2;
    if (snapshot.bracketGapAnalysis?.recommendedPowerLevers.some((l) => /interaction/i.test(l)) && card.roles.includes("interaction")) {
      score += 3;
    }
    return score;
  }
  let score = card.roles.length;
  const powerWeight = bracketPlan ? bracketPowerWeightV49(bracketPlan.targetBracket) : 0.5;
  if (snapshot.weaknesses.some((w) => w.includes("card advantage")) && card.roles.includes("card-advantage")) score += 5;
  if (snapshot.weaknesses.some((w) => w.includes("counter")) && card.roles.includes("counter-payoff")) score += 5;
  if (snapshot.interactionCoverage < 2 && card.roles.includes("interaction")) score += 4;
  if (snapshot.rampCoverage < 3 && card.roles.includes("ramp")) score += 3;
  if (charter.commanderRelationship === "Harmony" && card.worksWithoutCommander === "HIGH") score += 2;
  if (bracketPlan && bracketPlan.targetBracket >= 4) {
    if (card.roles.includes("ramp")) score += Math.round(3 * powerWeight);
    if (card.roles.includes("interaction")) score += Math.round(2 * powerWeight);
    if (card.roles.includes("finisher")) score += Math.round(4 * powerWeight);
    if (card.roles.includes("card-advantage")) score += Math.round(2 * powerWeight);
    if (card.roles.includes("protection")) score += 2;
    if (/sol ring|mana crypt|dockside|thassa|demonic tutor|force of will|cyclonic rift/i.test(card.name)) score += 3;
  }
  if (snapshot.bracketGapAnalysis?.recommendedPowerLevers.some((l) => /interaction/i.test(l)) && card.roles.includes("interaction")) {
    score += 3;
  }
  return score;
}

function selectBatchFromPool(args: {
  pool: CouncilCardV46[];
  selected: CouncilCardV46[];
  snapshot: DeckSnapshotV46;
  charter: DeckCharterV45;
  batchSize: number;
  bracketPlan: BracketBuildPlanV49 | null;
  powerPlan?: BracketPowerPlanV410 | null;
  catalog?: DeckResolutionCatalog | null;
}): CouncilCardV46[] {
  const selectedIds = new Set(args.selected.map((c) => c.cardId));
  const canonicalKeys = selectedCanonicalMatchKeysV4161(args.selected, args.catalog);
  return [...args.pool]
    .filter((c) => {
      if (selectedIds.has(c.cardId)) return false;
      if (!candidatePassesSingletonPrefilterV4161({ candidate: c, selected: args.selected, catalog: args.catalog })) {
        return false;
      }
      const identity = c.oracleId ? `oid:${c.oracleId}` : `name:${c.name.toLowerCase()}`;
      if (canonicalKeys.has(identity)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        scoreForBatch(b, args.snapshot, args.charter, args.bracketPlan, args.powerPlan ?? null) -
        scoreForBatch(a, args.snapshot, args.charter, args.bracketPlan, args.powerPlan ?? null),
    )
    .slice(0, args.batchSize);
}

function upgradeToV47(state: ProfessorCouncilStateV46): ProfessorCouncilStateV47 {
  const prior = state as ProfessorCouncilStateV47;
  return {
    ...state,
    version: PROFESSOR_COUNCIL_ASSEMBLY_V4_7_V1_VERSION,
    buildPhase: prior.buildPhase ?? "BUILDING",
    deckNeeds: prior.deckNeeds ?? [],
    candidatesByNeed: prior.candidatesByNeed ?? {},
    functionalProfiles: prior.functionalProfiles ?? {},
    discoveryReports: prior.discoveryReports ?? [],
    legalityGate: prior.legalityGate ?? null,
    targetTotalCards: prior.targetTotalCards ?? COMMANDER_DECK_TOTAL_CARDS_V47,
    bracketBuildPlan: prior.bracketBuildPlan ?? null,
    bracketPowerPlanV410: prior.bracketPowerPlanV410 ?? null,
    bracketPowerDecisionV410: prior.bracketPowerDecisionV410 ?? null,
    searchComparisonTelemetryV410: prior.searchComparisonTelemetryV410 ?? [],
    bracketUpgradeMissionV410: prior.bracketUpgradeMissionV410 ?? null,
    bracketConstructionContractV416: prior.bracketConstructionContractV416 ?? null,
    manaPlanV416: prior.manaPlanV416 ?? null,
    bracketPowerPortfolioV416: prior.bracketPowerPortfolioV416 ?? null,
    bracketPowerSearchReportsV416: prior.bracketPowerSearchReportsV416 ?? [],
    bracketReadinessV416: prior.bracketReadinessV416 ?? null,
    highDeficitCheckpointStreakV416: prior.highDeficitCheckpointStreakV416 ?? 0,
    winArchitectureLockedV416: prior.winArchitectureLockedV416 ?? false,
  };
}

export function recomputeBracketNativeStateV416(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog | null;
  bracket: CommanderBracket;
  commanderName?: string;
  commanderColorIdentity?: string[];
  theory?: WorkingDeckTheoryV4 | null;
  discoveryExhausted?: boolean;
  requireFullLibrary?: boolean;
  recordStructuralExecution?: boolean;
  precomputedStructuralExecution?: import("./professor-structural-search-execution-v4-16-6-v1").StructuralSearchExecutionV4166;
  cardsAddedThisPass?: number;
}): ProfessorCouncilStateV47 {
  const contract = args.state.bracketConstructionContractV416;
  if (!contract) return args.state;

  const commanderName = args.commanderName ?? args.state.deckCharter?.commander ?? "Commander";
  const legality = assessCanonicalDeckLegalityV4161({
    selectedCards: args.state.selectedCards,
    commanderName,
    catalog: args.catalog,
    requireFullLibrary: args.requireFullLibrary,
  });

  const snapshot = computeDeckSnapshotV47({ state: args.state, catalog: args.catalog });
  const profiles = resolveProfilesForSelectedV414({
    selected: args.state.selectedCards,
    catalog: args.catalog,
    functionalProfiles: args.state.functionalProfiles,
  });
  const manaPlan =
    args.state.manaPlanV416 && args.catalog
      ? recomputeManaPlanV416({
          prior: args.state.manaPlanV416,
          selectedCards: args.state.selectedCards,
        })
      : args.state.manaPlanV416;

  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan,
    selectedCards: args.state.selectedCards,
  });
  const commanderTruth = resolveCanonicalCardTruthV4164({
    name: commanderName,
    catalog: args.catalog,
  });
  const commanderColorIdentity =
    args.commanderColorIdentity ??
    (commanderTruth.colorIdentity.length > 0 ? commanderTruth.colorIdentity : commanderTruth.colors);
  const accessArchitectureV4165 = buildAccessArchitectureV4165({
    selectedCards: args.state.selectedCards,
    charter: args.state.deckCharter,
    theory: args.theory ?? null,
    catalog: args.catalog,
  });
  const accessArchitectureV4164 = accessArchitectureV4165;
  const accessArchitecture = buildAccessArchitectureV4163({
    selectedCards: args.state.selectedCards,
    charter: args.state.deckCharter,
    theory: args.theory ?? null,
    catalog: args.catalog,
  });
  const gcCount = countGameChangersInDeckV4162({
    selectedCards: args.state.selectedCards,
    catalog: args.catalog,
  });

  const portfolio = legality.effectiveBracketEvaluable
    ? evaluateBracketPowerPortfolioV416({
        contract,
        powerPlan: args.state.bracketPowerPlanV410 ?? null,
        selectedCards: args.state.selectedCards,
        profiles,
        gap: snapshot.bracketGapAnalysis as BracketGapAnalysisV410 | null,
        reservedLandSlots: manaPlan?.reservedLandSlots,
        gameChangerCount: gcCount,
        winReadiness: null,
        accessArchitecture,
      })
    : null;

  const winReadinessV4164 = assessVerifiedWinLineV4164({
    requestedBracket: args.bracket,
    selectedCards: args.state.selectedCards,
    charter: args.state.deckCharter,
    legality,
    catalog: args.catalog,
    accessRoutes: accessArchitectureV4164.routes,
  });
  const winReadiness = adaptWinReadinessV4164ToV4161(winReadinessV4164);

  const portfolioWithWin =
    portfolio && legality.effectiveBracketEvaluable
      ? evaluateBracketPowerPortfolioV416({
          contract,
          powerPlan: args.state.bracketPowerPlanV410 ?? null,
          selectedCards: args.state.selectedCards,
          profiles,
          gap: snapshot.bracketGapAnalysis as BracketGapAnalysisV410 | null,
          reservedLandSlots: manaPlan?.reservedLandSlots,
          gameChangerCount: gcCount,
          winReadiness,
          accessArchitecture,
        })
      : portfolio;

  const utilization = evaluateBracketPowerUtilizationV4161({
    requestedBracket: args.bracket,
    portfolio: portfolioWithWin,
    snapshot,
    selectedCards: args.state.selectedCards,
    legality,
  });

  const structuralTarget = resolveStructuralTargetV416(manaPlan);
  const atStructuralStop = args.state.selectedCards.length >= structuralTarget;
  const opportunityCostV4164 = rankOpportunityCostCandidatesV4164({
    selectedCards: args.state.selectedCards,
    charter: args.state.deckCharter,
    requestedBracket: args.bracket,
    commanderColorIdentity,
    catalog: args.catalog,
  });
  const opportunityCost = adaptOpportunityCostV4164ToV4163(opportunityCostV4164);
  const powerAssessment = assessBracketPowerAssessmentV4163({
    requestedBracket: args.bracket,
    portfolio: portfolioWithWin,
    quality: null,
    winReadiness,
    accessArchitecture,
    slotBudget,
    selectedNonlands: args.state.selectedCards,
    gameChangerCount: gcCount,
  });
  const preFinalCriticV4163 = atStructuralStop
    ? runPreFinalQualityCriticV4163({
        commanderName,
        charter: args.state.deckCharter,
        selectedCards: args.state.selectedCards,
        requestedBracket: args.bracket,
        slotBudget,
        accessArchitecture,
        winReadiness,
        powerAssessment,
        opportunityCost,
      })
    : null;
  const preFinalCritic = preFinalCriticV4163
    ? {
        version: "professor-pre-final-quality-critic-v4-16-2-v1" as const,
        resemblesTargetBracket: preFinalCriticV4163.resemblesTargetBracket,
        obviousWeakImplementations: preFinalCriticV4163.obviousWeakImplementations,
        disconnectedPackages: preFinalCriticV4163.disconnectedPackages,
        falseTagCountConfidence: preFinalCriticV4163.falseTagCountConfidence,
        replacementCandidates: preFinalCriticV4163.replacementCandidates,
        summary: preFinalCriticV4163.summary,
      }
    : null;
  const quality = assessBracketReadinessQualityV4162({
    selectedCards: args.state.selectedCards,
    charter: args.state.deckCharter,
    utilization,
    winReadiness,
    preFinalCritic,
    accessArchitecture,
    slotBudget,
  });
  const powerAssessmentFinal = assessBracketPowerAssessmentV4163({
    requestedBracket: args.bracket,
    portfolio: portfolioWithWin,
    quality,
    winReadiness,
    accessArchitecture,
    slotBudget,
    selectedNonlands: args.state.selectedCards,
    gameChangerCount: gcCount,
  });
  const gameChangerReviewState = buildGameChangerReviewStateV4162({
    selectedCards: args.state.selectedCards,
    catalog: args.catalog,
    considered: args.state.bracketPowerSearchHistoryV416?.candidatesAlreadyConsidered,
    rejected: args.state.bracketPowerSearchHistoryV416?.candidatesAlreadyRejected,
    selected: args.state.bracketPowerSearchHistoryV416?.candidatesAlreadySelected,
    reviewComplete: args.state.bracketPowerSearchHistoryV416?.gameChangerReviewComplete,
  });

  const theoryRealizations = assessTheoryRealizationV4165({
    theory: args.theory ?? null,
    selectedCards: args.state.selectedCards,
  });
  const structuralCompletionPlan = buildStructuralCompletionPlanV4164({
    slotBudget,
    deckNeeds: args.state.deckNeeds,
    missingBracketDimensions: portfolioWithWin?.criticalDeficits ?? [],
  });
  const structuralBuildTelemetryV4166 = updateStructuralBuildTelemetryV4166({
    prior: args.state.structuralBuildTelemetryV4166,
    slotBudget,
    deckNeeds: args.state.deckNeeds,
    theoryRealizations,
    selectedCards: args.state.selectedCards,
    candidatePool: args.state.candidatePool,
    requestedBracket: args.bracket,
    commanderColorIdentity,
    catalog: args.catalog,
    recordExecution: args.recordStructuralExecution ?? false,
    precomputedStructuralExecution: args.precomputedStructuralExecution,
    cardsAddedThisPass: args.cardsAddedThisPass ?? 0,
  });
  const structuralBuildTelemetryV4165 = updateStructuralBuildTelemetryV4165({
    prior: args.state.structuralBuildTelemetryV4165,
    slotBudget,
    deckNeeds: args.state.deckNeeds,
    theoryRealizations,
    selectedCards: args.state.selectedCards,
    candidatePool: args.state.candidatePool,
  });
  const structuralBuildTelemetry = updateStructuralBuildTelemetryV4164({
    prior: args.state.structuralBuildTelemetryV4164,
    selectedCardCount: args.state.selectedCards.length,
    remainingNonlandSlots: slotBudget.remainingNonlandSlots,
    attemptedNeeds: args.state.deckNeeds.filter((n) => n.status !== "SATISFIED").map((n) => n.needId),
  });
  const structuralExhaustionAudit = buildStructuralExhaustionAuditV4164(
    structuralBuildTelemetryV4166.exhaustionAudit.emitted
      ? { ...structuralBuildTelemetry, buildCandidateDiscoveryExhausted: true, searchTiersAttempted: structuralBuildTelemetryV4166.exhaustionAudit.evidence.executedTiers as never, candidatesFound: structuralBuildTelemetryV4166.exhaustionAudit.evidence.totalCandidatesRetrieved, candidatesRejected: structuralBuildTelemetryV4166.exhaustionAudit.evidence.totalRejected, rejectionReasons: Object.keys(structuralBuildTelemetryV4166.exhaustionAudit.evidence.rejectionDistribution), unexploredSearchSpaces: structuralBuildTelemetryV4166.exhaustionAudit.evidence.unexploredSearchSpaces }
      : structuralBuildTelemetry,
  );
  const structuralPhase = structuralBuildPhaseForTelemetryV4166(structuralBuildTelemetryV4166);
  let buildPhase = args.state.buildPhase;
  if (structuralPhase === "BUILD_FAILED_CANDIDATE_EXHAUSTION") {
    buildPhase = "BUILD_FAILED_CANDIDATE_EXHAUSTION";
  } else if (structuralPhase === "STRUCTURALLY_INCOMPLETE" && buildPhase !== "BUILD_FAILED_CANDIDATE_EXHAUSTION") {
    buildPhase = "STRUCTURALLY_INCOMPLETE";
  } else if (
    structuralBuildTelemetryV4166.buildPhase === "EARLY_ASSEMBLY" ||
    structuralBuildTelemetryV4166.buildPhase === "NORMAL_ASSEMBLY"
  ) {
    if (buildPhase === "STRUCTURALLY_INCOMPLETE") buildPhase = "BUILDING";
  }
  const landCount = args.state.selectedCards.filter((c) => c.category === "land").length;
  const professorBuildControlV41661 = resolveProfessorBuildControlV41661({
    libraryCount: args.state.selectedCards.length,
    landCount,
    structurallyComplete: slotBudget.structurallyComplete,
    structuralTarget,
    buildPhase,
    telemetryV4166: structuralBuildTelemetryV4166,
    telemetryV4165: structuralBuildTelemetryV4165,
    telemetryV4164: structuralBuildTelemetry,
  });
  const buildControlDecisionLogV41661 = recordBuildControlDecisionV41661({
    control: professorBuildControlV41661,
    iteration: structuralBuildTelemetryV4166.recomputeCount,
    priorLog: args.state.buildControlDecisionLogV41661,
  });
  const priorPhase = args.state.structuralBuildTelemetryV4166?.buildPhase;
  const enteredClosure =
    structuralBuildTelemetryV4166.buildPhase === "STRUCTURAL_CLOSURE" &&
    priorPhase !== "STRUCTURAL_CLOSURE";
  const closureExecutionStateV41662 = updateClosureExecutionStateV41662({
    prior: args.state.closureExecutionStateV41662,
    telemetry: structuralBuildTelemetryV4166,
    iteration: structuralBuildTelemetryV4166.recomputeCount,
    enteredClosure,
  });
  const strategicProgressV41662 = assessStrategicProgressV41662({
    slotBudget,
    theoryRealizations,
    selectedCards: args.state.selectedCards,
    priorSelectedCount: args.state.structuralBuildTelemetryV4166?.lastSelectedCardCount,
    winArchitectureLocked: args.state.winArchitectureLockedV416,
  });
  const theoryRealizationGovernanceV41662 = enrichTheoryRealizationGovernanceV41662({
    realizations: theoryRealizations,
    slotBudget,
    iteration: structuralBuildTelemetryV4166.recomputeCount,
    prior: args.state.theoryRealizationGovernanceV41662,
    commanderColorIdentity,
  });
  const professorNextActionV41662 = resolveProfessorNextActionV41662({
    control: professorBuildControlV41661,
    strategicProgress: strategicProgressV41662,
    libraryCount: args.state.selectedCards.length,
    structurallyComplete: slotBudget.structurallyComplete,
    structuralTarget,
  });
  const readiness = assessBracketReadinessV416({
    requestedBracket: args.bracket,
    portfolio: portfolioWithWin,
    gap: snapshot.bracketGapAnalysis as BracketGapAnalysisV410 | null,
    manaPlan,
    selectedNonLandCount: args.state.selectedCards.filter((c) => c.category !== "land").length,
    discoveryExhausted: args.discoveryExhausted,
    legality,
    utilization,
    winReadiness,
    quality,
    preFinalCritic,
    powerAssessment: powerAssessmentFinal,
    slotBudget,
  });

  return {
    ...args.state,
    buildPhase,
    legalityGate: legality.gate,
    canonicalLegalityV4161: legality,
    manaPlanV416: manaPlan,
    bracketPowerPortfolioV416: portfolioWithWin,
    bracketPowerUtilizationV4161: utilization,
    b4WinReadinessV4161: winReadiness,
    b4WinReadinessV4164: winReadinessV4164,
    bracketReadinessV416: readiness,
    bracketReadinessQualityV4162: quality,
    preFinalQualityCriticV4162: preFinalCritic,
    deckSlotBudgetV4163: slotBudget,
    accessArchitectureV4163: accessArchitecture,
    accessArchitectureV4164: accessArchitectureV4164,
    accessArchitectureV4165: accessArchitectureV4165,
    bracketPowerAssessmentV4163: powerAssessmentFinal,
    opportunityCostV4163: opportunityCost,
    opportunityCostV4164: opportunityCostV4164,
    preFinalQualityCriticV4163: preFinalCriticV4163,
    gameChangerReviewStateV4162: gameChangerReviewState,
    structuralCompletionPlanV4164: structuralCompletionPlan,
    structuralCompletionPlanV4165: structuralBuildTelemetryV4165.completionPlan,
    structuralCompletionPlanV4166: structuralBuildTelemetryV4166.completionPlan,
    structuralBuildTelemetryV4164: structuralBuildTelemetry,
    structuralBuildTelemetryV4165: structuralBuildTelemetryV4165,
    structuralBuildTelemetryV4166: structuralBuildTelemetryV4166,
    structuralExhaustionAuditV4164: structuralExhaustionAudit,
    professorBuildControlV41661,
    buildControlDecisionLogV41661,
    strategicProgressV41662,
    theoryRealizationGovernanceV41662,
    closureExecutionStateV41662,
    professorNextActionV41662,
  };
}

export async function runInitialAssemblyV47(args: {
  state: ProfessorCouncilStateV45;
  context: CouncilBrewContextV45;
  loopResult: ProfessorV41ConversationLoopResultV1;
  theory: WorkingDeckTheoryV4;
  catalog: DeckResolutionCatalog;
  commanderOracleId: string;
  colorIdentity: string[];
}): Promise<ProfessorCouncilStateV47> {
  const pass1 = args.loopResult.creativePass1;
  const charter = args.state.deckCharter!;
  let state = upgradeToV47({
    ...args.state,
    version: "professor-council-assembly-v4-6-v1",
    bracketBuildPolicy: buildBracketBuildPolicyV46({
      bracket: args.context.bracket,
      playStyle: charter.playStyle,
      commanderRelationship: charter.commanderRelationship,
    }),
    selectedCards: [],
    candidatePool: [],
    rejectedCards: [],
    cardDecisions: [],
    replacementHistory: [],
    checkpointsCompleted: [],
    assemblyRevision: 0,
    snapshots: [],
    phase: "ASSEMBLY",
  } as ProfessorCouncilStateV46);

  state.buildPhase = "RESEARCHING";
  const contract = state.bracketConstructionContractV416;
  state.manaPlanV416 =
    contract && state.manaPlanV416
      ? buildManaPlanV416({
          bracket: args.context.bracket,
          contract,
          colorIdentity: args.colorIdentity,
        })
      : state.manaPlanV416;

  if (contract && !state.winArchitectureLockedV416) {
    const winArch = inferWinArchitectureFromCharterV416({ charter, contract });
    state.deckNeeds = [
      ...buildInitialDeckNeedsV416({ charter, pass1, theory: args.theory, contract }),
      ...buildWinArchitectureDeckNeedsV416({
        contract,
        primaryWinArchitecture: winArch.primaryWinArchitecture,
        secondaryWinArchitecture: winArch.secondaryWinArchitecture,
        accessPlan: winArch.accessPlan,
        protectionPlan: winArch.protectionPlan,
      }),
    ];
    state.winArchitectureLockedV416 = true;
  } else {
    state.deckNeeds = contract
      ? buildInitialDeckNeedsV416({ charter, pass1, theory: args.theory, contract })
      : buildInitialDeckNeedsV47({ charter, pass1, theory: args.theory });
  }

  let powerSearchReports: BracketPowerSearchReportV416[] = [];
  const powerMissionCards: CouncilCardV46[] = [];
  if (contract && args.context.bracket >= 3) {
    const seedPortfolio = evaluateBracketPowerPortfolioV416({
      contract,
      powerPlan: state.bracketPowerPlanV410 ?? null,
      selectedCards: [],
      profiles: [],
      gap: null,
    });
    const missions = planPowerSearchMissionsV416({ portfolio: seedPortfolio, contract });
    let searchHistory: BracketPowerSearchHistoryV416 | null = null;
    for (const mission of missions.slice(0, 2)) {
      const result = executeBracketPowerSearchMissionV416({
        mission,
        catalog: args.catalog,
        charter,
        colorIdentity: args.colorIdentity,
        bracket: args.context.bracket,
        powerPlan: state.bracketPowerPlanV410 ?? null,
        deckNeeds: state.deckNeeds,
        selectedCards: [],
        revision: 1,
        history: searchHistory,
      });
      searchHistory = result.history;
      powerSearchReports.push(result.report);
      powerMissionCards.push(...result.cards);
    }
    state.bracketPowerSearchHistoryV416 = searchHistory;
  }
  state.bracketPowerSearchReportsV416 = powerSearchReports;

  const discovery = await discoverCandidatesV47({
    catalog: args.catalog,
    charter,
    pass1,
    theory: args.theory,
    colorIdentity: args.colorIdentity,
    bracket: args.context.bracket,
    deckNeeds: state.deckNeeds,
    selectedOracleIds: new Set([args.commanderOracleId]),
    selectedNames: new Set([charter.commander.toLowerCase()]),
    revision: 1,
    perQueryCap: 10,
    powerPlan: state.bracketPowerPlanV410 ?? null,
  });

  state.candidatePool = [...powerMissionCards, ...discovery.candidates];
  state.candidatesByNeed = {
    ...discovery.candidatesByNeed,
    "bracket-power-mission": powerMissionCards,
  };
  state.discoveryReports = [discovery];
  state.searchComparisonTelemetryV410 = [...(state.searchComparisonTelemetryV410 ?? []), ...(discovery.searchComparisons ?? [])];
  state.functionalProfiles = profileMapForSelected(state.candidatePool, args.catalog, {});

  const conversation = [...state.conversation];
  let turnCounter = conversation.length;
  const push = (turn: Omit<CouncilTurnV45, "turnId">) => {
    conversation.push({ ...turn, turnId: `t-${turnCounter++}` });
  };

  push({
    phase: "ASSEMBLY",
    speaker: "RESEARCH",
    intent: "SEARCH",
    respondsToTurnIds: [],
    message: `Creative described ${discovery.queries.length} deck needs — I found ${discovery.candidates.length} legal catalog candidates (${discovery.conceptDiscoveryCount} from concept search, ${discovery.namedModelPriorCount} named by Creative). Abstract concepts like "proliferate payoffs" become mechanic searches, not discarded strings.`,
    developerDetail: discovery.queries.map((q) => q.conceptText).join(" | "),
  });

  if (powerSearchReports.length > 0 && contract) {
    push({
      phase: "ASSEMBLY",
      speaker: "RESEARCH",
      intent: "SEARCH",
      respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
      message: `B${args.context.bracket} bracket contract active — ran ${powerSearchReports.length} dedicated power search mission(s) before synergy batch (${powerSearchReports.map((r) => r.mission.kind).join(", ")}). ${contract.floorExpectations[0] ?? ""}`,
      developerDetail: powerSearchReports.map((r) => `${r.mission.kind}: ${r.selectedCandidates.join(", ") || "none selected"}`).join(" | "),
    });
  }

  const snapshotSeed = computeDeckSnapshotV47({ state, catalog: args.catalog });
  const batchTarget = INITIAL_BATCH_TARGET_V47;
  const batch = selectBatchFromPool({
    pool: state.candidatePool,
    selected: [],
    snapshot: snapshotSeed,
    charter,
    batchSize: batchTarget,
    bracketPlan: state.bracketBuildPlan,
    powerPlan: state.bracketPowerPlanV410 ?? null,
    catalog: args.catalog,
  });

  state.selectedCards = batch.map((c) => ({
    ...c,
    status: c.roles.length >= 3 ? "CORE" : "SELECTED",
    criticStatus: "CHARTER_OK",
  }));
  state.candidatePool = state.candidatePool.filter((c) => !state.selectedCards.some((s) => s.cardId === c.cardId));
  state.functionalProfiles = profileMapForSelected(state.selectedCards, args.catalog, state.functionalProfiles);
  state.assemblyRevision = 1;
  state.buildPhase = "BUILDING";
  state.conversation = conversation;

  push({
    phase: "ASSEMBLY",
    speaker: "CREATIVE",
    intent: "PROPOSE",
    respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
    message: `First structural batch (${state.selectedCards.length} cards) from Research discovery — establishing ${charter.primaryStrategy.toLowerCase()} without relying on Creative card-name memory.`,
    developerDetail: state.selectedCards.map((c) => c.name).join(", "),
  });

  state.snapshots = [computeDeckSnapshotV47({ state, catalog: args.catalog })];

  const firstThreshold = CHECKPOINT_THRESHOLDS_V46[0]!;
  if (state.selectedCards.length >= firstThreshold) {
    state = upgradeToV47(runCheckpointCouncilV46(state, firstThreshold));
    state.snapshots = [...state.snapshots, computeDeckSnapshotV47({ state, catalog: args.catalog })];
  }

  state = recomputeBracketNativeStateV416({
    state,
    catalog: args.catalog,
    bracket: args.context.bracket,
  });

  return state;
}

export async function executeStructuralResearchPassV41662(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
  colorIdentity: string[];
  bracket: CommanderBracket;
}): Promise<ProfessorCouncilStateV47> {
  const telemetry = args.state.structuralBuildTelemetryV4166;
  const theoryRealizations = assessTheoryRealizationV4165({
    theory: args.theory,
    selectedCards: args.state.selectedCards,
  });
  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan: args.state.manaPlanV416,
    selectedCards: args.state.selectedCards,
  });
  const strategicRecovery = args.state.strategicProgressV41662?.strategicRecoveryRequired === true;
  const synthesizedPlan = buildStructuralCompletionPlanV4166({
    slotBudget,
    selectedCards: args.state.selectedCards,
    deckNeeds: args.state.deckNeeds,
    theoryRealizations,
    requestedBracket: args.bracket,
    stallDetected: strategicRecovery || telemetry?.stallDetected === true || slotBudget.remainingNonlandSlots <= 6,
    terminalExhaustion: false,
  });
  const rawMission = telemetry?.completionPlan.missions[0] ?? synthesizedPlan.missions[0];
  if (!rawMission) {
    throw new Error("STRUCTURAL_MISSION_MISSING");
  }
  const mission = compileMissionForDispatchV41662({
    mission: rawMission,
    theoryRealizations,
    commanderColorIdentity: args.colorIdentity,
  });
  const maxSlots = Math.min(Math.max(1, slotBudget.remainingNonlandSlots), mission.desiredSlots.max);

  let state = args.state;
  let candidatePool = state.candidatePool;
  if (candidatePool.length < 8) {
    const emergency = await forceEmergencyCandidateRefillV47({
      catalog: args.catalog,
      charter: state.deckCharter!,
      pass1: args.pass1,
      theory: args.theory,
      colorIdentity: args.colorIdentity,
      bracket: args.bracket,
      deckNeeds: state.deckNeeds,
      candidatePool,
      selectedCards: state.selectedCards,
      snapshot: computeDeckSnapshotV47({ state, catalog: args.catalog }),
      revision: state.assemblyRevision,
      powerPlan: state.bracketPowerPlanV410 ?? null,
    });
    candidatePool = emergency.candidatePool;
    state = {
      ...state,
      candidatePool,
      discoveryReports: [...state.discoveryReports, emergency.discoveryReport],
      buildPhase: "RESEARCHING",
    };
  }

  const supply = await ensureCandidateSupplyV47({
    catalog: args.catalog,
    charter: state.deckCharter!,
    pass1: args.pass1,
    theory: args.theory,
    colorIdentity: args.colorIdentity,
    bracket: args.bracket,
    deckNeeds: state.deckNeeds,
    candidatePool,
    selectedCards: state.selectedCards,
    snapshot: state.snapshots[state.snapshots.length - 1] ?? null,
    revision: state.assemblyRevision,
    powerPlan: state.bracketPowerPlanV410 ?? null,
  });
  state = { ...state, candidatePool: supply.candidatePool, deckNeeds: supply.deckNeeds };

  const executionId = `exec-${(telemetry?.executions.length ?? 0) + 1}-${mission.missionId}`;
  let execution = executeStructuralSearchV4166({
    executionId,
    mission,
    candidatePool: state.candidatePool,
    selectedCards: state.selectedCards,
    catalog: args.catalog,
    commanderColorIdentity: args.colorIdentity,
    requestedBracket: args.bracket,
    tier: mission.currentTier,
  });
  const selection = selectStructuralSearchCardsV4166({
    execution,
    candidatePool: state.candidatePool,
    maxSlots,
  });
  execution = selection.execution;

  const revision = state.assemblyRevision + 1;
  const selectedCards = [...state.selectedCards];
  const cardDecisions = [...state.cardDecisions];
  for (const card of selection.selectedCards) {
    const addCheck = isCardAvailableForSingletonAddV4161({
      selected: selectedCards,
      candidate: card,
      catalog: args.catalog,
    });
    if (!addCheck.available) continue;
    selectedCards.push({
      ...card,
      status: "SELECTED",
      addedAtRevision: revision,
      lastReviewedRevision: revision,
    });
    cardDecisions.push({
      decisionId: `dec-struct-${revision}-${card.oracleId ?? card.cardId}`,
      cardId: card.cardId,
      cardName: card.name,
      action: "ADD",
      proposedBy: "STRUCTURAL_RESEARCH",
      supportingCouncilTurnIds: [],
      reason: `${card.name} — structural mission ${mission.missionId} (${mission.deficitFunction})`,
      revision,
    });
  }

  const cardsAddedThisPass = selectedCards.length - args.state.selectedCards.length;
  state = {
    ...state,
    selectedCards,
    cardDecisions,
    assemblyRevision: revision,
    buildPhase: cardsAddedThisPass > 0 ? "BUILDING" : "RESEARCHING",
    candidatePool: state.candidatePool.filter(
      (c) => !selection.selectedCards.some((s) => s.cardId === c.cardId),
    ),
  };

  return recomputeBracketNativeStateV416({
    state,
    catalog: args.catalog,
    bracket: args.bracket,
    theory: args.theory,
    commanderColorIdentity: args.colorIdentity,
    recordStructuralExecution: true,
    precomputedStructuralExecution: execution,
    cardsAddedThisPass,
  });
}

export async function appendResearchBatchV47(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
  colorIdentity: string[];
  bracket: CommanderBracket;
  batchSize?: number;
}): Promise<ProfessorCouncilStateV47> {
  const structuralTarget = resolveStructuralTargetV416(args.state.manaPlanV416);
  const nextAction = args.state.professorNextActionV41662?.action;
  const structuralResearchPending =
    shouldRunStructuralResearchV4166({ telemetry: args.state.structuralBuildTelemetryV4166 ?? null }) ||
    nextAction === "RUN_STRUCTURAL_RESEARCH";
  if (args.state.selectedCards.length >= structuralTarget && !structuralResearchPending) {
    return args.state;
  }
  if (structuralResearchPending) {
    return executeStructuralResearchPassV41662(args);
  }

  if (args.state.structuralBuildTelemetryV4166?.termination?.shouldTerminate) {
    return recomputeBracketNativeStateV416({
      state: { ...args.state, buildPhase: "BUILD_FAILED_CANDIDATE_EXHAUSTION" },
      catalog: args.catalog,
      bracket: args.bracket,
      theory: args.theory,
      commanderColorIdentity: args.colorIdentity,
      discoveryExhausted: true,
    });
  }

  if (
    args.state.structuralBuildTelemetryV4166?.normalBuildDisabled &&
    args.state.structuralBuildTelemetryV4166?.buildPhase !== "EARLY_ASSEMBLY" &&
    args.state.structuralBuildTelemetryV4166?.buildPhase !== "NORMAL_ASSEMBLY"
  ) {
    return recomputeBracketNativeStateV416({
      state: args.state,
      catalog: args.catalog,
      bracket: args.bracket,
      theory: args.theory,
      commanderColorIdentity: args.colorIdentity,
      discoveryExhausted: false,
    });
  }

  let state = args.state;
  state = {
    ...state,
    candidatePool: sanitizeCandidatePoolV47({ pool: state.candidatePool, selectedCards: state.selectedCards }),
  };
  const contract = state.bracketConstructionContractV416;
  const portfolio = state.bracketPowerPortfolioV416;
  const gap = state.snapshots[state.snapshots.length - 1]?.bracketGapAnalysis as BracketGapAnalysisV410 | null;
  const holdForbidden = portfolio?.holdCourseForbidden || gap?.holdCourseForbidden;

  if (holdForbidden && contract) {
    const livePortfolio =
      portfolio ??
      evaluateBracketPowerPortfolioV416({
        contract,
        powerPlan: state.bracketPowerPlanV410 ?? null,
        selectedCards: state.selectedCards,
        profiles: resolveProfilesForSelectedV414({
          selected: state.selectedCards,
          catalog: args.catalog,
          functionalProfiles: state.functionalProfiles,
        }),
        gap,
        reservedLandSlots: state.manaPlanV416?.reservedLandSlots,
        gameChangerCount: countGameChangersInDeckV4162({
          selectedCards: state.selectedCards,
          catalog: args.catalog,
        }),
      });
    const missions = planPowerSearchMissionsV416({
      portfolio: livePortfolio,
      contract,
      history: state.bracketPowerSearchHistoryV416,
    });
    if (missions[0]) {
      const result = executeBracketPowerSearchMissionV416({
        mission: missions[0]!,
        catalog: args.catalog,
        charter: state.deckCharter!,
        colorIdentity: args.colorIdentity,
        bracket: args.bracket,
        powerPlan: state.bracketPowerPlanV410 ?? null,
        deckNeeds: state.deckNeeds,
        selectedCards: state.selectedCards,
        revision: state.assemblyRevision + 1,
        history: state.bracketPowerSearchHistoryV416,
      });
      state = {
        ...state,
        candidatePool: result.cards.length > 0 ? [...result.cards, ...state.candidatePool] : state.candidatePool,
        bracketPowerSearchReportsV416: [...(state.bracketPowerSearchReportsV416 ?? []), result.report],
        bracketPowerSearchHistoryV416: result.history,
        buildPhase: "RESEARCHING",
      };
    }
  }

  const supply = await ensureCandidateSupplyV47({
    catalog: args.catalog,
    charter: state.deckCharter!,
    pass1: args.pass1,
    theory: args.theory,
    colorIdentity: args.colorIdentity,
    bracket: args.bracket,
    deckNeeds: state.deckNeeds,
    candidatePool: state.candidatePool,
    selectedCards: state.selectedCards,
    snapshot: state.snapshots[state.snapshots.length - 1] ?? null,
    revision: state.assemblyRevision,
    powerPlan: state.bracketPowerPlanV410 ?? null,
  });

  state = {
    ...state,
    candidatePool: supply.candidatePool,
    deckNeeds: supply.deckNeeds,
    discoveryReports: supply.refilled ? [...state.discoveryReports, supply.discoveryReport] : state.discoveryReports,
    searchComparisonTelemetryV410: supply.refilled
      ? [...(state.searchComparisonTelemetryV410 ?? []), ...(supply.discoveryReport.searchComparisons ?? [])]
      : state.searchComparisonTelemetryV410,
    buildPhase: supply.refilled ? "RESEARCHING" : state.buildPhase,
  };

  if (supply.refilled) {
    state.functionalProfiles = profileMapForSelected(supply.candidatePool, args.catalog, state.functionalProfiles);
  }

  const suspendOrdinarySearch =
    holdForbidden && (state.highDeficitCheckpointStreakV416 ?? 0) >= 2 && (portfolio?.highDeficits.length ?? 0) > 0;

  if (suspendOrdinarySearch) {
    state.buildPhase = "RESEARCHING";
    return recomputeBracketNativeStateV416({
      state,
      catalog: args.catalog,
      bracket: args.bracket,
      commanderName: state.deckCharter?.commander,
      theory: args.theory,
      commanderColorIdentity: args.colorIdentity,
      discoveryExhausted: false,
    });
  }

  const snapshot = computeDeckSnapshotV47({ state, catalog: args.catalog });
  let batch = selectBatchFromPool({
    pool: state.candidatePool,
    selected: state.selectedCards,
    snapshot,
    charter: state.deckCharter!,
    batchSize: args.batchSize ?? 4,
    bracketPlan: state.bracketBuildPlan,
    powerPlan: state.bracketPowerPlanV410 ?? null,
    catalog: args.catalog,
  });
  if (batch.length === 0) {
    const emergency = await forceEmergencyCandidateRefillV47({
      catalog: args.catalog,
      charter: state.deckCharter!,
      pass1: args.pass1,
      theory: args.theory,
      colorIdentity: args.colorIdentity,
      bracket: args.bracket,
      deckNeeds: state.deckNeeds,
      candidatePool: state.candidatePool,
      selectedCards: state.selectedCards,
      snapshot,
      revision: state.assemblyRevision,
      powerPlan: state.bracketPowerPlanV410 ?? null,
    });
    state = {
      ...state,
      candidatePool: emergency.candidatePool,
      discoveryReports: [...state.discoveryReports, emergency.discoveryReport],
      buildPhase: "RESEARCHING",
    };
    batch = selectBatchFromPool({
      pool: state.candidatePool,
      selected: state.selectedCards,
      snapshot,
      charter: state.deckCharter!,
      batchSize: args.batchSize ?? 4,
      bracketPlan: state.bracketBuildPlan,
      powerPlan: state.bracketPowerPlanV410 ?? null,
      catalog: args.catalog,
    });
    if (batch.length === 0) {
      state.buildPhase = "NEEDS_ATTENTION";
      return recomputeBracketNativeStateV416({
        state,
        catalog: args.catalog,
        bracket: args.bracket,
        theory: args.theory,
        commanderColorIdentity: args.colorIdentity,
        discoveryExhausted: true,
      });
    }
  }

  const revision = state.assemblyRevision + 1;
  const cardDecisions = [...state.cardDecisions];
  const selectedCards = [...state.selectedCards];
  const countBeforeBatch = args.state.selectedCards.length;

  for (const card of batch) {
    const addCheck = isCardAvailableForSingletonAddV4161({
      selected: selectedCards,
      candidate: card,
      catalog: args.catalog,
    });
    if (!addCheck.available) continue;
    selectedCards.push({ ...card, status: "SELECTED", addedAtRevision: revision, lastReviewedRevision: revision });
    const cardReason = `${card.name} — ${card.roles.slice(0, 3).join("+")} addresses ${snapshot.weaknesses[0]?.slice(0, 80) ?? snapshot.researchQuestion.slice(0, 80)}`;
    cardDecisions.push({
      decisionId: `dec-batch-${revision}-${card.oracleId ?? card.cardId}`,
      cardId: card.cardId,
      cardName: card.name,
      action: "ADD",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: cardReason,
      revision,
    });
  }

  state = {
    ...state,
    selectedCards,
    candidatePool: state.candidatePool.filter((c) => !batch.some((b) => b.cardId === c.cardId)),
    cardDecisions,
    assemblyRevision: revision,
    buildPhase: "BUILDING",
    functionalProfiles: profileMapForSelected(selectedCards, args.catalog, state.functionalProfiles),
    snapshots: [...state.snapshots, computeDeckSnapshotV47({ state: { ...state, selectedCards, cardDecisions, assemblyRevision: revision }, catalog: args.catalog })],
  };

  const cardsAddedThisPass = selectedCards.length - countBeforeBatch;
  const recordStructuralExecution = shouldRunStructuralResearchV4166({
    telemetry: state.structuralBuildTelemetryV4166 ?? null,
  });

  return recomputeBracketNativeStateV416({
    state,
    catalog: args.catalog,
    bracket: args.bracket,
    theory: args.theory,
    commanderColorIdentity: args.colorIdentity,
    recordStructuralExecution,
    cardsAddedThisPass,
  });
}

export async function advanceCouncilAssemblyV47(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  pass1: CreativeProfessorPass1V4;
  theory: WorkingDeckTheoryV4;
  colorIdentity: string[];
  bracket: CommanderBracket;
  batchSize?: number;
}): Promise<ProfessorCouncilStateV47> {
  let next = await appendResearchBatchV47(args);
  for (const threshold of CHECKPOINT_THRESHOLDS_V46) {
    if (next.selectedCards.length >= threshold && !next.checkpointsCompleted.includes(threshold)) {
      const gapSnapshot = computeDeckSnapshotV47({ state: next, catalog: args.catalog });
      const gap = gapSnapshot.bracketGapAnalysis as BracketGapAnalysisV410 | null;
      next = runCheckpointCouncilV410(next, threshold, gap);
      next.snapshots = [...next.snapshots, gapSnapshot];
      next.deckNeeds = [
        ...next.deckNeeds,
        ...deriveDeckNeedsFromSnapshotV47({
          snapshot: gapSnapshot,
          charter: next.deckCharter!,
          existingNeedIds: new Set(next.deckNeeds.map((n) => n.needId)),
        }),
      ];
      if (gap?.holdCourseForbidden && gap.unresolvedHighDeficits.length > 0) {
        const streak = (next.highDeficitCheckpointStreakV416 ?? 0) + 1;
        next.highDeficitCheckpointStreakV416 = streak;
        const leverNeeds = gap.recommendedPowerLevers.slice(0, 2).map((lever, i) => ({
          needId: `bracket-deficit-${threshold}-${i}`,
          category: "ROLE_COMPRESSION" as const,
          role: "interaction",
          reason: `Bracket checkpoint ${threshold}: ${lever}`,
          source: "CRITIC_FINDING" as const,
          requiredFunctions: [lever],
          preferredFunctions: [`B${next.bracketPowerPlanV410?.targetBracket ?? args.bracket}`],
          requiredMechanics: [],
          preferredMechanics: [],
          desiredProducedResources: [],
          desiredConsumedResources: [],
          desiredEvents: [],
          urgency: "HIGH" as const,
          status: "OPEN" as const,
          conceptText: lever,
        }));
        next.deckNeeds = [...next.deckNeeds, ...leverNeeds];
      } else {
        next.highDeficitCheckpointStreakV416 = 0;
      }
    }
  }
  if (next.selectedCards.length >= CUT_REVIEW_THRESHOLD_V46 && !next.checkpointsCompleted.includes(CUT_REVIEW_THRESHOLD_V46)) {
    next = upgradeToV47(runCutReviewV46(next));
    next.buildPhase = "CUT_AND_BALANCE";
    next.snapshots = [...next.snapshots, computeDeckSnapshotV47({ state: next, catalog: args.catalog })];
  }
  return recomputeBracketNativeStateV416({
    state: next,
    catalog: args.catalog,
    bracket: args.bracket,
    discoveryExhausted: next.buildPhase === "NEEDS_ATTENTION",
  });
}

export function deckListFromCouncilStateV47(args: {
  state: ProfessorCouncilStateV47;
  commanderName: string;
}): ProfessorDeckListEntryV43[] {
  const list: ProfessorDeckListEntryV43[] = [{ name: args.commanderName, category: "commander" }];
  for (const card of args.state.selectedCards) {
    list.push({ name: card.name, category: card.category === "plan" ? "creature" : card.category });
  }
  return list;
}

export function evaluateLegalityGateV47(args: {
  state: ProfessorCouncilStateV47;
  commanderName: string;
  requireFullLibrary?: boolean;
}): LegalityGateResultV47 {
  return assessCanonicalDeckLegalityV4161({
    selectedCards: args.state.selectedCards,
    commanderName: args.commanderName,
    requireFullLibrary: args.requireFullLibrary ?? args.state.selectedCards.length >= COMMANDER_DECK_LIBRARY_SIZE_V47,
  }).gate;
}

export {
  ASSEMBLY_STRUCTURAL_TARGET_V47,
  ASSEMBLY_STOP_TARGET_V46 as ASSEMBLY_STOP_TARGET_V47,
  COMMANDER_DECK_TOTAL_CARDS_V47,
  COMMANDER_DECK_LIBRARY_SIZE_V47,
};
