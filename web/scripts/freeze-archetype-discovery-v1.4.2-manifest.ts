#!/usr/bin/env npx tsx
/**
 * Phase 5.4.2 freeze manifest — after DEV gate pass + denominator reconciliation.
 * Run: cd web && npx tsx scripts/freeze-archetype-discovery-v1.4.2-manifest.ts
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARCHETYPE_DISCOVERY_V1_VERSION } from "../src/lib/deck-synthesis/archetype-discovery-types-v1";
import { COMMANDER_CAUSAL_INFERENCE_VERSION } from "../src/lib/deck-synthesis/commander-causal-inference-v1.1";
import { blindHoldoutSetHash } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v1";
import { blindHoldoutV2SetHash } from "../src/lib/deck-synthesis/archetype-discovery-blind-holdout-v2";

const OUT_PATH = "data/milestones/deck-synthesis/archetype-discovery-v1.4.2-freeze-manifest.json";
const HUMAN_REVIEW_PATH = "data/milestones/deck-synthesis/archetype-discovery-v1.4.2-human-mechanical-review.json";
const RC8_MANIFEST = "data/milestones/rc8-development/rc8-candidate-v152-freeze-manifest.json";
const V132_MANIFEST = "data/milestones/deck-synthesis/archetype-discovery-v1.3.2-freeze-manifest.json";

const SOURCE_FILES = [
  "src/lib/deck-synthesis/archetype-discovery-types-v1.ts",
  "src/lib/deck-synthesis/commander-causal-roles-v1.ts",
  "src/lib/deck-synthesis/commander-causal-inference-v1.1.ts",
  "src/lib/deck-synthesis/direction-anchor-v1.ts",
  "src/lib/deck-synthesis/composite-direction-v1.ts",
  "src/lib/deck-synthesis/commander-build-direction-v1.ts",
  "src/lib/deck-synthesis/mechanical-motifs-v1.ts",
  "src/lib/deck-synthesis/discover-archetypes-v1.ts",
  "src/lib/deck-synthesis/commander-mechanical-profile-v1.ts",
  "src/lib/deck-synthesis/mechanical-engine-patterns-v1.ts",
  "src/lib/deck-synthesis/pattern-prerequisites-v1.ts",
  "src/lib/deck-synthesis/benchmark-commander-resolver-v1.ts",
  "src/lib/deck-synthesis/human-label-mapping-v1.ts",
  "src/lib/deck-synthesis/catalog-feasibility-v1.ts",
  "src/lib/deck-synthesis/deck-build-route-overlay-v1.ts",
  "src/lib/deck-synthesis/commander-deck-synthesis-v1-spec.ts",
  "src/lib/deck-synthesis/semantic-deckbuilding-copilot-v1-spec.ts",
  "src/lib/deck-synthesis/archetype-discovery-benchmark-v1.ts",
  "src/lib/deck-synthesis/archetype-discovery-blind-holdout-v1.ts",
  "src/lib/deck-synthesis/archetype-discovery-blind-holdout-v2.ts",
];

function sha256File(relPath: string): string {
  return createHash("sha256").update(readFileSync(resolve(relPath))).digest("hex");
}

function main() {
  const humanReview = JSON.parse(readFileSync(resolve(HUMAN_REVIEW_PATH), "utf8"));
  if (!humanReview.devGate542?.pass) {
    throw new Error("Refusing freeze — devGate542.pass is false");
  }

  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  const gitCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const rc8Manifest = JSON.parse(readFileSync(resolve(RC8_MANIFEST), "utf8"));
  const v132Manifest = JSON.parse(readFileSync(resolve(V132_MANIFEST), "utf8"));

  const sourceHashes = Object.fromEntries(SOURCE_FILES.map((p) => [p.split("/").pop()!, sha256File(p)]));

  const nonScorableCases = [
    {
      caseId: "blind-ishai",
      commander: "Ishai, Ojutai Dragonspeaker",
      commandZoneConfiguration: "single_commander",
      evaluationContextStatus: "OPTIONAL_COMMAND_ZONE_CONTEXT",
      reasonNotScored: "OPTIONAL_COMMAND_ZONE_CONTEXT_COHORT",
      expectedProductBehavior:
        "Flag optional partner context; do not score isolated single-face direction until partner supplied.",
    },
    {
      caseId: "blindv2-20-graveyard",
      commander: "Jacob Frye",
      commandZoneConfiguration: "single_commander",
      evaluationContextStatus: "OPTIONAL_COMMAND_ZONE_CONTEXT",
      reasonNotScored: "OPTIONAL_COMMAND_ZONE_CONTEXT_COHORT",
      expectedProductBehavior:
        "Partner keyword present; optional context flag correct. Isolated oracle slice is incomplete without partner.",
    },
    {
      caseId: "blindv2-28-counters",
      commander: "Wyll, Blade of Frontiers",
      commandZoneConfiguration: "single_commander",
      evaluationContextStatus: "OPTIONAL_COMMAND_ZONE_CONTEXT",
      reasonNotScored: "OPTIONAL_COMMAND_ZONE_CONTEXT_COHORT",
      expectedProductBehavior:
        "Background-permitted commander; optional context flag. Direction requires Background pairing for full evaluation.",
    },
    {
      caseId: "blindv2-30-tokens",
      commander: "Mzed, Mercenary Leader",
      commandZoneConfiguration: "single_commander",
      evaluationContextStatus: "OPTIONAL_COMMAND_ZONE_CONTEXT",
      reasonNotScored: "OPTIONAL_COMMAND_ZONE_CONTEXT_COHORT",
      expectedProductBehavior:
        "Partner keyword present; optional context flag. Missing central in isolation is expected product behavior.",
    },
    {
      caseId: "blindv2-46-partner-background",
      commander: "Bruse Tarl, Boorish Herder",
      commandZoneConfiguration: "single_commander",
      evaluationContextStatus: "OPTIONAL_COMMAND_ZONE_CONTEXT",
      reasonNotScored: "OPTIONAL_COMMAND_ZONE_CONTEXT_COHORT",
      expectedProductBehavior:
        "Partner keyword without paired partner in case definition; optional context flag is correct.",
    },
    {
      caseId: "blindv2-47-partner-background",
      commander: "Enolc, Perfect Clone",
      commandZoneConfiguration: "single_commander",
      evaluationContextStatus: "COMMAND_ZONE_CONTEXT_REQUIRED",
      reasonNotScored: "COMMAND_ZONE_CONTEXT_REQUIRED_COHORT",
      expectedProductBehavior:
        "Perfect-clone partner requires full command-zone composition; abstain from isolated scoring.",
    },
    {
      caseId: "blindv2-48-partner-background",
      commander: "Ganax, Astral Hunter",
      commandZoneConfiguration: "single_commander",
      evaluationContextStatus: "OPTIONAL_COMMAND_ZONE_CONTEXT",
      reasonNotScored: "OPTIONAL_COMMAND_ZONE_CONTEXT_COHORT",
      expectedProductBehavior:
        "Choose-a-Background commander without Background in case; optional context flag is correct.",
    },
  ];

  const manifest = {
    version: "archetype-discovery-v1.4.2-freeze-manifest",
    status: "ACCEPTED_FROZEN",
    phaseStatus: "PHASE_5_4_2_STATUS = ACCEPTED_FROZEN",
    frozenAt: new Date().toISOString(),
    acceptedBy: "human-mechanical-review-v5.4.2 + denominator-reconciliation-v1",
    supersedes: V132_MANIFEST,
    gitCommitSha,
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    commanderBuildDirectionSchemaVersion: "CommanderBuildDirection-v1.4.2",
    directionAnchorSchemaVersion: "DirectionAnchor-v1.4.2",
    retrievalSpecificationSchemaVersion: "RetrievalSpecification-v1.4.2",
    motifVocabularyVersion: "mechanical-motifs-v1.4.2",
    devGateAccounting: {
      totalCases: 118,
      scorableCases: 111,
      contextClassificationCohort: 7,
      otherLegitimateExclusions: 0,
      invariant:
        "totalCases (118) = scorableCases (111) + contextClassificationCohort (7) + otherLegitimateExclusions (0)",
      nonScorableCases,
      contextClassificationMetrics: humanReview.metrics.contextRequired,
      note: "Context cohort scored separately for context classification (100% correct). Not included in mechanical/retrieval denominator.",
    },
    humanReviewGate: {
      mechanicalPrecision: humanReview.metrics.mechanicalPrecision,
      primaryCorrectness: humanReview.metrics.primaryCorrectness,
      causalCorrectness: humanReview.metrics.causalCorrectness,
      anchorCorrectness: humanReview.metrics.anchorCorrectness,
      mechanismCorrectness: humanReview.metrics.mechanismCorrectness,
      retrievalUsability: humanReview.metrics.retrievalSpecUsability,
      missingCentralDirection: humanReview.metrics.missingCentralDirection,
      zeroUsableDirection: humanReview.metrics.zeroUsableDirection,
      payoffOnlyPrimaries: humanReview.metrics.payoffOnlyPrimaries,
      contextClassification: humanReview.metrics.contextClassification,
      pass: humanReview.devGate542.pass,
      scorableCaseCount: humanReview.metrics.scorableCases,
    },
    knownRetrievalAbstentions: [
      {
        caseId: "blindv2-06-multiple-legitimate-plans",
        commander: "Arwen Undómiel",
        classification: "KNOWN_RETRIEVAL_ABSTENTION",
        retrievalSpecificationCompleteness: 0.4,
        retrievalReadinessThreshold: 0.45,
        explanation:
          "Mechanical direction accepted (COMPOSITE: SCRY + SCRY_TRIGGER) but RetrievalSpecification lacks enough deterministic function buckets for Phase-6 candidate retrieval. Correct abstention — do not lower threshold.",
      },
      {
        caseId: "blindv2-36-activated-engine",
        commander: "Urianger Augurelt",
        classification: "KNOWN_RETRIEVAL_ABSTENTION",
        retrievalSpecificationCompleteness: 0.4,
        retrievalReadinessThreshold: 0.45,
        explanation:
          "Composite exile/top-of-library activated direction accepted mechanically but retrieval structure incomplete. Correct abstention preferred over fabricated candidate pool.",
      },
    ],
    knownLimitations: [
      "Isolated single-face evaluation for partner/Background-permitted commanders is intentionally incomplete — see contextClassificationCohort.",
      "Retrieval readiness threshold 0.45 is frozen; sub-threshold abstention is valid product behavior.",
      "SemanticDeckbuildingCopilot v1 is spec-only — not implemented.",
    ],
    frozenComponents: [
      "archetype-discovery-v1.4.2",
      "commander-causal-inference-v1.5",
      "CommanderBuildDirection schema (anchored-primary invariant, driverProvenance, retrievalSpecification)",
      "DirectionAnchor schema (anchorKind, mechanism, requirement, evidenceRefs)",
      "RetrievalSpecification schema (requiredFunctions, constructionConstraints, structuralNeeds)",
      "mechanical-motifs-v1.4.2 (DRIVER promotions incl. tutor-cheat, tap-state, type-qualified, scry loop)",
      "commander-build-direction-v1 (composition, centrality, composite merge, anchor seeding)",
      "commander-causal-roles-v1 (stateChangeTriggers, attritionStages, tutorCheats, typeQualifiedTriggers, activatedActions)",
      "commander-causal-inference-v1.5 (activated resource loops, attrition chains, tutor-cheat, tap-state, type-qualified)",
      "direction-anchor-v1 (anchor extraction + retrieval buckets)",
      "composite-direction-v1 (heterogeneous anchor cross-support)",
      "discover-archetypes-v1 (orchestrator + context classification)",
      "mechanical-engine-patterns-v1 (thresholds unchanged)",
      "pattern-prerequisites-v1",
      "catalog-feasibility-v1",
      "benchmark-commander-resolver-v1",
      "human-label-mapping-v1",
      "deck-build-route-overlay-v1 contract",
      "candidate-retrieval-mode-v1 SEMANTIC_ONLY contract",
      "semantic-deckbuilding-copilot-v1-spec (SPEC ONLY — not implemented)",
    ],
    dependencyVersions: {
      rc8ParserVersion: rc8Manifest.parserVersion,
      rc8ParserBlobClosure: rc8Manifest.parserBlobClosureHash,
      rc8SourceRegistryVersion: "rc8-source-registry-v1",
      rc8FreezeManifest: RC8_MANIFEST,
      semanticIndexVersion: v132Manifest.dependencyVersions?.semanticIndexVersion ?? "catalog-shadow-parse-rc8-v2",
      goldenCatalogVersion: v132Manifest.dependencyVersions?.goldenCatalogVersion ?? "golden-catalog-v1",
      ipv2_1CardProfileVersion: v132Manifest.dependencyVersions?.ipv2_1CardProfileVersion ?? "card-interaction-profile-v2.1",
      ipv2_1DeckProfileVersion: v132Manifest.dependencyVersions?.ipv2_1DeckProfileVersion ?? "deck-interaction-profile-v2.1",
      ipv2_1SpecVersion: v132Manifest.dependencyVersions?.ipv2_1SpecVersion ?? "interaction-profile-v2.1-spec-v1",
      deckBuildRouteOverlayVersion: "deck-build-route-overlay-v1",
      candidateRetrievalModeVersion: "candidate-retrieval-mode-v1",
      semanticOnlyRetrievalStatus: "FROZEN — Phase 6 authorization prerequisite",
    },
    contracts: v132Manifest.contracts,
    sourceHashes,
    artifactHashes: {
      humanMechanicalReview542: humanReview.hash ?? sha256File(HUMAN_REVIEW_PATH),
      regressionMatrix541to542: sha256File("data/milestones/deck-synthesis/archetype-discovery-v1.4.1-to-v1.4.2-regression-matrix.json"),
    },
    spentDevelopmentSets: {
      devBenchmarkV1: { caseCount: 28, status: "DEVELOPMENT_SPENT" },
      blindHoldoutV1: { caseCount: 40, hash: blindHoldoutSetHash(), status: "DEVELOPMENT_DIAGNOSTIC_SPENT" },
      blindHoldoutV2: { caseCount: 50, hash: blindHoldoutV2SetHash(), status: "DEVELOPMENT_DIAGNOSTIC_SPENT" },
      totalStrategyCases: 118,
    },
    policy: {
      rc8: "FROZEN",
      phase5DevelopmentTuning: "STOPPED",
      phase6: "WAIT",
      optimizer: "WAIT",
      copilotImplementation: "WAIT — spec accepted, implementation deferred",
      semanticOnlyRetrieval: "FROZEN",
      retrievalReadinessThreshold: 0.45,
      changeControl: "Any change to frozen components requires a new discovery version (e.g. v1.4.3 or v1.5.0).",
      blindV3: "AUTHORIZED AFTER FREEZE — see blind-v3-seal-manifest.json",
    },
  };

  mkdirSync(resolve("data/milestones/deck-synthesis"), { recursive: true });
  writeFileSync(resolve(OUT_PATH), JSON.stringify(manifest, null, 2));
  console.log(
    JSON.stringify(
      {
        status: manifest.status,
        phaseStatus: manifest.phaseStatus,
        outPath: resolve(OUT_PATH),
        hash: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
        devGateAccounting: manifest.devGateAccounting.invariant,
        gitCommitSha,
      },
      null,
      2,
    ),
  );
}

main();
