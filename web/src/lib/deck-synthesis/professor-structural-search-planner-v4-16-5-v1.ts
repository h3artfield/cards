/**
 * Professor v4.16.5 — structural search missions, domain-aware escalation, hard termination.
 */
import { createHash } from "node:crypto";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import type { DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import type { TheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";
import { unrealizedCorePackages } from "./professor-theory-realization-v4-16-5-v1";

export const PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_5_V1_VERSION =
  "professor-structural-search-planner-v4-16-5-v1";

export type StructuralSearchTierV4165 = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type StructuralSearchRejectionReasonV4165 =
  | "RETRIEVAL_RETURNED_ZERO"
  | "ALL_OFF_COLOR"
  | "ALL_ALREADY_SELECTED"
  | "ALL_SINGLETON_CONFLICT"
  | "ALL_TOO_LOW_QUALITY"
  | "ALL_WRONG_FUNCTION"
  | "ALL_BREAK_CHARTER"
  | "ALL_BREAK_BRACKET"
  | "ALL_REDUNDANT"
  | "UNRESOLVED_ORACLE"
  | "WEAK_FILLER_REJECTED";

export type StructuralSearchMissionStatusV4165 =
  | "PENDING"
  | "SEARCHING"
  | "CANDIDATES_FOUND"
  | "EXHAUSTED"
  | "SATISFIED"
  | "REVISED";

export type SearchDomainDiffV4165 = {
  previousQuery: string;
  nextQuery: string;
  previousDomain: string;
  nextDomain: string;
  newConstraints: string[];
  relaxedConstraints: string[];
  candidatesNewToMission: number;
  zeroNewCandidatesReason?: StructuralSearchRejectionReasonV4165;
};

export type StructuralCandidateSupplyV4165 = {
  neededSlots: number;
  viableCandidateCount: number;
  strongCandidateCount: number;
  marginalCandidateCount: number;
  rejectedCandidateCount: number;
};

export type StructuralSearchMissionV4165 = {
  version: typeof PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_5_V1_VERSION;
  missionId: string;
  slotCount: number;
  need: string;
  strategicPurpose: string;
  minimumRequirements: string[];
  preferredProperties: string[];
  forbiddenProperties: string[];
  acceptableCardTypes: string[];
  mechanicRelations: string[];
  targetPackages: string[];
  currentCoverage: number;
  desiredCoverage: number;
  searchQueries: string[];
  searchDomains: string[];
  currentTier: StructuralSearchTierV4165;
  candidatesConsidered: string[];
  rejectionReasons: StructuralSearchRejectionReasonV4165[];
  domainDiffs: SearchDomainDiffV4165[];
  candidateSupply: StructuralCandidateSupplyV4165 | null;
  status: StructuralSearchMissionStatusV4165;
};

export type StructuralCompletionPlanV4165 = {
  version: typeof PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_5_V1_VERSION;
  remainingNonlandSlots: number;
  missions: StructuralSearchMissionV4165[];
  action: "RUN_STRUCTURAL_RESEARCH";
  summary: string;
};

export type BuildLoopFingerprintV4165 = {
  selectedCardCount: number;
  activeMissionIds: string[];
  activeSearchTier: StructuralSearchTierV4165;
  candidateSetHash: string;
};

export type BuildLoopTerminationV4165 = {
  version: typeof PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_5_V1_VERSION;
  shouldTerminate: boolean;
  terminalState: "BUILD_FAILED_CANDIDATE_EXHAUSTION" | null;
  normalBuildDisabled: boolean;
  structuralResearchDisabled: boolean;
  consecutiveIdenticalPasses: number;
  reason: string;
};

const TIER_SPECS: Record<
  StructuralSearchTierV4165,
  { domain: string; queryTemplate: (mission: StructuralSearchMissionV4165) => string }
> = {
  1: {
    domain: "existing_candidate_pool",
    queryTemplate: (m) => `pool:${m.need}`,
  },
  2: {
    domain: "semantic_function_mechanic",
    queryTemplate: (m) => `function=${m.strategicPurpose};mechanic=${m.mechanicRelations.join("+") || "general"}`,
  },
  3: {
    domain: "mechanic_inversion",
    queryTemplate: (m) => `problem-stop:${m.need};answer-mechanics:${m.minimumRequirements.join("|")}`,
  },
  4: {
    domain: "oracle_golden_catalog_predicates",
    queryTemplate: (m) =>
      `types=${m.acceptableCardTypes.join(",")};requirements=${m.minimumRequirements.join(";")}`,
  },
  5: {
    domain: "strategy_package_rag",
    queryTemplate: (m) => `strategy-rag:${m.strategicPurpose};packages=${m.targetPackages.join(",")}`,
  },
  6: {
    domain: "model_prior_hypothesis",
    queryTemplate: (m) => `model-prior:${m.need};purpose=${m.strategicPurpose}`,
  },
  7: {
    domain: "functional_substitution",
    queryTemplate: (m) => `substitute:${m.need}→functional-equivalent`,
  },
};

const SLOT_MISSION_SPECS: Record<
  string,
  Omit<StructuralSearchMissionV4165, "version" | "missionId" | "slotCount" | "status" | "domainDiffs" | "candidateSupply" | "currentTier" | "candidatesConsidered" | "rejectionReasons" | "searchQueries" | "searchDomains">
> = {
  "interaction-quality": {
    need: "efficient-interaction",
    strategicPurpose: "interaction advancing primary engine",
    minimumRequirements: ["efficient removal or counter", "color-legal", "B4 interaction floor"],
    preferredProperties: ["instant-speed", "low-mv", "multi-role"],
    forbiddenProperties: ["draft-tier", "narrow"],
    acceptableCardTypes: ["Instant", "Sorcery", "Enchantment"],
    mechanicRelations: ["interaction", "engine-synergy"],
    targetPackages: [],
    currentCoverage: 0,
    desiredCoverage: 1,
  },
  "card-velocity": {
    need: "card-velocity",
    strategicPurpose: "card advantage or selection",
    minimumRequirements: ["draw or filter", "color-legal"],
    preferredProperties: ["efficient", "repeatable"],
    forbiddenProperties: ["slow"],
    acceptableCardTypes: ["Instant", "Sorcery", "Enchantment", "Artifact"],
    mechanicRelations: ["card-advantage", "selection"],
    targetPackages: [],
    currentCoverage: 0,
    desiredCoverage: 1,
  },
  "engine-redundancy": {
    need: "engine-redundancy",
    strategicPurpose: "engine redundancy for primary package",
    minimumRequirements: ["supports primary engine", "color-legal"],
    preferredProperties: ["synergy", "redundancy"],
    forbiddenProperties: ["orthogonal"],
    acceptableCardTypes: ["Creature", "Artifact", "Enchantment"],
    mechanicRelations: ["engine"],
    targetPackages: [],
    currentCoverage: 0,
    desiredCoverage: 1,
  },
  access: {
    need: "access",
    strategicPurpose: "deterministic or functional access to critical pieces",
    minimumRequirements: ["tutor OR redundancy OR selection OR recursion", "color-legal"],
    preferredProperties: ["efficient", "targets engine/win"],
    forbiddenProperties: ["narrow without payoff"],
    acceptableCardTypes: ["Instant", "Sorcery", "Enchantment", "Artifact"],
    mechanicRelations: ["access", "tutor", "selection"],
    targetPackages: [],
    currentCoverage: 0,
    desiredCoverage: 1,
  },
  "theory-package": {
    need: "theory-package-realization",
    strategicPurpose: "realize CORE package in deck",
    minimumRequirements: ["package member", "singleton available", "color-legal"],
    preferredProperties: ["core-package"],
    forbiddenProperties: [],
    acceptableCardTypes: ["Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker"],
    mechanicRelations: ["package"],
    targetPackages: [],
    currentCoverage: 0,
    desiredCoverage: 1,
  },
};

function missionCategoryForNeed(needId: string): string {
  if (/interaction|protection/i.test(needId)) return "interaction-quality";
  if (/card-advantage|velocity|ramp/i.test(needId)) return "card-velocity";
  if (/engine|package|damage-redirection/i.test(needId)) return "engine-redundancy";
  if (/access|tutor|win-architecture|compact-win/i.test(needId)) return "access";
  return "engine-redundancy";
}

export function hashCandidateSet(names: string[]): string {
  return createHash("sha256")
    .update([...names].sort().join("\n"))
    .digest("hex")
    .slice(0, 16);
}

export function buildLoopFingerprintV4165(args: {
  selectedCardCount: number;
  missions: StructuralSearchMissionV4165[];
  candidatePoolNames: string[];
}): BuildLoopFingerprintV4165 {
  const active = args.missions.filter((m) => m.status !== "SATISFIED" && m.status !== "EXHAUSTED");
  return {
    selectedCardCount: args.selectedCardCount,
    activeMissionIds: active.map((m) => m.missionId),
    activeSearchTier: active[0]?.currentTier ?? 1,
    candidateSetHash: hashCandidateSet(args.candidatePoolNames),
  };
}

export function buildStructuralSearchMissionsV4165(args: {
  slotBudget: DeckSlotBudgetV4163;
  deckNeeds: DeckNeedV47[];
  theoryRealizations?: TheoryRealizationV4165[];
  allocations?: { category: string; slots: number }[];
}): StructuralSearchMissionV4165[] {
  if (args.slotBudget.structurallyComplete) return [];
  const remaining = args.slotBudget.remainingNonlandSlots;
  const missions: StructuralSearchMissionV4165[] = [];
  let idx = 0;

  for (const unrealized of unrealizedCorePackages(args.theoryRealizations ?? [])) {
    if (idx >= remaining) break;
    const spec = SLOT_MISSION_SPECS["theory-package"]!;
    missions.push({
      version: PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_5_V1_VERSION,
      missionId: `mission-theory-${unrealized.packageId}`,
      slotCount: 1,
      ...spec,
      need: `realize-package:${unrealized.packageId}`,
      strategicPurpose: unrealized.intendedFunction,
      targetPackages: [unrealized.packageId],
      minimumRequirements: [...spec.minimumRequirements, ...unrealized.candidateCards.slice(0, 3)],
      currentCoverage: unrealized.selectedMembers.length,
      desiredCoverage: unrealized.requiredMinimumMembers,
      searchQueries: [TIER_SPECS[1].queryTemplate({ ...spec, need: unrealized.packageId } as never)],
      searchDomains: [TIER_SPECS[1].domain],
      currentTier: 1,
      candidatesConsidered: [],
      rejectionReasons: [],
      domainDiffs: [],
      candidateSupply: null,
      status: "PENDING",
    });
    idx += 1;
  }

  const allocations =
    args.allocations ??
    (remaining > 0
      ? [
          { category: "interaction-quality", slots: Math.max(1, Math.ceil(remaining * 0.25)) },
          { category: "card-velocity", slots: Math.max(1, Math.ceil(remaining * 0.25)) },
          { category: "engine-redundancy", slots: Math.max(1, Math.ceil(remaining * 0.25)) },
          { category: "access", slots: Math.max(0, remaining - 3) },
        ]
      : []);

  for (const alloc of allocations) {
    const spec = SLOT_MISSION_SPECS[alloc.category] ?? SLOT_MISSION_SPECS["engine-redundancy"]!;
    for (let s = 0; s < alloc.slots && idx < remaining; s++) {
      const openNeed = args.deckNeeds.find((n) => n.status !== "SATISFIED");
      const needId = openNeed?.needId ?? missionCategoryForNeed(alloc.category);
      missions.push({
        version: PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_5_V1_VERSION,
        missionId: `mission-${alloc.category}-${idx}`,
        slotCount: 1,
        ...spec,
        need: needId,
        searchQueries: [TIER_SPECS[1].queryTemplate({ ...spec, need: needId } as never)],
        searchDomains: [TIER_SPECS[1].domain],
        currentTier: 1,
        candidatesConsidered: [],
        rejectionReasons: [],
        domainDiffs: [],
        candidateSupply: null,
        status: "PENDING",
      });
      idx += 1;
    }
  }
  return missions;
}

export function buildStructuralCompletionPlanV4165(args: {
  slotBudget: DeckSlotBudgetV4163;
  deckNeeds: DeckNeedV47[];
  theoryRealizations?: TheoryRealizationV4165[];
}): StructuralCompletionPlanV4165 | null {
  if (args.slotBudget.structurallyComplete) return null;
  const missions = buildStructuralSearchMissionsV4165(args);
  return {
    version: PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_5_V1_VERSION,
    remainingNonlandSlots: args.slotBudget.remainingNonlandSlots,
    missions,
    action: "RUN_STRUCTURAL_RESEARCH",
    summary: `${args.slotBudget.remainingNonlandSlots} slots — ${missions.length} structural search mission(s)`,
  };
}

export function reformulateQueryForRejection(args: {
  mission: StructuralSearchMissionV4165;
  reason: StructuralSearchRejectionReasonV4165;
}): { nextTier: StructuralSearchTierV4165; relaxed: string[]; tightened: string[] } {
  let nextTier = Math.min(7, args.mission.currentTier + 1) as StructuralSearchTierV4165;
  const relaxed: string[] = [];
  const tightened: string[] = [];
  if (args.reason === "ALL_WRONG_FUNCTION") {
    nextTier = Math.max(nextTier, 3 as StructuralSearchTierV4165);
    relaxed.push("broaden semantic mechanic");
  } else if (args.reason === "ALL_ALREADY_SELECTED") {
    nextTier = Math.max(nextTier, 7 as StructuralSearchTierV4165);
    relaxed.push("functional equivalent");
  } else if (args.reason === "ALL_TOO_LOW_QUALITY") {
    nextTier = Math.max(nextTier, 4 as StructuralSearchTierV4165);
    tightened.push("raise B4 quality predicates");
  } else if (args.reason === "RETRIEVAL_RETURNED_ZERO") {
    nextTier = Math.max(nextTier, 2 as StructuralSearchTierV4165);
    relaxed.push("expand search domain");
  } else if (args.reason === "WEAK_FILLER_REJECTED") {
    tightened.push("quality floor enforced");
  }
  return { nextTier, relaxed, tightened };
}

export function escalateStructuralMissionV4165(args: {
  mission: StructuralSearchMissionV4165;
  rejectionReason?: StructuralSearchRejectionReasonV4165;
  candidatesNewToMission?: number;
}): StructuralSearchMissionV4165 {
  const priorQuery = args.mission.searchQueries[args.mission.searchQueries.length - 1] ?? "";
  const priorDomain = args.mission.searchDomains[args.mission.searchDomains.length - 1] ?? TIER_SPECS[1].domain;
  const reformulation = args.rejectionReason
    ? reformulateQueryForRejection({ mission: args.mission, reason: args.rejectionReason })
    : { nextTier: Math.min(7, args.mission.currentTier + 1) as StructuralSearchTierV4165, relaxed: [], tightened: [] };
  const nextTier = reformulation.nextTier;
  const tierSpec = TIER_SPECS[nextTier];
  const nextQuery = tierSpec.queryTemplate(args.mission);
  const nextDomain = tierSpec.domain;
  const domainDiff: SearchDomainDiffV4165 = {
    previousQuery: priorQuery,
    nextQuery,
    previousDomain: priorDomain,
    nextDomain,
    newConstraints: reformulation.tightened,
    relaxedConstraints: reformulation.relaxed,
    candidatesNewToMission: args.candidatesNewToMission ?? 0,
    zeroNewCandidatesReason:
      (args.candidatesNewToMission ?? 0) === 0 ? args.rejectionReason ?? "RETRIEVAL_RETURNED_ZERO" : undefined,
  };
  const exhausted = nextTier >= 7 && (args.candidatesNewToMission ?? 0) === 0;
  return {
    ...args.mission,
    currentTier: nextTier,
    searchQueries: [...args.mission.searchQueries, nextQuery],
    searchDomains: [...args.mission.searchDomains, nextDomain],
    rejectionReasons: args.rejectionReason
      ? [...args.mission.rejectionReasons, args.rejectionReason]
      : args.mission.rejectionReasons,
    domainDiffs: [...args.mission.domainDiffs, domainDiff],
    status: exhausted ? "EXHAUSTED" : "SEARCHING",
  };
}

export function evaluateBuildLoopTerminationV4165(args: {
  priorFingerprint: BuildLoopFingerprintV4165 | null;
  currentFingerprint: BuildLoopFingerprintV4165;
  missions: StructuralSearchMissionV4165[];
}): BuildLoopTerminationV4165 {
  const identical =
    args.priorFingerprint &&
    args.priorFingerprint.selectedCardCount === args.currentFingerprint.selectedCardCount &&
    args.priorFingerprint.candidateSetHash === args.currentFingerprint.candidateSetHash &&
    args.priorFingerprint.activeMissionIds.join(",") === args.currentFingerprint.activeMissionIds.join(",");

  const consecutiveIdenticalPasses = identical ? 2 : 0;
  const allExhausted =
    args.missions.length > 0 && args.missions.every((m) => m.status === "EXHAUSTED" || m.status === "SATISFIED");
  const anyRemaining = args.missions.some((m) => m.status !== "SATISFIED" && m.status !== "EXHAUSTED");
  const shouldTerminate = consecutiveIdenticalPasses >= 2 || (allExhausted && anyRemaining === false && args.missions.some((m) => m.status === "EXHAUSTED"));

  const fullyExhausted =
    args.missions.length > 0 &&
    args.missions.filter((m) => m.status !== "SATISFIED").every((m) => m.status === "EXHAUSTED" && m.currentTier >= 7);

  const terminal = fullyExhausted || (consecutiveIdenticalPasses >= 2 && args.currentFingerprint.selectedCardCount > 0);

  return {
    version: PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_5_V1_VERSION,
    shouldTerminate: terminal,
    terminalState: terminal ? "BUILD_FAILED_CANDIDATE_EXHAUSTION" : null,
    normalBuildDisabled: terminal || consecutiveIdenticalPasses >= 2 || fullyExhausted,
    structuralResearchDisabled: terminal || fullyExhausted,
    consecutiveIdenticalPasses,
    reason: terminal
      ? fullyExhausted
        ? "All applicable search tiers exhausted with zero acceptable candidates"
        : "Two consecutive identical build passes — hard no-op termination"
      : consecutiveIdenticalPasses >= 1
        ? "Escalation required before next identical pass"
        : "Build may continue",
  };
}

export function assertManaBaseAllowedV4165(args: { structurallyComplete: boolean; context?: string }): void {
  if (args.structurallyComplete) return;
  const msg = `RUN_MANA_BASE blocked — structurally incomplete${args.context ? ` (${args.context})` : ""}`;
  if (process.env.NODE_ENV !== "production") {
    throw new Error(msg);
  }
}

export function tierDomainChanged(tier: StructuralSearchTierV4165, priorTier: StructuralSearchTierV4165): boolean {
  return TIER_SPECS[tier].domain !== TIER_SPECS[priorTier].domain;
}
