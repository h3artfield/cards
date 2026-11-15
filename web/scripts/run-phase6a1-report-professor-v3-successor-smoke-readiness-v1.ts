#!/usr/bin/env npx tsx
/** Report Professor v3 successor smoke readiness bundle v1. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V5 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v5";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V4_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH,
  verifyProfessorV3SmokeExecutionAuthorizationV5,
  verifyProfessorV3SmokeExecutionIdentityV4,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v4";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-successor-smoke-readiness-report-v1.json");
const AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-successor-smoke-readiness-audit-v1.json");
const MANIFEST_PATH = resolve(MILESTONES, "phase6a1-professor-v3-successor-smoke-readiness-v1-manifest.json");

function main() {
  if (!existsSync(AUDIT_PATH)) throw new Error(`Missing audit artifact: ${AUDIT_PATH}`);
  const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8")) as {
    passed: number;
    totalChecks: number;
    failed: number;
    checks: Array<{ id: string; pass: boolean }>;
  };
  const identity = verifyProfessorV3SmokeExecutionIdentityV4();
  const authorization = verifyProfessorV3SmokeExecutionAuthorizationV5();

  const report = {
    version: "phase6a1-professor-v3-successor-smoke-readiness-report-v1",
    generatedAt: new Date().toISOString(),
    decision:
      "PROFESSOR_V3_SPENT_FAILURE_REPAIR_V1_BLOCK_STRUCTURED_OUTPUT_SCHEMA_API_INCOMPATIBLE_AND_SUCCESSOR_EXECUTION_DELTA_REQUIRED",
    readinessStatus: audit.failed === 0 && identity.ok && authorization.ok ? "PASS" : "FAIL",
    audit: {
      path: AUDIT_PATH,
      sha256: sha256File(AUDIT_PATH),
      passed: audit.passed,
      totalChecks: audit.totalChecks,
      failed: audit.failed,
    },
    independentlyReviewedExecutionAuthorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V5,
    reviewedExecutionIdentity: identity.ok ? identity.identity : identity,
    executionPinsArtifact: {
      path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH,
      sha256: existsSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH) ? sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V4_PATH) : null,
    },
    stackIdentity: "professor-v3-muldrotha-smoke-execution-tree-v4-successor",
    spentSmokePreserved: true,
    openAiCallsInThisBlock: 0,
    instruction: "REPORT AND WAIT — successor smoke readiness submitted. Next authorization: exactly one successor Muldrotha Professor v3 smoke.",
    nextAuthorizedStep: "Exactly one successor Muldrotha Professor v3 smoke run only after independent successor readiness pass",
    bundleManifest: existsSync(MANIFEST_PATH)
      ? { path: MANIFEST_PATH, sha256: sha256File(MANIFEST_PATH) }
      : { path: MANIFEST_PATH, sha256: null, note: "Run package script after audit pass" },
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: OUT_PATH, sha256: sha256File(OUT_PATH), readinessStatus: report.readinessStatus }, null, 2));
  if (report.readinessStatus !== "PASS") process.exit(1);
}

main();
