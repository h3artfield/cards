#!/usr/bin/env npx tsx
/**
 * Phase 5.6 freeze manifest — after targeted human freeze review pass.
 */
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ARCHETYPE_DISCOVERY_V1_VERSION } from "../src/lib/deck-synthesis/archetype-discovery-types-v1";
import { COMMANDER_CAUSAL_INFERENCE_VERSION } from "../src/lib/deck-synthesis/commander-causal-inference-v1.1";

const OUT_PATH = "data/milestones/deck-synthesis/archetype-discovery-v1.6.0-freeze-manifest.json";
const TARGETED_REVIEW_PATH = "data/milestones/deck-synthesis/phase56-targeted-human-freeze-review-v1.json";
const DEV_REGRESSION_PATH = "data/milestones/deck-synthesis/phase56-dev-regression-v1.1.json";
const ELIGIBILITY_AUDIT_PATH = "data/milestones/deck-synthesis/benchmark-commander-eligibility-audit-v1.1.json";
const RC8_MANIFEST = "data/milestones/rc8-development/rc8-candidate-v152-freeze-manifest.json";
const V150_MANIFEST = "data/milestones/deck-synthesis/archetype-discovery-v1.5.0-freeze-manifest.json";

const SOURCE_FILES = [
  "src/lib/deck-synthesis/archetype-discovery-types-v1.ts",
  "src/lib/deck-synthesis/commander-causal-roles-v1.ts",
  "src/lib/deck-synthesis/commander-causal-inference-v1.1.ts",
  "src/lib/deck-synthesis/phase56-causal-inference.ts",
  "src/lib/deck-synthesis/direction-anchor-v1.ts",
  "src/lib/deck-synthesis/composite-direction-v1.ts",
  "src/lib/deck-synthesis/commander-build-direction-v1.ts",
  "src/lib/deck-synthesis/mechanical-motifs-v1.ts",
  "src/lib/deck-synthesis/command-zone-composition-v1.ts",
  "src/lib/deck-synthesis/discover-archetypes-v1.ts",
  "src/lib/deck-synthesis/commander-mechanical-profile-v1.ts",
  "src/lib/deck-synthesis/mechanical-engine-patterns-v1.ts",
  "src/lib/deck-synthesis/pattern-prerequisites-v1.ts",
  "src/lib/deck-synthesis/benchmark-commander-resolver-v1.ts",
  "src/lib/deck-synthesis/benchmark-commander-legality-v1.1.ts",
  "src/lib/deck-synthesis/human-label-mapping-v1.ts",
  "src/lib/deck-synthesis/catalog-feasibility-v1.ts",
  "src/lib/deck-synthesis/deck-build-route-overlay-v1.ts",
  "src/lib/deck-synthesis/commander-deck-synthesis-v1-spec.ts",
  "src/lib/deck-synthesis/semantic-deckbuilding-copilot-v1-spec.ts",
  "src/lib/deck-builder/commander-format-legality-snapshot-v1.ts",
  "src/lib/deck-builder/inventory-catalog-enrichment.ts",
];

function sha256File(relPath: string): string {
  return createHash("sha256").update(readFileSync(resolve(relPath))).digest("hex");
}

function main() {
  const targetedReview = JSON.parse(readFileSync(resolve(TARGETED_REVIEW_PATH), "utf8"));
  if (!targetedReview.freezeGate?.pass) {
    throw new Error("Refusing freeze — phase56 targeted human review freezeGate.pass is false");
  }

  const devRegression = JSON.parse(readFileSync(resolve(DEV_REGRESSION_PATH), "utf8"));
  if (!devRegression.phase56DevGate?.pass) {
    throw new Error("Refusing freeze — phase56DevGate.pass is false");
  }

  const eligibilityAudit = JSON.parse(readFileSync(resolve(ELIGIBILITY_AUDIT_PATH), "utf8"));
  const v150Manifest = JSON.parse(readFileSync(resolve(V150_MANIFEST), "utf8"));
  const rc8Manifest = JSON.parse(readFileSync(resolve(RC8_MANIFEST), "utf8"));
  const repoRoot = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
  const gitCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();

  const sourceHashes = Object.fromEntries(SOURCE_FILES.map((p) => [p.split("/").pop()!, sha256File(p)]));

  const correctAbstentions = (devRegression.records ?? devRegression.cases ?? [])
    .filter((c: { abstentionClass?: string }) => c.abstentionClass === "CORRECT_ABSTENTION")
    .map((c: { caseId: string; setId?: string; evaluationContextStatus?: string }) => ({
      caseId: c.caseId,
      setId: c.setId,
      classification: "CORRECT_ABSTENTION",
      evaluationContextStatus: c.evaluationContextStatus,
    }));

  const manifest = {
    version: "archetype-discovery-v1.6.0-freeze-manifest",
    status: "ACCEPTED_FROZEN",
    phaseStatus: "PHASE_5_6_STATUS = ACCEPTED_FROZEN",
    frozenAt: new Date().toISOString(),
    acceptedBy: "phase56-targeted-human-freeze-review-v1 + phase56-dev-regression-v1.1",
    supersedes: "data/milestones/deck-synthesis/archetype-discovery-v1.5.0-freeze-manifest.json",
    gitCommitSha,
    discoveryEngineVersion: ARCHETYPE_DISCOVERY_V1_VERSION,
    causalInferenceVersion: COMMANDER_CAUSAL_INFERENCE_VERSION,
    commanderBuildDirectionSchemaVersion: "CommanderBuildDirection-v1.6.0",
    directionAnchorSchemaVersion: "DirectionAnchor-v1.6.0",
    retrievalSpecificationSchemaVersion: "RetrievalSpecification-v1.6.0",
    motifVocabularyVersion: "mechanical-motifs-v1.6.0",
    commandZoneCompositionVersion: "CommandZoneComposition-v1.6.0",
    benchmarkEligibilityDependency: "benchmark-commander-legality-v1.1",
    devGateAccounting: {
      totalEligibleCases: devRegression.totalEligibleCases ?? 197,
      scorableCases: devRegression.phase56DevGate?.eligibleCases ?? 192,
      contextClassificationCohort: 5,
      eligibilityModel: "benchmark-commander-eligibility-audit-v1.1.json",
      invariant: "197 eligible under v1.1 LIVE_COMMANDER; 192 scorable + 5 optional-context cohort",
    },
    phase56DevGate: devRegression.phase56DevGate,
    targetedHumanFreezeReview: {
      artifact: TARGETED_REVIEW_PATH,
      artifactHash: targetedReview.artifactHash,
      reviewScopeCount: targetedReview.accounting?.reviewScopeCount,
      regressions: targetedReview.accounting?.regressions ?? 0,
      pass: targetedReview.freezeGate?.pass ?? false,
    },
    phase56ForensicRepairs: {
      blindV4FailureFamily: "8 semantic failures repaired — first-spell damage, draw→counter, explore-on-damage, modal vote ETB, characteristic ETB damage, global P/T swap, storied threshold, typal ETB tokens",
      mandatoryReviewCases: [
        "blindv4-01-partner-pair",
        "blindv4-05-partner-pair",
        "blindv4-06-partner-pair",
        "blindv4-17-triggered-engine",
        "blindv4-18-triggered-engine",
        "blindv4-20-activated-engine",
        "blindv4-21-activated-engine",
        "blindv4-22-static-state-engine",
      ],
      noCardNameRules: true,
      retrievalThresholdUnchanged: 0.45,
    },
    knownCorrectAbstentions: correctAbstentions.length
      ? correctAbstentions
      : v150Manifest.knownRetrievalAbstentions ?? [],
    knownCompositionClassificationLimitations: targetedReview.knownCompositionClassificationLimitations ?? [],
    knownLimitations: [
      ...(v150Manifest.knownLimitations ?? []),
      "Pir+Toothy reciprocal edges classified INDEPENDENT_PARALLEL_PLANS + LOW cross-support — direction/retrieval correct; composition classification conservative.",
      "Mannichi zero-motif GLOBAL_CHARACTERISTIC_TRANSFORMATION direction is valid per anchor-grounded retrieval spec.",
      "Blind-v4 remains SPENT/FAIL historical — not re-run for generalization credit.",
      "Semantic Deckbuilding Professor implementation remains WAIT.",
    ],
    frozenComponents: [
      "archetype-discovery-v1.6.0",
      "commander-causal-inference-v1.6 + phase56-causal-inference",
      "DirectionAnchor (new mechanism families + OUTPUT/ENGINE motif fallback)",
      "CommanderBuildDirection (anchor seed mappings + synthetic seed when anchor-only)",
      "RetrievalSpecification",
      "CommandZoneComposition (member preservation, compositionTypes[], preservedMemberDirections[], professorFields, feedbackLoops, crossSupportEdges)",
      "composition relationship types (INDEPENDENT_PARALLEL_PLANS, COMPLEMENTARY_PLAN, CROSS_SUPPORT_ENGINE, BIDIRECTIONAL_ENGINE)",
      "feedback-loop representation",
      "ranking + thresholds + resolver",
      "context handling",
      "benchmark eligibility v1.1 dependency",
      "candidate-retrieval-mode-v1 SEMANTIC_ONLY contract",
      "semantic-deckbuilding-professor-v1-spec Professor-facing fields (implementation WAIT)",
    ],
    professorFacingFieldsFrozen: [
      "independentPlans[]",
      "complementaryPlans[]",
      "competingDirections[]",
      "crossSupportStrength",
      "crossSupportEdges[]",
      "feedbackLoops[]",
      "unresolvedDirectionAmbiguity[]",
      "correctAbstentionReason",
    ],
    dependencyVersions: {
      ...(v150Manifest.dependencyVersions ?? {}),
      benchmarkEligibilityAuditV11: ELIGIBILITY_AUDIT_PATH,
      benchmarkEligibilityAuditV11Hash: eligibilityAudit.artifactHash ?? sha256File(ELIGIBILITY_AUDIT_PATH),
      commanderFormatLegalitySnapshot: "commander-format-legality-snapshot-v1",
    },
    rc8Frozen: true,
    semanticOnlyFrozen: true,
    phase6Status: "WAIT_FOR_BLIND_V5",
    professorImplementationStatus: "WAIT",
    optimizerStatus: "WAIT",
    blindV5Authorized: true,
    sourceFileHashes: sourceHashes,
    artifactHashes: {
      phase56DevRegression: sha256File(DEV_REGRESSION_PATH),
      phase56TargetedHumanReview: targetedReview.artifactHash ?? sha256File(TARGETED_REVIEW_PATH),
      benchmarkEligibilityAuditV11: eligibilityAudit.artifactHash ?? sha256File(ELIGIBILITY_AUDIT_PATH),
      rc8FreezeManifest: rc8Manifest.artifactHash ?? sha256File(RC8_MANIFEST),
    },
  };

  manifest.artifactHashes.freezeManifest = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");

  const outPath = resolve(process.cwd(), OUT_PATH);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, status: manifest.status, phaseStatus: manifest.phaseStatus }, null, 2));
}

main();
