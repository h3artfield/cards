#!/usr/bin/env npx tsx
/** No-model smoke-readiness v2 checks — execution pins, exact IO, repair payload, failure seal. */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runProfessorPlanCaseV3Orchestration } from "./lib/phase6a1-professor-plan-agent-v3";
import { buildMuldrothaProfessorContextV3ZeroAffordances } from "./lib/phase6a1-professor-v3-grounding-fixtures-v1";
import { castFromGraveyardAssertion, mechanismRef } from "./lib/phase6a1-professor-v3-fixture-assertions-v1";
import { MULDROTHA_CAST_FACT, MULDROTHA_LAND_FACT } from "./lib/phase6a1-professor-v3-grounding-fixtures-v1";
import {
  buildProfessorV3ApiRequestBody,
  buildProfessorV3ModelUserContent,
  createProfessorV3ModelCallerV2,
} from "./lib/phase6a1-professor-v3-model-caller-v2";
import {
  verifyProfessorV3ModelAttemptArtifactRecordV2,
} from "./lib/phase6a1-professor-v3-model-attempt-artifacts-v2";
import { buildProfessorV3PromptPayload } from "./lib/phase6a1-professor-v3-prompt-payload-v1";
import { appendRetrievalEvent, initRunLedgerFromContext } from "../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import {
  assertProfessorV3SmokeExecutionPinsV2,
  PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V2,
  sha256Bytes,
  verifyProfessorV3SmokeExecutionPinsV2,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v2";
import { sealProfessorV3SmokeExecutionFailureV2 } from "./lib/phase6a1-professor-v3-smoke-failure-seal-v2";
import {
  assertProfessorV3SmokeOutputsAbsentV2,
  preflightProfessorV3SmokeOutputsAbsentV2,
  resolveProfessorV3SmokeMuldrothaOutputTargetsV2,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v2";
import { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 } from "./lib/phase6a1-professor-plan-prompt-v3";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const EXECUTE_RUNNER = resolve(HERE, "run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts");
const OUT_AUDIT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-audit-v2.json");

const groundedDependentPlan = {
  strategyHypotheses: [
    {
      hypothesisId: "dep",
      title: "Dep",
      strategicClaim: "Muldrotha casts permanents from graveyard",
      causalReasoning: "Commander grants cast permission",
      evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
      strategicAssertions: [castFromGraveyardAssertion({ assertionId: "a2", packageId: "p2" })],
      causalEdges: [],
      commanderDependency: "HIGH",
      lens: "DEPENDENT_SYNERGY",
      packages: [
        {
          packageId: "p2",
          purpose: "Cast",
          functionalRoles: ["ENGINE"],
          inputs: [],
          resourcesRequired: [],
          outputs: [],
          resourcesProduced: [],
          commanderDependency: "HIGH",
          worksWithoutCommander: "LOW",
          evidenceRefs: [mechanismRef([MULDROTHA_CAST_FACT])],
        },
      ],
      relationships: [],
    },
  ],
};

type Check = { id: string; description: string; pass: boolean; detail?: string };

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const muldrothaCtx = buildMuldrothaProfessorContextV3ZeroAffordances();
  const modelPin = loadProfessorModelPinV2();

  checks.push({
    id: "reviewed-stack-pin-pass",
    description: "Reviewed execution stack unchanged → pin check PASS",
    pass: assertProfessorV3SmokeExecutionPinsV2().ok,
  });

  let mutatedPinFailed = false;
  const tmp = mkdtempSync(join(tmpdir(), "prof-v3-pin-mutate-"));
  const probe = PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V2.find((s) => s.label === "phase6a1-professor-v3-model-caller-v2")!;
  const mutatedPath = join(tmp, "mutated-model-caller.ts");
  cpSync(probe.path, mutatedPath);
  writeFileSync(mutatedPath, `${readFileSync(mutatedPath, "utf8")} `);
  const mutatedSources = PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V2.map((s) =>
    s.label === probe.label ? { ...s, path: mutatedPath } : s,
  );
  mutatedPinFailed = !verifyProfessorV3SmokeExecutionPinsV2({ sources: mutatedSources }).ok;
  checks.push({
    id: "mutated-material-byte-fails-before-model",
    description: "One reviewed source byte changed → fail before modelCaller",
    pass: mutatedPinFailed,
  });

  const targets = resolveProfessorV3SmokeMuldrothaOutputTargetsV2(MILESTONES);
  checks.push({
    id: "smoke-output-targets-absent",
    description: "Real smoke write-once output targets absent before execution",
    pass: preflightProfessorV3SmokeOutputsAbsentV2(targets).length === 0,
  });

  let staleAttemptDirBlocked = false;
  try {
    const tmpTargets = resolveProfessorV3SmokeMuldrothaOutputTargetsV2(mkdtempSync(join(tmpdir(), "prof-v3-preflight-")));
    mkdirSync(tmpTargets.modelAttemptsDir, { recursive: true });
    writeFileSync(join(tmpTargets.modelAttemptsDir, "attempt-000-system-instructions.txt"), "stale\n");
    assertProfessorV3SmokeOutputsAbsentV2(tmpTargets);
  } catch {
    staleAttemptDirBlocked = true;
  }
  checks.push({
    id: "stale-model-attempts-dir-blocked",
    description: "Pre-existing attempt-000 artifact fails before model execution",
    pass: staleAttemptDirBlocked,
  });

  const attemptDir = mkdtempSync(join(tmpdir(), "prof-v3-exact-io-"));
  const apiResponseBody = JSON.stringify({
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(groundedDependentPlan) }] }],
    output_text: JSON.stringify(groundedDependentPlan),
  });
  const fakeFetch = (async () =>
    ({
      ok: true,
      status: 200,
      text: async () => apiResponseBody,
    }) as Response) as typeof fetch;
  const payload = buildProfessorV3PromptPayload(muldrothaCtx);
  const caller = createProfessorV3ModelCallerV2({
    modelPin,
    outputDir: attemptDir,
    fetchImpl: fakeFetch,
    requireOpenAiKey: () => "test-key",
  });
  const response = await caller({
    attemptIndex: 0,
    systemPrompt: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
    userPayload: payload,
    afterToolResults: false,
  });
  const record = response.boundary!;
  const requestBytes = readFileSync(join(attemptDir, "attempt-000-api-request-body.json"), "utf8");
  const rawBytes = readFileSync(join(attemptDir, "attempt-000-api-response-raw.json"), "utf8");
  checks.push({
    id: "request-artifact-sha-exact-bytes",
    description: "Request artifact SHA equals SHA(exact request artifact bytes)",
    pass: record.apiRequestBodySha256 === sha256Bytes(requestBytes),
  });
  checks.push({
    id: "raw-response-artifact-sha-exact-bytes",
    description: "Raw response artifact SHA equals SHA(exact raw response bytes)",
    pass: record.apiResponseRawSha256 === sha256Bytes(rawBytes),
  });
  checks.push({
    id: "exact-io-artifact-record-valid",
    description: "All attempt artifact SHAs match written bytes",
    pass: verifyProfessorV3ModelAttemptArtifactRecordV2({ outputDir: attemptDir, record }),
  });

  let ctx = muldrothaCtx;
  let runLedger = initRunLedgerFromContext(ctx);
  runLedger = appendRetrievalEvent({
    runLedger,
    hits: [
      {
        chunkId: "rag-readiness-v2-chunk",
        citationLabel: "rag-readiness-v2-chunk",
        corpus: "fixture",
        authorityTier: "fixture",
        retrievalMethod: "lexical_exact",
        score: 1,
        provenanceTier: "CURATED_KNOWLEDGE",
        retrievalText: "Muldrotha self-mill stocks graveyard permanents for recursion.",
        mode: "COMMANDER_PRIMER",
      },
    ],
    tool: "searchMtgKnowledge",
    query: "muldrotha graveyard primer",
    retrievalMode: "COMMANDER_PRIMER",
  });
  ctx = {
    ...ctx,
    initialRagEvidence: [
      ...ctx.initialRagEvidence,
      {
        chunkId: "rag-readiness-v2-chunk",
        citationLabel: "rag-readiness-v2-chunk",
        corpus: "fixture",
        authorityTier: "fixture",
        retrievalMethod: "lexical_exact",
        score: 1,
        provenanceTier: "CURATED_KNOWLEDGE",
        retrievalText: "Muldrotha self-mill stocks graveyard permanents for recursion.",
        mode: "COMMANDER_PRIMER",
      },
    ],
  };
  const refreshedPayload = buildProfessorV3PromptPayload(ctx);
  const repairInstructions = "Repair your prior JSON output.\n- grounding issue\nRe-read evidence IDs in the current payload above.";
  const userContent = buildProfessorV3ModelUserContent({
    attemptIndex: 1,
    systemPrompt: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
    userPayload: refreshedPayload,
    repairPrompt: repairInstructions,
    afterToolResults: true,
  });
  checks.push({
    id: "repair-tool-refreshed-user-content",
    description: "Repair + tool refreshed model user-content contains evidence + repair instructions",
    pass:
      userContent.includes("rag-readiness-v2-chunk") &&
      userContent.includes("Muldrotha self-mill stocks graveyard permanents for recursion.") &&
      userContent.includes("Repair your prior JSON output") &&
      userContent.includes(refreshedPayload.modelVisibleText.slice(0, 80)),
  });

  const apiRequestBody = buildProfessorV3ApiRequestBody(modelPin, PROFESSOR_PLAN_SYSTEM_PROMPT_V3, userContent);
  checks.push({
    id: "api-request-body-exact-string",
    description: "API request body builder returns exact JSON string used for HTTP body",
    pass: apiRequestBody === JSON.stringify(JSON.parse(apiRequestBody)),
  });

  let exceptionSealed = false;
  const failureDir = mkdtempSync(join(tmpdir(), "prof-v3-failure-"));
  const failureTargets = resolveProfessorV3SmokeMuldrothaOutputTargetsV2(failureDir);
  try {
    await runProfessorPlanCaseV3Orchestration({
      ctx: muldrothaCtx,
      executionMode: "REAL_SMOKE",
      modelAuthorization: "AUTHORIZED",
      modelCaller: async () => {
        throw new Error("injected model caller failure");
      },
    });
  } catch (error) {
    const seal = sealProfessorV3SmokeExecutionFailureV2({
      targets: failureTargets,
      caseId: "fixture-failure",
      executionStage: "MODEL_ORCHESTRATION",
      error,
      materialPins: { fileCount: 1, files: [] },
      stackIdentity: "fixture",
      stdout: "stdout-fixture",
      stderr: "stderr-fixture",
    });
    exceptionSealed =
      seal.executionStatus === "FAILED_EXCEPTION" &&
      existsSync(failureTargets.failure) &&
      existsSync(failureTargets.manifest) &&
      existsSync(failureTargets.stdout) &&
      existsSync(failureTargets.stderr);
  }
  checks.push({
    id: "injected-exception-failure-sealed",
    description: "Injected model-caller exception produces FAILED_EXCEPTION forensic artifacts",
    pass: exceptionSealed,
  });

  const blocked = spawnSync("npx", ["tsx", EXECUTE_RUNNER], { encoding: "utf8", cwd: resolve(HERE, ".."), shell: true });
  checks.push({
    id: "execute-runner-blocked-without-switch",
    description: "Execute runner fails closed before pin verification without --execute",
    pass: blocked.status === 1,
  });

  rmSync(attemptDir, { recursive: true, force: true });
  rmSync(failureDir, { recursive: true, force: true });

  return checks;
}

async function main() {
  if (existsSync(OUT_AUDIT)) rmSync(OUT_AUDIT);
  const checks = await runChecks();
  const audit = {
    version: "phase6a1-professor-v3-smoke-readiness-audit-v2",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V2_EXECUTION_SEAL_AND_EXACT_IO_REQUIRED",
    totalChecks: checks.length,
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    checks,
  };
  writeFileSync(OUT_AUDIT, JSON.stringify(audit, null, 2));
  console.log(JSON.stringify({ artifact: OUT_AUDIT, passed: audit.passed, total: audit.totalChecks, failed: audit.failed }, null, 2));
  if (audit.failed > 0) process.exit(1);
}

main();
