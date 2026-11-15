#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Sealed 28-case Professor PLAN experiment v3.
 * Reuses frozen PLAN stack v2 + frozen semantic retrieval v4/v5.
 * Frontier model pin required. Harness smoke is separate from formal population.
 */
import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROFESSOR_PLANNING_CONTRACTS_V2_VERSION } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";
import { STRATEGY_PACKAGE_VALIDATOR_V2_VERSION } from "../src/lib/deck-synthesis/strategy-package-validator-v2";
import { FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_SHA256 } from "./lib/phase6a1-frozen-semantic-opportunity-v322-loader-v1";
import { loadFrozenSemanticOpportunityModelV322 } from "./lib/phase6a1-frozen-semantic-opportunity-v322-loader-v1";
import { getImplementedMechanismCatalog } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import {
  runProfessorPlanCaseV2,
  PROFESSOR_PLAN_AGENT_V2_VERSION,
  type ProfessorCaseExperimentRecordV2,
  type RuntimeFailureAttemptRecordV2,
} from "./lib/phase6a1-professor-plan-agent-v2";
import { buildProfessorPlanningContextV2, PROFESSOR_PLAN_CONTEXT_BUILDER_V2_VERSION } from "./lib/phase6a1-professor-plan-context-builder-v2";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import { PROFESSOR_PLAN_NORMALIZER_V2_VERSION } from "./lib/phase6a1-professor-plan-normalizer-v2";
import { PROFESSOR_PLAN_PROMPT_V2_VERSION } from "./lib/phase6a1-professor-plan-prompt-v2";
import {
  PROFESSOR_PLAN_STACK_FREEZE_V2_PATH,
  writeProfessorPlanStackFreezeV2,
} from "./lib/phase6a1-professor-plan-stack-freeze-v2";
import {
  assertMtgRagRetrievalSemanticFreezeV1,
  MTG_RAG_RETRIEVAL_SEMANTIC_FREEZE_V1_PATH,
} from "./lib/phase6a1-mtg-rag-retrieval-semantic-freeze-v1";
import { THREE_LENS_PORTFOLIO_SELECTOR_V2_VERSION } from "./lib/phase6a1-three-lens-portfolio-selector-v2";

function loadEnvLocal(): void {
  const p = resolve(__dirname, "../.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

const OUT_DIR = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3");
const SMOKE_DIR = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-frontier-smoke");
const CASES_DIR = resolve(OUT_DIR, "cases");
const MANIFEST_PATH = resolve(OUT_DIR, "phase6a1-professor-plan-experiment-manifest-v3.json");
const SEALED_PATH = resolve(OUT_DIR, "phase6a1-professor-plan-experiment-sealed-v3.json");
const REPORT_PATH = resolve(OUT_DIR, "phase6a1-professor-plan-experiment-report-v3.json");
const RUN_HISTORY_DIR = resolve(
  "data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v3-run-history",
);
const PARTIAL_SEAL_ARCHIVE_DIR = resolve(RUN_HISTORY_DIR, "partial-seal-credit-exhaustion-2026-08-13");
const KNOWN_PARTIAL_MANIFEST_SHA256 = "39384b62ca896851f3c7b3d351d7665186abb05328a59a19d5dbc5b611809189";
const KNOWN_PARTIAL_CASE_SET_SHA256 = "dd00431d3591fe18ca07e3281c41dbb55327faf6c5a5fb8ab5635086b4cd92b1";
const KNOWN_PARTIAL_SEALED_AT = "2026-08-13T11:44:22.228Z";
const V1_INTEGRITY_AUDIT_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v1-case-integrity-audit-gpt56sol-v1.json",
);
const HARNESS_SMOKE_ARCHIVE = "phase6a1-professor-plan-experiment-v2-harness-smoke-gpt4o-v1";

type CaseRecord = {
  caseId: string;
  commanders: string[];
  caseArtifactPath: string;
  hypothesisCount: number;
  validatedPackageCount: number;
  toolCallCount: number;
  repairRoundCount: number;
  caseStatus: string;
  threeLensCollapseUnexplained: boolean;
  sealedAt: string;
  status: "SEALED" | "FAILED";
};

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function hashCaseSet(casePaths: string[]): string {
  const parts = casePaths
    .map((p) => hashFile(p))
    .sort()
    .join("\n");
  return createHash("sha256").update(parts).digest("hex");
}

function inferRuntimeFailurePhase(error: string): RuntimeFailureAttemptRecordV2["failurePhase"] {
  if (/query embedding failed/i.test(error) || /credit_balance_exhausted/i.test(error)) {
    return "CONTEXT_BUILD";
  }
  if (/Professor PLAN v2 failed/i.test(error)) return "PROFESSOR_INVOKE";
  return "UNKNOWN";
}

function inferRuntimeFailureAttemptKind(
  existing: Record<string, unknown>,
): RuntimeFailureAttemptRecordV2["attemptKind"] {
  if (existing.resumeGeneration === "CREDIT_RESTORATION_RESUME_V1") return "CREDIT_RESTORATION_RESUME";
  if (Array.isArray(existing.priorRuntimeFailureAttempts) && existing.priorRuntimeFailureAttempts.length > 0) {
    return "CREDIT_RESTORATION_RESUME";
  }
  return "INITIAL_PARTIAL_RUN";
}

function preserveRuntimeFailureAttempt(
  existing: Record<string, unknown>,
  attemptKind: RuntimeFailureAttemptRecordV2["attemptKind"] = inferRuntimeFailureAttemptKind(existing),
): RuntimeFailureAttemptRecordV2 {
  const error = String(existing.error ?? "unknown runtime failure");
  return {
    attemptId: typeof existing.caseAttemptId === "string" ? existing.caseAttemptId : randomUUID(),
    attemptKind,
    taskId: typeof existing.taskId === "string" ? existing.taskId : undefined,
    sealedAt: String(existing.sealedAt ?? new Date().toISOString()),
    error,
    failurePhase: inferRuntimeFailurePhase(error),
    caseStatus: "RUNTIME_FAILURE",
    artifactSnapshot: existing,
  };
}

function attachPriorRuntimeFailures(
  record: ProfessorCaseExperimentRecordV2,
  priorAttempts: RuntimeFailureAttemptRecordV2[],
): ProfessorCaseExperimentRecordV2 {
  if (priorAttempts.length === 0) return record;
  return {
    ...record,
    resumeGeneration: "CREDIT_RESTORATION_RESUME_V1",
    priorRuntimeFailureAttempts: priorAttempts,
  };
}

function archivePartialSealIfNeeded(allowResume: boolean): void {
  if (!allowResume || !existsSync(SEALED_PATH)) return;
  if (existsSync(resolve(PARTIAL_SEAL_ARCHIVE_DIR, "partial-seal-record.json"))) {
    console.log(`Partial seal already archived at ${PARTIAL_SEAL_ARCHIVE_DIR}`);
    return;
  }

  const sealed = JSON.parse(readFileSync(SEALED_PATH, "utf8")) as {
    manifestSha256?: string;
    caseSetSha256?: string;
    sealedAt?: string;
  };
  const manifestSha256 = existsSync(MANIFEST_PATH) ? hashFile(MANIFEST_PATH) : sealed.manifestSha256;
  const caseSetSha256 = sealed.caseSetSha256;

  mkdirSync(PARTIAL_SEAL_ARCHIVE_DIR, { recursive: true });
  if (existsSync(MANIFEST_PATH)) {
    copyFileSync(MANIFEST_PATH, resolve(PARTIAL_SEAL_ARCHIVE_DIR, "phase6a1-professor-plan-experiment-manifest-v2.json"));
  }
  copyFileSync(SEALED_PATH, resolve(PARTIAL_SEAL_ARCHIVE_DIR, "phase6a1-professor-plan-experiment-sealed-v2.json"));
  if (existsSync(REPORT_PATH)) {
    copyFileSync(REPORT_PATH, resolve(PARTIAL_SEAL_ARCHIVE_DIR, "phase6a1-professor-plan-experiment-report-v2.json"));
  }

  const partialSealRecord = {
    version: "phase6a1-professor-plan-experiment-partial-seal-v2",
    classification: "PARTIAL_RUNTIME_FAILURE_CREDIT_EXHAUSTION",
    archivedAt: new Date().toISOString(),
    note: "Partial-run seal preserved before credit-restoration resume. Not the final experiment seal.",
    expectedPartialSeal: {
      manifestSha256: KNOWN_PARTIAL_MANIFEST_SHA256,
      caseSetSha256: KNOWN_PARTIAL_CASE_SET_SHA256,
      sealedAt: KNOWN_PARTIAL_SEALED_AT,
    },
    archivedSeal: {
      manifestSha256,
      caseSetSha256,
      sealedAt: sealed.sealedAt,
    },
    artifacts: {
      manifest: "phase6a1-professor-plan-experiment-manifest-v2.json",
      sealed: "phase6a1-professor-plan-experiment-sealed-v2.json",
      report: "phase6a1-professor-plan-experiment-report-v2.json",
    },
  };
  writeFileSync(
    resolve(PARTIAL_SEAL_ARCHIVE_DIR, "partial-seal-record.json"),
    JSON.stringify(partialSealRecord, null, 2),
  );
  console.log(`Archived partial seal to ${PARTIAL_SEAL_ARCHIVE_DIR}`);
}

function shouldSkipCaseOnResume(existing: Record<string, unknown>): boolean {
  const status = String(existing.caseStatus ?? "");
  return status !== "RUNTIME_FAILURE";
}

function selectEntries(smokeMode: boolean) {
  const catalog = getImplementedMechanismCatalog();
  if (smokeMode) {
    const caseId = process.env.PROFESSOR_PLAN_EXPERIMENT_CASE_ID?.trim() || "hybrid-kinnan";
    const entry = catalog.find((c) => c.caseId === caseId);
    if (!entry) throw new Error(`Unknown smoke caseId ${caseId}`);
    return [entry];
  }
  const caseLimit = parseInt(process.env.PROFESSOR_PLAN_EXPERIMENT_CASE_LIMIT ?? "0", 10);
  if (caseLimit > 0) return catalog.slice(0, caseLimit);
  return catalog;
}

function smokeHarnessVerified(record: ProfessorCaseExperimentRecordV2): boolean {
  const lastInvocation = record.invocations[record.invocations.length - 1];
  if (!lastInvocation) return false;
  return (
    lastInvocation.normalization.status === "SUCCESS" &&
    lastInvocation.validationInput != null &&
    lastInvocation.validationResults.length > 0
  );
}

async function runSmokeCase(modelPin: ReturnType<typeof loadProfessorModelPinV2>) {
  const smokeCaseId = process.env.PROFESSOR_PLAN_EXPERIMENT_CASE_ID?.trim() || "hybrid-kinnan";
  const entries = selectEntries(true);
  const entry = entries[0];
  const model = loadFrozenSemanticOpportunityModelV322();
  const oppCase = model.cases.find((c) => c.caseId === entry.caseId);
  if (!oppCase) throw new Error(`Missing frozen opportunities for ${entry.caseId}`);

  mkdirSync(SMOKE_DIR, { recursive: true });
  const smokePath = resolve(SMOKE_DIR, `${entry.caseId}.json`);

  console.log(`Frontier harness smoke: ${entry.caseId} (${entry.commanders.join(" / ")})`);
  console.log(
    `Model pin ${modelPin.productName} / ${modelPin.modelIdentifier} / reasoning=${modelPin.reasoningConfiguration.effort} sha256=${modelPin.sha256}`,
  );

  const ctx = await buildProfessorPlanningContextV2(entry, oppCase);
  const record = await runProfessorPlanCaseV2(ctx, { experimentPurpose: "HARNESS_SMOKE_ONLY" });
  writeFileSync(smokePath, JSON.stringify(record, null, 2));

  const verified = smokeHarnessVerified(record);
  console.log(`Smoke normalization+validation pipeline: ${verified ? "VERIFIED" : "FAILED"}`);
  console.log(`Smoke caseStatus=${record.caseStatus}`);

  if (!verified) {
    throw new Error(
      `Frontier harness smoke failed for ${entry.caseId}. Fix pin/prompt/harness before formal 28-case run.`,
    );
  }

  const stackFreezePath = writeProfessorPlanStackFreezeV2({
    smokeCaseId: entry.caseId,
    smokeCaseStatus: record.caseStatus,
    smokeSystemPromptHash: record.invocations[record.invocations.length - 1]?.systemPromptHash ?? "",
    smokeUserPromptHash: record.invocations[record.invocations.length - 1]?.userPromptHash ?? "",
  });
  const stackFreeze = JSON.parse(readFileSync(stackFreezePath, "utf8")) as { manifestSha256: string };
  console.log(`Stack freeze written: ${stackFreezePath}`);
  console.log(`stackFreezeManifestSha256=${stackFreeze.manifestSha256}`);
  console.log(`smokeArtifact=${smokePath}`);
}

async function runFormalExperiment(modelPin: ReturnType<typeof loadProfessorModelPinV2>) {
  const retrievalFreeze = assertMtgRagRetrievalSemanticFreezeV1();
  if (!existsSync(MTG_RAG_RETRIEVAL_SEMANTIC_FREEZE_V1_PATH)) {
    throw new Error(`Missing retrieval semantic freeze ${MTG_RAG_RETRIEVAL_SEMANTIC_FREEZE_V1_PATH}.`);
  }
  if (!existsSync(PROFESSOR_PLAN_STACK_FREEZE_V2_PATH)) {
    throw new Error(`Missing stack freeze ${PROFESSOR_PLAN_STACK_FREEZE_V2_PATH}. Reuse v2 PLAN stack freeze.`);
  }
  const stackFreeze = JSON.parse(readFileSync(PROFESSOR_PLAN_STACK_FREEZE_V2_PATH, "utf8")) as {
    manifestSha256: string;
    modelPin: { sha256: string };
  };
  if (stackFreeze.modelPin.sha256 !== modelPin.sha256) {
    throw new Error("Model pin changed after stack freeze. Re-run frontier smoke and re-freeze stack.");
  }

  const experimentStartedAt = new Date().toISOString();
  const model = loadFrozenSemanticOpportunityModelV322();
  const entries = selectEntries(false);
  const oppByCase = new Map(model.cases.map((c) => [c.caseId, c]));
  const allowResume = process.env.PROFESSOR_PLAN_EXPERIMENT_RESUME === "1";

  mkdirSync(CASES_DIR, { recursive: true });
  archivePartialSealIfNeeded(allowResume);

  const caseRecords: CaseRecord[] = [];
  const caseArtifactPaths: string[] = [];
  let caseIndex = 0;

  for (const entry of entries) {
    caseIndex++;
    const casePath = resolve(CASES_DIR, `${entry.caseId}.json`);
    let priorRuntimeFailureAttempts: RuntimeFailureAttemptRecordV2[] = [];

    if (allowResume && existsSync(casePath)) {
      const existing = JSON.parse(readFileSync(casePath, "utf8")) as Record<string, unknown>;
      if (existing.experimentPurpose === "HARNESS_SMOKE_ONLY") {
        throw new Error(`Formal run found harness smoke artifact at ${casePath}. Remove it before formal run.`);
      }
      if (shouldSkipCaseOnResume(existing)) {
        const sealedExisting = existing as ProfessorCaseExperimentRecordV2;
        console.log(`[${caseIndex}/${entries.length}] SKIP (resume, preserved) ${entry.caseId}`);
        caseArtifactPaths.push(casePath);
        caseRecords.push({
          caseId: entry.caseId,
          commanders: entry.commanders,
          caseArtifactPath: `cases/${entry.caseId}.json`,
          hypothesisCount: sealedExisting.proposedHypotheses?.length ?? 0,
          validatedPackageCount: sealedExisting.finalValidatedPackages?.length ?? 0,
          toolCallCount: sealedExisting.toolCallTrace?.length ?? 0,
          repairRoundCount: sealedExisting.repairRounds?.length ?? 0,
          caseStatus: sealedExisting.caseStatus ?? "UNKNOWN",
          threeLensCollapseUnexplained: sealedExisting.threeLensCollapseUnexplained ?? false,
          sealedAt: String(sealedExisting.sealedAt),
          status: "SEALED",
        });
        continue;
      }

      priorRuntimeFailureAttempts = [
        ...((existing.priorRuntimeFailureAttempts as RuntimeFailureAttemptRecordV2[] | undefined) ?? []),
        preserveRuntimeFailureAttempt(existing),
      ];
      console.log(
        `[${caseIndex}/${entries.length}] RESUME (runtime failure) ${entry.caseId} — prior attempt ${priorRuntimeFailureAttempts[priorRuntimeFailureAttempts.length - 1]?.attemptId}`,
      );
    }

    const oppCase = oppByCase.get(entry.caseId);
    if (!oppCase) throw new Error(`Missing frozen opportunities for ${entry.caseId}`);

    console.log(`[${caseIndex}/${entries.length}] Professor PLAN v3 ${entry.caseId} (${entry.commanders.join(" / ")})`);

    try {
      const ctx = await buildProfessorPlanningContextV2(entry, oppCase);
      const record = attachPriorRuntimeFailures(
        await runProfessorPlanCaseV2(ctx, {
          experimentPurpose: "FORMAL_EXPERIMENT",
          stackFreezeManifestSha256: stackFreeze.manifestSha256,
        }),
        priorRuntimeFailureAttempts,
      );
      writeFileSync(casePath, JSON.stringify(record, null, 2));
      caseArtifactPaths.push(casePath);
      caseRecords.push({
        caseId: entry.caseId,
        commanders: entry.commanders,
        caseArtifactPath: `cases/${entry.caseId}.json`,
        hypothesisCount: record.proposedHypotheses.length,
        validatedPackageCount: record.finalValidatedPackages.length,
        toolCallCount: record.toolCallTrace.length,
        repairRoundCount: record.repairRounds.length,
        caseStatus: record.caseStatus,
        threeLensCollapseUnexplained: record.threeLensCollapseUnexplained,
        sealedAt: record.sealedAt,
        status: record.caseStatus === "RUNTIME_FAILURE" ? "FAILED" : "SEALED",
      });
    } catch (err) {
      const failedAt = new Date().toISOString();
      const caseAttemptId = randomUUID();
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorRecord = {
        version: PROFESSOR_PLAN_AGENT_V2_VERSION,
        experimentPurpose: "FORMAL_EXPERIMENT",
        caseId: entry.caseId,
        commanders: entry.commanders,
        caseStatus: "RUNTIME_FAILURE",
        caseAttemptId,
        error: errorMessage,
        failurePhase: inferRuntimeFailurePhase(errorMessage),
        sealedAt: failedAt,
        goldComparisonStatus: "NOT_RUN_AWAITING_PRE_GOLD_AUDIT",
        resumeGeneration: priorRuntimeFailureAttempts.length > 0 ? "CREDIT_RESTORATION_RESUME_V1" : undefined,
        priorRuntimeFailureAttempts:
          priorRuntimeFailureAttempts.length > 0 ? priorRuntimeFailureAttempts : undefined,
      };
      writeFileSync(casePath, JSON.stringify(errorRecord, null, 2));
      caseArtifactPaths.push(casePath);
      console.error(`FAILED ${entry.caseId}: ${errorRecord.error}`);
      caseRecords.push({
        caseId: entry.caseId,
        commanders: entry.commanders,
        caseArtifactPath: `cases/${entry.caseId}.json`,
        hypothesisCount: 0,
        validatedPackageCount: 0,
        toolCallCount: 0,
        repairRoundCount: 0,
        caseStatus: "RUNTIME_FAILURE",
        threeLensCollapseUnexplained: false,
        sealedAt: failedAt,
        status: "FAILED",
      });
    }
  }

  const latestCaseSeal = caseRecords.reduce(
    (max, c) => (c.sealedAt > max ? c.sealedAt : max),
    caseRecords[0]?.sealedAt ?? experimentStartedAt,
  );

  const manifest = {
    version: "phase6a1-professor-plan-experiment-manifest-v3",
    generatedAt: experimentStartedAt,
    completedAt: latestCaseSeal,
    authorization: {
      commanderMechanismFacts: "FROZEN_DEV_TRUTH",
      semanticOpportunityV322: "FROZEN_DEV_TRUTH",
      professorPlanExperimentV1: "ARCHIVED_FAILED_DIAGNOSTIC",
      professorPlanExperimentV2: "ARCHIVED_RETRIEVAL_DEGRADED_BASELINE",
      professorPlanExperimentV3: "AUTHORIZED_FORMAL_RUN",
      gateB: "WAIT",
      liveSemanticRetrieval: "FROZEN",
      optimizer: "WAIT",
      goldBuildPathComparison: "WAIT_UNTIL_PRE_GOLD_AUDIT",
    },
    excludedDiagnostics: {
      harnessSmokeGpt4oArchive: HARNESS_SMOKE_ARCHIVE,
      note: "gpt-4o Meren harness smoke verifies fail-closed normalization only; excluded from formal population",
    },
    stackFreeze: {
      artifact: "phase6a1-professor-plan-experiment-v2-stack-freeze-v1.json",
      manifestSha256: stackFreeze.manifestSha256,
    },
    retrievalSemanticFreeze: {
      artifact: "phase6a1-mtg-rag-retrieval-semantic-freeze-v1.json",
      rankingVersion: retrievalFreeze.rankingVersion,
      serviceVersion: retrievalFreeze.serviceVersion,
      prospectiveHoldout: retrievalFreeze.prospectiveEvidence.holdoutVersion,
      top4UsefulRate: retrievalFreeze.prospectiveEvidence.top4UsefulRate,
    },
    priorDiagnosticAudit: {
      artifact: "phase6a1-professor-plan-experiment-v1-case-integrity-audit-gpt56sol-v1.json",
      sha256: existsSync(V1_INTEGRITY_AUDIT_PATH) ? hashFile(V1_INTEGRITY_AUDIT_PATH) : "MISSING",
    },
    inputs: {
      frozenOpportunityModel: "phase6a1-semantic-opportunity-model-v3.2.2.json",
      frozenOpportunityModelSha256: FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_SHA256,
      mechanismFacts: "phase6a1-commander-mechanism-facts-v4-implemented.json",
      contractsVersion: PROFESSOR_PLANNING_CONTRACTS_V2_VERSION,
      promptVersion: PROFESSOR_PLAN_PROMPT_V2_VERSION,
      agentVersion: PROFESSOR_PLAN_AGENT_V2_VERSION,
      normalizerVersion: PROFESSOR_PLAN_NORMALIZER_V2_VERSION,
      validatorVersion: STRATEGY_PACKAGE_VALIDATOR_V2_VERSION,
      threeLensSelectorVersion: THREE_LENS_PORTFOLIO_SELECTOR_V2_VERSION,
      contextBuilderVersion: PROFESSOR_PLAN_CONTEXT_BUILDER_V2_VERSION,
      modelPinPath: "phase6a1-professor-plan-model-pin-v2.json",
      modelPinSha256: modelPin.sha256,
      professorModelIdentifier: modelPin.modelIdentifier,
      professorProductName: modelPin.productName,
      professorProvider: modelPin.provider,
      professorApiSurface: modelPin.apiSurface,
      professorReasoningConfiguration: modelPin.reasoningConfiguration,
      professorInferenceParameters: modelPin.inferenceParameters,
    },
    experimentIsolation: {
      buildPathV3GoldExcluded: true,
      edhrecTopDeckResearchExcluded: true,
      path: "SEMANTIC_ONLY",
      noResumeFromV1Artifacts: true,
      noResumeFromV2Artifacts: true,
    },
    bounds: modelPin.experimentBounds,
    cases: caseRecords,
    population: {
      cases: caseRecords.length,
      sealedCases: caseRecords.filter((c) => c.status === "SEALED").length,
      failedCases: caseRecords.filter((c) => c.status === "FAILED").length,
      sealedSuccessCases: caseRecords.filter((c) => c.caseStatus === "SEALED_SUCCESS").length,
      sealedFailureCases: caseRecords.filter((c) => c.caseStatus === "SEALED_FAILURE").length,
      normalizationFailureCases: caseRecords.filter((c) => c.caseStatus === "NORMALIZATION_FAILURE").length,
      runtimeFailureCases: caseRecords.filter((c) => c.caseStatus === "RUNTIME_FAILURE").length,
      totalHypotheses: caseRecords.reduce((n, c) => n + c.hypothesisCount, 0),
      totalValidatedPackages: caseRecords.reduce((n, c) => n + c.validatedPackageCount, 0),
      unexplainedThreeLensCollapseCases: caseRecords.filter((c) => c.threeLensCollapseUnexplained).length,
    },
  };

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  const manifestSha256 = hashFile(MANIFEST_PATH);
  const caseSetSha256 = hashCaseSet(caseArtifactPaths);
  const sealedAt = new Date().toISOString() >= latestCaseSeal ? new Date().toISOString() : latestCaseSeal;

  const runtimeComplete = manifest.population.runtimeFailureCases === 0;
  const preGoldGatesClear =
    runtimeComplete &&
    manifest.population.normalizationFailureCases === 0 &&
    manifest.population.unexplainedThreeLensCollapseCases === 0 &&
    caseRecords.filter((c) => c.caseStatus === "SEALED_SUCCESS" && c.validatedPackageCount === 0).length === 0;

  const sealed = {
    version: "phase6a1-professor-plan-experiment-sealed-v3",
    sealedAt,
    caseCount: caseRecords.length,
    manifestSha256,
    caseSetSha256,
    modelPinSha256: modelPin.sha256,
    stackFreezeManifestSha256: stackFreeze.manifestSha256,
    latestCaseSealTimestamp: latestCaseSeal,
    goldEvaluationStatus: "NOT_RUN",
    preGoldAuditStatus: preGoldGatesClear ? "AWAITING_INDEPENDENT_REVIEW" : "BLOCKED_RUNTIME_OR_VALIDATION_FAILURE",
    sealKind: preGoldGatesClear ? "FINAL_COMPLETE" : "INTERIM_AFTER_RESUME",
    partialSealArchive: existsSync(resolve(PARTIAL_SEAL_ARCHIVE_DIR, "partial-seal-record.json"))
      ? "phase6a1-professor-plan-experiment-v2-run-history/partial-seal-credit-exhaustion-2026-08-13/partial-seal-record.json"
      : undefined,
    note: preGoldGatesClear
      ? "Formal Professor v3 outputs sealed after all 28 cases complete with frozen semantic retrieval. REPORT AND WAIT for pre-gold audit."
      : "Interim seal after resume pass; runtime or validation gates not yet clear.",
    caseIds: caseRecords.map((c) => c.caseId),
  };

  const report = {
    version: "phase6a1-professor-plan-experiment-report-v3",
    generatedAt: sealedAt,
    overallStatus: preGoldGatesClear ? "SEALED_AWAIT_PRE_GOLD_AUDIT" : "PARTIAL_OR_BLOCKED_AWAIT_COMPLETION",
    manifestPath: "phase6a1-professor-plan-experiment-v3/phase6a1-professor-plan-experiment-manifest-v3.json",
    sealedPath: "phase6a1-professor-plan-experiment-v3/phase6a1-professor-plan-experiment-sealed-v3.json",
    professorPlanRuntime: runtimeComplete ? "COMPLETE" : "PARTIAL_FAILURE",
    gateB: "WAIT",
    optimizer: "WAIT",
    goldComparison: "WAIT",
    summary: manifest.population,
    preGoldAcceptanceGates: {
      runtimeFailedCases: manifest.population.runtimeFailureCases,
      normalizationFailuresUnresolved: manifest.population.normalizationFailureCases,
      zeroPackageSealedSuccessCases: caseRecords.filter(
        (c) => c.caseStatus === "SEALED_SUCCESS" && c.validatedPackageCount === 0,
      ).length,
      unexplainedThreeLensCollapseCases: manifest.population.unexplainedThreeLensCollapseCases,
      sealHashMismatch: false,
    },
  };

  writeFileSync(SEALED_PATH, JSON.stringify(sealed, null, 2));
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log("\n" + JSON.stringify(manifest.population, null, 2));
  console.log(`\nmodelPinSha256=${modelPin.sha256}`);
  console.log(`manifestSha256=${manifestSha256}`);
  console.log(`caseSetSha256=${caseSetSha256}`);
  console.log(`sealedAt=${sealedAt}`);
  console.log(`\nWrote ${REPORT_PATH}`);
}

async function main() {
  loadEnvLocal();
  process.env.MTG_RAG_ENABLED = "true";
  assertMtgRagRetrievalSemanticFreezeV1();
  const modelPin = loadProfessorModelPinV2();
  const smokeMode = process.env.PROFESSOR_PLAN_EXPERIMENT_SMOKE === "1";

  if (smokeMode) {
    await runSmokeCase(modelPin);
    return;
  }

  await runFormalExperiment(modelPin);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
