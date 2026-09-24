#!/usr/bin/env npx tsx
/** No-model smoke-readiness v4 checks — initial RAG, authorization root, partial failure seal. */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runProfessorPlanCaseV3Orchestration,
  type ProfessorV3OrchestrationProgressV3,
} from "./lib/phase6a1-professor-plan-agent-v3";
import { buildProfessorPlanningContextV3 } from "./lib/phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import { createProfessorV3ModelCallerV3 } from "./lib/phase6a1-professor-v3-model-caller-v3";
import { verifyProfessorV3ModelAttemptRawResponsePreservedV3 } from "./lib/phase6a1-professor-v3-model-attempt-artifacts-v3";
import { buildProfessorV3PromptPayload } from "./lib/phase6a1-professor-v3-prompt-payload-v1";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import { PROFESSOR_PLAN_SYSTEM_PROMPT_V3 } from "./lib/phase6a1-professor-plan-prompt-v3";
import { PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V4 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v4";
import {
  assertProfessorV3SmokeExecutionPreflightV4,
  loadProfessorV3ReviewedExecutionIdentityV3,
  PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V3_PATH,
  PROFESSOR_V3_SMOKE_EXECUTION_PINS_V3_PATH,
  PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V3,
  sealProfessorV3SmokeExecutionPinsV3,
  sha256Bytes,
  verifyProfessorV3SmokeExecutionAuthorizationV4,
} from "./lib/phase6a1-professor-v3-smoke-material-pins-v3";
import {
  enumerateProfessorV3PartialModelAttemptFilesV4,
  sealProfessorV3SmokeExecutionFailureV4,
} from "./lib/phase6a1-professor-v3-smoke-failure-seal-v4";
import {
  preflightProfessorV3SmokeOutputsAbsentV2,
  resolveProfessorV3SmokeMuldrothaOutputTargetsV2,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v2";
import { initRunLedgerFromContext } from "../src/lib/deck-synthesis/professor-v3-run-ledger-v1";
import { MILESTONES, sha256File } from "./lib/phase6a1-pinned-implementation-container-v1";
import type { MtgKnowledgeEvidence } from "../src/lib/deck-intelligence/mtg-knowledge-service";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const EXECUTE_RUNNER = resolve(HERE, "run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts");
const OUT_AUDIT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-audit-v4.json");
const MECHANISM_TRUTH_CASE_ID = "multi-muldrotha";

const MULDROTHA_CAST_FACT = "muldrotha-cast-permanents-from-graveyard";

const groundedDependentPlan = {
  strategyHypotheses: [
    {
      hypothesisId: "dep",
      title: "Dep",
      strategicClaim: "Muldrotha casts permanents from graveyard",
      causalReasoning: "Commander grants cast permission",
      evidenceRefs: [{ kind: "MECHANISM", mechanismIds: [MULDROTHA_CAST_FACT] }],
      strategicAssertions: [
        {
          assertionId: "a2",
          packageId: "p2",
          predicate: "CAST_FROM_GRAVEYARD",
          action: { type: "CAST", fromZone: "GRAVEYARD" },
          evidenceRefs: [{ kind: "MECHANISM", mechanismIds: [MULDROTHA_CAST_FACT] }],
        },
      ],
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
          evidenceRefs: [{ kind: "MECHANISM", mechanismIds: [MULDROTHA_CAST_FACT] }],
        },
      ],
      relationships: [],
    },
  ],
};

const fixtureInitialHits: MtgKnowledgeEvidence[] = [
  {
    chunkId: "smoke-initial-commander-primer-chunk",
    corpus: "commander_primer",
    authorityTier: "fixture",
    citationLabel: "smoke-initial-commander-primer-chunk",
    retrievalMethod: "lexical_exact",
    score: 1,
    provenanceTier: "CURATED_KNOWLEDGE",
    retrievalText: "Muldrotha self-mill stocks graveyard permanents for recursion.",
  },
  {
    chunkId: "smoke-initial-package-chunk",
    corpus: "deckbuilding_package",
    authorityTier: "fixture",
    citationLabel: "smoke-initial-package-chunk",
    retrievalMethod: "lexical_exact",
    score: 1,
    provenanceTier: "CURATED_KNOWLEDGE",
    retrievalText: "Graveyard packages for Muldrotha include self-mill and sacrifice outlets.",
  },
];

type Check = { id: string; description: string; pass: boolean; detail?: string };

async function runChecks(): Promise<Check[]> {
  const checks: Check[] = [];
  const modelPin = loadProfessorModelPinV2();
  const reviewedIdentity = loadProfessorV3ReviewedExecutionIdentityV3();
  const entry = getPilotMechanismCatalogEntry(MECHANISM_TRUTH_CASE_ID);
  if (!entry) throw new Error("Missing Muldrotha mechanism truth entry");

  checks.push({
    id: "independent-authorization-preflight-pass",
    description: "Independent authorization root + identity + pins preflight PASS",
    pass: assertProfessorV3SmokeExecutionPreflightV4().ok,
  });

  let coordinatedDriftFailed = false;
  const driftTmp = mkdtempSync(join(tmpdir(), "prof-v3-coordinated-drift-v4-"));
  const driftPinsPath = join(driftTmp, "coordinated-drift-pins.json");
  const driftIdentityPath = join(driftTmp, "coordinated-drift-identity.json");
  const probe = PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V3.find((s) => s.label === "phase6a1-professor-v3-model-caller-v3")!;
  const mutatedPath = join(driftTmp, "mutated-model-caller.ts");
  cpSync(probe.path, mutatedPath);
  writeFileSync(mutatedPath, `${readFileSync(mutatedPath, "utf8")}// coordinated drift v4\n`);
  const mutatedSources = PROFESSOR_V3_SMOKE_MATERIAL_SOURCES_V3.map((s) =>
    s.label === probe.label ? { ...s, path: mutatedPath } : s,
  );
  const driftPins = sealProfessorV3SmokeExecutionPinsV3({ sources: mutatedSources });
  writeFileSync(driftPinsPath, JSON.stringify(driftPins, null, 2));
  const driftIdentity = {
    ...reviewedIdentity,
    executeRunnerSha256: sha256File(resolve(HERE, "run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts")),
    executionPinsArtifactSha256: sha256File(driftPinsPath),
    dependencyManifestSha256: driftPins.dependencyManifestSha256,
  };
  writeFileSync(driftIdentityPath, JSON.stringify(driftIdentity, null, 2));
  coordinatedDriftFailed = !verifyProfessorV3SmokeExecutionAuthorizationV4({
    identityPath: driftIdentityPath,
    pinsPath: driftPinsPath,
  }).ok;
  checks.push({
    id: "coordinated-source-pins-identity-drift-fails",
    description: "Coordinated source + pins + identity drift fails against independent authorization root",
    pass: coordinatedDriftFailed,
  });

  const ctxWithInitialRag = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: {
      includeMechanicalAffordances: true,
      searchMtgKnowledgeImpl: async (req) => ({
        hits:
          req.mode === "COMMANDER_PRIMER"
            ? fixtureInitialHits.filter((hit) => hit.chunkId.includes("commander-primer"))
            : req.mode === "PACKAGE"
              ? fixtureInitialHits.filter((hit) => hit.chunkId.includes("package"))
              : [],
      }),
    },
  });
  const initialPayload = buildProfessorV3PromptPayload(ctxWithInitialRag);
  checks.push({
    id: "first-smoke-payload-has-initial-rag-evidence",
    description: "First real-smoke model payload contains non-empty initial RAG evidence before tool calls",
    pass:
      ctxWithInitialRag.initialRagEvidence.length > 0 &&
      initialPayload.modelVisibleText.includes("smoke-initial-commander-primer-chunk") &&
      initialPayload.modelVisibleText.includes("Muldrotha self-mill stocks graveyard permanents for recursion."),
  });

  const runLedger = initRunLedgerFromContext(ctxWithInitialRag);
  const primerQuery = `${entry.commanders[0]} commander strategy enablers payoffs`;
  const packageQuery = `${entry.commanders.join(" ")} deckbuilding packages synergy`;
  const primerEvent = runLedger.retrievalEvents.find((event) => event.retrievalMode === "COMMANDER_PRIMER");
  const packageEvent = runLedger.retrievalEvents.find((event) => event.retrievalMode === "PACKAGE");
  const primerObject = runLedger.evidenceObjects.find((obj) => obj.evidenceId === "smoke-initial-commander-primer-chunk");
  checks.push({
    id: "initial-retrieval-provenance-preserved",
    description: "Initial retrieval provenance preserved in run ledger with query/mode/content SHA",
    pass:
      Boolean(primerEvent) &&
      primerEvent!.query === primerQuery &&
      primerEvent!.returnedEvidenceIds.includes("smoke-initial-commander-primer-chunk") &&
      Boolean(packageEvent) &&
      packageEvent!.query === packageQuery &&
      packageEvent!.returnedEvidenceIds.includes("smoke-initial-package-chunk") &&
      Boolean(primerObject) &&
      primerObject!.contentSha256 === sha256Bytes(fixtureInitialHits[0].retrievalText),
  });

  const payload = buildProfessorV3PromptPayload(ctxWithInitialRag);
  const sealPartial = async (fetchImpl: typeof fetch, expectSubstring: string) => {
    const attemptDir = mkdtempSync(join(tmpdir(), "prof-v3-partial-seal-"));
    const failureDir = mkdtempSync(join(tmpdir(), "prof-v3-partial-failure-"));
    const failureTargets = resolveProfessorV3SmokeMuldrothaOutputTargetsV2(failureDir);
    failureTargets.modelAttemptsDir = attemptDir;
    mkdirSync(attemptDir, { recursive: true });
    const caller = createProfessorV3ModelCallerV3({
      modelPin,
      outputDir: attemptDir,
      fetchImpl,
      requireOpenAiKey: () => "test-key",
    });
    let sealed = false;
    try {
      await caller({
        attemptIndex: 0,
        systemPrompt: PROFESSOR_PLAN_SYSTEM_PROMPT_V3,
        userPayload: payload,
        afterToolResults: false,
      });
    } catch (error) {
      const seal = sealProfessorV3SmokeExecutionFailureV4({
        targets: failureTargets,
        caseId: "fixture-partial-seal",
        executionStage: "MODEL_ORCHESTRATION",
        error,
        materialPins: { fileCount: 0, files: [] },
        stackIdentity: reviewedIdentity.stackIdentity,
        independentlyReviewedExecutionAuthorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V4,
        reviewedExecutionIdentity: reviewedIdentity,
      });
      const manifest = JSON.parse(readFileSync(failureTargets.manifest, "utf8")) as {
        partialModelAttemptFiles: Array<{ path: string; sha256: string }>;
      };
      const enumerated = enumerateProfessorV3PartialModelAttemptFilesV4(attemptDir);
      sealed =
        seal.partialModelAttemptFiles.length > 0 &&
        manifest.partialModelAttemptFiles.length > 0 &&
        enumerated.some((file) => file.sha256 === sha256Bytes(readFileSync(join(attemptDir, file.path), "utf8"))) &&
        enumerated.some((file) => readFileSync(join(attemptDir, file.path), "utf8").includes(expectSubstring));
    }
    rmSync(attemptDir, { recursive: true, force: true });
    rmSync(failureDir, { recursive: true, force: true });
    return sealed;
  };

  checks.push({
    id: "http500-partial-files-sealed",
    description: "HTTP 500 partial attempt files included in failure manifest with exact SHAs",
    pass: await sealPartial(
      (async () =>
        ({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: async () => "upstream exploded",
        }) as Response) as typeof fetch,
      "upstream exploded",
    ),
  });

  checks.push({
    id: "malformed-api-json-partial-files-sealed",
    description: "Malformed API JSON partial files sealed in failure manifest",
    pass: await sealPartial(
      (async () =>
        ({
          ok: true,
          status: 200,
          statusText: "OK",
          text: async () => "{not-json",
        }) as Response) as typeof fetch,
      "{not-json",
    ),
  });

  checks.push({
    id: "malformed-professor-json-partial-files-sealed",
    description: "Malformed Professor JSON partial files sealed in failure manifest",
    pass: await sealPartial(
      (async () =>
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
      "not professor json",
    ),
  });

  let initialRetrievalModelCalls = 0;
  let initialRetrievalSealed = false;
  const retrievalFailureDir = mkdtempSync(join(tmpdir(), "prof-v3-initial-rag-failure-"));
  const retrievalFailureTargets = resolveProfessorV3SmokeMuldrothaOutputTargetsV2(retrievalFailureDir);
  try {
    const failureCtx = await buildProfessorPlanningContextV3({
      entry,
      oppCase: null,
      options: {
        includeMechanicalAffordances: true,
        searchMtgKnowledgeImpl: async () => {
          throw new Error("injected initial retrieval failure");
        },
      },
    });
    await runProfessorPlanCaseV3Orchestration({
      ctx: failureCtx,
      executionMode: "REAL_SMOKE",
      modelAuthorization: "AUTHORIZED",
      modelCaller: async () => {
        initialRetrievalModelCalls += 1;
        return { parsed: groundedDependentPlan };
      },
    });
  } catch (error) {
    const seal = sealProfessorV3SmokeExecutionFailureV4({
      targets: retrievalFailureTargets,
      caseId: "fixture-initial-rag-failure",
      executionStage: "INITIAL_CONTEXT",
      error,
      materialPins: { fileCount: 0, files: [] },
      stackIdentity: reviewedIdentity.stackIdentity,
      independentlyReviewedExecutionAuthorization: PROFESSOR_V3_INDEPENDENTLY_REVIEWED_EXECUTION_AUTHORIZATION_V4,
      reviewedExecutionIdentity: reviewedIdentity,
      stdout: "stdout-fixture",
      stderr: "stderr-fixture",
    });
    initialRetrievalSealed =
      seal.executionStatus === "FAILED_EXCEPTION" &&
      existsSync(retrievalFailureTargets.failure) &&
      existsSync(retrievalFailureTargets.manifest) &&
      existsSync(retrievalFailureTargets.result);
  }
  checks.push({
    id: "injected-initial-rag-failure-sealed-zero-model-requests",
    description: "Injected initial RAG retrieval failure produces FAILED_EXCEPTION with zero Professor model requests",
    pass: initialRetrievalSealed && initialRetrievalModelCalls === 0,
  });

  checks.push({
    id: "smoke-output-targets-absent",
    description: "Real smoke write-once output targets absent before execution",
    pass: preflightProfessorV3SmokeOutputsAbsentV2(resolveProfessorV3SmokeMuldrothaOutputTargetsV2(MILESTONES)).length === 0,
  });

  const blocked = spawnSync("npx", ["tsx", EXECUTE_RUNNER], { encoding: "utf8", cwd: resolve(HERE, ".."), shell: true });
  checks.push({
    id: "execute-runner-blocked-without-switch",
    description: "Execute runner fails closed before authorization verification without --execute",
    pass: blocked.status === 1,
  });

  rmSync(driftTmp, { recursive: true, force: true });
  rmSync(retrievalFailureDir, { recursive: true, force: true });

  return checks;
}

async function main() {
  if (existsSync(OUT_AUDIT)) rmSync(OUT_AUDIT);
  const checks = await runChecks();
  const audit = {
    version: "phase6a1-professor-v3-smoke-readiness-audit-v4",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_FROZEN_SMOKE_READINESS_BLOCK_V4_INITIAL_RAG_AND_FAILURE_SEAL_CLOSURE_REQUIRED",
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
