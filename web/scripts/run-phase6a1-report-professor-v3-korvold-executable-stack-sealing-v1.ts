#!/usr/bin/env npx tsx
/** Report Korvold executable-stack hardening bundle v1. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PROFESSOR_V3_EXECUTABLE_STACK_SEALING_DECISION_V1,
  PROFESSOR_V3_KORVOLD_FINAL_EXECUTION_HARDENING_DECISION_V1,
  PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V9,
  PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_DECISION_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v9";
import { PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1";
import {
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V8_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V8_PATH,
  assertProfessorV3CandidateExecutionAuthorizationV9,
  assertProfessorV3KorvoldExecutableSmokeExecutionPreflightV9,
  loadProfessorV3ReviewedExecutionIdentityV8,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v8";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-korvold-executable-stack-sealing-report-v1.json");
const AUDIT_PATH = resolve(MILESTONES, "phase6a1-professor-v3-korvold-executable-stack-sealing-audit-v1.json");
const MANIFEST_PATH = resolve(MILESTONES, "phase6a1-professor-v3-korvold-executable-stack-sealing-v1-manifest.json");
const LIVE_ROOT_PATH = resolve(REPO, "web/scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts");
const OUT_ZIP_PATH = resolve(MILESTONES, "phase6a1-professor-v3-korvold-executable-stack-sealing-v1.zip");

function main() {
  if (!existsSync(AUDIT_PATH)) throw new Error(`Missing audit artifact: ${AUDIT_PATH}`);
  const audit = JSON.parse(readFileSync(AUDIT_PATH, "utf8")) as {
    passed: number;
    totalChecks: number;
    failed: number;
  };
  let preflightOk = false;
  let candidateAuthOk = false;
  try {
    assertProfessorV3KorvoldExecutableSmokeExecutionPreflightV9();
    preflightOk = true;
  } catch {
    preflightOk = false;
  }
  try {
    assertProfessorV3CandidateExecutionAuthorizationV9();
    candidateAuthOk = true;
  } catch {
    candidateAuthOk = false;
  }
  const identity = loadProfessorV3ReviewedExecutionIdentityV8();
  const manifest = existsSync(MANIFEST_PATH)
    ? (JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { zip?: { sha256?: string } })
    : null;

  const report = {
    version: "phase6a1-professor-v3-korvold-executable-stack-sealing-report-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_KORVOLD_FINAL_EXECUTION_HARDENING_DECISION_V1,
    priorExecutableStackSealingV1: PROFESSOR_V3_EXECUTABLE_STACK_SEALING_DECISION_V1,
    readinessStatus: audit.failed === 0 && preflightOk && candidateAuthOk ? "PASS" : "FAIL",
    bindingRepairV1: "PASS_SEALED",
    executableStackHardeningV1: audit.failed === 0 ? "PASS" : "FAIL",
    korvoldProspectiveModelSmoke: "NOT_YET_AUTHORIZED",
    openAiCallsInThisBlock: 0,
    liveAuthorization: PROFESSOR_V3_LIVE_EXECUTION_AUTHORIZATION,
    liveAuthorizationRoot: {
      relativePath: "web/scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-live-root-v1.ts",
      sha256: sha256File(LIVE_ROOT_PATH),
      note: "External to dependency closure; runner imports this root only. Swap root values after independent smoke authorization without changing runner bytes.",
    },
    candidateAuthorization: PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V9,
    candidateDecision: PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_DECISION_V1,
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
    reviewedExecutionIdentity: identity,
    executionPinsArtifact: {
      path: PROFESSOR_V3_SMOKE_EXECUTION_PINS_V8_PATH,
      sha256: existsSync(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V8_PATH) ? sha256File(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V8_PATH) : null,
    },
    externalAnchors: {
      executionIdentityArtifactSha256: sha256File(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V8_PATH),
      executeRunnerSha256: identity.executeRunnerSha256,
      executionPinsArtifactSha256: identity.executionPinsArtifactSha256,
      dependencyManifestSha256: identity.dependencyManifestSha256,
      liveAuthorizationRootSha256: sha256File(LIVE_ROOT_PATH),
      candidateAuthorizationDecision: PROFESSOR_V3_KORVOLD_PROSPECTIVE_SMOKE_DECISION_V1,
    },
    instruction:
      "REPORT AND WAIT — hardening complete. Candidate auth is not live. Activation swaps external live-authorization root only.",
    nextAuthorizedStep:
      "Independent authorization to swap live authorization root to reviewed candidate values for one Korvold prospective model smoke",
    bundleManifest: existsSync(MANIFEST_PATH)
      ? { path: MANIFEST_PATH, sha256: sha256File(MANIFEST_PATH) }
      : { path: MANIFEST_PATH, sha256: null, note: "Run package script after audit pass" },
    bundleZip: existsSync(OUT_ZIP_PATH)
      ? { path: OUT_ZIP_PATH, sha256: manifest?.zip?.sha256 ?? sha256File(OUT_ZIP_PATH) }
      : { path: OUT_ZIP_PATH, sha256: null, note: "Run package script after report pass" },
  };

  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ report: OUT_PATH, sha256: sha256File(OUT_PATH), readinessStatus: report.readinessStatus }, null, 2));
  if (report.readinessStatus !== "PASS") process.exit(1);
}

main();
