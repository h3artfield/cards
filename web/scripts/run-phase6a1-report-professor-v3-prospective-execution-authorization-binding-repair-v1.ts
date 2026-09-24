#!/usr/bin/env npx tsx
/** Report Professor v3 prospective execution-authorization binding repair bundle v1. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
  PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v8";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH,
  verifyProfessorV3SmokeExecutionAuthorizationV8,
  verifyProfessorV3SmokeExecutionIdentityV7,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v7";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-report-v1.json",
);
const AUDIT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-audit-v1.json",
);
const MANIFEST_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-v1-manifest.json",
);

function main() {
  if (!existsSync(AUDIT_PATH)) throw new Error(`Missing audit artifact: ${AUDIT_PATH}`);
  const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8")) as {
    passed: number;
    totalChecks: number;
    failed: number;
  };
  const identity = verifyProfessorV3SmokeExecutionIdentityV7();
  const authorization = verifyProfessorV3SmokeExecutionAuthorizationV8();

  const report = {
    version: "phase6a1-professor-v3-prospective-execution-authorization-binding-repair-report-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_BINDING_REPAIR_DECISION_V1,
    readinessStatus: audit.failed === 0 && identity.ok && authorization.ok ? "PASS" : "FAIL",
    incompleteResponseRepairV1: "PASS_SEALED",
    muldrothaSuccessorV1: "SPENT",
    muldrothaSuccessorV2: "SPENT",
    muldrothaSuccessorV3: "MUST_NOT_EXECUTE",
    openAiCallsInThisBlock: 0,
    prospectiveSubject: {
      mechanismTruthCaseId: "multi-korvold",
      prospectiveCaseId: "professor-v3-smoke-korvold-prospective-v1",
      stackIdentity: "professor-v3-korvold-smoke-execution-tree-v1-prospective",
    },
    audit: {
      path: AUDIT_PATH,
      sha256: sha256File(AUDIT_PATH),
      passed: audit.passed,
      totalChecks: audit.totalChecks,
      failed: audit.failed,
    },
    independentlyReviewedExecutionAuthorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V8,
    reviewedExecutionIdentity: identity.ok ? identity.identity : identity,
    executionPinsArtifact: {
      path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH,
      sha256: existsSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH) ? sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V7_PATH) : null,
    },
    externalAnchors: identity.ok
      ? {
          executionIdentityArtifactSha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V7_PATH),
          executeRunnerSha256: identity.identity.executeRunnerSha256,
          executionPinsArtifactSha256: identity.identity.executionPinsArtifactSha256,
          dependencyManifestSha256: identity.identity.dependencyManifestSha256,
        }
      : null,
    instruction: "REPORT AND WAIT — binding repair submitted. No prospective model smoke authorized yet.",
    nextAuthorizedStep:
      "Fresh Korvold prospective model smoke only after independent authorization with new external anchors and modelExecutionAuthorized=true",
    bundleManifest: existsSync(MANIFEST_PATH)
      ? { path: MANIFEST_PATH, sha256: sha256File(MANIFEST_PATH) }
      : { path: MANIFEST_PATH, sha256: null, note: "Run package script after audit pass" },
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: OUT_PATH, sha256: sha256File(OUT_PATH), readinessStatus: report.readinessStatus }, null, 2));
  if (report.readinessStatus !== "PASS") process.exit(1);
}

main();
