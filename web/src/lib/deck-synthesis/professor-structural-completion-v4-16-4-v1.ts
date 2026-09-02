/**
 * Professor v4.16.4 — structural build completion, escalation, and no-op loop detection.
 */
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import type { DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";

export const PROFESSOR_STRUCTURAL_COMPLETION_V4_16_4_V1_VERSION = "professor-structural-completion-v4-16-4-v1";

export type StructuralSearchTierV4164 = 1 | 2 | 3 | 4 | 5 | 6;

export type StructuralSlotAllocationV4164 = {
  category: string;
  slots: number;
  reason: string;
};

export type StructuralCompletionPlanV4164 = {
  version: typeof PROFESSOR_STRUCTURAL_COMPLETION_V4_16_4_V1_VERSION;
  remainingNonlandSlots: number;
  openDeckNeeds: string[];
  underfilledRoles: string[];
  underfilledPackages: string[];
  missingBracketDimensions: string[];
  curveNeeds: string[];
  redundancyNeeds: string[];
  flexSlots: number;
  allocations: StructuralSlotAllocationV4164[];
  action: "RUN_STRUCTURAL_RESEARCH";
  summary: string;
};

export type StructuralBuildTelemetryV4164 = {
  version: typeof PROFESSOR_STRUCTURAL_COMPLETION_V4_16_4_V1_VERSION;
  consecutiveUnchangedPasses: number;
  lastSelectedCardCount: number;
  currentSearchTier: StructuralSearchTierV4164;
  searchTiersAttempted: StructuralSearchTierV4164[];
  normalBuildSearchSuspended: boolean;
  searchEscalationRequired: boolean;
  buildCandidateDiscoveryExhausted: boolean;
  remainingSlots: number;
  attemptedNeeds: string[];
  candidatesFound: number;
  candidatesRejected: number;
  rejectionReasons: string[];
  unexploredSearchSpaces: string[];
};

export type StructuralExhaustionAuditV4164 = {
  version: typeof PROFESSOR_STRUCTURAL_COMPLETION_V4_16_4_V1_VERSION;
  remainingSlots: number;
  attemptedNeeds: string[];
  searchTiersAttempted: StructuralSearchTierV4164[];
  candidatesFound: number;
  candidatesRejected: number;
  rejectionReasons: string[];
  unexploredSearchSpaces: string[];
  emitted: boolean;
  reason: "BUILD_CANDIDATE_DISCOVERY_EXHAUSTED" | null;
};

const TIER_LABELS: Record<StructuralSearchTierV4164, string> = {
  1: "existing candidate pool",
  2: "semantic oracle function/mechanic search",
  3: "golden catalog oracle/function search",
  4: "strategy/package RAG",
  5: "MODEL_PRIOR hypotheses",
  6: "function-equivalent / role-compression search",
};

export function buildStructuralCompletionPlanV4164(args: {
  slotBudget: DeckSlotBudgetV4163;
  deckNeeds: DeckNeedV47[];
  underfilledRoles?: string[];
  missingBracketDimensions?: string[];
}): StructuralCompletionPlanV4164 | null {
  if (args.slotBudget.structurallyComplete) return null;
  const remaining = args.slotBudget.remainingNonlandSlots;
  const openNeeds = args.deckNeeds.filter((n) => n.status !== "SATISFIED").map((n) => n.needId);
  const underfilledRoles = args.underfilledRoles ?? ["interaction", "card-velocity", "engine", "access", "protection", "win"];
  const allocations: StructuralSlotAllocationV4164[] = [];
  let left = remaining;
  const categories = [
    { category: "interaction-quality", weight: 0.22 },
    { category: "card-velocity", weight: 0.16 },
    { category: "engine-redundancy", weight: 0.16 },
    { category: "access", weight: 0.12 },
    { category: "protection-recovery", weight: 0.12 },
    { category: "win-architecture", weight: 0.12 },
    { category: "flex-compression", weight: 0.1 },
  ];
  for (const cat of categories) {
    if (left <= 0) break;
    const slots = Math.max(1, Math.round(remaining * cat.weight));
    const assigned = Math.min(slots, left);
    allocations.push({
      category: cat.category,
      slots: assigned,
      reason: `Intentional fill for ${remaining} remaining structural slots`,
    });
    left -= assigned;
  }
  if (left > 0 && allocations.length > 0) {
    allocations[allocations.length - 1]!.slots += left;
  }

  return {
    version: PROFESSOR_STRUCTURAL_COMPLETION_V4_16_4_V1_VERSION,
    remainingNonlandSlots: remaining,
    openDeckNeeds: openNeeds,
    underfilledRoles,
    underfilledPackages: [],
    missingBracketDimensions: args.missingBracketDimensions ?? [],
    curveNeeds: [],
    redundancyNeeds: [],
    flexSlots: allocations.find((a) => a.category === "flex-compression")?.slots ?? 0,
    allocations,
    action: "RUN_STRUCTURAL_RESEARCH",
    summary: `${remaining} structural nonland slots remain — ${allocations.map((a) => `${a.slots} ${a.category}`).join(", ")}`,
  };
}

export function updateStructuralBuildTelemetryV4164(args: {
  prior: StructuralBuildTelemetryV4164 | null | undefined;
  selectedCardCount: number;
  remainingNonlandSlots: number;
  attemptedNeeds?: string[];
  candidatesFound?: number;
  candidatesRejected?: number;
  rejectionReasons?: string[];
}): StructuralBuildTelemetryV4164 {
  const prior = args.prior;
  const unchanged = prior ? prior.lastSelectedCardCount === args.selectedCardCount : false;
  const consecutiveUnchangedPasses = unchanged ? (prior?.consecutiveUnchangedPasses ?? 0) + 1 : 0;
  const searchEscalationRequired = consecutiveUnchangedPasses >= 2;
  let currentSearchTier = prior?.currentSearchTier ?? 1;
  const searchTiersAttempted = [...(prior?.searchTiersAttempted ?? [])];
  if (searchEscalationRequired && currentSearchTier < 6) {
    currentSearchTier = Math.min(6, (currentSearchTier + 1) as StructuralSearchTierV4164);
    if (!searchTiersAttempted.includes(currentSearchTier)) searchTiersAttempted.push(currentSearchTier);
  }

  const tiersWithZeroAdds =
    searchEscalationRequired && consecutiveUnchangedPasses >= 4 ? currentSearchTier : null;
  const buildCandidateDiscoveryExhausted =
    currentSearchTier >= 6 && consecutiveUnchangedPasses >= 6 && args.remainingNonlandSlots > 0;

  return {
    version: PROFESSOR_STRUCTURAL_COMPLETION_V4_16_4_V1_VERSION,
    consecutiveUnchangedPasses,
    lastSelectedCardCount: args.selectedCardCount,
    currentSearchTier,
    searchTiersAttempted,
    normalBuildSearchSuspended: searchEscalationRequired,
    searchEscalationRequired,
    buildCandidateDiscoveryExhausted,
    remainingSlots: args.remainingNonlandSlots,
    attemptedNeeds: args.attemptedNeeds ?? prior?.attemptedNeeds ?? [],
    candidatesFound: args.candidatesFound ?? prior?.candidatesFound ?? 0,
    candidatesRejected: args.candidatesRejected ?? prior?.candidatesRejected ?? 0,
    rejectionReasons: args.rejectionReasons ?? prior?.rejectionReasons ?? [],
    unexploredSearchSpaces:
      buildCandidateDiscoveryExhausted || tiersWithZeroAdds
        ? Object.entries(TIER_LABELS)
            .filter(([tier]) => Number(tier) > currentSearchTier)
            .map(([, label]) => label)
        : [],
  };
}

export function buildStructuralExhaustionAuditV4164(
  telemetry: StructuralBuildTelemetryV4164,
): StructuralExhaustionAuditV4164 {
  return {
    version: PROFESSOR_STRUCTURAL_COMPLETION_V4_16_4_V1_VERSION,
    remainingSlots: telemetry.remainingSlots,
    attemptedNeeds: telemetry.attemptedNeeds,
    searchTiersAttempted: telemetry.searchTiersAttempted,
    candidatesFound: telemetry.candidatesFound,
    candidatesRejected: telemetry.candidatesRejected,
    rejectionReasons: telemetry.rejectionReasons,
    unexploredSearchSpaces: telemetry.unexploredSearchSpaces,
    emitted: telemetry.buildCandidateDiscoveryExhausted,
    reason: telemetry.buildCandidateDiscoveryExhausted ? "BUILD_CANDIDATE_DISCOVERY_EXHAUSTED" : null,
  };
}

export function shouldRunStructuralResearchV4164(args: {
  slotBudget: DeckSlotBudgetV4163 | null;
}): boolean {
  return Boolean(args.slotBudget && !args.slotBudget.structurallyComplete);
}

export function structuralSearchTierLabel(tier: StructuralSearchTierV4164): string {
  return TIER_LABELS[tier];
}
