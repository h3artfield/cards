/**
 * Normative functional-role closure design v3 constants.
 * Applicability matrix: lens × trigger × role → REQUIRED | RECOMMENDED | N/A
 */
export const FUNCTIONAL_ROLES = [
  "ENGINE",
  "ENABLER",
  "FUEL",
  "PAYOFF",
  "CONVERSION",
  "PROTECTION",
  "RECOVERY",
  "FINISHER",
  "COMMANDER_MAINTENANCE",
  "CROSS_ENGINE_BRIDGE",
] as const;

export type FunctionalRole = (typeof FUNCTIONAL_ROLES)[number];
export type Lens = "DEPENDENT_SYNERGY" | "INDEPENDENT_SYNERGY" | "HARMONY";
export type Applicability = "REQUIRED" | "RECOMMENDED" | "N/A";
export type ClosureStatus =
  | "CLOSED"
  | "GAP_DETECTED"
  | "HARMONY_UNDERDETERMINED"
  | "EVIDENCE_INSUFFICIENT";

/** Normative precedence — higher index wins over lower when multiple statuses apply. */
export const CLOSURE_STATUS_PRECEDENCE: ClosureStatus[] = [
  "CLOSED",
  "GAP_DETECTED",
  "HARMONY_UNDERDETERMINED",
  "EVIDENCE_INSUFFICIENT",
];

export function resolveClosureStatus(candidates: ClosureStatus[]): ClosureStatus {
  let best: ClosureStatus = "CLOSED";
  let bestRank = -1;
  for (const status of candidates) {
    const rank = CLOSURE_STATUS_PRECEDENCE.indexOf(status);
    if (rank > bestRank) {
      bestRank = rank;
      best = status;
    }
  }
  return best;
}

export const LENSES: Lens[] = ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"];

export const TRIGGER_IDS = [
  "T_ENGINE_PRESENT",
  "T_COMMANDER_OPERATIONAL",
  "T_SECONDARY_LOOP",
  "T_PARTNER_HANDOFF",
  "T_ZONE_VOLATILITY",
  "T_CREATURE_DENSITY",
  "T_CONVERSION_OUTPUT",
  "T_COMBAT_FINISH",
  "T_INTERACTION_PRESSURE",
  "T_EVIDENCE_PARTIAL",
] as const;

export type TriggerId = (typeof TRIGGER_IDS)[number];

export type TriggerDefinition = {
  triggerId: TriggerId;
  semanticPredicate: string;
  derivedFrom: "commander_oracle" | "engine_structure" | "resource_topology";
  detectionHints: string[];
};

export const TRIGGER_REGISTRY: Record<TriggerId, TriggerDefinition> = {
  T_ENGINE_PRESENT: {
    triggerId: "T_ENGINE_PRESENT",
    semanticPredicate: "hypothesis declares measurable engineOutputs with supporting validated packages in graph",
    derivedFrom: "engine_structure",
    detectionHints: ["engineOutputs.length > 0", "validatedPackages.length > 0"],
  },
  T_COMMANDER_OPERATIONAL: {
    triggerId: "T_COMMANDER_OPERATIONAL",
    semanticPredicate: "commanderDependencies include repeated activation, untap, or zone-availability requirements",
    derivedFrom: "commander_oracle",
    detectionHints: ["commanderDependencies mentions untap/activation/availability"],
  },
  T_SECONDARY_LOOP: {
    triggerId: "T_SECONDARY_LOOP",
    semanticPredicate: "hypothesis declares independent secondary engineInputs/outputs distinct from primary chain",
    derivedFrom: "engine_structure",
    detectionHints: ["secondaryLoop marker in hypothesis strategyStatement or engineInputs"],
  },
  T_PARTNER_HANDOFF: {
    triggerId: "T_PARTNER_HANDOFF",
    semanticPredicate: "commandZoneConfiguration is partner_pair and hypotheses declare cross-commander handoff",
    derivedFrom: "resource_topology",
    detectionHints: ["partner handoff in commanderDependencies or producedResources consumed cross-commander"],
  },
  T_ZONE_VOLATILITY: {
    triggerId: "T_ZONE_VOLATILITY",
    semanticPredicate: "engine uses graveyard/exile/library as primary resource store",
    derivedFrom: "resource_topology",
    detectionHints: ["resource graph nodes in non-battlefield zones"],
  },
  T_CREATURE_DENSITY: {
    triggerId: "T_CREATURE_DENSITY",
    semanticPredicate: "engine requires renewable creatures/tokens/fodder density",
    derivedFrom: "engine_structure",
    detectionHints: ["producedResources includes creature tokens or fodder loops"],
  },
  T_CONVERSION_OUTPUT: {
    triggerId: "T_CONVERSION_OUTPUT",
    semanticPredicate: "resourceTransformations change resource type into new exploitable output",
    derivedFrom: "engine_structure",
    detectionHints: ["resourceTransformations non-empty"],
  },
  T_COMBAT_FINISH: {
    triggerId: "T_COMBAT_FINISH",
    semanticPredicate: "strategyStatement or payoffs declare combat damage or combat-trigger win pressure",
    derivedFrom: "engine_structure",
    detectionHints: ["payoffs mention combat damage or evasive attackers"],
  },
  T_INTERACTION_PRESSURE: {
    triggerId: "T_INTERACTION_PRESSURE",
    semanticPredicate: "semanticRequirements include stabilization against removal/stax/attrition",
    derivedFrom: "engine_structure",
    detectionHints: ["semanticRequirements mention protection/stabilization"],
  },
  T_EVIDENCE_PARTIAL: {
    triggerId: "T_EVIDENCE_PARTIAL",
    semanticPredicate: "frozenFacts or frozenOpportunities marked unavailable/incomplete for required inference",
    derivedFrom: "resource_topology",
    detectionHints: ["frozenFacts status UNAVAILABLE or opportunities incomplete"],
  },
};

export type ApplicabilityMatrixEntry = {
  triggerId: TriggerId;
  lens: Lens;
  roleEffects: Partial<Record<FunctionalRole, Applicability>>;
};

/** Normative lens × trigger × role matrix (executable, not inferred from DEV adjudications). */
export const APPLICABILITY_MATRIX: ApplicabilityMatrixEntry[] = [
  {
    triggerId: "T_ENGINE_PRESENT",
    lens: "DEPENDENT_SYNERGY",
    roleEffects: { ENGINE: "REQUIRED", PAYOFF: "REQUIRED" },
  },
  {
    triggerId: "T_ENGINE_PRESENT",
    lens: "INDEPENDENT_SYNERGY",
    roleEffects: { ENGINE: "REQUIRED", ENABLER: "REQUIRED", PAYOFF: "REQUIRED" },
  },
  {
    triggerId: "T_ENGINE_PRESENT",
    lens: "HARMONY",
    roleEffects: { CROSS_ENGINE_BRIDGE: "REQUIRED" },
  },
  {
    triggerId: "T_COMMANDER_OPERATIONAL",
    lens: "DEPENDENT_SYNERGY",
    roleEffects: { COMMANDER_MAINTENANCE: "REQUIRED" },
  },
  {
    triggerId: "T_SECONDARY_LOOP",
    lens: "INDEPENDENT_SYNERGY",
    roleEffects: { PAYOFF: "REQUIRED" },
  },
  {
    triggerId: "T_PARTNER_HANDOFF",
    lens: "DEPENDENT_SYNERGY",
    roleEffects: { COMMANDER_MAINTENANCE: "RECOMMENDED" },
  },
  {
    triggerId: "T_PARTNER_HANDOFF",
    lens: "HARMONY",
    roleEffects: { CROSS_ENGINE_BRIDGE: "REQUIRED" },
  },
  {
    triggerId: "T_ZONE_VOLATILITY",
    lens: "DEPENDENT_SYNERGY",
    roleEffects: { RECOVERY: "RECOMMENDED" },
  },
  {
    triggerId: "T_ZONE_VOLATILITY",
    lens: "INDEPENDENT_SYNERGY",
    roleEffects: { RECOVERY: "RECOMMENDED" },
  },
  {
    triggerId: "T_CREATURE_DENSITY",
    lens: "DEPENDENT_SYNERGY",
    roleEffects: { FUEL: "REQUIRED" },
  },
  {
    triggerId: "T_CREATURE_DENSITY",
    lens: "INDEPENDENT_SYNERGY",
    roleEffects: { FUEL: "REQUIRED" },
  },
  {
    triggerId: "T_CREATURE_DENSITY",
    lens: "HARMONY",
    roleEffects: { FUEL: "RECOMMENDED", CROSS_ENGINE_BRIDGE: "RECOMMENDED" },
  },
  {
    triggerId: "T_CONVERSION_OUTPUT",
    lens: "DEPENDENT_SYNERGY",
    roleEffects: { CONVERSION: "REQUIRED" },
  },
  {
    triggerId: "T_CONVERSION_OUTPUT",
    lens: "INDEPENDENT_SYNERGY",
    roleEffects: { CONVERSION: "REQUIRED" },
  },
  {
    triggerId: "T_COMBAT_FINISH",
    lens: "DEPENDENT_SYNERGY",
    roleEffects: { FINISHER: "RECOMMENDED" },
  },
  {
    triggerId: "T_COMBAT_FINISH",
    lens: "INDEPENDENT_SYNERGY",
    roleEffects: { FINISHER: "RECOMMENDED" },
  },
  {
    triggerId: "T_INTERACTION_PRESSURE",
    lens: "DEPENDENT_SYNERGY",
    roleEffects: { PROTECTION: "RECOMMENDED" },
  },
  {
    triggerId: "T_INTERACTION_PRESSURE",
    lens: "INDEPENDENT_SYNERGY",
    roleEffects: { PROTECTION: "RECOMMENDED" },
  },
];

export const TRIGGER_PRECEDENCE: TriggerId[] = [
  "T_EVIDENCE_PARTIAL",
  "T_ENGINE_PRESENT",
  "T_COMMANDER_OPERATIONAL",
  "T_PARTNER_HANDOFF",
  "T_ZONE_VOLATILITY",
  "T_CREATURE_DENSITY",
  "T_CONVERSION_OUTPUT",
  "T_COMBAT_FINISH",
  "T_INTERACTION_PRESSURE",
  "T_SECONDARY_LOOP",
];

export function mergeApplicability(
  firedTriggers: TriggerId[],
  lens: Lens,
): Record<FunctionalRole, Applicability> {
  const out = Object.fromEntries(FUNCTIONAL_ROLES.map((r) => [r, "N/A"])) as Record<FunctionalRole, Applicability>;
  const ordered = TRIGGER_PRECEDENCE.filter((t) => firedTriggers.includes(t));
  for (const triggerId of ordered) {
    const entry = APPLICABILITY_MATRIX.find((e) => e.triggerId === triggerId && e.lens === lens);
    if (!entry) continue;
    for (const [role, app] of Object.entries(entry.roleEffects) as Array<[FunctionalRole, Applicability]>) {
      if (app === "REQUIRED") out[role] = "REQUIRED";
      else if (app === "RECOMMENDED" && out[role] !== "REQUIRED") out[role] = "RECOMMENDED";
    }
  }
  return out;
}

export function matrixRuleFor(triggerId: TriggerId, lens: Lens, role: FunctionalRole): ApplicabilityMatrixEntry | undefined {
  return APPLICABILITY_MATRIX.find((e) => e.triggerId === triggerId && e.lens === lens && e.roleEffects[role]);
}
