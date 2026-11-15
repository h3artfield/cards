#!/usr/bin/env npx tsx
/** Transitive runtime local-import closure repair audit — 0 OpenAI calls. */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import {
  PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
  PROFESSOR_V3_CHATTERFANG_TRANSITIVE_RUNTIME_CLOSURE_REPAIR_DECISION_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1";
import {
  CHATTERFANG_EXECUTE_RUNNER_PATH,
  PROFESSOR_V3_CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS,
  auditRuntimeLocalImportClosureV1,
} from "./lib/phase6a1-professor-v3-runtime-local-import-closure-v1";
import {
  assertProfessorV3ChatterfangRuntimeLocalImportClosureV11,
  resolveProfessorV3ChatterfangExecutableMaterialSourcesV11,
  resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11,
  verifyProfessorV3ChatterfangRuntimeLocalImportClosureV11,
  verifyProfessorV3SmokeExecutionIdentityV11,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v11";
import { MILESTONES, REPO, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const WEB = resolve(REPO, "web");
const OUT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-chatterfang-transitive-runtime-closure-repair-audit-v1.json",
);
const PLAN_OUTPUT_SCHEMA_V2_PATH = resolve(WEB, "scripts/lib/phase6a1-professor-v3-plan-output-schema-v2.ts");
const EXTERNAL_AUTH = new Set(PROFESSOR_V3_CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS);

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

function main() {
  loadProjectEnvLocal();
  const checks: Check[] = [];
  const moduleSources = resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11();
  const fullSources = resolveProfessorV3ChatterfangExecutableMaterialSourcesV11();

  record(
    checks,
    "closure-entrypoint",
    "Closure is rooted at the Chatterfang execute runner",
    CHATTERFANG_EXECUTE_RUNNER_PATH.endsWith(
      "run-phase6a1-execute-smoke-professor-v3-chatterfang-prospective-v1.ts",
    ),
    CHATTERFANG_EXECUTE_RUNNER_PATH,
  );

  record(
    checks,
    "closure-includes-manifest-algorithm",
    "Transitive closure includes smoke material pins v3 manifest algorithm module",
    moduleSources.some((source) => source.label === "phase6a1-professor-v3-smoke-material-pins-v3"),
  );

  record(
    checks,
    "closure-includes-plan-output-schema-v2",
    "Transitive closure includes plan output schema v2",
    moduleSources.some((source) => source.label === "phase6a1-professor-v3-plan-output-schema-v2"),
  );

  record(
    checks,
    "closure-includes-rag-firestore-stack",
    "Transitive closure includes RAG/Firestore runtime helpers",
    ["admin", "collections", "embed-query", "firestore-chunk-write", "alias-store"].every((label) =>
      moduleSources.some((source) => source.label === label),
    ),
  );

  record(
    checks,
    "closure-excludes-external-auth",
    "External live/candidate authorization roots are excluded from pinned closure",
    !fullSources.some((source) =>
      PROFESSOR_V3_CHATTERFANG_EXTERNAL_RUNTIME_AUTHORIZATION_PATHS.some((externalPath) => source.path === externalPath),
    ),
  );

  try {
    assertProfessorV3ChatterfangRuntimeLocalImportClosureV11();
    record(
      checks,
      "closure-audit-current-pins",
      "Current computed closure matches sealed pin set symmetrically",
      true,
      `moduleCount=${moduleSources.length}; totalCount=${fullSources.length}`,
    );
  } catch (err) {
    record(
      checks,
      "closure-audit-current-pins",
      "Current computed closure matches sealed pin set symmetrically",
      false,
      String(err),
    );
  }

  const incompletePinsAudit = auditRuntimeLocalImportClosureV1({
    entryPath: CHATTERFANG_EXECUTE_RUNNER_PATH,
    pinnedAbsolutePaths: moduleSources
      .filter((source) => source.label !== "phase6a1-professor-v3-smoke-material-pins-v3")
      .map((source) => source.path),
    externalAbsolutePaths: EXTERNAL_AUTH,
  });
  record(
    checks,
    "closure-audit-unpinned-transitive-import",
    "Omitting a known transitive runtime import fails closure audit",
    !incompletePinsAudit.pass &&
      incompletePinsAudit.unpinnedLocalImports.some((path) => path.includes("phase6a1-professor-v3-smoke-material-pins-v3.ts")),
    `unpinned=${incompletePinsAudit.unpinnedLocalImports.length}`,
  );

  const tempDir = mkdtempSync(join(tmpdir(), "chatterfang-closure-mutation-"));
  const mutatedSchemaPath = join(tempDir, "phase6a1-professor-v3-plan-output-schema-v2.ts");
  const originalBytes = readFileSync(PLAN_OUTPUT_SCHEMA_V2_PATH);
  const mutatedBytes = Buffer.from(originalBytes);
  mutatedBytes[Math.min(100, mutatedBytes.length - 1)] ^= 0x01;
  writeFileSync(mutatedSchemaPath, mutatedBytes);

  const mutatedSources = fullSources.map((source) =>
    source.label === "phase6a1-professor-v3-plan-output-schema-v2"
      ? { ...source, path: mutatedSchemaPath }
      : source,
  );
  const mutatedIdentity = verifyProfessorV3SmokeExecutionIdentityV11({ sources: mutatedSources });
  record(
    checks,
    "preflight-fails-on-transitive-byte-mutation",
    "One-byte mutation in transitively imported runtime source fails identity preflight before model request",
    !mutatedIdentity.ok,
    mutatedIdentity.ok ? "expected failure" : Object.entries(mutatedIdentity.details ?? {}).slice(0, 3).map(([k, v]) => `${k}=${v}`).join("; "),
  );

  const closureWithMutation = verifyProfessorV3ChatterfangRuntimeLocalImportClosureV11({
    sources: mutatedSources.filter((source) => source.path.endsWith(".ts") || source.path.endsWith(".tsx") || source.path.endsWith(".js")),
  });
  record(
    checks,
    "closure-audit-fails-on-transitive-byte-mutation",
    "One-byte mutation in transitively imported runtime source fails closure audit",
    !closureWithMutation.ok,
  );

  const audit = {
    version: "phase6a1-professor-v3-chatterfang-transitive-runtime-closure-repair-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_CHATTERFANG_TRANSITIVE_RUNTIME_CLOSURE_REPAIR_DECISION_V1,
    openAiCallsInThisBlock: 0,
    executeRunnerPath: CHATTERFANG_EXECUTE_RUNNER_PATH,
    executeRunnerSha256: sha256File(CHATTERFANG_EXECUTE_RUNNER_PATH),
    candidateAuthorizationSha256: sha256File(
      resolve(WEB, "scripts/lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1.ts"),
    ),
    candidateAuthorizationDependencyManifestSha256:
      PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.dependencyManifestSha256,
    runtimeModuleClosureFileCount: moduleSources.length,
    executionMaterialClosureFileCount: fullSources.length,
    totalChecks: checks.length,
    passed: checks.filter((check) => check.pass).length,
    failed: checks.filter((check) => !check.pass).length,
    checks,
  };

  writeFileSync(OUT_PATH, JSON.stringify(audit, null, 2));
  console.log(
    JSON.stringify(
      {
        artifact: OUT_PATH,
        sha256: sha256File(OUT_PATH),
        passed: audit.passed,
        total: audit.totalChecks,
        runtimeModuleClosureFileCount: audit.runtimeModuleClosureFileCount,
        executionMaterialClosureFileCount: audit.executionMaterialClosureFileCount,
      },
      null,
      2,
    ),
  );

  if (audit.failed > 0) process.exit(1);
}

main();
