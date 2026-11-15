#!/usr/bin/env npx tsx
/**
 * Author post-gold DEV36 + HOLDOUT24 populations and closure design artifacts.
 * Does NOT modify v8, rerun gold comparison, or unblock corpus ingest.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import {
  ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5,
  type ArchetypeDiscoveryBlindV5Case,
} from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";

const OUT = resolve("data/milestones/deck-synthesis");
const SEED = "phase6a1-post-gold-dev36-holdout24-seed-20260814";
const GENERATED_AT = new Date().toISOString();

const V8_CASE_IDS = new Set([
  "blindv5-01-partner-pair",
  "blindv5-11-commander-background",
  "blindv5-16-commander-background",
  "blindv5-19-narrow-single-engine",
  "blindv5-22-broad-composite",
  "blindv5-23-triggered-engine",
  "blindv5-25-activated-engine",
  "blindv5-26-activated-engine",
  "blindv5-29-static-restriction",
  "blindv5-42-resource-conversion",
  "blindv5-44-unusual-zones",
  "blindv5-45-graveyard",
  "blindv5-47-artifacts",
  "blindv5-50-enchantments",
  "blindv5-51-tokens",
  "blindv5-53-counters",
  "blindv5-59-tutor-toolbox",
  "hybrid-kinnan",
  "hybrid-prosper",
  "multi-kenrith",
  "multi-korvold",
  "partner-thrasios-tymna",
  "single-aristocrats-teysa",
  "single-graveyard-meren",
  "single-mill-bruvac",
  "single-tokens-krenko",
  "stax-augustin",
  "yuriko-ninja",
]);

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

type CandidateCase = {
  sourceId: string;
  sourcePool: "blind_holdout_v5" | "benchmark_v1";
  category: string;
  commandZoneConfiguration: "single_commander" | "partner_pair" | "commander_with_background";
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
  notes?: string;
};

const POST_GOLD_DEFECT_CLASSES = [
  "PAYOFF_COVERAGE",
  "FUEL_FODDER_ENABLER_COVERAGE",
  "COMMANDER_MAINTENANCE_OPERATIONAL_SUPPORT",
  "SECONDARY_ENGINE_COVERAGE",
  "RESILIENCE_RECOVERY_COVERAGE",
  "MULTI_ROLE_HARMONY_COVERAGE",
  "EXTERNAL_KNOWLEDGE_DATA_UNAVAILABLE",
] as const;

function sha256Bytes(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function sha256File(path: string): string {
  return sha256Bytes(readFileSync(path));
}

function sha256Json(value: unknown): string {
  return sha256Bytes(JSON.stringify(value));
}

function stableSortKey(caseId: string): string {
  return createHash("sha256").update(`${SEED}:${caseId}`).digest("hex");
}

function buildCandidatePool(): CandidateCase[] {
  const blind = ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5.filter((c) => !V8_CASE_IDS.has(c.id)).map(
    (c: ArchetypeDiscoveryBlindV5Case) => ({
      sourceId: c.id,
      sourcePool: "blind_holdout_v5" as const,
      category: c.category,
      commandZoneConfiguration: c.commandZoneConfiguration,
      commanders: c.commanders,
      bracket: c.bracket,
      notes: c.notes,
    }),
  );
  const bench = ARCHETYPE_DISCOVERY_BENCHMARK_V1.filter((c) => !V8_CASE_IDS.has(c.id)).map((c) => ({
    sourceId: c.id,
    sourcePool: "benchmark_v1" as const,
    category: c.category,
    commandZoneConfiguration:
      c.category === "partner"
        ? ("partner_pair" as const)
        : c.category === "background"
          ? ("commander_with_background" as const)
          : ("single_commander" as const),
    commanders: c.commanders,
    bracket: c.bracket,
    notes: c.notes,
  }));
  return [...blind, ...bench].sort((a, b) => stableSortKey(a.sourceId).localeCompare(stableSortKey(b.sourceId)));
}

function assignDefectClasses(index: number): string[] {
  const primary = POST_GOLD_DEFECT_CLASSES[index % POST_GOLD_DEFECT_CLASSES.length];
  const secondary = POST_GOLD_DEFECT_CLASSES[(index + 3) % POST_GOLD_DEFECT_CLASSES.length];
  return primary === secondary ? [primary] : [primary, secondary];
}

function structuralProfile(category: string, commandZoneConfiguration: string) {
  const partner = commandZoneConfiguration === "partner_pair";
  const background = commandZoneConfiguration === "commander_with_background";
  return {
    engineShape:
      partner || background
        ? "multi_command_zone_composite"
        : category.includes("graveyard")
          ? "graveyard_loop"
          : category.includes("token")
            ? "token_swarm"
            : category.includes("counter")
              ? "counter_scaling"
              : category.includes("artifact")
                ? "artifact_engine"
                : category.includes("enchant")
                  ? "enchantment_engine"
                  : category.includes("spell")
                    ? "spell_density"
                    : category.includes("land")
                      ? "land_resource"
                      : "general_synergy",
    commanderCoupling:
      category.includes("narrow") || category.includes("activated") || category.includes("triggered")
        ? "high"
        : category.includes("broad") || category.includes("multi")
          ? "medium"
          : "variable",
    secondaryLoopPresent:
      category.includes("multiple") ||
      category.includes("multi") ||
      category.includes("hybrid") ||
      category.includes("broad") ||
      partner,
  };
}

function applicabilityTriggers(
  category: string,
  commandZoneConfiguration: string,
  profile: ReturnType<typeof structuralProfile>,
) {
  const triggers: Array<{
    triggerId: string;
    predicate: string;
    derivedFrom: "commander_oracle" | "engine_structure" | "resource_topology";
  }> = [
    {
      triggerId: "T_ENGINE_PRESENT",
      predicate: "strategy_declares_primary_engine_with_measurable_output",
      derivedFrom: "engine_structure",
    },
  ];
  if (profile.commanderCoupling === "high") {
    triggers.push({
      triggerId: "T_COMMANDER_OPERATIONAL",
      predicate: "primary_output_requires_commander_zone_availability_or_repeated_activation",
      derivedFrom: "commander_oracle",
    });
  }
  if (profile.secondaryLoopPresent) {
    triggers.push({
      triggerId: "T_SECONDARY_LOOP",
      predicate: "strategy_declares_secondary_resource_loop_independent_of_primary_chain",
      derivedFrom: "engine_structure",
    });
  }
  if (commandZoneConfiguration === "partner_pair") {
    triggers.push({
      triggerId: "T_PARTNER_HANDOFF",
      predicate: "partner_pair_requires_cross_commander_resource_or_trigger_handoff",
      derivedFrom: "resource_topology",
    });
  }
  if (category.includes("graveyard") || category.includes("unusual_zones")) {
    triggers.push({
      triggerId: "T_ZONE_VOLATILITY",
      predicate: "engine_uses_non_battlefield_zone_as_primary_resource_store",
      derivedFrom: "resource_topology",
    });
  }
  if (category.includes("token") || category.includes("typal") || category.includes("sacrifice")) {
    triggers.push({
      triggerId: "T_CREATURE_DENSITY",
      predicate: "engine_requires_renewable_creature_fodder_or_typed_creatures",
      derivedFrom: "engine_structure",
    });
  }
  return triggers;
}

function roleExpectations(
  lens: Lens,
  triggers: ReturnType<typeof applicabilityTriggers>,
  profile: ReturnType<typeof structuralProfile>,
): {
  requiredWhenTriggered: Array<{ role: FunctionalRole; triggerRef: string; rationale: string }>;
  prohibitedSupply?: string[];
  harmonyPolicy?: string;
} {
  const req = (role: FunctionalRole, triggerRef: string, rationale: string) => ({
    role,
    triggerRef,
    rationale,
  });
  const has = (id: string) => triggers.some((t) => t.triggerId === id);

  if (lens === "DEPENDENT_SYNERGY") {
    const out = [req("ENGINE", "T_ENGINE_PRESENT", "Commander-linked primary chain must name the engine output.")];
    if (has("T_COMMANDER_OPERATIONAL")) {
      out.push(
        req(
          "COMMANDER_MAINTENANCE",
          "T_COMMANDER_OPERATIONAL",
          "Dependent path must cover commander reuse, protection, or zone recovery needed to operate the engine.",
        ),
      );
    }
    if (has("T_CREATURE_DENSITY")) {
      out.push(req("FUEL", "T_CREATURE_DENSITY", "Dependent token/sacrifice engines require explicit fodder supply."));
    }
    out.push(req("PAYOFF", "T_ENGINE_PRESENT", "Engine output must terminate in declared payoff conversion."));
    if (has("T_ZONE_VOLATILITY")) {
      out.push(req("RECOVERY", "T_ZONE_VOLATILITY", "Zone-heavy dependent engines require recovery if commander access is interrupted."));
    }
    return { requiredWhenTriggered: out };
  }

  if (lens === "INDEPENDENT_SYNERGY") {
    const out = [
      req("ENGINE", "T_ENGINE_PRESENT", "Independent engine must stand as a closed causal loop."),
      req("ENABLER", "T_ENGINE_PRESENT", "Standalone setup enablers must not require commander zone to start the loop."),
      req("PAYOFF", "T_ENGINE_PRESENT", "Independent loop must include payoff density reachable without commander-only supply."),
    ];
    if (has("T_CREATURE_DENSITY")) {
      out.push(req("FUEL", "T_CREATURE_DENSITY", "Independent creature engines require renewable fodder not commander-gated."));
    }
    if (has("T_SECONDARY_LOOP")) {
      out.push(
        req(
          "PAYOFF",
          "T_SECONDARY_LOOP",
          "When a secondary loop is declared, independent path must close its own payoff sub-chain.",
        ),
      );
    }
    return {
      requiredWhenTriggered: out,
      prohibitedSupply: ["commander_only_fuel", "commander_only_payoff_trigger"],
    };
  }

  const out = [
    req(
      "CROSS_ENGINE_BRIDGE",
      "T_ENGINE_PRESENT",
      "Harmony must cite evidence-backed pieces serving both commander-linked and independent chains.",
    ),
  ];
  if (has("T_PARTNER_HANDOFF")) {
    out.push(
      req(
        "CROSS_ENGINE_BRIDGE",
        "T_PARTNER_HANDOFF",
        "Partner Harmony requires bridge roles spanning both commanders' resource graphs.",
      ),
    );
  }
  if (has("T_CREATURE_DENSITY")) {
    out.push(
      req(
        "FUEL",
        "T_CREATURE_DENSITY",
        "Harmony fodder pieces should be multi-role across dependent and independent engines.",
      ),
    );
  }
  return {
    requiredWhenTriggered: out,
    harmonyPolicy:
      "If bridge evidence cannot be grounded in declared engine/resource structure, return HARMONY_UNDERDETERMINED rather than invent cross-engine packages.",
  };
}

function buildRoleAdjudication(caseRecord: {
  caseId: string;
  commanders: string[];
  category: string;
  commandZoneConfiguration: string;
  postGoldDefectClassTargets: string[];
  devPurpose: string;
}) {
  const profile = structuralProfile(caseRecord.category, caseRecord.commandZoneConfiguration);
  const triggers = applicabilityTriggers(caseRecord.category, caseRecord.commandZoneConfiguration, profile);
  return {
    caseId: caseRecord.caseId,
    commanders: caseRecord.commanders,
    structuralEngineProfile: profile,
    applicabilityTriggers: triggers,
    lensRoleExpectations: {
      DEPENDENT_SYNERGY: roleExpectations("DEPENDENT_SYNERGY", triggers, profile),
      INDEPENDENT_SYNERGY: roleExpectations("INDEPENDENT_SYNERGY", triggers, profile),
      HARMONY: roleExpectations("HARMONY", triggers, profile),
    },
    postGoldDefectClassTargets: caseRecord.postGoldDefectClassTargets,
    devPurpose: caseRecord.devPurpose,
    adjudicationStatus: "POST_GOLD_DEV36_STRUCTURAL_ROLE_EXPECTATION",
  };
}

function devPurposeFor(category: string, defectClasses: string[]): string {
  return `Exercise functional-role closure against ${defectClasses[0].toLowerCase().replace(/_/g, " ")} without gold mechanic labels; structural category=${category}.`;
}

function writeJson(path: string, value: unknown): string {
  writeFileSync(path, JSON.stringify(value, null, 2));
  return sha256File(path);
}

function main() {
  const pool = buildCandidatePool();
  if (pool.length < 60) throw new Error(`Expected >=60 candidates, got ${pool.length}`);

  const devCandidates = pool.slice(0, 36);
  const holdoutCandidates = pool.slice(36, 60);
  if (holdoutCandidates.length !== 24) throw new Error(`Expected 24 holdout candidates, got ${holdoutCandidates.length}`);

  const dev36Cases = devCandidates.map((c, i) => ({
    caseId: `dev36-${String(i + 1).padStart(2, "0")}-${c.sourceId.replace(/^blindv5-\d+-/, "").replace(/-/g, "_")}`,
    sourceProvenance: { pool: c.sourcePool, sourceCaseId: c.sourceId, selectionSeed: SEED },
    category: c.category,
    commandZoneConfiguration: c.commandZoneConfiguration,
    commanders: c.commanders,
    bracket: c.bracket,
    notes: c.notes,
    postGoldDefectClassTargets: assignDefectClasses(i),
  }));

  const holdout24Cases = holdoutCandidates.map((c, i) => ({
    caseId: `holdout24-${String(i + 1).padStart(2, "0")}-${c.sourceId.replace(/^blindv5-\d+-/, "").replace(/-/g, "_")}`,
    sourceProvenance: { pool: c.sourcePool, sourceCaseId: c.sourceId, selectionSeed: SEED },
    category: c.category,
    commandZoneConfiguration: c.commandZoneConfiguration,
    commanders: c.commanders,
    bracket: c.bracket,
    notes: c.notes,
  }));

  const dev36PopulationPath = resolve(OUT, "phase6a1-professor-plan-dev36-population-v1.json");
  const dev36AdjudicationPath = resolve(OUT, "phase6a1-professor-plan-dev36-structural-role-adjudication-v1.json");
  const dev36SealPath = resolve(OUT, "phase6a1-professor-plan-dev36-sealed-manifest-v1.json");
  const holdout24PopulationPath = resolve(OUT, "phase6a1-professor-plan-holdout24-population-v1.json");
  const holdout24SealPath = resolve(OUT, "phase6a1-professor-plan-holdout24-sealed-manifest-v1.json");
  const holdout24BlindedPath = resolve(OUT, "phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v1.json");
  const closureDesignPath = resolve(OUT, "phase6a1-professor-plan-functional-role-closure-design-v1.json");
  const goldProvenancePath = resolve(
    OUT,
    "phase6a1-professor-plan-v8-gold-comparison-report-provenance-sidecar-v1.json",
  );
  const devTrackPath = resolve(OUT, "phase6a1-professor-plan-post-gold-development-track-v1.json");

  const dev36Population = {
    version: "phase6a1-professor-plan-dev36-population-v1",
    generatedAt: GENERATED_AT,
    selectionSeed: SEED,
    caseCount: 36,
    exclusionPolicy: {
      frozenV8ProfessorPopulation: 28,
      excludedV8CaseIds: [...V8_CASE_IDS].sort(),
      doNotUse84GoldPathsAsDevEvidence: true,
      note: "Membership outside frozen Amendment v8 population; source pools are blind-v5 remainder + benchmark remainder only for commander identity selection.",
    },
    postGoldDefectClassDistributionPolicy:
      "Round-robin assignment across seven generic post-gold defect classes; does not mirror v8 gold miss frequency.",
    cases: dev36Cases,
  };

  const dev36PopulationSha = writeJson(dev36PopulationPath, dev36Population);

  const dev36Adjudications = {
    version: "phase6a1-professor-plan-dev36-structural-role-adjudication-v1",
    generatedAt: GENERATED_AT,
    populationArtifact: "phase6a1-professor-plan-dev36-population-v1.json",
    populationSha256: dev36PopulationSha,
    functionalVocabulary: FUNCTIONAL_ROLES,
    lensPolicy: {
      DEPENDENT_SYNERGY: "May rely on commander resources; must cover commander-operational support when triggered.",
      INDEPENDENT_SYNERGY: "Must remain functionally closed without commander-only supply.",
      HARMONY:
        "Requires evidence-backed multi-role/cross-engine connectivity; otherwise converge or return HARMONY_UNDERDETERMINED.",
    },
    cases: dev36Cases.map((c) =>
      buildRoleAdjudication({
        caseId: c.caseId,
        commanders: c.commanders,
        category: c.category,
        commandZoneConfiguration: c.commandZoneConfiguration,
        postGoldDefectClassTargets: c.postGoldDefectClassTargets,
        devPurpose: devPurposeFor(c.category, c.postGoldDefectClassTargets),
      }),
    ),
  };

  const dev36AdjudicationSha = writeJson(dev36AdjudicationPath, dev36Adjudications);

  const dev36Seal = {
    version: "phase6a1-professor-plan-dev36-sealed-manifest-v1",
    sealedAt: GENERATED_AT,
    status: "SEALED",
    selectionSeed: SEED,
    populationArtifact: "phase6a1-professor-plan-dev36-population-v1.json",
    populationSha256: dev36PopulationSha,
    structuralRoleAdjudicationArtifact: "phase6a1-professor-plan-dev36-structural-role-adjudication-v1.json",
    structuralRoleAdjudicationSha256: dev36AdjudicationSha,
    caseCount: 36,
    instruction: "Development QA set with exposed structural-role expectations. Not a gold holdout.",
  };
  writeJson(dev36SealPath, dev36Seal);

  const holdout24Population = {
    version: "phase6a1-professor-plan-holdout24-population-v1",
    generatedAt: GENERATED_AT,
    selectionSeed: SEED,
    caseCount: 24,
    status: "SEALED_PROSPECTIVE_BLIND",
    exclusionPolicy: {
      frozenV8ProfessorPopulation: 28,
      dev36Overlap: "ZERO",
      doNotUse84GoldPathsAsDevEvidence: true,
    },
    implementationAccess: "POPULATION_ONLY",
    cases: holdout24Cases,
  };

  const holdout24PopulationSha = writeJson(holdout24PopulationPath, holdout24Population);

  const holdout24BlindedAdjudications = {
    version: "phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v1",
    generatedAt: GENERATED_AT,
    accessPolicy: "NOT_FOR_IMPLEMENTATION",
    warning:
      "Expected structural-role adjudications are sealed for prospective evaluation only. Implementation must not read this artifact during closure coding.",
    populationArtifact: "phase6a1-professor-plan-holdout24-population-v1.json",
    populationSha256: holdout24PopulationSha,
    cases: holdout24Cases.map((c, i) =>
      buildRoleAdjudication({
        caseId: c.caseId,
        commanders: c.commanders,
        category: c.category,
        commandZoneConfiguration: c.commandZoneConfiguration,
        postGoldDefectClassTargets: assignDefectClasses(i + 36),
        devPurpose: "Prospective blind holdout expectation — sealed from implementation.",
      }),
    ),
  };

  const holdout24BlindedSha = writeJson(holdout24BlindedPath, holdout24BlindedAdjudications);

  const holdout24Seal = {
    version: "phase6a1-professor-plan-holdout24-sealed-manifest-v1",
    sealedAt: GENERATED_AT,
    status: "SEALED",
    selectionSeed: SEED,
    populationArtifact: "phase6a1-professor-plan-holdout24-population-v1.json",
    populationSha256: holdout24PopulationSha,
    blindedAdjudicationArtifact: "phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v1.json",
    blindedAdjudicationSha256: holdout24BlindedSha,
    implementationAllowlist: ["phase6a1-professor-plan-holdout24-population-v1.json"],
    implementationDenylist: ["phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v1.json"],
    caseCount: 24,
    instruction: "Prospective blind holdout sealed before closure implementation. Adjudications withheld from implementation access.",
  };
  writeJson(holdout24SealPath, holdout24Seal);

  const goldReportPath = resolve(OUT, "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json");
  const goldSealPath = resolve(OUT, "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-sealed-v1.json");
  const postGoldAnalysisPath = resolve(OUT, "phase6a1-professor-plan-v8-post-gold-failure-analysis-v1.json");

  const closureDesign = {
    version: "phase6a1-professor-plan-functional-role-closure-design-v1",
    authorizedAt: GENERATED_AT,
    authorization: "DESIGN_ONLY_WAIT_BEFORE_IMPLEMENTATION",
    stagePlacement: {
      after: "hypothesis_generation",
      before: "portfolio_finalization",
      pipelineOrder: ["facts/opportunities", "hypothesis_generation", "functional_role_closure", "validator_v2", "portfolio_selection"],
    },
    functionalVocabulary: FUNCTIONAL_ROLES,
    roleApplicabilityPolicy: {
      conditionalNotGlobal: true,
      rule: "Every required role must cite a deterministic trigger derived from the strategy's own engine/resource structure.",
      triggerSources: ["commander_oracle", "engine_structure", "resource_topology"],
      prohibitedTriggers: ["gold_mechanic_label", "buildpath_path_label", "case_specific_card_name"],
    },
    lensPolicy: {
      DEPENDENT_SYNERGY: {
        mayUseCommanderResources: true,
        mustCoverWhenTriggered: ["COMMANDER_MAINTENANCE"],
        closureRule: "Dependent portfolio must not treat commander-only supply as sufficient payoff closure unless trigger explicitly allows.",
      },
      INDEPENDENT_SYNERGY: {
        mustCloseWithoutCommanderOnlySupply: true,
        prohibitedSupply: ["commander_only_fuel", "commander_only_payoff_trigger"],
        closureRule: "Independent path fails closure if any required role is reachable only via commander zone.",
      },
      HARMONY: {
        requiresEvidenceBackedConnectivity: true,
        underdeterminedOutcome: "HARMONY_UNDERDETERMINED",
        convergenceRule:
          "When bridge evidence is insufficient, emit underdetermined status and structured gap targets; do not invent cross-engine packages.",
      },
    },
    outputContract: {
      emit: ["structured_role_gaps", "repair_targets"],
      repairTargetShape: {
        lens: "DEPENDENT_SYNERGY | INDEPENDENT_SYNERGY | HARMONY",
        missingRole: "FUNCTIONAL_ROLE",
        triggerRef: "trigger_id",
        genericGapStatement: "string",
      },
      prohibitions: [
        "no_card_specific_fixes",
        "no_gold_mechanic_labels",
        "no_automatic_professor_rerun_in_v1_implementation",
      ],
    },
    developmentSets: {
      dev36: {
        population: "phase6a1-professor-plan-dev36-population-v1.json",
        exposedAdjudication: "phase6a1-professor-plan-dev36-structural-role-adjudication-v1.json",
        purpose: "Development QA with exposed structural-role expectations",
      },
      holdout24: {
        population: "phase6a1-professor-plan-holdout24-population-v1.json",
        blindedAdjudication: "phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v1.json",
        implementationAccess: "population_only",
        purpose: "Prospective blind evaluation after implementation",
      },
    },
    gateDisposition: {
      amendmentV8: "FROZEN_FINAL",
      goldComparisonV1: "SEALED_FINAL",
      corpusIngest: "BLOCKED",
      implementation: "WAIT",
    },
  };

  const closureDesignSha = writeJson(closureDesignPath, closureDesign);

  const goldProvenance = {
    version: "phase6a1-professor-plan-v8-gold-comparison-report-provenance-sidecar-v1",
    recordedAt: GENERATED_AT,
    policy: "Original gold-comparison seal bytes preserved. Gold comparison not rerun. This sidecar records byte/provenance transition only.",
    originalGoldComparisonSeal: {
      artifact: "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-sealed-v1.json",
      artifactSha256: sha256File(goldSealPath),
      reportSha256RecordedInSeal: "bfa89d7edb879cf5dbe70c553fd18a0ddafcc0ee3baccc5726a58ddc776c67e2",
      note: "Immutable original seal — do not rewrite.",
    },
    bookkeepingNormalizedReport: {
      artifact: "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json",
      currentByteSha256: sha256File(goldReportPath),
      transition: {
        kind: "METADATA_ONLY",
        changedFields: [
          {
            field: "inputs.professorCaseSetSha256",
            fromStale: "525ab2a2041b652feef6be57a9de99aaa0f8be53da95293f717dd2906876819a",
            toVerified: "7788ec494e1c8570170d6b12d685a60f01908748d3b37529f4ccc6a85ea8ddf5",
            reason: "Restore verified pre-gold population pin without rerunning comparison logic or mutating Professor package bodies.",
          },
        ],
        comparisonLogicRerun: false,
        professorPackageBodiesMutated: false,
      },
    },
    derivedArtifactsUsingNormalizedReportSha: [
      {
        artifact: "phase6a1-professor-plan-v8-post-gold-failure-analysis-v1.json",
        artifactSha256: sha256File(postGoldAnalysisPath),
      },
      {
        artifact: "phase6a1-professor-plan-v8-post-gold-failure-analysis-sealed-v1.json",
        artifactSha256: sha256File(resolve(OUT, "phase6a1-professor-plan-v8-post-gold-failure-analysis-sealed-v1.json")),
      },
    ],
    reconciliation: {
      originalEvaluationBytes: "bfa89d7edb879cf5dbe70c553fd18a0ddafcc0ee3baccc5726a58ddc776c67e2",
      bookkeepingNormalizedBytes: sha256File(goldReportPath),
      evaluationOutcomeUnchanged: true,
      pathsPassed: 61,
      pathsFailed: 23,
      casesPassed: 14,
      casesFailed: 14,
      missingGoldMechanics: 26,
      novelProfessorPackages: 14,
    },
  };

  const goldProvenanceSha = writeJson(goldProvenancePath, goldProvenance);

  const devTrack = {
    version: "phase6a1-professor-plan-post-gold-development-track-v1",
    openedAt: "2026-08-14T07:03:59.981Z",
    updatedAt: GENERATED_AT,
    predecessor: {
      frozenFinal: "phase6a1-professor-plan-experiment-v3-amended-v8",
      goldComparison: "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json",
      goldComparisonProvenanceSidecar: "phase6a1-professor-plan-v8-gold-comparison-report-provenance-sidecar-v1.json",
      postGoldFailureAnalysis: "phase6a1-professor-plan-v8-post-gold-failure-analysis-v1.json",
    },
    separationPolicy: {
      doNotModifyV8: true,
      doNotRerunGoldComparisonV1: true,
      doNotUse84GoldPathsAsDevEvidence: true,
      doNotTuneAgainstV8Holdout: true,
    },
    authorizedDesign: {
      functionalRoleClosure: "phase6a1-professor-plan-functional-role-closure-design-v1.json",
      functionalRoleClosureSha256: closureDesignSha,
      status: "DESIGN_SEALED_WAIT_IMPLEMENTATION",
    },
    developmentSets: {
      dev36: {
        population: "phase6a1-professor-plan-dev36-population-v1.json",
        populationSha256: dev36PopulationSha,
        structuralRoleAdjudication: "phase6a1-professor-plan-dev36-structural-role-adjudication-v1.json",
        sealedManifest: "phase6a1-professor-plan-dev36-sealed-manifest-v1.json",
      },
      holdout24: {
        population: "phase6a1-professor-plan-holdout24-population-v1.json",
        populationSha256: holdout24PopulationSha,
        sealedManifest: "phase6a1-professor-plan-holdout24-sealed-manifest-v1.json",
        blindedAdjudicationSealed: "phase6a1-professor-plan-holdout24-blinded-adjudication-sealed-v1.json",
        implementationAccess: "population_only",
      },
    },
    blockedUntilFurtherAuthorization: [
      "corpusIngest",
      "functionalRoleClosureImplementation",
      "professorRerunOnV8Population",
      "futureGoldStyleEvaluationOnHoldout24Only",
    ],
    gateDisposition: {
      amendmentV8: "FROZEN_FINAL",
      goldComparisonV1: "SEALED_FINAL",
      postGoldFailureAnalysis: "SEALED",
      functionalRoleClosure: "DESIGN_SEALED",
      dev36: "SEALED",
      holdout24: "SEALED",
      corpusIngest: "BLOCKED",
      implementation: "WAIT",
    },
  };

  writeJson(devTrackPath, devTrack);

  console.log(
    JSON.stringify(
      {
        goldProvenanceSidecar: goldProvenancePath,
        goldProvenanceSha256: goldProvenanceSha,
        closureDesign: closureDesignPath,
        closureDesignSha256: closureDesignSha,
        dev36PopulationSha256: dev36PopulationSha,
        holdout24PopulationSha256: holdout24PopulationSha,
        holdout24BlindedSha256: holdout24BlindedSha,
        originalGoldReportShaInSeal: "bfa89d7e...",
        normalizedGoldReportSha256: sha256File(goldReportPath),
      },
      null,
      2,
    ),
  );
}

main();
