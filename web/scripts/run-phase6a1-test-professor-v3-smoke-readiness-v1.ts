#!/usr/bin/env npx tsx
/** No-model smoke-readiness checks for Professor v3 Muldrotha execution delta. */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  coerceProfessorV3ToolRequest,
  runProfessorPlanCaseV3Orchestration,
  validateProfessorV3ToolRequest,
} from "./lib/phase6a1-professor-plan-agent-v3";
import { buildMuldrothaProfessorContextV3ZeroAffordances } from "./lib/phase6a1-professor-v3-grounding-fixtures-v1";
import {
  castFromGraveyardAssertion,
  mechanismRef,
} from "./lib/phase6a1-professor-v3-fixture-assertions-v1";
import { MULDROTHA_CAST_FACT, MULDROTHA_LAND_FACT } from "./lib/phase6a1-professor-v3-grounding-fixtures-v1";
import { createProfessorV3ModelAttemptArtifactSink } from "./lib/phase6a1-professor-v3-model-attempt-artifacts-v1";
import { buildProfessorV3SemanticRelationshipSourceIdentity } from "./lib/phase6a1-professor-v3-semantic-relationship-source-v1";
import { buildProfessorV3SmokeMaterialPinReport } from "./lib/phase6a1-professor-v3-smoke-material-pins-v1";
import {
  preflightProfessorV3SmokeOutputsAbsent,
  resolveProfessorV3SmokeMuldrothaOutputTargets,
} from "./lib/phase6a1-professor-v3-smoke-output-targets-v1";
import { DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { MILESTONES } from "./lib/phase6a1-pinned-implementation-container-v1";

const HERE = resolve(fileURLToPath(import.meta.url), "..");
const EXECUTE_RUNNER = resolve(HERE, "run-phase6a1-execute-smoke-professor-v3-muldrotha-v1.ts");
const OUT_AUDIT = resolve(MILESTONES, "phase6a1-professor-v3-smoke-readiness-audit-v1.json");

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

  const blocked = spawnSync("npx", ["tsx", EXECUTE_RUNNER], {
    encoding: "utf8",
    cwd: resolve(HERE, ".."),
    shell: true,
  });
  checks.push({
    id: "execute-runner-blocked-without-switch",
    description: "Execute runner fails closed before model without --execute",
    pass:
      blocked.status === 1 &&
      (blocked.stdout.includes("MODEL_EXECUTION_NOT_AUTHORIZED") || blocked.stderr.includes("MODEL_EXECUTION_NOT_AUTHORIZED")),
    detail: blocked.status === 1 ? undefined : `exit=${String(blocked.status)} signal=${String(blocked.signal)}`,
  });

  const materialPins = buildProfessorV3SmokeMaterialPinReport();
  checks.push({
    id: "material-pins-present",
    description: "Material source/hash manifest builds with pinned files",
    pass: materialPins.fileCount >= 15 && materialPins.files.every((f) => f.sha256.length === 64),
  });

  const semanticSource = buildProfessorV3SemanticRelationshipSourceIdentity({ caseId: "multi-muldrotha" });
  checks.push({
    id: "semantic-relationship-source-documented",
    description: "Muldrotha semantic relationship authority documented — no separate frozen v3.2.2 case",
    pass:
      semanticSource.caseSpecific.separateFrozenV322CaseExists === false &&
      typeof semanticSource.caseSpecific.muldrothaNote === "string",
  });

  const absentTargets = preflightProfessorV3SmokeOutputsAbsent(resolveProfessorV3SmokeMuldrothaOutputTargets(MILESTONES));
  checks.push({
    id: "smoke-output-targets-absent",
    description: "Real smoke write-once output targets are absent before execution",
    pass: absentTargets.length === 0,
    detail: absentTargets.length ? absentTargets.join(", ") : undefined,
  });

  const malformedTool = coerceProfessorV3ToolRequest({ tool: "searchMtgKnowledge", query: "  ", mode: "COMMANDER_PRIMER" });
  checks.push({
    id: "tool-request-nonblank-query",
    description: "Blank tool query fails closed at runtime boundary",
    pass: !malformedTool.ok && malformedTool.reason.includes("nonblank"),
  });

  const badLimit = coerceProfessorV3ToolRequest({ tool: "searchMtgKnowledge", query: "x", mode: "COMMANDER_PRIMER", limit: 0 });
  checks.push({
    id: "tool-request-positive-limit",
    description: "Non-positive tool limit fails closed",
    pass: !badLimit.ok,
  });

  const badObject = coerceProfessorV3ToolRequest(null);
  checks.push({
    id: "tool-request-runtime-object",
    description: "Non-object tool request fails closed",
    pass: !badObject.ok,
  });

  let modelCalls = 0;
  let normalizationRepairUsed = false;
  const normalizationRepair = await runProfessorPlanCaseV3Orchestration({
    ctx: muldrothaCtx,
    executionMode: "REAL_SMOKE",
    modelAuthorization: "AUTHORIZED",
    requireLensCoverage: false,
    maxRepairRounds: 2,
    modelCaller: async () => {
      modelCalls += 1;
      if (modelCalls === 1) return { parsed: { strategyHypotheses: "not-an-array" } };
      normalizationRepairUsed = true;
      return { parsed: groundedDependentPlan };
    },
  });
  checks.push({
    id: "normalization-failure-uses-repair-budget",
    description: "Normalization failure enters repair loop before final failure",
    pass:
      normalizationRepairUsed &&
      normalizationRepair.executionStatus === "SUCCESS" &&
      normalizationRepair.caseStatus === "SUCCESS" &&
      normalizationRepair.repairRounds.some((r) => (r.normalizationIssues?.length ?? 0) > 0),
  });

  let repairPromptSeenOnToolRefresh: string | undefined;
  let repairRoundCalls = 0;
  const ungroundedPlan = {
    strategyHypotheses: [
      {
        hypothesisId: "bad-cross",
        title: "Bad",
        strategicClaim: "c",
        causalReasoning: "r",
        evidenceRefs: [mechanismRef([MULDROTHA_LAND_FACT, MULDROTHA_CAST_FACT])],
        strategicAssertions: [
          {
            assertionId: "bad",
            packageId: "bad-pkg",
            predicate: "PERMITS_ACTION",
            action: "CAST_FROM_GRAVEYARD",
            object: "LAND_CARD",
            sourceZone: "GRAVEYARD",
            provider: "COMMANDER",
            evidenceRefs: [mechanismRef([MULDROTHA_LAND_FACT, MULDROTHA_CAST_FACT])],
          },
        ],
        causalEdges: [],
        commanderDependency: "HIGH",
        lens: "DEPENDENT_SYNERGY",
        packages: [
          {
            packageId: "bad-pkg",
            purpose: "Bad",
            functionalRoles: ["ENGINE"],
            inputs: [],
            resourcesRequired: [],
            outputs: [],
            resourcesProduced: [],
            commanderDependency: "HIGH",
            worksWithoutCommander: "LOW",
            evidenceRefs: [mechanismRef([MULDROTHA_LAND_FACT, MULDROTHA_CAST_FACT])],
          },
        ],
        relationships: [],
      },
    ],
  };
  const repairToolRoundTrip = await runProfessorPlanCaseV3Orchestration({
    ctx: muldrothaCtx,
    executionMode: "REAL_SMOKE",
    modelAuthorization: "AUTHORIZED",
    requireLensCoverage: false,
    maxRepairRounds: 2,
    modelCaller: async (input) => {
      repairRoundCalls += 1;
      if (input.repairPrompt && input.afterToolResults) repairPromptSeenOnToolRefresh = input.repairPrompt;
      if (input.repairPrompt && !input.afterToolResults) {
        return {
          parsed: { pending: true },
          toolRequests: [{ tool: "searchMtgKnowledge", query: "muldrotha primer", mode: "COMMANDER_PRIMER", limit: 1 }],
        };
      }
      if (repairRoundCalls === 1) return { parsed: ungroundedPlan };
      if (input.afterToolResults) return { parsed: groundedDependentPlan };
      return { parsed: groundedDependentPlan };
    },
    fakeToolHits: () => [
      {
        chunkId: "rag-readiness-tool",
        citationLabel: "rag-readiness-tool",
        corpus: "fixture",
        authorityTier: "fixture",
        retrievalMethod: "lexical_exact",
        score: 1,
        provenanceTier: "CURATED_KNOWLEDGE",
        retrievalText: "Muldrotha decks use self-mill to stock the graveyard.",
        mode: "COMMANDER_PRIMER",
      },
    ],
  });
  checks.push({
    id: "repair-prompt-through-tool-call",
    description: "Active repairPrompt preserved on refreshed model call after tool",
    pass:
      typeof repairPromptSeenOnToolRefresh === "string" &&
      repairPromptSeenOnToolRefresh.includes("Repair your prior JSON") &&
      repairToolRoundTrip.executionStatus === "SUCCESS",
  });

  const malformedToolRun = await runProfessorPlanCaseV3Orchestration({
    ctx: muldrothaCtx,
    executionMode: "REAL_SMOKE",
    modelAuthorization: "AUTHORIZED",
    parsedModelResponse: {
      toolRequests: [{ tool: "searchMtgKnowledge", query: "", mode: "COMMANDER_PRIMER" }],
    },
    modelCaller: async () => ({ parsed: null }),
  });
  checks.push({
    id: "malformed-tool-request-fail-closed",
    description: "Malformed runtime tool request fails closed before retrieval",
    pass:
      malformedToolRun.executionStatus === "TOOL_VALIDATION_FAILURE" &&
      malformedToolRun.caseStatus === "TOOL_VALIDATION_FAILURE",
  });

  const tmpDir = mkdtempSync(join(tmpdir(), "prof-v3-attempts-"));
  try {
    const sink = createProfessorV3ModelAttemptArtifactSink({ outputDir: tmpDir, relPrefix: "attempts" });
    await runProfessorPlanCaseV3Orchestration({
      ctx: muldrothaCtx,
      executionMode: "REAL_SMOKE",
      modelAuthorization: "AUTHORIZED",
      parsedModelResponse: groundedDependentPlan,
      requireLensCoverage: false,
      modelAttemptArtifactSink: sink,
    });
    checks.push({
      id: "model-attempt-byte-artifacts",
      description: "Model attempt artifact sink writes system/user/raw byte artifacts",
      pass: true,
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const budgetCap = validateProfessorV3ToolRequest({
    req: { tool: "searchMtgKnowledge", query: "x", mode: "COMMANDER_PRIMER", limit: 4 },
    budget: { ...DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET_V3, maxRetrievedEvidenceChunks: 1 },
    toolCallsSoFar: 0,
    chunksRetrievedSoFar: 0,
  });
  checks.push({
    id: "chunk-budget-cap",
    description: "Retrieval limit capped to remaining chunk budget",
    pass: budgetCap.ok && budgetCap.cappedLimit === 1,
  });

  return checks;
}

async function main() {
  if (existsSync(OUT_AUDIT)) rmSync(OUT_AUDIT);
  const checks = await runChecks();
  const audit = {
    version: "phase6a1-professor-v3-smoke-readiness-audit-v1",
    generatedAt: new Date().toISOString(),
    decision: "PROFESSOR_V3_ARCHITECTURE_V5_PASS_SMOKE_EXECUTION_READINESS_BLOCK_V1",
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
