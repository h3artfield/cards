#!/usr/bin/env npx tsx
/** Pre-execution hash report v4 — semantic opportunity repair stack for gate-v4 successor. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildImplementationExecutionTree,
  cleanupStagingRoot,
  MILESTONES,
  sha256File,
} from "./lib/phase6a1-pinned-implementation-container-v1";
import {
  buildPilotStackIdentityInputs,
  computeSingleFinalStackIdentity,
} from "./lib/phase6a1-professor-plan-serialization-pilot-stack-v1";
import {
  assertPilotTruthSupplementsPresent,
  getSpentPilotMechanismTruthSupplementSha256,
  getSpentPilotOpportunitySupplementSha256,
  getSpentPilotOpportunitySupplementV2Sha256,
} from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import {
  CATALOG_VERIFIER_PATH,
  MECHANISM_TRUTH_SUPPLEMENT_ARTIFACT,
  OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT,
  PILOT_SPEC_ARTIFACT,
} from "./lib/phase6a1-serialization-pilot-v8-config-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPORT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v4.json");
const GATE_V3 = resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v3.json");
const FORENSIC_REPORT = resolve(MILESTONES, "phase6a1-professor-plan-muldrotha-normalization-forensic-v1.json");

const PATHS = {
  pilotRunner: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8.ts"),
  pilotRunnerContainerV4: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v4-diagnostic-capture-v1.ts"),
  pinnedContainerHelper: resolve(HERE, "lib/phase6a1-pinned-implementation-container-v1.ts"),
  config: resolve(HERE, "lib/phase6a1-serialization-pilot-v8-config-v1.ts"),
  serializer: resolve(HERE, "lib/phase6a1-professor-plan-serializer-v1.ts"),
  losslessness: resolve(HERE, "lib/phase6a1-professor-plan-serialization-losslessness-v1.ts"),
  semanticProjection: resolve(HERE, "lib/phase6a1-professor-plan-serialization-semantic-projection-v1.ts"),
  runtimeInputV8SchemaValidator: resolve(HERE, "lib/phase6a1-professor-plan-runtime-input-v8-schema-validator-v1.ts"),
  artifactRouting: resolve(HERE, "lib/phase6a1-serialization-pilot-artifact-routing-v1.ts"),
  harmony: resolve(HERE, "lib/phase6a1-professor-plan-serialization-harmony-v1.ts"),
  stackIdentity: resolve(HERE, "lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts"),
  spentPilotTruthLoader: resolve(HERE, "lib/phase6a1-spent-pilot-truth-loader-v1.ts"),
  spentPilotAdjudication: resolve(HERE, "lib/phase6a1-spent-pilot-mechanism-truth-adjudication-v1.ts"),
  factFamilyRules: resolve(HERE, "lib/phase6a1-semantic-opportunity-fact-family-rules-v1.ts"),
  contextPreflight: resolve(HERE, "lib/phase6a1-professor-plan-context-preflight-v1.ts"),
  agent: resolve(HERE, "lib/phase6a1-professor-plan-agent-v2.ts"),
  buildOpportunitySupplementV2: resolve(HERE, "run-phase6a1-build-spent-pilot-semantic-opportunity-supplement-v2.ts"),
  auditOpportunityCoverageV2: resolve(HERE, "run-phase6a1-audit-spent-pilot-opportunity-coverage-v2.ts"),
  auditNormalizerSatisfiabilityV2: resolve(HERE, "run-phase6a1-audit-spent-pilot-normalizer-satisfiability-v2.ts"),
  auditContextPreflightV1: resolve(HERE, "run-phase6a1-audit-professor-plan-context-preflight-v1.ts"),
  materialSourceDiff: resolve(HERE, "run-phase6a1-report-serialization-pilot-material-source-diff-v1.ts"),
  fidelityAudit: resolve(HERE, "lib/phase6a1-semantic-opportunity-fidelity-audit-v1.ts"),
  packageReviewV2: resolve(HERE, "run-phase6a1-package-serialization-pilot-semantic-opportunity-repair-review-v2.ts"),
};

const AUDIT_ARTIFACTS = {
  opportunityCoverageV2: resolve(MILESTONES, "phase6a1-spent-pilot-opportunity-coverage-audit-v2.json"),
  normalizerSatisfiabilityV2: resolve(MILESTONES, "phase6a1-spent-pilot-normalizer-satisfiability-audit-v2.json"),
  contextPreflightV1: resolve(MILESTONES, "phase6a1-professor-plan-context-preflight-audit-v1.json"),
  materialSourceDiffV1: resolve(MILESTONES, "phase6a1-serialization-pilot-material-source-diff-v1.json"),
};

function main() {
  assertPilotTruthSupplementsPresent();
  if (!existsSync(GATE_V3)) {
    throw new Error(`Missing immutable gate-v3 evidence required for v4 successor report: ${GATE_V3}`);
  }

  const staging = buildImplementationExecutionTree();
  const implementationExecutionTree = {
    manifestSha256: staging.treeManifestSha256,
    fileCount: staging.treeFileCount,
    archiveByteSha256: staging.archiveByteSha256,
    overlayFileCount: staging.overlayFileCount,
  };

  const stackInputs = buildPilotStackIdentityInputs({
    pilotRunnerPath: PATHS.pilotRunner,
    pilotRunnerContainerWrapperPath: PATHS.pilotRunnerContainerV4,
    pinnedContainerHelperPath: PATHS.pinnedContainerHelper,
    configPath: PATHS.config,
    serializerPath: PATHS.serializer,
    losslessnessPath: PATHS.losslessness,
    semanticProjectionPath: PATHS.semanticProjection,
    runtimeInputV8SchemaValidatorPath: PATHS.runtimeInputV8SchemaValidator,
    artifactRoutingPath: PATHS.artifactRouting,
    harmonyPath: PATHS.harmony,
    stackIdentityPath: PATHS.stackIdentity,
    spentPilotTruthLoaderPath: PATHS.spentPilotTruthLoader,
    spentPilotAdjudicationPath: PATHS.spentPilotAdjudication,
    implementationExecutionTree,
  });
  cleanupStagingRoot(staging.stagingRoot);

  const singleFinalStackIdentity = computeSingleFinalStackIdentity(stackInputs);
  const gateV3 = JSON.parse(readFileSync(GATE_V3, "utf8")) as { generatedAt?: string; decision?: string };

  const report = {
    version: "phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v4",
    generatedAt: new Date().toISOString(),
    decision: "ROOT-CAUSE_REPAIR_SEMANTIC_OPPORTUNITY_COVERAGE",
    executionStatus: "GATE_V4_DIAGNOSTIC_CAPTURE_SUCCESSOR_AWAITING_INDEPENDENT_REVIEW",
    instruction:
      "REPORT AND WAIT — semantic opportunity repair packaged for independent review. Do not run gate-v4 / 5/5 pilot / OpenAI until authorized.",
    rootCause: "NORMALIZATION_INVARIANT_IMPOSSIBILITY_EMPTY_FROZEN_SEMANTIC_OPPORTUNITY_UNIVERSE",
    preservedHistoricalEvidence: {
      gateV1Artifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v1.json",
      gateV2Artifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v2.json",
      gateV3Artifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v3.json",
      gateV3Sha256: sha256File(GATE_V3),
      gateV3GeneratedAt: gateV3.generatedAt ?? null,
      gateV3Decision: gateV3.decision ?? null,
      gateV3StdoutArtifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stdout-v1.txt",
      gateV3StderrArtifact: "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v3-container-stderr-v1.txt",
      forensicReportArtifact: "phase6a1-professor-plan-muldrotha-normalization-forensic-v1.json",
      forensicReportPresent: existsSync(FORENSIC_REPORT),
      forensicReportSha256: existsSync(FORENSIC_REPORT) ? sha256File(FORENSIC_REPORT) : null,
    },
    implementationExecutionTree,
    singleFinalStackIdentity,
    stackIdentityInputs: stackInputs,
    semanticOpportunityRepair: {
      opportunitySupplementV2: {
        artifact: OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT,
        sha256: getSpentPilotOpportunitySupplementV2Sha256(),
      },
      factFamilyRulesSource: {
        path: "web/scripts/lib/phase6a1-semantic-opportunity-fact-family-rules-v1.ts",
        sha256: sha256File(PATHS.factFamilyRules),
      },
      contextPreflightSource: {
        path: "web/scripts/lib/phase6a1-professor-plan-context-preflight-v1.ts",
        sha256: sha256File(PATHS.contextPreflight),
      },
      professorAgentSource: {
        path: "web/scripts/lib/phase6a1-professor-plan-agent-v2.ts",
        sha256: sha256File(PATHS.agent),
      },
      fidelityAuditSource: {
        path: "web/scripts/lib/phase6a1-semantic-opportunity-fidelity-audit-v1.ts",
        sha256: sha256File(PATHS.fidelityAudit),
      },
      materialSourceDiff: {
        artifact: "phase6a1-serialization-pilot-material-source-diff-v1.json",
        present: existsSync(AUDIT_ARTIFACTS.materialSourceDiffV1),
        sha256: existsSync(AUDIT_ARTIFACTS.materialSourceDiffV1)
          ? sha256File(AUDIT_ARTIFACTS.materialSourceDiffV1)
          : null,
      },
      audits: {
        opportunityCoverageV2: {
          artifact: "phase6a1-spent-pilot-opportunity-coverage-audit-v2.json",
          present: existsSync(AUDIT_ARTIFACTS.opportunityCoverageV2),
          sha256: existsSync(AUDIT_ARTIFACTS.opportunityCoverageV2)
            ? sha256File(AUDIT_ARTIFACTS.opportunityCoverageV2)
            : null,
        },
        normalizerSatisfiabilityV2: {
          artifact: "phase6a1-spent-pilot-normalizer-satisfiability-audit-v2.json",
          present: existsSync(AUDIT_ARTIFACTS.normalizerSatisfiabilityV2),
          sha256: existsSync(AUDIT_ARTIFACTS.normalizerSatisfiabilityV2)
            ? sha256File(AUDIT_ARTIFACTS.normalizerSatisfiabilityV2)
            : null,
        },
        contextPreflightV1: {
          artifact: "phase6a1-professor-plan-context-preflight-audit-v1.json",
          present: existsSync(AUDIT_ARTIFACTS.contextPreflightV1),
          sha256: existsSync(AUDIT_ARTIFACTS.contextPreflightV1)
            ? sha256File(AUDIT_ARTIFACTS.contextPreflightV1)
            : null,
        },
      },
    },
    componentHashes: Object.fromEntries(
      Object.entries(PATHS).map(([key, path]) => [key, { path: path.replace(/\\/g, "/").split("/web/")[1] ?? path, sha256: sha256File(path) }]),
    ),
    supplementArtifacts: {
      mechanismTruthSupplement: {
        artifact: MECHANISM_TRUTH_SUPPLEMENT_ARTIFACT,
        sha256: getSpentPilotMechanismTruthSupplementSha256(),
      },
      opportunitySupplementPreferred: {
        artifact: OPPORTUNITY_SUPPLEMENT_V2_ARTIFACT,
        sha256: getSpentPilotOpportunitySupplementSha256(),
      },
    },
    executionGate: {
      requiredEnv: "PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED=1",
      requiredScriptArgs: ["--execute"],
      failClosedOnExistingPassArtifact: true,
      failClosedOnExistingGateV4Artifact: true,
      failClosedOnExistingV4StdoutArtifact: true,
      failClosedOnExistingV4StderrArtifact: true,
      requireHistoricalGateV3Present: true,
      requiredGateV3Sha256: "cc269a2b34f809f793d26dd566d8585e6f675d4253a1ad78e12737ab93611d00",
      pinnedContainerScript:
        "web/scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v4-diagnostic-capture-v1.ts",
      gateArtifactOnExecution: "phase6a1-professor-plan-serialization-pilot-pinned-container-gate-v4.json",
      containerStdoutArtifact:
        "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v4-container-stdout-v1.txt",
      containerStderrArtifact:
        "phase6a1-professor-plan-serialization-pilot-pinned-container-run-v4-container-stderr-v1.txt",
    },
    catalogVerifierV2: {
      artifact: "phase6a1-professor-plan-catalog-data-state-verification-v2.json",
      present: existsSync(CATALOG_VERIFIER_PATH),
      sha256: existsSync(CATALOG_VERIFIER_PATH) ? sha256File(CATALOG_VERIFIER_PATH) : null,
    },
    pilotSpec: {
      artifact: PILOT_SPEC_ARTIFACT,
      sha256: sha256File(resolve(MILESTONES, PILOT_SPEC_ARTIFACT)),
    },
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ artifact: REPORT_PATH, sha256: sha256File(REPORT_PATH), singleFinalStackIdentity }, null, 2));
}

main();
