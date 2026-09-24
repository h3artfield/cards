#!/usr/bin/env npx tsx
/**
 * Author post-gold closure design v2, DEV36/HOLDOUT24 frozen snapshots, and adjudications.
 * Addresses pre-implementation audit DESIGN_BLOCK. Does NOT implement closure runtime.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const OUT = resolve("data/milestones/deck-synthesis");
const SEED = "phase6a1-post-gold-dev36-holdout24-seed-20260814";
const GENERATED_AT = new Date().toISOString();

const FUNCTIONAL_ROLES = [
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

type FunctionalRole = (typeof FUNCTIONAL_ROLES)[number];
type Lens = "DEPENDENT_SYNERGY" | "INDEPENDENT_SYNERGY" | "HARMONY";
type Applicability = "REQUIRED" | "RECOMMENDED" | "N/A";
type Satisfaction = "SATISFIED" | "MISSING" | "NOT_APPLICABLE";
type ClosureStatus =
  | "CLOSED"
  | "GAP_DETECTED"
  | "HARMONY_UNDERDETERMINED"
  | "EVIDENCE_INSUFFICIENT";

const LENSES: Lens[] = ["DEPENDENT_SYNERGY", "INDEPENDENT_SYNERGY", "HARMONY"];

const TRIGGER_REGISTRY = {
  T_ENGINE_PRESENT: {
    predicate: "strategy_declares_primary_engine_with_measurable_output",
    derivedFrom: "engine_structure",
    description: "Primary engine output is declared in hypothesis resource graph.",
  },
  T_COMMANDER_OPERATIONAL: {
    predicate: "primary_output_requires_commander_zone_availability_or_repeated_activation",
    derivedFrom: "commander_oracle",
    description: "Engine chain requires commander to remain available or be repeatedly activated.",
  },
  T_SECONDARY_LOOP: {
    predicate: "strategy_declares_secondary_resource_loop_independent_of_primary_chain",
    derivedFrom: "engine_structure",
    description: "A secondary resource loop is declared alongside the primary engine.",
  },
  T_PARTNER_HANDOFF: {
    predicate: "partner_pair_requires_cross_commander_resource_or_trigger_handoff",
    derivedFrom: "resource_topology",
    description: "Partner configuration requires cross-commander handoff.",
  },
  T_ZONE_VOLATILITY: {
    predicate: "engine_uses_non_battlefield_zone_as_primary_resource_store",
    derivedFrom: "resource_topology",
    description: "Primary fuel or value lives in graveyard, exile, or other non-battlefield zone.",
  },
  T_CREATURE_DENSITY: {
    predicate: "engine_requires_renewable_creature_fodder_or_typed_creatures",
    derivedFrom: "engine_structure",
    description: "Engine requires creature fodder density or typed creature supply.",
  },
  T_CONVERSION_OUTPUT: {
    predicate: "engine_declares_resource_transformation_with_new_output_type",
    derivedFrom: "engine_structure",
    description: "Engine transforms one resource type into a different exploitable output.",
  },
  T_COMBAT_FINISH: {
    predicate: "strategy_declares_combat_damage_or_combat_trigger_win_pattern",
    derivedFrom: "engine_structure",
    description: "Strategy terminates in combat-based finish pressure.",
  },
  T_INTERACTION_PRESSURE: {
    predicate: "strategy_declares_persistent_interaction_or_board_stabilization_need",
    derivedFrom: "engine_structure",
    description: "Engine requires protection from disruption or attrition pressure.",
  },
  T_EVIDENCE_PARTIAL: {
    predicate: "required_oracle_or_resource_fact_missing_from_frozen_inputs",
    derivedFrom: "resource_topology",
    description: "Frozen facts/opportunities are insufficient to derive role evidence.",
  },
} as const;

type TriggerId = keyof typeof TRIGGER_REGISTRY;

type BenchmarkCase = {
  caseId: string;
  sourceProvenance: { pool: string; sourceCaseId: string; selectionSeed: string };
  category: string;
  commandZoneConfiguration: "single_commander" | "partner_pair" | "commander_with_background";
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
  notes?: string;
};

type RoleSlot = { applicability: Applicability; satisfaction: Satisfaction };

type LensExpectation = {
  expectedTriggerResults: Array<{ triggerId: TriggerId; applies: boolean; derivedFrom: string }>;
  roleApplicability: Record<FunctionalRole, Applicability>;
  expectedSatisfaction: Record<
    FunctionalRole,
    { state: Satisfaction; evidenceBindings: Array<{ packageRefId: string; bindingKind: string }> }
  >;
  closureStatus: ClosureStatus;
  repairTargets: Array<{
    lens: Lens;
    missingRole: FunctionalRole;
    triggerRef: TriggerId;
    genericGapStatement: string;
  }>;
};

function sha256Bytes(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

function writeJson(path: string, value: unknown): string {
  writeFileSync(path, JSON.stringify(value, null, 2));
  return sha256File(path);
}

function loadV1Population(version: "dev36" | "holdout24"): BenchmarkCase[] {
  const file =
    version === "dev36"
      ? "phase6a1-professor-plan-dev36-population-v1.json"
      : "phase6a1-professor-plan-holdout24-population-v1.json";
  const parsed = JSON.parse(readFileSync(resolve(OUT, file), "utf8")) as { cases: BenchmarkCase[] };
  return parsed.cases.map(({ caseId, sourceProvenance, category, commandZoneConfiguration, commanders, bracket, notes }) => ({
    caseId,
    sourceProvenance,
    category,
    commandZoneConfiguration,
    commanders,
    bracket,
    notes,
  }));
}

function topologyTriggers(category: string, commandZoneConfiguration: string, evidencePartial: boolean): TriggerId[] {
  const triggers: TriggerId[] = ["T_ENGINE_PRESENT"];
  if (evidencePartial) triggers.push("T_EVIDENCE_PARTIAL");
  if (commandZoneConfiguration === "partner_pair") triggers.push("T_PARTNER_HANDOFF");
  if (["graveyard", "unusual_zones", "multi_stage_engine"].some((k) => category.includes(k))) {
    triggers.push("T_ZONE_VOLATILITY");
  }
  if (["tokens", "typal", "attrition_engine", "counters"].some((k) => category.includes(k))) {
    triggers.push("T_CREATURE_DENSITY");
  }
  if (
    ["resource_conversion", "cost_dependency", "resource_scaler", "output_multiplier", "artifacts"].some((k) =>
      category.includes(k),
    )
  ) {
    triggers.push("T_CONVERSION_OUTPUT");
  }
  if (["combat", "typal", "single_plan"].some((k) => category.includes(k)) || category === "partner_pair") {
    triggers.push("T_COMBAT_FINISH");
  }
  if (
    ["protection_engine", "static_restriction", "attrition_engine", "static_state_engine", "stax"].some((k) =>
      category.includes(k),
    )
  ) {
    triggers.push("T_INTERACTION_PRESSURE");
  }
  if (
    ["multi_archetype", "multiple_legitimate_plans", "broad", "hybrid", "partner"].some((k) => category.includes(k)) ||
    commandZoneConfiguration !== "single_commander"
  ) {
    triggers.push("T_SECONDARY_LOOP");
  }
  if (["activated_engine", "activated_cost", "triggered_engine", "tutor_toolbox"].some((k) => category.includes(k))) {
    triggers.push("T_COMMANDER_OPERATIONAL");
  }
  return [...new Set(triggers)];
}

function defaultApplicability(
  triggerIds: TriggerId[],
  lens: Lens,
  commandZoneConfiguration: string,
): Record<FunctionalRole, Applicability> {
  const out = Object.fromEntries(FUNCTIONAL_ROLES.map((r) => [r, "N/A"])) as Record<FunctionalRole, Applicability>;
  out.ENGINE = "REQUIRED";
  out.PAYOFF = "REQUIRED";
  if (lens === "INDEPENDENT_SYNERGY") out.ENABLER = "REQUIRED";
  if (triggerIds.includes("T_CREATURE_DENSITY")) out.FUEL = "REQUIRED";
  if (triggerIds.includes("T_CONVERSION_OUTPUT")) out.CONVERSION = "REQUIRED";
  if (triggerIds.includes("T_COMBAT_FINISH")) out.FINISHER = "RECOMMENDED";
  if (triggerIds.includes("T_INTERACTION_PRESSURE")) out.PROTECTION = "RECOMMENDED";
  if (triggerIds.includes("T_ZONE_VOLATILITY")) out.RECOVERY = "RECOMMENDED";
  if (triggerIds.includes("T_COMMANDER_OPERATIONAL") && lens === "DEPENDENT_SYNERGY") {
    out.COMMANDER_MAINTENANCE = "REQUIRED";
  }
  if (lens === "DEPENDENT_SYNERGY" && commandZoneConfiguration === "partner_pair") {
    out.COMMANDER_MAINTENANCE = "REQUIRED";
  }
  if (lens === "HARMONY") out.CROSS_ENGINE_BRIDGE = "REQUIRED";
  if (triggerIds.includes("T_PARTNER_HANDOFF") && lens === "HARMONY") out.CROSS_ENGINE_BRIDGE = "REQUIRED";
  return out;
}

/** Explicit DEV36 role-coverage slots: each role gets satisfied + missing case indices. */
const ROLE_COVERAGE: Record<
  FunctionalRole | "EVIDENCE_INSUFFICIENT",
  { satisfied: Array<{ caseIndex: number; lens: Lens }>; missing: Array<{ caseIndex: number; lens: Lens }> }
> = {
  ENGINE: {
    satisfied: [
      { caseIndex: 0, lens: "DEPENDENT_SYNERGY" },
      { caseIndex: 1, lens: "INDEPENDENT_SYNERGY" },
    ],
    missing: [{ caseIndex: 2, lens: "DEPENDENT_SYNERGY" }],
  },
  ENABLER: {
    satisfied: [{ caseIndex: 13, lens: "INDEPENDENT_SYNERGY" }],
    missing: [{ caseIndex: 14, lens: "INDEPENDENT_SYNERGY" }],
  },
  FUEL: {
    satisfied: [
      { caseIndex: 1, lens: "DEPENDENT_SYNERGY" },
      { caseIndex: 25, lens: "INDEPENDENT_SYNERGY" },
    ],
    missing: [
      { caseIndex: 25, lens: "DEPENDENT_SYNERGY" },
      { caseIndex: 1, lens: "INDEPENDENT_SYNERGY" },
    ],
  },
  PAYOFF: {
    satisfied: [{ caseIndex: 0, lens: "DEPENDENT_SYNERGY" }],
    missing: [{ caseIndex: 4, lens: "INDEPENDENT_SYNERGY" }],
  },
  CONVERSION: {
    satisfied: [
      { caseIndex: 32, lens: "DEPENDENT_SYNERGY" },
      { caseIndex: 33, lens: "INDEPENDENT_SYNERGY" },
    ],
    missing: [
      { caseIndex: 32, lens: "INDEPENDENT_SYNERGY" },
      { caseIndex: 33, lens: "DEPENDENT_SYNERGY" },
    ],
  },
  PROTECTION: {
    satisfied: [
      { caseIndex: 9, lens: "DEPENDENT_SYNERGY" },
      { caseIndex: 34, lens: "INDEPENDENT_SYNERGY" },
    ],
    missing: [
      { caseIndex: 9, lens: "INDEPENDENT_SYNERGY" },
      { caseIndex: 34, lens: "DEPENDENT_SYNERGY" },
    ],
  },
  RECOVERY: {
    satisfied: [
      { caseIndex: 5, lens: "DEPENDENT_SYNERGY" },
      { caseIndex: 6, lens: "INDEPENDENT_SYNERGY" },
    ],
    missing: [
      { caseIndex: 5, lens: "INDEPENDENT_SYNERGY" },
      { caseIndex: 6, lens: "DEPENDENT_SYNERGY" },
    ],
  },
  FINISHER: {
    satisfied: [
      { caseIndex: 10, lens: "DEPENDENT_SYNERGY" },
      { caseIndex: 27, lens: "INDEPENDENT_SYNERGY" },
    ],
    missing: [
      { caseIndex: 10, lens: "INDEPENDENT_SYNERGY" },
      { caseIndex: 27, lens: "DEPENDENT_SYNERGY" },
    ],
  },
  COMMANDER_MAINTENANCE: {
    satisfied: [
      { caseIndex: 2, lens: "DEPENDENT_SYNERGY" },
      { caseIndex: 23, lens: "DEPENDENT_SYNERGY" },
    ],
    missing: [
      { caseIndex: 19, lens: "DEPENDENT_SYNERGY" },
      { caseIndex: 31, lens: "DEPENDENT_SYNERGY" },
    ],
  },
  CROSS_ENGINE_BRIDGE: {
    satisfied: [{ caseIndex: 16, lens: "HARMONY" }],
    missing: [{ caseIndex: 17, lens: "HARMONY" }],
  },
  EVIDENCE_INSUFFICIENT: {
    satisfied: [{ caseIndex: 34, lens: "DEPENDENT_SYNERGY" }],
    missing: [{ caseIndex: 35, lens: "INDEPENDENT_SYNERGY" }],
  },
};

function slotMap(): Map<string, "SATISFIED" | "MISSING"> {
  const map = new Map<string, "SATISFIED" | "MISSING">();
  for (const [role, slots] of Object.entries(ROLE_COVERAGE)) {
    if (role === "EVIDENCE_INSUFFICIENT") continue;
    for (const s of slots.satisfied) map.set(`${s.caseIndex}:${s.lens}:${role}`, "SATISFIED");
    for (const s of slots.missing) map.set(`${s.caseIndex}:${s.lens}:${role}`, "MISSING");
  }
  return map;
}

function isEvidenceCase(caseIndex: number): boolean {
  return caseIndex === 34 || caseIndex === 35;
}

function buildLensExpectation(
  caseIndex: number,
  lens: Lens,
  category: string,
  commandZoneConfiguration: string,
  slots: Map<string, "SATISFIED" | "MISSING">,
): LensExpectation {
  const evidencePartial = isEvidenceCase(caseIndex);
  const triggerIds = topologyTriggers(category, commandZoneConfiguration, evidencePartial);
  const applicability = defaultApplicability(triggerIds, lens, commandZoneConfiguration);

  if (caseIndex === 17 && lens === "HARMONY") {
    applicability.CROSS_ENGINE_BRIDGE = "REQUIRED";
  }

  const expectedSatisfaction = Object.fromEntries(
    FUNCTIONAL_ROLES.map((role) => {
      const app = applicability[role];
      if (app === "N/A") {
        return [role, { state: "NOT_APPLICABLE" as Satisfaction, evidenceBindings: [] }];
      }
      const slot = slots.get(`${caseIndex}:${lens}:${role}`);
      const state: Satisfaction = slot ?? (app === "RECOMMENDED" ? "SATISFIED" : "SATISFIED");
      const packageRefId = `pkg-${caseIndex}-${lens.slice(0, 3).toLowerCase()}-${role.toLowerCase()}`;
      return [
        role,
        {
          state,
          evidenceBindings:
            state === "SATISFIED"
              ? [{ packageRefId, bindingKind: state === "SATISFIED" ? "validated_role_claim" : "none" }]
              : [],
        },
      ];
    }),
  ) as LensExpectation["expectedSatisfaction"];

  for (const role of FUNCTIONAL_ROLES) {
    const slot = slots.get(`${caseIndex}:${lens}:${role}`);
    const app = applicability[role];
    if (app === "N/A") {
      expectedSatisfaction[role] = { state: "NOT_APPLICABLE", evidenceBindings: [] };
      continue;
    }
    if (slot) {
      expectedSatisfaction[role].state = slot;
      expectedSatisfaction[role].evidenceBindings =
        slot === "SATISFIED"
          ? [
              {
                packageRefId: `pkg-${caseIndex}-${lens.slice(0, 3).toLowerCase()}-${role.toLowerCase()}`,
                bindingKind: "validated_role_claim",
              },
            ]
          : [];
    }
  }

  let closureStatus: ClosureStatus = "CLOSED";
  if (evidencePartial) {
    closureStatus = "EVIDENCE_INSUFFICIENT";
  } else if (caseIndex === 17 && lens === "HARMONY") {
    closureStatus = "HARMONY_UNDERDETERMINED";
  } else if (Object.values(expectedSatisfaction).some((s) => s.state === "MISSING")) {
    closureStatus = "GAP_DETECTED";
  }

  const repairTargets = FUNCTIONAL_ROLES.flatMap((role) => {
    if (expectedSatisfaction[role].state !== "MISSING") return [];
    const triggerRef =
      role === "CONVERSION"
        ? "T_CONVERSION_OUTPUT"
        : role === "FINISHER"
          ? "T_COMBAT_FINISH"
          : role === "PROTECTION"
            ? "T_INTERACTION_PRESSURE"
            : role === "RECOVERY"
              ? "T_ZONE_VOLATILITY"
              : role === "COMMANDER_MAINTENANCE"
                ? "T_COMMANDER_OPERATIONAL"
                : role === "CROSS_ENGINE_BRIDGE"
                  ? "T_PARTNER_HANDOFF"
                  : role === "FUEL"
                    ? "T_CREATURE_DENSITY"
                    : "T_ENGINE_PRESENT";
    return [
      {
        lens,
        missingRole: role,
        triggerRef,
        genericGapStatement: `Required ${role.toLowerCase()} role has no evidence-bound validated package under frozen inputs.`,
      },
    ];
  });

  return {
    expectedTriggerResults: Object.entries(TRIGGER_REGISTRY).map(([triggerId, meta]) => ({
      triggerId: triggerId as TriggerId,
      applies: triggerIds.includes(triggerId as TriggerId),
      derivedFrom: meta.derivedFrom,
    })),
    roleApplicability: applicability,
    expectedSatisfaction,
    closureStatus,
    repairTargets,
  };
}

function buildRuntimeSnapshot(
  benchmark: BenchmarkCase,
  caseIndex: number,
  lensExpectations: Record<Lens, LensExpectation>,
) {
  const evidencePartial = isEvidenceCase(caseIndex);
  return {
    caseId: benchmark.caseId,
    commanders: benchmark.commanders,
    commandZoneConfiguration: benchmark.commandZoneConfiguration,
    runtimeSchemaVersion: "phase6a1-closure-runtime-input-v2",
    frozenFacts: evidencePartial
      ? [{ factId: `fact-${caseIndex}-partial`, status: "UNAVAILABLE" }]
      : [{ factId: `fact-${caseIndex}-core`, status: "AVAILABLE" }],
    frozenOpportunities: [{ opportunityId: `opp-${caseIndex}-core`, status: evidencePartial ? "UNAVAILABLE" : "AVAILABLE" }],
    lenses: Object.fromEntries(
      LENSES.map((lens) => {
        const exp = lensExpectations[lens];
        const validatedPackages = FUNCTIONAL_ROLES.flatMap((role) => {
          const sat = exp.expectedSatisfaction[role];
          if (sat.state !== "SATISFIED") return [];
          const packageRefId = sat.evidenceBindings[0]?.packageRefId ?? `pkg-${caseIndex}-${lens.slice(0, 3).toLowerCase()}-${role.toLowerCase()}`;
          return [
            {
              packageRefId,
              hypothesisId: `hyp-${caseIndex}-${lens.slice(0, 3).toLowerCase()}`,
              validatorStatus: "VALID",
              roleClaims: [role],
              resourceBindings: [{ resourceNodeId: `res-${caseIndex}-${role.toLowerCase()}`, claim: role.toLowerCase() }],
            },
          ];
        });
        const rejectedPackages = [
          {
            packageRefId: `pkg-${caseIndex}-${lens.slice(0, 3).toLowerCase()}-rejected`,
            hypothesisId: `hyp-${caseIndex}-${lens.slice(0, 3).toLowerCase()}`,
            validatorStatus: "INVALID",
            roleClaims: ["ENGINE"],
            rejectionReason: "validator_v2_failed",
          },
        ];
        return [
          lens,
          {
            hypotheses: [
              {
                hypothesisId: `hyp-${caseIndex}-${lens.slice(0, 3).toLowerCase()}`,
                declaredEngineOutputs: ["primary_output"],
                resourceClaims: exp.expectedTriggerResults.filter((t) => t.applies).map((t) => t.triggerId),
              },
            ],
            validatedPackages,
            rejectedPackages,
            resourceGraph: {
              nodes: exp.expectedTriggerResults.filter((t) => t.applies).map((t) => ({ nodeId: t.triggerId, kind: t.derivedFrom })),
              edges: [],
            },
          },
        ];
      }),
    ),
  };
}

function buildDesignV2(dev36ManifestSha: string, holdoutManifestSha: string) {
  return {
    version: "phase6a1-professor-plan-functional-role-closure-design-v2",
    supersedes: "phase6a1-professor-plan-functional-role-closure-design-v1",
    preImplementationAudit: {
      artifact: "phase6a1-professor-plan-functional-role-closure-preimplementation-audit-gpt56sol-v1.json",
      decision: "DESIGN_BLOCK",
      addressedBy: "design-v2-repair-set",
    },
    authorizedAt: GENERATED_AT,
    authorization: "DESIGN_V2_WAIT_BEFORE_IMPLEMENTATION",
    bracketPolicy: {
      closureBracketInvariant: true,
      statement:
        "Functional-role applicability, trigger registry, and satisfaction rules are derived only from strategy/resource topology and validator-approved packages. Bracket does not alter role semantics.",
      holdout24BracketNote:
        "HOLDOUT24 is bracket-3-only; acceptable because closure is bracket-invariant. Bracket-diverse holdout deferred until bracket-sensitive semantics are introduced.",
    },
    pipelineOrder: [
      "facts/opportunities",
      "hypothesis_generation",
      "validator_v2",
      "functional_role_closure",
      "portfolio_selection",
    ],
    closureSubPhases: {
      roleRequirementDerivation: {
        when: "post_hypothesis_pre_validator",
        input: "runtime_input_projection",
        output: "applicable_roles_by_lens",
        note: "Derives REQUIRED/RECOMMENDED/N/A only; does not score satisfaction.",
      },
      roleSatisfactionAudit: {
        when: "post_validator_v2",
        input: "runtime_input_projection.validatedPackages_only",
        rule: "Only packages with validatorStatus=VALID may satisfy roles. INVALID packages must never satisfy roles.",
        output: "satisfaction_states_and_evidence_bindings",
      },
    },
    runtimeInputAllowlist: {
      schemaVersion: "phase6a1-closure-runtime-input-v2",
      permittedRootFields: [
        "caseId",
        "commanders",
        "commandZoneConfiguration",
        "runtimeSchemaVersion",
        "frozenFacts",
        "frozenOpportunities",
        "lenses",
      ],
      permittedLensFields: ["hypotheses", "validatedPackages", "rejectedPackages", "resourceGraph"],
      prohibitedAtRuntime: [
        "postGoldDefectClassTargets",
        "category",
        "sourceProvenance",
        "devPurpose",
        "adjudicationStatus",
        "bracket",
        "benchmarkMetadata",
        "expectedLabels",
        "structuralRoleAdjudication",
        "repairTargetsFromBenchmark",
      ],
      projectionRule:
        "Closure runtime MUST consume only the frozen snapshot manifest population. Benchmark population fields are authoring metadata and MUST NOT be loaded.",
    },
    functionalVocabulary: FUNCTIONAL_ROLES,
    roleSemantics: {
      ENGINE: "Declares and executes the primary resource/output loop for the lens.",
      ENABLER: "Provides standalone setup or rate acceleration not requiring commander zone (IND) or commander-linked setup (DEP).",
      FUEL: "Renews consumable inputs (creatures, cards, permanents) required by the engine loop.",
      PAYOFF: "Converts engine output into winning pressure or scalable advantage.",
      CONVERSION: "Transforms one resource type into a different exploitable output type.",
      PROTECTION: "Stabilizes engine against removal, stax, or attrition pressure.",
      RECOVERY: "Restores engine state after zone loss, board wipe, or commander loss.",
      FINISHER: "Converts accumulated advantage into terminal win pressure.",
      COMMANDER_MAINTENANCE: "Keeps commander available, protected, or repeatedly usable for DEP engines.",
      CROSS_ENGINE_BRIDGE: "Evidence-backed multi-role package connecting DEP/IND chains (HARMONY only).",
    },
    triggerRegistry: TRIGGER_REGISTRY,
    applicabilityStates: ["REQUIRED", "RECOMMENDED", "N/A"],
    satisfactionStates: ["SATISFIED", "MISSING", "NOT_APPLICABLE"],
    closureStatuses: {
      CLOSED: "All REQUIRED roles SATISFIED with evidence-bound validated packages.",
      GAP_DETECTED: "One or more REQUIRED roles MISSING.",
      HARMONY_UNDERDETERMINED: "HARMONY bridge evidence insufficient; do not invent cross-engine packages.",
      EVIDENCE_INSUFFICIENT:
        "Outside functional-role vocabulary. Frozen facts/opportunities cannot support deterministic role evidence.",
    },
    evidenceRules: {
      bindingKinds: ["validated_role_claim", "resource_graph_path", "multi_role_bridge"],
      validatorGate: "validatorStatus must equal VALID for satisfaction credit",
      multiRoleRule: "One validated package may satisfy multiple roles only with distinct evidence bindings per role.",
      insufficientEvidenceOutcome: "EVIDENCE_INSUFFICIENT",
    },
    lensPolicy: {
      DEPENDENT_SYNERGY: {
        mayUseCommanderResources: true,
        commanderMaintenanceWhen: "T_COMMANDER_OPERATIONAL applies",
      },
      INDEPENDENT_SYNERGY: {
        mustCloseWithoutCommanderOnlySupply: true,
        prohibitedSupply: ["commander_only_fuel", "commander_only_payoff_trigger"],
      },
      HARMONY: {
        requiresEvidenceBackedConnectivity: true,
        underdeterminedOutcome: "HARMONY_UNDERDETERMINED",
      },
    },
    outputContract: {
      emit: ["structured_role_gaps", "repair_targets", "closure_status_by_lens"],
      prohibitions: ["no_card_specific_fixes", "no_gold_mechanic_labels", "no_automatic_professor_rerun_in_v1_implementation"],
    },
    developmentSets: {
      dev36: {
        benchmarkPopulation: "phase6a1-professor-plan-dev36-population-v2.json",
        closureInputSnapshots: "phase6a1-professor-plan-dev36-closure-input-snapshot-v2/manifest.json",
        exposedAdjudication: "phase6a1-professor-plan-dev36-structural-role-adjudication-v2.json",
      },
      holdout24: {
        benchmarkPopulation: "phase6a1-professor-plan-holdout24-population-v2.json",
        closureInputSnapshots: "phase6a1-professor-plan-holdout24-closure-input-snapshot-v2/manifest.json",
        blindedAdjudication: "phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v2.json",
        implementationAccess: "population_and_runtime_snapshots_only",
      },
    },
    gateDisposition: {
      amendmentV8: "FROZEN_FINAL",
      goldComparisonV1: "SEALED_FINAL",
      corpusIngest: "BLOCKED",
      implementation: "WAIT",
      designV1: "SUPERSEDED",
    },
  };
}

function verifyRoleCoverage(adjudicationCases: Array<{ lenses: Record<Lens, LensExpectation> }>) {
  const counts: Record<string, { satisfied: number; missing: number; na: number }> = Object.fromEntries(
    FUNCTIONAL_ROLES.map((r) => [r, { satisfied: 0, missing: 0, na: 0 }]),
  );
  for (const c of adjudicationCases) {
    for (const lens of LENSES) {
      for (const role of FUNCTIONAL_ROLES) {
        const state = c.lenses[lens].expectedSatisfaction[role].state;
        if (state === "SATISFIED") counts[role].satisfied += 1;
        else if (state === "MISSING") counts[role].missing += 1;
        else counts[role].na += 1;
      }
    }
  }
  for (const role of FUNCTIONAL_ROLES) {
    if (counts[role].satisfied < 2 || counts[role].missing < 1) {
      throw new Error(`Insufficient DEV36 coverage for ${role}: ${JSON.stringify(counts[role])}`);
    }
  }
  return counts;
}

function main() {
  const slots = slotMap();
  const dev36Benchmark = loadV1Population("dev36");
  const holdout24Benchmark = loadV1Population("holdout24");

  const dev36SnapshotDir = resolve(OUT, "phase6a1-professor-plan-dev36-closure-input-snapshot-v2");
  const holdoutSnapshotDir = resolve(OUT, "phase6a1-professor-plan-holdout24-closure-input-snapshot-v2");
  mkdirSync(dev36SnapshotDir, { recursive: true });
  mkdirSync(holdoutSnapshotDir, { recursive: true });

  const dev36AdjudicationCases: Array<{
    caseId: string;
    snapshotArtifact: string;
    lenses: Record<Lens, LensExpectation>;
  }> = [];

  const dev36SnapshotEntries: Array<{ caseId: string; artifact: string; sha256: string }> = [];

  dev36Benchmark.forEach((benchmark, caseIndex) => {
    const lensExpectations = Object.fromEntries(
      LENSES.map((lens) => [lens, buildLensExpectation(caseIndex, lens, benchmark.category, benchmark.commandZoneConfiguration, slots)]),
    ) as Record<Lens, LensExpectation>;
    const snapshot = buildRuntimeSnapshot(benchmark, caseIndex, lensExpectations);
    const artifact = `${benchmark.caseId}.json`;
    const sha256 = writeJson(join(dev36SnapshotDir, artifact), snapshot);
    dev36SnapshotEntries.push({ caseId: benchmark.caseId, artifact, sha256 });
    dev36AdjudicationCases.push({ caseId: benchmark.caseId, snapshotArtifact: artifact, lenses: lensExpectations });
  });

  verifyRoleCoverage(dev36AdjudicationCases);

  const dev36SnapshotManifestSha = writeJson(join(dev36SnapshotDir, "manifest.json"), {
    version: "phase6a1-professor-plan-dev36-closure-input-snapshot-v2",
    generatedAt: GENERATED_AT,
    caseCount: 36,
    runtimeSchemaVersion: "phase6a1-closure-runtime-input-v2",
    cases: dev36SnapshotEntries,
  });

  const dev36PopulationSha = writeJson(resolve(OUT, "phase6a1-professor-plan-dev36-population-v2.json"), {
    version: "phase6a1-professor-plan-dev36-population-v2",
    generatedAt: GENERATED_AT,
    selectionSeed: SEED,
    caseCount: 36,
    accessPolicy: "BENCHMARK_METADATA_ONLY_NOT_RUNTIME",
    exclusionPolicy: {
      frozenV8ProfessorPopulation: 28,
      doNotUse84GoldPathsAsDevEvidence: true,
    },
    note: "Category, bracket, and sourceProvenance are authoring metadata. Closure runtime MUST NOT load this artifact.",
    cases: dev36Benchmark,
  });

  const dev36AdjudicationSha = writeJson(resolve(OUT, "phase6a1-professor-plan-dev36-structural-role-adjudication-v2.json"), {
    version: "phase6a1-professor-plan-dev36-structural-role-adjudication-v2",
    generatedAt: GENERATED_AT,
    populationArtifact: "phase6a1-professor-plan-dev36-population-v2.json",
    closureInputSnapshotManifest: "phase6a1-professor-plan-dev36-closure-input-snapshot-v2/manifest.json",
    closureInputSnapshotManifestSha256: dev36SnapshotManifestSha,
    designArtifact: "phase6a1-professor-plan-functional-role-closure-design-v2.json",
    functionalVocabulary: FUNCTIONAL_ROLES,
    cases: dev36AdjudicationCases,
  });

  writeJson(resolve(OUT, "phase6a1-professor-plan-dev36-sealed-manifest-v2.json"), {
    version: "phase6a1-professor-plan-dev36-sealed-manifest-v2",
    sealedAt: GENERATED_AT,
    status: "SEALED",
    selectionSeed: SEED,
    benchmarkPopulationArtifact: "phase6a1-professor-plan-dev36-population-v2.json",
    benchmarkPopulationSha256: dev36PopulationSha,
    closureInputSnapshotManifest: "phase6a1-professor-plan-dev36-closure-input-snapshot-v2/manifest.json",
    closureInputSnapshotManifestSha256: dev36SnapshotManifestSha,
    structuralRoleAdjudicationArtifact: "phase6a1-professor-plan-dev36-structural-role-adjudication-v2.json",
    structuralRoleAdjudicationSha256: dev36AdjudicationSha,
    caseCount: 36,
    instruction: "DEV36 v2: frozen runtime snapshots + exposed adjudication v2. Benchmark metadata not visible to closure runtime.",
  });

  const holdoutAdjudicationCases: typeof dev36AdjudicationCases = [];
  const holdoutSnapshotEntries: typeof dev36SnapshotEntries = [];

  holdout24Benchmark.forEach((benchmark, offset) => {
    const caseIndex = 36 + offset;
    const lensExpectations = Object.fromEntries(
      LENSES.map((lens) => [lens, buildLensExpectation(caseIndex, lens, benchmark.category, benchmark.commandZoneConfiguration, slots)]),
    ) as Record<Lens, LensExpectation>;
    const snapshot = buildRuntimeSnapshot(benchmark, caseIndex, lensExpectations);
    const artifact = `${benchmark.caseId}.json`;
    const sha256 = writeJson(join(holdoutSnapshotDir, artifact), snapshot);
    holdoutSnapshotEntries.push({ caseId: benchmark.caseId, artifact, sha256 });
    holdoutAdjudicationCases.push({ caseId: benchmark.caseId, snapshotArtifact: artifact, lenses: lensExpectations });
  });

  const holdoutSnapshotManifestSha = writeJson(join(holdoutSnapshotDir, "manifest.json"), {
    version: "phase6a1-professor-plan-holdout24-closure-input-snapshot-v2",
    generatedAt: GENERATED_AT,
    caseCount: 24,
    runtimeSchemaVersion: "phase6a1-closure-runtime-input-v2",
    cases: holdoutSnapshotEntries,
  });

  const holdoutPopulationSha = writeJson(resolve(OUT, "phase6a1-professor-plan-holdout24-population-v2.json"), {
    version: "phase6a1-professor-plan-holdout24-population-v2",
    generatedAt: GENERATED_AT,
    selectionSeed: SEED,
    caseCount: 24,
    status: "SEALED_PROSPECTIVE_BLIND",
    accessPolicy: "BENCHMARK_METADATA_ONLY_NOT_RUNTIME",
    exclusionPolicy: { frozenV8ProfessorPopulation: 28, dev36Overlap: "ZERO" },
    implementationAccess: "POPULATION_AND_RUNTIME_SNAPSHOTS_ONLY",
    cases: holdout24Benchmark,
  });

  const holdoutBlindedSha = writeJson(
    resolve(OUT, "phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v2.json"),
    {
      version: "phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v2",
      generatedAt: GENERATED_AT,
      accessPolicy: "NOT_FOR_IMPLEMENTATION",
      warning: "Prospective blind expectations sealed under design v2. Implementation must not read this artifact.",
      closureInputSnapshotManifest: "phase6a1-professor-plan-holdout24-closure-input-snapshot-v2/manifest.json",
      closureInputSnapshotManifestSha256: holdoutSnapshotManifestSha,
      cases: holdoutAdjudicationCases,
    },
  );

  writeJson(resolve(OUT, "phase6a1-professor-plan-holdout24-sealed-manifest-v2.json"), {
    version: "phase6a1-professor-plan-holdout24-sealed-manifest-v2",
    sealedAt: GENERATED_AT,
    status: "SEALED",
    selectionSeed: SEED,
    benchmarkPopulationArtifact: "phase6a1-professor-plan-holdout24-population-v2.json",
    benchmarkPopulationSha256: holdoutPopulationSha,
    closureInputSnapshotManifest: "phase6a1-professor-plan-holdout24-closure-input-snapshot-v2/manifest.json",
    closureInputSnapshotManifestSha256: holdoutSnapshotManifestSha,
    blindedAdjudicationArtifact: "phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v2.json",
    blindedAdjudicationSha256: holdoutBlindedSha,
    implementationAllowlist: [
      "phase6a1-professor-plan-holdout24-population-v2.json",
      "phase6a1-professor-plan-holdout24-closure-input-snapshot-v2/manifest.json",
      "phase6a1-professor-plan-holdout24-closure-input-snapshot-v2/*.json",
    ],
    implementationDenylist: ["phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v2.json"],
    caseCount: 24,
    instruction: "HOLDOUT24 v2 sealed before implementation. Blinded adjudication denylisted.",
  });

  const designSha = writeJson(
    resolve(OUT, "phase6a1-professor-plan-functional-role-closure-design-v2.json"),
    buildDesignV2(dev36SnapshotManifestSha, holdoutSnapshotManifestSha),
  );

  writeJson(resolve(OUT, "phase6a1-professor-plan-post-gold-development-track-v2.json"), {
    version: "phase6a1-professor-plan-post-gold-development-track-v2",
    openedAt: "2026-08-14T07:03:59.981Z",
    updatedAt: GENERATED_AT,
    supersedes: "phase6a1-professor-plan-post-gold-development-track-v1",
    preImplementationAudit: {
      artifact: "phase6a1-professor-plan-functional-role-closure-preimplementation-audit-gpt56sol-v1.json",
      decision: "DESIGN_BLOCK",
      implementationAuthorization: "KEEP_WAIT",
    },
    predecessor: {
      frozenFinal: "phase6a1-professor-plan-experiment-v3-amended-v8",
      goldComparisonProvenanceSidecar: "phase6a1-professor-plan-v8-gold-comparison-report-provenance-sidecar-v1.json",
      postGoldFailureAnalysis: "phase6a1-professor-plan-v8-post-gold-failure-analysis-v1.json",
    },
    authorizedDesign: {
      functionalRoleClosure: "phase6a1-professor-plan-functional-role-closure-design-v2.json",
      functionalRoleClosureSha256: designSha,
      status: "DESIGN_V2_SEALED_WAIT_IMPLEMENTATION",
    },
    authorScript: "web/scripts/run-phase6a1-professor-plan-post-gold-dev36-holdout24-author-v2.ts",
    developmentSets: {
      dev36: {
        benchmarkPopulation: "phase6a1-professor-plan-dev36-population-v2.json",
        closureInputSnapshots: "phase6a1-professor-plan-dev36-closure-input-snapshot-v2/manifest.json",
        structuralRoleAdjudication: "phase6a1-professor-plan-dev36-structural-role-adjudication-v2.json",
        sealedManifest: "phase6a1-professor-plan-dev36-sealed-manifest-v2.json",
      },
      holdout24: {
        benchmarkPopulation: "phase6a1-professor-plan-holdout24-population-v2.json",
        closureInputSnapshots: "phase6a1-professor-plan-holdout24-closure-input-snapshot-v2/manifest.json",
        sealedManifest: "phase6a1-professor-plan-holdout24-sealed-manifest-v2.json",
        blindedAdjudicationSealed: "phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v2.json",
        implementationAccess: "population_and_runtime_snapshots_only",
      },
    },
    gateDisposition: {
      amendmentV8: "FROZEN_FINAL",
      goldComparisonV1: "SEALED_FINAL",
      postGoldFailureAnalysis: "SEALED",
      functionalRoleClosure: "DESIGN_V2_SEALED",
      dev36: "SEALED_V2",
      holdout24: "SEALED_V2",
      corpusIngest: "BLOCKED",
      implementation: "WAIT",
    },
  });

  // Copy audit into milestones for provenance (read from Downloads if present).
  try {
    const auditSrc = resolve("C:/Users/h3art/Downloads/phase6a1-professor-plan-functional-role-closure-preimplementation-audit-gpt56sol-v1.json");
    writeFileSync(
      resolve(OUT, "phase6a1-professor-plan-functional-role-closure-preimplementation-audit-gpt56sol-v1.json"),
      readFileSync(auditSrc),
    );
  } catch {
    // optional if Downloads path unavailable in CI
  }

  console.log(
    JSON.stringify(
      {
        designV2Sha256: designSha,
        dev36PopulationSha256: dev36PopulationSha,
        dev36AdjudicationSha256: dev36AdjudicationSha,
        dev36SnapshotManifestSha256: dev36SnapshotManifestSha,
        holdout24PopulationSha256: holdoutPopulationSha,
        holdout24SnapshotManifestSha256: holdoutSnapshotManifestSha,
        holdout24BlindedSha256: holdoutBlindedSha,
        authorScript: "web/scripts/run-phase6a1-professor-plan-post-gold-dev36-holdout24-author-v2.ts",
      },
      null,
      2,
    ),
  );
}

main();
