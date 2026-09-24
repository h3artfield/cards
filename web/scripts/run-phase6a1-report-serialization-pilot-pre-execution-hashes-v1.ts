#!/usr/bin/env npx tsx
/**
 * Pre-execution hash report for serialization pilot v8 infrastructure.
 * Emits pinned byte SHAs and REPORT AND WAIT — does not execute pilot.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPilotStackIdentityInputs,
  computeSingleFinalStackIdentity,
} from "./lib/phase6a1-professor-plan-serialization-pilot-stack-v1";
import {
  getSpentPilotMechanismTruthSupplementSha256,
  getSpentPilotOpportunitySupplementSha256,
  assertPilotTruthSupplementsPresent,
} from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import {
  CATALOG_VERIFIER_PATH,
  MECHANISM_TRUTH_SUPPLEMENT_ARTIFACT,
  OPPORTUNITY_SUPPLEMENT_ARTIFACT,
  PILOT_SPEC_ARTIFACT,
} from "./lib/phase6a1-serialization-pilot-v8-config-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const REPORT_PATH = resolve(MILESTONES, "phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v1.json");

const PATHS = {
  pilotRunner: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8.ts"),
  pilotRunnerContainer: resolve(HERE, "run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts"),
  serializer: resolve(HERE, "lib/phase6a1-professor-plan-serializer-v1.ts"),
  losslessness: resolve(HERE, "lib/phase6a1-professor-plan-serialization-losslessness-v1.ts"),
  harmony: resolve(HERE, "lib/phase6a1-professor-plan-serialization-harmony-v1.ts"),
  stackIdentity: resolve(HERE, "lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts"),
  spentPilotTruthLoader: resolve(HERE, "lib/phase6a1-spent-pilot-truth-loader-v1.ts"),
  spentPilotAdjudication: resolve(HERE, "lib/phase6a1-spent-pilot-mechanism-truth-adjudication-v1.ts"),
  spentPilotConfig: resolve(HERE, "lib/phase6a1-serialization-pilot-v8-config-v1.ts"),
  buildSupplement: resolve(HERE, "run-phase6a1-build-spent-pilot-mechanism-truth-supplement-v1.ts"),
};

function main() {
  assertPilotTruthSupplementsPresent();

  const stackInputs = buildPilotStackIdentityInputs({
    pilotRunnerPath: PATHS.pilotRunner,
    serializerPath: PATHS.serializer,
    losslessnessPath: PATHS.losslessness,
    harmonyPath: PATHS.harmony,
    stackIdentityPath: PATHS.stackIdentity,
    spentPilotTruthLoaderPath: PATHS.spentPilotTruthLoader,
  });
  const singleFinalStackIdentity = computeSingleFinalStackIdentity(stackInputs);

  const catalogVerifierPresent = existsSync(CATALOG_VERIFIER_PATH);
  const catalogVerifier = catalogVerifierPresent
    ? (JSON.parse(readFileSync(CATALOG_VERIFIER_PATH, "utf8")) as { pass?: boolean })
    : null;

  const report = {
    version: "phase6a1-professor-plan-serialization-pilot-pre-execution-hash-report-v1",
    generatedAt: new Date().toISOString(),
    decision: "SERIALIZATION_PILOT_IMPLEMENTATION_AUTHORIZED_NO_COMMANDER_SUBSTITUTION",
    executionStatus: "IMPLEMENTATION_COMPLETE_AWAITING_INDEPENDENT_VERIFIER_PASS",
    instruction: "REPORT_AND_WAIT — do not execute 5/5 pilot until catalog verifier v2 PASS is independently confirmed.",
    immutablePilotCommanders: [
      "Muldrotha, the Gravetide",
      "Zaxara, the Exemplary",
      "Korvold, Fae-Cursed King",
      "Prosper, Tome-Bound",
      "Omnath, Locus of Rage",
    ],
    componentHashes: {
      pilotRunner: { path: "web/scripts/run-phase6a1-run-serialization-pilot-v8.ts", sha256: sha256File(PATHS.pilotRunner) },
      pilotRunnerContainerWrapper: {
        path: "web/scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts",
        sha256: sha256File(PATHS.pilotRunnerContainer),
      },
      professorToRuntimeSerializer: {
        path: "web/scripts/lib/phase6a1-professor-plan-serializer-v1.ts",
        sha256: sha256File(PATHS.serializer),
      },
      semanticLosslessnessGate: {
        path: "web/scripts/lib/phase6a1-professor-plan-serialization-losslessness-v1.ts",
        sha256: sha256File(PATHS.losslessness),
      },
      harmonyFrozenEvidenceValidator: {
        path: "web/scripts/lib/phase6a1-professor-plan-serialization-harmony-v1.ts",
        sha256: sha256File(PATHS.harmony),
      },
      stackIdentityBuilder: {
        path: "web/scripts/lib/phase6a1-professor-plan-serialization-pilot-stack-v1.ts",
        sha256: sha256File(PATHS.stackIdentity),
      },
      spentPilotTruthLoader: {
        path: "web/scripts/lib/phase6a1-spent-pilot-truth-loader-v1.ts",
        sha256: sha256File(PATHS.spentPilotTruthLoader),
      },
      spentPilotAdjudicationModule: {
        path: "web/scripts/lib/phase6a1-spent-pilot-mechanism-truth-adjudication-v1.ts",
        sha256: sha256File(PATHS.spentPilotAdjudication),
      },
      buildSupplementScript: {
        path: "web/scripts/run-phase6a1-build-spent-pilot-mechanism-truth-supplement-v1.ts",
        sha256: sha256File(PATHS.buildSupplement),
      },
    },
    supplementArtifacts: {
      mechanismTruthSupplement: {
        artifact: MECHANISM_TRUTH_SUPPLEMENT_ARTIFACT,
        sha256: getSpentPilotMechanismTruthSupplementSha256(),
        cases: ["multi-muldrotha", "blindv5-52-tokens", "single-landfall-omnath"],
      },
      opportunitySupplement: {
        artifact: OPPORTUNITY_SUPPLEMENT_ARTIFACT,
        sha256: getSpentPilotOpportunitySupplementSha256(),
      },
    },
    pilotSpec: {
      artifact: PILOT_SPEC_ARTIFACT,
      sha256: sha256File(resolve(MILESTONES, PILOT_SPEC_ARTIFACT)),
    },
    catalogVerifierV2: {
      artifact: "phase6a1-professor-plan-catalog-data-state-verification-v2.json",
      present: catalogVerifierPresent,
      pass: catalogVerifier?.pass ?? null,
      sha256: catalogVerifierPresent ? sha256File(CATALOG_VERIFIER_PATH) : null,
      independentConfirmationRequired: true,
      note: "Implementation team does not independently certify PASS bytes in this report.",
    },
    singleFinalStackIdentity,
    stackIdentityInputs: stackInputs,
    executionGate: {
      requiredEnv: "PHASE6A1_INDEPENDENT_CATALOG_VERIFIER_PASS_CONFIRMED=1",
      pinnedContainerScript: "web/scripts/run-phase6a1-run-serialization-pilot-v8-in-pinned-container-v1.ts",
      passArtifactOnSuccess: "phase6a1-professor-plan-serialization-pilot-pass-v1.json",
    },
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main();
