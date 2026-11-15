#!/usr/bin/env npx tsx
/**
 * Seal semantic closure benchmark v3:
 * design v3, fixture catalog, snapshots, independent adjudication, leakage tests, manifests.
 * Does NOT implement closure runtime. Does NOT open holdout blinded adjudication to implementation.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARCHETYPE_DISCOVERY_BENCHMARK_V1 } from "../src/lib/deck-synthesis/archetype-discovery-benchmark-v1";
import { ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5 } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v5";
import {
  APPLICABILITY_MATRIX,
  FUNCTIONAL_ROLES,
  LENSES,
  TRIGGER_PRECEDENCE,
  TRIGGER_REGISTRY,
} from "./lib/phase6a1-closure-design-v3-matrix";
import { DEV36_SCENARIO_ASSIGNMENTS, type ScenarioKind } from "./lib/phase6a1-semantic-fixture-templates-v3";
import { authorFixtureCatalog } from "./run-phase6a1-closure-semantic-fixture-catalog-author-v3";
import { authorSemanticSnapshots } from "./run-phase6a1-closure-semantic-snapshot-author-v3";
import { authorIndependentAdjudication } from "./run-phase6a1-closure-independent-adjudication-author-v3";
import { runLeakageTests, writeLeakageReport } from "./run-phase6a1-closure-semantic-benchmark-leakage-test-v3";

const OUT = resolve("data/milestones/deck-synthesis");
const GENERATED_AT = new Date().toISOString();
const HOLDOUT_V3_SEED = "phase6a1-holdout24-v3-semantic-seed-20260814";

const V8_CASE_IDS = new Set([
  "blindv5-01-partner-pair", "blindv5-11-commander-background", "blindv5-16-commander-background",
  "blindv5-19-narrow-single-engine", "blindv5-22-broad-composite", "blindv5-23-triggered-engine",
  "blindv5-25-activated-engine", "blindv5-26-activated-engine", "blindv5-29-static-restriction",
  "blindv5-42-resource-conversion", "blindv5-44-unusual-zones", "blindv5-45-graveyard",
  "blindv5-47-artifacts", "blindv5-50-enchantments", "blindv5-51-tokens", "blindv5-53-counters",
  "blindv5-59-tutor-toolbox", "hybrid-kinnan", "hybrid-prosper", "multi-kenrith", "multi-korvold",
  "partner-thrasios-tymna", "single-aristocrats-teysa", "single-graveyard-meren", "single-mill-bruvac",
  "single-tokens-krenko", "stax-augustin", "yuriko-ninja",
]);

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeJson(path: string, value: unknown): string {
  writeFileSync(path, JSON.stringify(value, null, 2));
  return sha256File(path);
}

function loadExcludedSourceIds(): Set<string> {
  const dev36 = JSON.parse(readFileSync(resolve(OUT, "phase6a1-professor-plan-dev36-population-v2.json"), "utf8")) as {
    cases: Array<{ sourceProvenance: { sourceCaseId: string } }>;
  };
  const holdoutV2 = JSON.parse(readFileSync(resolve(OUT, "phase6a1-professor-plan-holdout24-population-v2.json"), "utf8")) as {
    cases: Array<{ sourceProvenance: { sourceCaseId: string }; caseId: string }>;
  };
  const excluded = new Set<string>();
  for (const id of V8_CASE_IDS) excluded.add(id);
  for (const c of dev36.cases) excluded.add(c.sourceProvenance.sourceCaseId);
  for (const c of holdoutV2.cases) {
    excluded.add(c.sourceProvenance.sourceCaseId);
    excluded.add(c.caseId);
  }
  return excluded;
}

function normalizeCommander(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function loadExcludedCommanders(): Set<string> {
  const files = [
    "phase6a1-professor-plan-dev36-population-v2.json",
    "phase6a1-professor-plan-holdout24-population-v2.json",
  ];
  const excluded = new Set<string>();
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(resolve(OUT, file), "utf8")) as { cases: Array<{ commanders: string[] }> };
    for (const c of parsed.cases) for (const cmd of c.commanders) excluded.add(normalizeCommander(cmd));
  }
  for (const id of V8_CASE_IDS) {
    const fromBlind = ARCHETYPE_DISCOVERY_BLIND_HOLDOUT_V5.find((c) => c.id === id);
    const fromBench = ARCHETYPE_DISCOVERY_BENCHMARK_V1.find((c) => c.id === id);
    for (const cmd of fromBlind?.commanders ?? fromBench?.commanders ?? []) excluded.add(normalizeCommander(cmd));
  }
  return excluded;
}

const HOLDOUT_V3_COMMANDER_POOL: Array<{
  caseSuffix: string;
  category: string;
  commandZoneConfiguration: "single_commander" | "partner_pair" | "commander_with_background";
  commanders: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
}> = [
  { caseSuffix: "alela-artifacts", category: "artifacts", commandZoneConfiguration: "single_commander", commanders: ["Alela, Artificer Prodigy"], bracket: 3 },
  { caseSuffix: "aesi-lands", category: "lands", commandZoneConfiguration: "single_commander", commanders: ["Aesi, Tyrant of Gyr Kom"], bracket: 3 },
  { caseSuffix: "athreos-aristocrats", category: "attrition_engine", commandZoneConfiguration: "single_commander", commanders: ["Athreos, God of Passage"], bracket: 3 },
  { caseSuffix: "breena-counters", category: "counters", commandZoneConfiguration: "single_commander", commanders: ["Breena, the Demagogue"], bracket: 3 },
  { caseSuffix: "derevi-tokens", category: "tokens", commandZoneConfiguration: "single_commander", commanders: ["Derevi, Empyrial Tactician"], bracket: 4 },
  { caseSuffix: "etali-spells", category: "spells_casting", commandZoneConfiguration: "single_commander", commanders: ["Etali, Primal Conqueror"], bracket: 3 },
  { caseSuffix: "ghave-counters", category: "counters", commandZoneConfiguration: "single_commander", commanders: ["Ghave, Guru of Spores"], bracket: 3 },
  { caseSuffix: "golos-goodstuff", category: "broad_composite", commandZoneConfiguration: "single_commander", commanders: ["Golos, Tireless Pilgrim"], bracket: 3 },
  { caseSuffix: "heliod-enchantments", category: "enchantments", commandZoneConfiguration: "single_commander", commanders: ["Heliod, Sun-Crowned"], bracket: 3 },
  { caseSuffix: "ishai-spells", category: "spells_casting", commandZoneConfiguration: "single_commander", commanders: ["Ishai, Ojutai Dragonspeaker"], bracket: 3 },
  { caseSuffix: "jhoira-artifacts", category: "artifacts", commandZoneConfiguration: "single_commander", commanders: ["Jhoira, Weatherlight Captain"], bracket: 3 },
  { caseSuffix: "kalamax-spells", category: "triggered_engine", commandZoneConfiguration: "single_commander", commanders: ["Kalamax, the Stormsire"], bracket: 3 },
  { caseSuffix: "marath-counters", category: "counters", commandZoneConfiguration: "single_commander", commanders: ["Marath, Will of the Wild"], bracket: 3 },
  { caseSuffix: "miirym-dragons", category: "typal", commandZoneConfiguration: "single_commander", commanders: ["Miirym, Sentinel Wyrm"], bracket: 3 },
  { caseSuffix: "najeela-combat", category: "combat", commandZoneConfiguration: "single_commander", commanders: ["Najeela, the Blade-Blossom"], bracket: 4 },
  { caseSuffix: "oloro-life", category: "static_state_engine", commandZoneConfiguration: "single_commander", commanders: ["Oloro, Ageless Ascetic"], bracket: 3 },
  { caseSuffix: "riku-spells", category: "multiple_legitimate_plans", commandZoneConfiguration: "single_commander", commanders: ["Riku of Two Reflections"], bracket: 3 },
  { caseSuffix: "selvala-ramp", category: "resource_scaler", commandZoneConfiguration: "single_commander", commanders: ["Selvala, Heart of the Wilds"], bracket: 3 },
  { caseSuffix: "saskia-combat", category: "combat", commandZoneConfiguration: "single_commander", commanders: ["Saskia, the Unyielding"], bracket: 3 },
  { caseSuffix: "tatyova-lands", category: "lands", commandZoneConfiguration: "single_commander", commanders: ["Tatyova, Benthic Druid"], bracket: 3 },
  { caseSuffix: "tuvasa-enchantments", category: "enchantments", commandZoneConfiguration: "single_commander", commanders: ["Tuvasa the Sunlit"], bracket: 2 },
  { caseSuffix: "xyris-tokens", category: "tokens", commandZoneConfiguration: "single_commander", commanders: ["Xyris, the Writhing Tide"], bracket: 3 },
  { caseSuffix: "yarok-landfall", category: "lands", commandZoneConfiguration: "single_commander", commanders: ["Yarok, the Desecrated"], bracket: 3 },
  { caseSuffix: "zacama-combo", category: "resource_conversion", commandZoneConfiguration: "single_commander", commanders: ["Zacama, Primal Calamity"], bracket: 3 },
];

function selectHoldoutV3Population() {
  const excludedCommanders = loadExcludedCommanders();
  const excludedSourceIds = loadExcludedSourceIds();
  const candidates = HOLDOUT_V3_COMMANDER_POOL.filter((c) =>
    c.commanders.every((cmd) => !excludedCommanders.has(normalizeCommander(cmd))),
  ).sort((a, b) =>
    createHash("sha256").update(`${HOLDOUT_V3_SEED}:${a.caseSuffix}`).digest("hex").localeCompare(
      createHash("sha256").update(`${HOLDOUT_V3_SEED}:${b.caseSuffix}`).digest("hex"),
    ),
  );
  if (candidates.length < 24) throw new Error(`Insufficient fresh holdout v3 commanders: ${candidates.length}`);
  return candidates.slice(0, 24).map((c, i) => ({
    caseId: `holdout24v3-${String(i + 1).padStart(2, "0")}-${c.caseSuffix}`,
    sourceProvenance: {
      pool: "fresh_commander_identity_v3",
      sourceCaseId: c.caseSuffix,
      selectionSeed: HOLDOUT_V3_SEED,
    },
    category: c.category,
    commandZoneConfiguration: c.commandZoneConfiguration,
    commanders: c.commanders,
    bracket: c.bracket,
  }));
}

const HOLDOUT24_V3_SCENARIOS: ScenarioKind[] = [
  "token_closed", "conversion_gap", "partner_maint_closed", "graveyard_recovery_gap",
  "protection_closed", "finisher_gap", "harmony_bridge_closed", "independent_enabler_gap",
  "token_fuel_gap", "conversion_closed", "partner_maint_gap", "graveyard_recovery_closed",
  "protection_gap", "finisher_closed", "harmony_underdetermined", "minimal_closed",
  "token_closed", "conversion_gap", "protection_closed", "finisher_gap",
  "graveyard_recovery_gap", "partner_maint_closed", "harmony_bridge_closed", "evidence_insufficient",
];

function main() {
  const holdoutCases = selectHoldoutV3Population();
  if (holdoutCases.length !== 24) throw new Error(`Expected 24 holdout v3 cases, got ${holdoutCases.length}`);

  const holdoutPopulationSha = writeJson(resolve(OUT, "phase6a1-professor-plan-holdout24-v3-population-v3.json"), {
    version: "phase6a1-professor-plan-holdout24-v3-population-v3",
    generatedAt: GENERATED_AT,
    selectionSeed: HOLDOUT_V3_SEED,
    caseCount: 24,
    accessPolicy: "BENCHMARK_METADATA_ONLY_NOT_RUNTIME",
    exclusionPolicy: {
      frozenV8ProfessorPopulation: 28,
      dev36SemanticBenchmarkOverlap: "ZERO",
      holdout24V2Compromised: "EXCLUDED",
    },
    note: "Fresh prospective holdout v3. Does not reuse HOLDOUT24 v2 compromised cases.",
    cases: holdoutCases,
  });

  writeJson(resolve(OUT, "phase6a1-professor-plan-v2-benchmark-disposition-v3.json"), {
    version: "phase6a1-professor-plan-v2-benchmark-disposition-v3",
    recordedAt: GENERATED_AT,
    auditReference: "phase6a1-professor-plan-functional-role-closure-v2-author-script-audit-gpt56sol-v1.json",
    dev36V2: {
      status: "SYNTHETIC_UNIT_FIXTURE",
      purpose: ["schema parsing", "validator gating", "role-gap serialization", "status handling", "INVALID package exclusion", "deterministic output formatting"],
      notSemanticEvidence: true,
    },
    holdout24V2: {
      status: "COMPROMISED_BEFORE_USE",
      doNotOpenBlindedAdjudication: true,
      doNotUseAsSemanticHoldout: true,
    },
  });

  const designSha = writeJson(resolve(OUT, "phase6a1-professor-plan-functional-role-closure-design-v3.json"), {
    version: "phase6a1-professor-plan-functional-role-closure-design-v3",
    supersedes: "phase6a1-professor-plan-functional-role-closure-design-v2",
    authorizedAt: GENERATED_AT,
    authorization: "DESIGN_V3_WAIT_BEFORE_IMPLEMENTATION",
    preImplementationAudits: [
      "phase6a1-professor-plan-functional-role-closure-preimplementation-audit-gpt56sol-v1.json",
      "phase6a1-professor-plan-functional-role-closure-v2-author-script-audit-gpt56sol-v1.json",
    ],
    bracketPolicy: {
      closureBracketInvariant: true,
      statement: "Role applicability derives from semantic strategy/resource topology only; bracket does not alter closure semantics.",
    },
    roleClassificationArchitecture: {
      choice: "OPTION_A_CLOSURE_INFERS_ROLES",
      rule: "Runtime snapshots MUST NOT contain roleClaims. Closure classifies validated packages using semantic fields and graph connectivity.",
    },
    pipelineOrder: ["facts/opportunities", "hypothesis_generation", "validator_v2", "functional_role_closure", "portfolio_selection"],
    closureSubPhases: {
      roleRequirementDerivation: { when: "post_hypothesis", uses: "semantic snapshot + applicability matrix" },
      roleSatisfactionAudit: { when: "post_validator_v2", rule: "Only validatorStatus=VALID packages may satisfy roles" },
    },
    runtimeInputAllowlist: {
      schemaVersion: "phase6a1-semantic-closure-runtime-input-v3",
      prohibitedAtRuntime: ["roleClaims", "T_* trigger labels as answers", "benchmark/adjudication metadata"],
    },
    functionalVocabulary: FUNCTIONAL_ROLES,
    triggerRegistry: TRIGGER_REGISTRY,
    applicabilityMatrix: APPLICABILITY_MATRIX,
    triggerPrecedence: TRIGGER_PRECEDENCE,
    applicabilityStates: ["REQUIRED", "RECOMMENDED", "N/A"],
    satisfactionStates: ["SATISFIED", "MISSING", "NOT_APPLICABLE"],
    closureStatuses: {
      CLOSED: "All REQUIRED roles SATISFIED",
      GAP_DETECTED: "One or more REQUIRED roles MISSING",
      HARMONY_UNDERDETERMINED: "Insufficient bridge connectivity evidence",
      EVIDENCE_INSUFFICIENT: "Outside functional-role vocabulary; frozen facts/opportunities incomplete",
    },
    recommendedSemantics: {
      gapDetectedFrom: "REQUIRED missing only",
      advisoryRoleGapsFrom: "RECOMMENDED missing",
      rule: "RECOMMENDED+MISSING alone MUST NOT produce GAP_DETECTED",
    },
    repairTargetInvariants: [
      "repairTarget.triggerRef MUST be a fired trigger",
      "repairTarget MUST trace to applicability matrix rule for missingRole",
      "no hard-coded role→trigger fallback without matrix proof",
    ],
    v2Preservation: {
      dev36V2: "SYNTHETIC_UNIT_FIXTURE",
      holdout24V2: "COMPROMISED_BEFORE_USE",
    },
    gateDisposition: {
      amendmentV8: "FROZEN_FINAL",
      goldComparisonV1: "SEALED_FINAL",
      corpusIngest: "BLOCKED",
      implementation: "WAIT",
    },
  });

  authorFixtureCatalog(
    JSON.parse(readFileSync(resolve(OUT, "phase6a1-professor-plan-dev36-population-v2.json"), "utf8")).cases,
    DEV36_SCENARIO_ASSIGNMENTS,
    "dev36",
  );
  authorFixtureCatalog(holdoutCases, HOLDOUT24_V3_SCENARIOS, "holdout24-v3");

  const devSnapshots = authorSemanticSnapshots("dev36");
  const holdSnapshots = authorSemanticSnapshots("holdout24-v3");

  const devAdjSha = authorIndependentAdjudication(
    devSnapshots.snapshotDir,
    resolve(OUT, "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v3.json"),
    devSnapshots.manifestSha256,
  );

  const holdAdjSha = authorIndependentAdjudication(
    holdSnapshots.snapshotDir,
    resolve(OUT, "phase6a1-professor-plan-holdout24-v3-blinded-adjudication-sealed-v3.json"),
    holdSnapshots.manifestSha256,
  );

  const leakage = {
    dev36: runLeakageTests(devSnapshots.snapshotDir),
    holdout24v3: runLeakageTests(holdSnapshots.snapshotDir),
  };
  if (!leakage.dev36.pass || !leakage.holdout24v3.pass) {
    throw new Error(`Leakage test failed: ${JSON.stringify(leakage)}`);
  }
  const leakageReportPath = writeLeakageReport(leakage);

  writeJson(resolve(OUT, "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v3.json"), {
    version: "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v3",
    sealedAt: GENERATED_AT,
    designArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
    designSha256: designSha,
    benchmarkPopulation: "phase6a1-professor-plan-dev36-population-v2.json",
    semanticClosureInputManifest: "phase6a1-professor-plan-dev36-semantic-closure-input-v3/manifest.json",
    semanticClosureInputManifestSha256: devSnapshots.manifestSha256,
    semanticClosureAdjudication: "phase6a1-professor-plan-dev36-semantic-closure-adjudication-v3.json",
    semanticClosureAdjudicationSha256: devAdjSha,
    leakageTestReport: "phase6a1-professor-plan-semantic-closure-leakage-test-report-v3.json",
    caseCount: 36,
    instruction: "Semantic DEV36 v3. Snapshots authored independently of adjudication.",
  });

  writeJson(resolve(OUT, "phase6a1-professor-plan-holdout24-v3-sealed-manifest-v3.json"), {
    version: "phase6a1-professor-plan-holdout24-v3-sealed-manifest-v3",
    sealedAt: GENERATED_AT,
    designArtifact: "phase6a1-professor-plan-functional-role-closure-design-v3.json",
    benchmarkPopulation: "phase6a1-professor-plan-holdout24-v3-population-v3.json",
    benchmarkPopulationSha256: holdoutPopulationSha,
    semanticClosureInputManifest: "phase6a1-professor-plan-holdout24-v3-semantic-closure-input-v3/manifest.json",
    semanticClosureInputManifestSha256: holdSnapshots.manifestSha256,
    blindedAdjudicationArtifact: "phase6a1-professor-plan-holdout24-v3-blinded-adjudication-sealed-v3.json",
    blindedAdjudicationSha256: holdAdjSha,
    implementationAllowlist: [
      "phase6a1-professor-plan-holdout24-v3-population-v3.json",
      "phase6a1-professor-plan-holdout24-v3-semantic-closure-input-v3/manifest.json",
      "phase6a1-professor-plan-holdout24-v3-semantic-closure-input-v3/*.json",
    ],
    implementationDenylist: ["phase6a1-professor-plan-holdout24-v3-blinded-adjudication-sealed-v3.json"],
    caseCount: 24,
    instruction: "Fresh HOLDOUT24-V3. Blinded adjudication SHA referenced only; do not expose to implementation.",
  });

  writeJson(resolve(OUT, "phase6a1-professor-plan-post-gold-development-track-v3.json"), {
    version: "phase6a1-professor-plan-post-gold-development-track-v3",
    updatedAt: GENERATED_AT,
    supersedes: "phase6a1-professor-plan-post-gold-development-track-v2",
    auditDisposition: "DESIGN_BLOCK_V2_CONFIRMED_ADDRESSED_BY_V3",
    authorScripts: {
      fixtureCatalog: "web/scripts/run-phase6a1-closure-semantic-fixture-catalog-author-v3.ts",
      semanticSnapshot: "web/scripts/run-phase6a1-closure-semantic-snapshot-author-v3.ts",
      independentAdjudication: "web/scripts/run-phase6a1-closure-independent-adjudication-author-v3.ts",
      leakageTest: "web/scripts/run-phase6a1-closure-semantic-benchmark-leakage-test-v3.ts",
      sealOrchestrator: "web/scripts/run-phase6a1-closure-semantic-benchmark-seal-v3.ts",
    },
    v2Preservation: { dev36V2: "SYNTHETIC_UNIT_FIXTURE", holdout24V2: "COMPROMISED_BEFORE_USE" },
    semanticBenchmarkV3: {
      dev36: "phase6a1-professor-plan-dev36-semantic-sealed-manifest-v3.json",
      holdout24v3: "phase6a1-professor-plan-holdout24-v3-sealed-manifest-v3.json",
    },
    gateDisposition: {
      amendmentV8: "FROZEN_FINAL",
      goldComparisonV1: "SEALED_FINAL",
      corpusIngest: "BLOCKED",
      closureImplementation: "WAIT",
    },
  });

  try {
    writeFileSync(
      resolve(OUT, "phase6a1-professor-plan-functional-role-closure-v2-author-script-audit-gpt56sol-v1.json"),
      readFileSync("C:/Users/h3art/Downloads/phase6a1-professor-plan-functional-role-closure-v2-author-script-audit-gpt56sol-v1.json"),
    );
  } catch {
    /* optional */
  }

  console.log(
    JSON.stringify(
      {
        designV3Sha256: designSha,
        dev36SnapshotManifestSha256: devSnapshots.manifestSha256,
        dev36AdjudicationSha256: devAdjSha,
        holdout24v3PopulationSha256: holdoutPopulationSha,
        holdout24v3SnapshotManifestSha256: holdSnapshots.manifestSha256,
        holdout24v3BlindedAdjudicationSha256: holdAdjSha,
        leakageReportPath,
        leakagePass: leakage.dev36.pass && leakage.holdout24v3.pass,
      },
      null,
      2,
    ),
  );
}

main();
