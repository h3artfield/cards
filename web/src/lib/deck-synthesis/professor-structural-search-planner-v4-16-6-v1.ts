/**
 * Professor v4.16.6 — phase-aware structural planning, deficit missions, coverage truth.
 */
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import type { DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import type { TheoryRealizationV4165 } from "./professor-theory-realization-v4-16-5-v1";
import { unrealizedCorePackages } from "./professor-theory-realization-v4-16-5-v1";
import type { StructuralSearchMissionV4165 } from "./professor-structural-search-planner-v4-16-5-v1";
import type { StructuralSearchTierV4165 } from "./professor-structural-search-planner-v4-16-5-v1";

export const PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_6_V1_VERSION =
  "professor-structural-search-planner-v4-16-6-v1";

export type BuildPhaseV4166 =
  | "EARLY_ASSEMBLY"
  | "NORMAL_ASSEMBLY"
  | "STALLED_RECOVERY"
  | "STRUCTURAL_CLOSURE"
  | "BUILD_FAILED_CANDIDATE_EXHAUSTION";

export type StructuralRoleConstraintV4166 = "MUST_SATISFY_ROLE" | "PREFER_ENGINE_SYNERGY";

export type StructuralCoverageV4166 = {
  function: string;
  currentCount: number;
  currentQuality: "NONE" | "MARGINAL" | "ADEQUATE" | "STRONG";
  targetRange: { min: number; max: number };
  deficit: number;
  selectedMembers: string[];
  roleConstraint: StructuralRoleConstraintV4166;
};

export type AccessToolTargetSplitV4166 = {
  accessToolsSelected: string[];
  accessTargetsRealized: string[];
  accessToolCoverage: number;
  accessTargetRealization: "NOT_READY" | "PARTIAL" | "READY";
};

export type AggregatedStructuralMissionV4166 = Omit<
  StructuralSearchMissionV4165,
  "slotCount" | "missionId"
> & {
  version: typeof PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_6_V1_VERSION;
  missionId: string;
  desiredSlots: { min: number; max: number };
  deficitFunction: string;
  roleConstraint: StructuralRoleConstraintV4166;
  priority: number;
};

export type StructuralCompletionPlanV4166 = {
  version: typeof PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_6_V1_VERSION;
  buildPhase: BuildPhaseV4166;
  remainingNonlandSlots: number;
  missions: AggregatedStructuralMissionV4166[];
  coverage: StructuralCoverageV4166[];
  accessSplit: AccessToolTargetSplitV4166;
  action: "CONTINUE_NORMAL_ASSEMBLY" | "RUN_STRUCTURAL_RESEARCH" | "TERMINATE_EXHAUSTED";
  summary: string;
};

const ACCESS_TOOL_PATTERN =
  /tutor|survival of the fittest|entomb|buried alive|recruiter|wishclaw|gamble|worldly|enlightened|mystical|vampiric|diabolic|personal tutor|finale of devastation|fabricate|merchant scroll|green sun's zenith|idyllic tutor|imperial seal|grim tutor|diabolic intent|collective brutality|neoform|chord of calling|eldritch evolution/i;

function countByRole(selected: CouncilCardV46[], rolePattern: RegExp): string[] {
  return selected
    .filter((c) => c.category !== "land" && (rolePattern.test(c.roles.join(" ")) || rolePattern.test(c.name)))
    .map((c) => c.name);
}

function qualityFromCount(count: number, strongThreshold: number): StructuralCoverageV4166["currentQuality"] {
  if (count === 0) return "NONE";
  if (count >= strongThreshold) return "STRONG";
  if (count >= Math.max(1, strongThreshold - 1)) return "ADEQUATE";
  return "MARGINAL";
}

export function assessAccessToolTargetSplitV4166(args: {
  selectedCards: CouncilCardV46[];
  theoryRealizations: TheoryRealizationV4165[];
}): AccessToolTargetSplitV4166 {
  const accessToolsSelected = args.selectedCards
    .filter((c) => c.category !== "land" && (ACCESS_TOOL_PATTERN.test(c.name) || c.roles.some((r) => /access|tutor/i.test(r))))
    .map((c) => c.name);
  const accessTargetsRealized: string[] = [];
  for (const r of args.theoryRealizations) {
    if (r.realizationStatus === "REALIZED" || r.realizationStatus === "PARTIAL") {
      accessTargetsRealized.push(...r.selectedMembers);
    }
  }
  const accessToolCoverage = accessToolsSelected.length;
  let accessTargetRealization: AccessToolTargetSplitV4166["accessTargetRealization"] = "NOT_READY";
  if (accessTargetsRealized.length >= 2) accessTargetRealization = "READY";
  else if (accessTargetsRealized.length > 0) accessTargetRealization = "PARTIAL";
  return { accessToolsSelected, accessTargetsRealized, accessToolCoverage, accessTargetRealization };
}

export function assessStructuralCoverageV4166(args: {
  selectedCards: CouncilCardV46[];
  requestedBracket: number;
}): StructuralCoverageV4166[] {
  const nonlands = args.selectedCards.filter((c) => c.category !== "land");
  const interaction = countByRole(nonlands, /interaction|removal|counter|destroy|exile/i);
  const velocity = countByRole(nonlands, /card-advantage|draw|filter|impulse|selection|velocity/i);
  const engine = countByRole(nonlands, /engine|synergy|combo|token|sacrifice|ramp/i);
  const protection = countByRole(nonlands, /protection|hexproof|indestructible|defense|recovery/i);
  const access = countByRole(nonlands, ACCESS_TOOL_PATTERN);
  const bracket = args.requestedBracket;
  const interactionTarget = bracket >= 4 ? 8 : 6;
  const velocityTarget = bracket >= 4 ? 10 : 8;
  const engineTarget = bracket >= 4 ? 12 : 10;
  const protectionTarget = bracket >= 4 ? 4 : 3;
  const accessTarget = bracket >= 4 ? 4 : 3;

  return [
    {
      function: "interaction",
      currentCount: interaction.length,
      currentQuality: qualityFromCount(interaction.length, interactionTarget),
      targetRange: { min: Math.max(4, interactionTarget - 4), max: interactionTarget + 2 },
      deficit: Math.max(0, interactionTarget - interaction.length),
      selectedMembers: interaction,
      roleConstraint: "MUST_SATISFY_ROLE",
    },
    {
      function: "card-velocity",
      currentCount: velocity.length,
      currentQuality: qualityFromCount(velocity.length, velocityTarget),
      targetRange: { min: Math.max(4, velocityTarget - 4), max: velocityTarget + 2 },
      deficit: Math.max(0, velocityTarget - velocity.length),
      selectedMembers: velocity,
      roleConstraint: "MUST_SATISFY_ROLE",
    },
    {
      function: "engine",
      currentCount: engine.length,
      currentQuality: qualityFromCount(engine.length, engineTarget),
      targetRange: { min: Math.max(6, engineTarget - 4), max: engineTarget + 4 },
      deficit: Math.max(0, engineTarget - engine.length),
      selectedMembers: engine,
      roleConstraint: "PREFER_ENGINE_SYNERGY",
    },
    {
      function: "protection",
      currentCount: protection.length,
      currentQuality: qualityFromCount(protection.length, protectionTarget),
      targetRange: { min: 2, max: protectionTarget + 2 },
      deficit: Math.max(0, protectionTarget - protection.length),
      selectedMembers: protection,
      roleConstraint: "MUST_SATISFY_ROLE",
    },
    {
      function: "access-tools",
      currentCount: access.length,
      currentQuality: qualityFromCount(access.length, accessTarget),
      targetRange: { min: 2, max: accessTarget + 2 },
      deficit: Math.max(0, accessTarget - access.length),
      selectedMembers: access,
      roleConstraint: "MUST_SATISFY_ROLE",
    },
  ];
}

export function resolveBuildPhaseV4166(args: {
  slotBudget: DeckSlotBudgetV4163;
  stallDetected: boolean;
  terminalExhaustion: boolean;
}): BuildPhaseV4166 {
  if (args.terminalExhaustion) return "BUILD_FAILED_CANDIDATE_EXHAUSTION";
  const ratio = args.slotBudget.selectedNonlands / Math.max(1, args.slotBudget.expectedNonlands);
  if (args.slotBudget.structurallyComplete) return "STRUCTURAL_CLOSURE";
  if (args.stallDetected) {
    return args.slotBudget.remainingNonlandSlots <= 6 ? "STRUCTURAL_CLOSURE" : "STALLED_RECOVERY";
  }
  if (ratio < 0.5) return "EARLY_ASSEMBLY";
  if (args.slotBudget.remainingNonlandSlots <= 6) return "STRUCTURAL_CLOSURE";
  return "NORMAL_ASSEMBLY";
}

function baseMissionFields(
  spec: Partial<AggregatedStructuralMissionV4166>,
): Omit<AggregatedStructuralMissionV4166, "missionId" | "desiredSlots" | "deficitFunction" | "priority"> {
  return {
    version: PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_6_V1_VERSION,
    need: spec.need ?? "deficit",
    strategicPurpose: spec.strategicPurpose ?? "",
    minimumRequirements: spec.minimumRequirements ?? [],
    preferredProperties: spec.preferredProperties ?? [],
    forbiddenProperties: spec.forbiddenProperties ?? [],
    acceptableCardTypes: spec.acceptableCardTypes ?? [],
    mechanicRelations: spec.mechanicRelations ?? [],
    targetPackages: spec.targetPackages ?? [],
    currentCoverage: spec.currentCoverage ?? 0,
    desiredCoverage: spec.desiredCoverage ?? 1,
    searchQueries: spec.searchQueries ?? [],
    searchDomains: spec.searchDomains ?? [],
    currentTier: 1,
    candidatesConsidered: [],
    rejectionReasons: [],
    domainDiffs: [],
    candidateSupply: null,
    status: "PENDING",
    roleConstraint: spec.roleConstraint ?? "MUST_SATISFY_ROLE",
  };
}

export function buildAggregatedMissionsV4166(args: {
  slotBudget: DeckSlotBudgetV4163;
  coverage: StructuralCoverageV4166[];
  theoryRealizations: TheoryRealizationV4165[];
  accessSplit: AccessToolTargetSplitV4166;
  deckNeeds: DeckNeedV47[];
}): AggregatedStructuralMissionV4166[] {
  const missions: AggregatedStructuralMissionV4166[] = [];
  let priority = 1;

  for (const unrealized of unrealizedCorePackages(args.theoryRealizations)) {
    missions.push({
      ...baseMissionFields({
        need: `realize-package:${unrealized.packageId}`,
        strategicPurpose: unrealized.intendedFunction,
        minimumRequirements: ["package member", "singleton available", "color-legal"],
        preferredProperties: ["core-package"],
        acceptableCardTypes: ["Creature", "Artifact", "Enchantment", "Instant", "Sorcery"],
        mechanicRelations: ["package"],
        targetPackages: [unrealized.packageId],
        currentCoverage: unrealized.selectedMembers.length,
        desiredCoverage: unrealized.requiredMinimumMembers,
        searchQueries: [
          `function=core-package-realization;package=${unrealized.packageId};members=${unrealized.candidateCards.slice(0, 6).join("|")}`,
        ],
        searchDomains: ["semantic_oracle", "package_rag", "golden_catalog"],
        roleConstraint: "PREFER_ENGINE_SYNERGY",
      }),
      missionId: `mission-realize-core-package-${unrealized.packageId}`,
      desiredSlots: { min: unrealized.requiredMinimumMembers, max: Math.min(8, unrealized.candidateCards.length) },
      deficitFunction: "core-package-realization",
      priority: priority++,
    });
  }

  const unrealizedCore = unrealizedCorePackages(args.theoryRealizations).length > 0;
  const accessDeficit = args.accessSplit.accessToolCoverage < 2 && !unrealizedCore;

  for (const cov of args.coverage) {
    if (cov.deficit <= 0) continue;
    if (cov.function === "access-tools" && (args.accessSplit.accessToolCoverage >= 2 || unrealizedCore)) continue;

    const slots = Math.min(cov.deficit, Math.max(2, Math.ceil(cov.deficit * 0.6)));
    const tier1Query = `function=${cov.function};deficit=${cov.deficit}`;
    missions.push({
      ...baseMissionFields({
        need: cov.function,
        strategicPurpose:
          cov.function === "interaction"
            ? "efficient interaction for bracket"
            : cov.function === "card-velocity"
              ? "card advantage or selection"
              : cov.function === "protection"
                ? "protection and recovery"
                : cov.function === "access-tools"
                  ? "deterministic or functional access"
                  : "engine redundancy for primary package",
        minimumRequirements: ["color-legal", "B4 quality floor"],
        preferredProperties: cov.roleConstraint === "PREFER_ENGINE_SYNERGY" ? ["synergy"] : ["efficient", "multi-role"],
        acceptableCardTypes:
          cov.function === "interaction"
            ? ["Instant", "Sorcery"]
            : cov.function === "card-velocity"
              ? ["Instant", "Sorcery", "Enchantment", "Artifact"]
              : ["Creature", "Artifact", "Enchantment", "Instant", "Sorcery"],
        mechanicRelations: [cov.function],
        currentCoverage: cov.currentCount,
        desiredCoverage: cov.targetRange.min,
        searchQueries: [tier1Query],
        searchDomains: ["existing_candidate_pool"],
        roleConstraint: cov.roleConstraint,
      }),
      missionId: `mission-${cov.function}`,
      desiredSlots: { min: Math.max(1, slots - 1), max: slots + 1 },
      deficitFunction: cov.function,
      priority: priority++,
    });
  }

  if (accessDeficit && !missions.some((m) => m.deficitFunction === "access-tools")) {
    missions.push({
      ...baseMissionFields({
        need: "access",
        strategicPurpose: "functional access when targets unrealized",
        minimumRequirements: ["tutor OR redundancy OR selection", "color-legal"],
        mechanicRelations: ["access"],
        searchQueries: ["function=access-tools;deficit=functional"],
        searchDomains: ["golden_catalog", "semantic_oracle"],
        roleConstraint: "MUST_SATISFY_ROLE",
      }),
      missionId: "mission-access-functional",
      desiredSlots: { min: 1, max: 3 },
      deficitFunction: "access-tools",
      priority: priority++,
    });
  }

  return missions.sort((a, b) => a.priority - b.priority);
}

export function buildStructuralCompletionPlanV4166(args: {
  slotBudget: DeckSlotBudgetV4163;
  selectedCards: CouncilCardV46[];
  deckNeeds: DeckNeedV47[];
  theoryRealizations: TheoryRealizationV4165[];
  requestedBracket: number;
  stallDetected: boolean;
  terminalExhaustion: boolean;
}): StructuralCompletionPlanV4166 {
  const buildPhase = resolveBuildPhaseV4166({
    slotBudget: args.slotBudget,
    stallDetected: args.stallDetected,
    terminalExhaustion: args.terminalExhaustion,
  });
  const coverage = assessStructuralCoverageV4166({
    selectedCards: args.selectedCards,
    requestedBracket: args.requestedBracket,
  });
  const accessSplit = assessAccessToolTargetSplitV4166({
    selectedCards: args.selectedCards,
    theoryRealizations: args.theoryRealizations,
  });

  if (buildPhase === "EARLY_ASSEMBLY" || buildPhase === "NORMAL_ASSEMBLY") {
    return {
      version: PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_6_V1_VERSION,
      buildPhase,
      remainingNonlandSlots: args.slotBudget.remainingNonlandSlots,
      missions: [],
      coverage,
      accessSplit,
      action: "CONTINUE_NORMAL_ASSEMBLY",
      summary: `${buildPhase} — ${args.slotBudget.selectedNonlands}/${args.slotBudget.expectedNonlands} nonlands; normal assembly continues`,
    };
  }

  const missions = buildAggregatedMissionsV4166({
    slotBudget: args.slotBudget,
    coverage,
    theoryRealizations: args.theoryRealizations,
    accessSplit,
    deckNeeds: args.deckNeeds,
  });

  return {
    version: PROFESSOR_STRUCTURAL_SEARCH_PLANNER_V4_16_6_V1_VERSION,
    buildPhase,
    remainingNonlandSlots: args.slotBudget.remainingNonlandSlots,
    missions,
    coverage,
    accessSplit,
    action: args.terminalExhaustion ? "TERMINATE_EXHAUSTED" : "RUN_STRUCTURAL_RESEARCH",
    summary: `${buildPhase} — ${missions.length} deficit mission(s) for ${args.slotBudget.remainingNonlandSlots} remaining slots`,
  };
}
