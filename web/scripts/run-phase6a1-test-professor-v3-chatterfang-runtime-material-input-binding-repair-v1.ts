#!/usr/bin/env npx tsx
/** Runtime material input binding repair audit — 0 OpenAI calls. */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import {
  PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1,
  PROFESSOR_V3_CHATTERFANG_RUNTIME_MATERIAL_INPUT_BINDING_REPAIR_DECISION_V1,
} from "./lib/phase6a1-professor-v3-smoke-execution-authorization-chatterfang-v1";
import {
  buildProfessorV3ChatterfangRequiredRuntimeMaterialInputSourcesV1,
} from "./lib/phase6a1-professor-v3-runtime-local-import-closure-v1";
import {
  assertProfessorV3ChatterfangRuntimeMaterialInputBindingV11,
  resolveProfessorV3ChatterfangExecutableMaterialSourcesV11,
  resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11,
  resolveProfessorV3ChatterfangRuntimeMaterialInputSourcesV11,
  verifyProfessorV3SmokeExecutionIdentityV11,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v11";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";

const OUT_PATH = resolve(
  MILESTONES,
  "phase6a1-professor-v3-chatterfang-runtime-material-input-binding-repair-audit-v1.json",
);

type Check = { id: string; description: string; pass: boolean; detail?: string };

function record(checks: Check[], id: string, description: string, pass: boolean, detail?: string) {
  checks.push({ id, description, pass, detail });
}

function mutateToTemp(originalPath: string): string {
  const tempDir = mkdtempSync(join(tmpdir(), "chatterfang-material-input-mutation-"));
  const dest = join(tempDir, originalPath.split(/[\\/]/).pop()!);
  const bytes = Buffer.from(readFileSync(originalPath));
  bytes[Math.min(120, bytes.length - 1)] ^= 0x01;
  writeFileSync(dest, bytes);
  return dest;
}

function main() {
  loadProjectEnvLocal();
  const checks: Check[] = [];
  const requiredMaterialInputs = buildProfessorV3ChatterfangRequiredRuntimeMaterialInputSourcesV1();
  const modelPinJsonPath = requiredMaterialInputs.find((source) => source.label === "phase6a1-professor-plan-model-pin-v2-json")!.path;
  const chatterfangTruthJsonPath = requiredMaterialInputs.find(
    (source) => source.label === "phase6a1-professor-v3-chatterfang-prospective-mechanism-truth-v1",
  )!.path;
  const moduleSources = resolveProfessorV3ChatterfangExecutableRuntimeModuleSourcesV11();
  const materialInputSources = resolveProfessorV3ChatterfangRuntimeMaterialInputSourcesV11();
  const fullSources = resolveProfessorV3ChatterfangExecutableMaterialSourcesV11();

  record(
    checks,
    "runtime-module-closure-count-88",
    "Runtime local module import closure remains 88 files",
    moduleSources.length === 88,
    `count=${moduleSources.length}`,
  );
  record(
    checks,
    "runtime-material-input-count",
    "Discovered runtime material inputs are bound separately from module closure",
    materialInputSources.length >= 2,
    `count=${materialInputSources.length}; labels=${materialInputSources.map((source) => source.label).join(", ")}`,
  );
  record(
    checks,
    "execution-material-closure-count-90",
    "Final execution material set equals module closure union material inputs",
    fullSources.length === moduleSources.length + materialInputSources.length,
    `module=${moduleSources.length}; material=${materialInputSources.length}; total=${fullSources.length}`,
  );
  record(
    checks,
    "model-pin-json-in-final-pins",
    "Model pin JSON is included in final execution material pins",
    fullSources.some((source) => source.path === modelPinJsonPath),
  );
  record(
    checks,
    "chatterfang-mechanism-truth-json-in-final-pins",
    "Chatterfang mechanism truth JSON is included in final execution material pins",
    fullSources.some((source) => source.path === chatterfangTruthJsonPath),
  );

  try {
    assertProfessorV3ChatterfangRuntimeMaterialInputBindingV11();
    record(checks, "material-input-binding-current-pins", "Current material input binding passes against sealed pins", true);
  } catch (err) {
    record(checks, "material-input-binding-current-pins", "Current material input binding passes against sealed pins", false, String(err));
  }

  const mutatedModelPinSources = fullSources.map((source) =>
    source.path === modelPinJsonPath ? { ...source, path: mutateToTemp(source.path) } : source,
  );
  const mutatedModelPinIdentity = verifyProfessorV3SmokeExecutionIdentityV11({ sources: mutatedModelPinSources });
  record(
    checks,
    "preflight-fails-on-model-pin-json-byte-mutation",
    "One-byte mutation in model pin JSON fails candidate preflight before model request",
    !mutatedModelPinIdentity.ok,
    mutatedModelPinIdentity.ok ? "expected failure" : Object.entries(mutatedModelPinIdentity.details ?? {}).slice(0, 3).map(([k, v]) => `${k}=${v}`).join("; "),
  );

  const mutatedTruthSources = fullSources.map((source) =>
    source.path === chatterfangTruthJsonPath
      ? { ...source, path: mutateToTemp(source.path) }
      : source,
  );
  const mutatedTruthIdentity = verifyProfessorV3SmokeExecutionIdentityV11({ sources: mutatedTruthSources });
  record(
    checks,
    "preflight-fails-on-chatterfang-truth-json-byte-mutation",
    "One-byte mutation in Chatterfang mechanism truth JSON fails candidate preflight before model request",
    !mutatedTruthIdentity.ok,
    mutatedTruthIdentity.ok ? "expected failure" : Object.entries(mutatedTruthIdentity.details ?? {}).slice(0, 3).map(([k, v]) => `${k}=${v}`).join("; "),
  );

  const audit = {
    version: "phase6a1-professor-v3-chatterfang-runtime-material-input-binding-repair-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: PROFESSOR_V3_CHATTERFANG_RUNTIME_MATERIAL_INPUT_BINDING_REPAIR_DECISION_V1,
    openAiCallsInThisBlock: 0,
    runtimeModuleClosureFileCount: moduleSources.length,
    runtimeMaterialInputFileCount: materialInputSources.length,
    executionMaterialClosureFileCount: fullSources.length,
    candidateAuthorizationDependencyManifestSha256:
      PROFESSOR_V3_CHATTERFANG_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V1.dependencyManifestSha256,
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
        runtimeMaterialInputFileCount: audit.runtimeMaterialInputFileCount,
        executionMaterialClosureFileCount: audit.executionMaterialClosureFileCount,
      },
      null,
      2,
    ),
  );

  if (audit.failed > 0) process.exit(1);
}

main();
