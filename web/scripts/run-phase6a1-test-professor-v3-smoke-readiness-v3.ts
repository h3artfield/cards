#!/usr/bin/env npx tsx
/** No-model smoke-readiness v3 checks — execution identity, staged IO, failure boundary. */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runProfessorPlanCaseV3Orchestration,
  type ProfessorV3OrchestrationProgressV3,
} from "./lib/phase6a1-professor-plan-agent-v3";
import { buildMuldrothaProfessorContextV3ZeroAffordances } from "./lib/phase6a1-professor-v3-grounding-fixtures-v1";
import { castFromGraveyardAssertion, mechanismRef } from "./lib/phase6a1-professor-v3-fixture-assertions-v1";
import { MULDROTHA_CAST_FACT, MULDROTHA_LAND_FACT } from "./lib/phase6a1-professor-v3-grounding-fixtures-v1";
import {
  buildProfessorV3ApiRequestBody,
  buildProfessorV3ModelUserContent,
  createProfessorV3ModelCallerV3,
} from "./lib/phase6a1-professor-v3-model-caller-v3";
import {
  verifyProfessorV3ModelAttemptArtifactRecordV3,
  verifyProfessorV3ModelAttemptRawResponsePreservedV3,
  verifyProfessorV3ModelAttemptRequestPreservedV3,
} from "./lib/phase6a1-professor-v3-model-attempt-artifacts-v3";
import { buildProfessorV3PromptPayload } from "./lib/phase6a1-professor-v3-prompt-payload-v1";
import { appendRetrievalEvent, initRunLedgerFromContext } from "../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import {
  assertProfessorV3SmokeExecutionIdentityV3,
  computeDependencyManifestSha256,
  computeProfessorV3SmokeMaterialPins,
  loadProfessorV3ReviewedExecutionIdentityV3,
  loadProfessorV3SmokeExecutionPinsV3,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH,
  PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V3,
  sealProfessorV3SmokeExecutionPinsV3,
  sha256Bytes,
  verifyProfessorV3SmokeExecutionIdentityV3,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";
import { sealProfessorV3SmokeExecutionFailureV3 } from "./lib/phase6a1-professor-v3-smoke-failure-seal-v3";
import {
  assertProfessorV3SmokeOutputsAbsentV2,
  preflightProfessorV3SmokeOutputsAbsentV2,
  resolveProfessorV3SmokeMuldrothaOutputTargetsV2,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v2";
import { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 } from "./lib/phase6a1-professor-plan-prompt-v3";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const EXECUTE_RUNNER = resolve(HERE, "run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts");
const OUT_AUDIT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-audit-v3.json");

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
  const reviewedIdentity = loadProfessorV3ReviewedExecutionIdentityV3();

  checks.push({
    id: "reviewed-execution-identity-pass",
    description: "Reviewed execution identity artifact matches runner, pins artifact, and dependency manifest",
    pass: assertProfessorV3SmokeExecutionIdentityV3().ok,
  });

  let coordinatedDriftFailed = false;
  const driftTmp = mkdtempSync(join(tmpdir(), "prof-v3-coordinated-drift-"));
  const driftPinsPath = join(driftTmp, "coordinated-drift-pins.json");
  const probe = PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V3.find((s) => s.label === "phase6a1-professor-v3-model-caller-v3")!;
  const mutatedPath = join(driftTmp, "mutated-model-caller.ts");
  cpSync(probe.path, mutatedPath);
  writeFileSync(mutatedPath, `${readFileSync(mutatedPath, "utf8")}// coordinated drift\n`);
  const mutatedSources = PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V3.map((s) =>
    s.label === probe.label ? { ...s, path: mutatedPath } : s,
  );
  const driftPins = sealProfessorV3SmokeExecutionPinsV3({ sources: mutatedSources });
  writeFileSync(driftPinsPath, JSON.stringify(driftPins, null, 2));
  coordinatedDriftFailed = !verifyProfessorV3SmokeExecutionIdentityV3({
    pinsPath: driftPinsPath,
    sources: mutatedSources,
    identity: reviewedIdentity,
  }).ok;
  checks.push({
    id: "coordinated-source-and-pins-drift-fails",
    description: "Coordinated source + local pins JSON drift still fails against reviewed identity artifact",
    pass: coordinatedDriftFailed,
  });

  const targets = resolveProfessorV3SmokeMuldrothaOutputTargetsV2(MILESTONES);
  checks.push({
    id: "smoke-output-targets-absent",
    description: "Real smoke write-once output targets absent before execution",
    pass: preflightProfessorV3SmokeOutputsAbsentV2(targets).length === 0,
  });

  const attemptDir = mkdtempSync(join(tmpdir(), "prof-v3-exact-io-"));
  const successResponseBody = JSON.stringify({
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(groundedDependentPlan) }] }],
    output_text: JSON.stringify(groundedDependentPlan),
  });
  const payload = buildProfessorV3PromptPayload(muldrothaCtx);
  const successCaller = createProfessorV3ModelCallerV3({
    modelPin,
    outputDir: attemptDir,
    fetchImpl: (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => successResponseBody,
      }) as Response) as typeof fetch,
    requireOpenAiKey: () => "test-key",
  });
  const successResponse = await successCaller({
    attemptIndex: 0,
    systemPrompt: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
    userPayload: payload,
    afterToolResults: false,
  });
  const successRecord = successResponse.boundary!;
  const requestBytes = readFileSync(join(attemptDir, "attempt-000-api-request-body.json"), "utf8");
  const rawBytes = readFileSync(join(attemptDir, "attempt-000-api-response-raw.json"), "utf8");
  checks.push({
    id: "request-artifact-sha-exact-bytes",
    description: "Request artifact SHA equals SHA(exact request artifact bytes)",
    pass: successRecord.apiRequestBodySha256 === sha256Bytes(requestBytes),
  });
  checks.push({
    id: "raw-response-artifact-sha-exact-bytes",
    description: "Raw response artifact SHA equals SHA(exact raw response bytes)",
    pass: successRecord.apiResponseRawSha256 === sha256Bytes(rawBytes),
  });
  checks.push({
    id: "exact-io-artifact-record-valid",
    description: "All success-path attempt artifact SHAs match written bytes",
    pass: verifyProfessorV3ModelAttemptArtifactRecordV3({ outputDir: attemptDir, record: successRecord }),
  });

  const http500Dir = mkdtempSync(join(tmpdir(), "prof-v3-http500-"));
  let http500Request: ReturnType<typeof verifyProfessorV3ModelAttemptRequestPreservedV3> extends boolean ? never : any;
  let http500Response: any;
  const http500Caller = createProfessorV3ModelCallerV3({
    modelPin,
    outputDir: http500Dir,
    fetchImpl: (async () =>
      ({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        text: async () => "upstream exploded",
      }) as Response) as typeof fetch,
    requireOpenAiKey: () => "test-key",
    onAttemptRequest: (record) => {
      http500Request = record;
    },
    onAttemptResponse: (record) => {
      http500Response = record;
    },
  });
  let http500Failed = false;
  try {
    await http500Caller({
      attemptIndex: 0,
      systemPrompt: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
      userPayload: payload,
      afterToolResults: false,
    });
  } catch {
    http500Failed = true;
  }
  checks.push({
    id: "http500-request-preserved-before-throw",
    description: "Fake HTTP 500 preserves outgoing request before throw",
    pass:
      http500Failed &&
      Boolean(http500Request) &&
      verifyProfessorV3ModelAttemptRequestPreservedV3({ outputDir: http500Dir, record: http500Request }),
  });
  checks.push({
    id: "http500-raw-response-preserved-before-throw",
    description: "Fake HTTP 500 preserves raw response body before throw",
    pass:
      http500Failed &&
      Boolean(http500Response) &&
      verifyProfessorV3ModelAttemptRawResponsePreservedV3({ outputDir: http500Dir, record: http500Response }) &&
      readFileSync(join(http500Dir, "attempt-000-api-response-raw.json"), "utf8") === "upstream exploded",
  });

  const malformedApiDir = mkdtempSync(join(tmpdir(), "prof-v3-malformed-api-"));
  let malformedApiResponse: any;
  const malformedApiCaller = createProfessorV3ModelCallerV3({
    modelPin,
    outputDir: malformedApiDir,
    fetchImpl: (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "{not-json",
      }) as Response) as typeof fetch,
    requireOpenAiKey: () => "test-key",
    onAttemptResponse: (record) => {
      malformedApiResponse = record;
    },
  });
  let malformedApiFailed = false;
  try {
    await malformedApiCaller({
      attemptIndex: 0,
      systemPrompt: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
      userPayload: payload,
      afterToolResults: false,
    });
  } catch {
    malformedApiFailed = true;
  }
  checks.push({
    id: "malformed-api-json-raw-preserved",
    description: "Malformed API JSON preserves raw body before parse failure",
    pass:
      malformedApiFailed &&
      verifyProfessorV3ModelAttemptRawResponsePreservedV3({ outputDir: malformedApiDir, record: malformedApiResponse }) &&
      readFileSync(join(malformedApiDir, "attempt-000-api-response-raw.json"), "utf8") === "{not-json",
  });

  const malformedProfessorDir = mkdtempSync(join(tmpdir(), "prof-v3-malformed-professor-"));
  let malformedProfessorResponse: any;
  const malformedProfessorCaller = createProfessorV3ModelCallerV3({
    modelPin,
    outputDir: malformedProfessorDir,
    fetchImpl: (async () =>
      ({
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: "not professor json" }] }],
            output_text: "not professor json",
          }),
      }) as Response) as typeof fetch,
    requireOpenAiKey: () => "test-key",
    onAttemptResponse: (record) => {
      malformedProfessorResponse = record;
    },
  });
  let malformedProfessorFailed = false;
  try {
    await malformedProfessorCaller({
      attemptIndex: 0,
      systemPrompt: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
      userPayload: payload,
      afterToolResults: false,
    });
  } catch {
    malformedProfessorFailed = true;
  }
  checks.push({
    id: "malformed-professor-json-raw-preserved",
    description: "Malformed Professor output preserves API/raw text before parse failure",
    pass:
      malformedProfessorFailed &&
      verifyProfessorV3ModelAttemptRawResponsePreservedV3({
        outputDir: malformedProfessorDir,
        record: malformedProfessorResponse,
      }) &&
      readFileSync(join(malformedProfessorDir, "attempt-000-api-response-raw.json"), "utf8").includes("not professor json"),
  });

  let retrievalProgress: ProfessorV3OrchestrationProgressV3 | null = null;
  let retrievalOrchestrationCalls = 0;
  try {
    await runProfessorPlanCaseV3Orchestration({
      ctx: muldrothaCtx,
      executionMode: "REAL_SMOKE",
      modelAuthorization: "AUTHORIZED",
      modelCaller: async () => {
        retrievalOrchestrationCalls += 1;
        throw new Error("injected retrieval-stage model failure");
      },
      onProgress: (progress) => {
        retrievalProgress = progress;
      },
    });
  } catch {
    /* expected */
  }
  checks.push({
    id: "thrown-orchestration-progress-preserves-ledger-and-trace",
    description: "Thrown orchestration preserves latest run ledger + execution trace via onProgress",
    pass:
      retrievalOrchestrationCalls === 1 &&
      Boolean(retrievalProgress?.runLedger) &&
      Boolean(retrievalProgress?.executionTrace) &&
      retrievalProgress!.executionStage.length > 0,
  });

  let exceptionSealed = false;
  const failureDir = mkdtempSync(join(tmpdir(), "prof-v3-failure-"));
  const failureTargets = resolveProfessorV3SmokeMuldrothaOutputTargetsV2(failureDir);
  let latestProgress: ProfessorV3OrchestrationProgressV3 | null = null;
  try {
    await runProfessorPlanCaseV3Orchestration({
      ctx: muldrothaCtx,
      executionMode: "REAL_SMOKE",
      modelAuthorization: "AUTHORIZED",
      modelCaller: async () => {
        throw new Error("injected model caller failure");
      },
      onProgress: (progress) => {
        latestProgress = progress;
      },
    });
  } catch (error) {
    const seal = sealProfessorV3SmokeExecutionFailureV3({
      targets: failureTargets,
      caseId: "fixture-failure",
      executionStage: latestProgress?.executionStage ?? "MODEL_ORCHESTRATION",
      error,
      materialPins: { fileCount: 1, files: [] },
      stackIdentity: reviewedIdentity.stackIdentity,
      reviewedExecutionIdentity: reviewedIdentity,
      executionTrace: latestProgress?.executionTrace ?? null,
      runLedger: latestProgress?.runLedger ?? null,
      stdout: "stdout-fixture",
      stderr: "stderr-fixture",
    });
    exceptionSealed =
      seal.executionStatus === "FAILED_EXCEPTION" &&
      existsSync(failureTargets.failure) &&
      existsSync(failureTargets.result) &&
      existsSync(failureTargets.manifest) &&
      existsSync(failureTargets.stdout) &&
      existsSync(failureTargets.stderr) &&
      Boolean(seal.runLedger) &&
      Boolean(seal.executionTrace);
  }
  checks.push({
    id: "injected-exception-failure-sealed-with-trace",
    description: "Injected model-caller exception produces FAILED_EXCEPTION seal with ledger + trace",
    pass: exceptionSealed,
  });

  const blocked = spawnSync("npx", ["tsx", EXECUTE_RUNNER], { encoding: "utf8", cwd: resolve(HERE, ".."), shell: true });
  checks.push({
    id: "execute-runner-blocked-without-switch",
    description: "Execute runner fails closed before identity verification without --execute",
    pass: blocked.status === 1,
  });

  checks.push({
    id: "reviewed-pin-set-includes-rag-and-semantic-source",
    description: "Reviewed pin set includes semantic relationship source and mtg-knowledge-service",
    pass: (() => {
      const pins = loadProfessorV3SmokeExecutionPinsV3(PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH);
      const labels = new Set(pins.files.map((f) => f.label));
      return labels.has("phase6a1-professor-v3-semantic-relationship-source-v1") && labels.has("mtg-knowledge-service");
    })(),
  });

  rmSync(attemptDir, { recursive: true, force: true });
  rmSync(http500Dir, { recursive: true, force: true });
  rmSync(malformedApiDir, { recursive: true, force: true });
  rmSync(malformedProfessorDir, { recursive: true, force: true });
  rmSync(failureDir, { recursive: true, force: true });
  rmSync(driftTmp, { recursive: true, force: true });

  return checks;
}

async function main() {
  if (existsSync(OUT_AUDIT)) rmSync(OUT_AUDIT);
  const checks = await runChecks();
  const audit = {
    version: "phase6a1-professor-v3-smoke-readiness-audit-v3",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V3_PIN_ROOT_AND_FAILURE_BOUNDARY_REQUIRED",
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
