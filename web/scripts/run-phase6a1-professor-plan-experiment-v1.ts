#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Sealed 28-case Professor PLAN experiment.
 * Uses frozen CommanderMechanismFacts + SemanticOpportunity v3.2.2.
 * Does NOT expose BuildPath v3 gold. Does NOT score against gold until sealed.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { PROFESSOR_PLANNING_CONTRACTS_V2_VERSION } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";
import { FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_SHA256 } from "./lib/phase6a1-frozen-semantic-opportunity-v322-loader-v1";
import { loadFrozenSemanticOpportunityModelV322 } from "./lib/phase6a1-frozen-semantic-opportunity-v322-loader-v1";
import { getImplementedMechanismCatalog } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import { runProfessorPlanCase } from "./lib/phase6a1-professor-plan-agent-v1";
import { buildProfessorPlanningContext } from "./lib/phase6a1-professor-plan-context-builder-v1";
import { PROFESSOR_PLAN_AGENT_V1_VERSION } from "./lib/phase6a1-professor-plan-agent-v1";

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

const OUT_DIR = resolve("data/milestones/deck-synthesis/phase6a1-professor-plan-experiment-v1");
const CASES_DIR = resolve(OUT_DIR, "cases");
const MANIFEST_PATH = resolve(OUT_DIR, "phase6a1-professor-plan-experiment-manifest-v1.json");
const SEALED_PATH = resolve(OUT_DIR, "phase6a1-professor-plan-experiment-sealed-v1.json");
const REPORT_PATH = resolve(OUT_DIR, "phase6a1-professor-plan-experiment-report-v1.json");

async function main() {
  loadEnvLocal();
  const generatedAt = new Date().toISOString();
  const model = loadFrozenSemanticOpportunityModelV322();
  const catalog = getImplementedMechanismCatalog();
  const oppByCase = new Map(model.cases.map((c) => [c.caseId, c]));

  const caseLimit = parseInt(process.env.PROFESSOR_PLAN_EXPERIMENT_CASE_LIMIT ?? "0", 10);
  const entries = caseLimit > 0 ? catalog.slice(0, caseLimit) : catalog;

  mkdirSync(CASES_DIR, { recursive: true });

  const caseRecords = [];
  let caseIndex = 0;

  for (const entry of entries) {
    caseIndex++;
    const casePath = resolve(CASES_DIR, `${entry.caseId}.json`);
    if (existsSync(casePath) && process.env.PROFESSOR_PLAN_EXPERIMENT_RESUME !== "0") {
      const existing = JSON.parse(readFileSync(casePath, "utf8")) as {
        caseId: string;
        proposedHypotheses: unknown[];
        finalValidatedPackages: unknown[];
        toolCallTrace: unknown[];
        repairRounds: unknown[];
        sealedAt: string;
      };
      console.log(`[${caseIndex}/${entries.length}] SKIP (resume) ${entry.caseId}`);
      caseRecords.push({
        caseId: entry.caseId,
        commanders: entry.commanders,
        caseArtifactPath: `cases/${entry.caseId}.json`,
        hypothesisCount: existing.proposedHypotheses.length,
        validatedPackageCount: existing.finalValidatedPackages.length,
        toolCallCount: existing.toolCallTrace.length,
        repairRoundCount: existing.repairRounds.length,
        sealedAt: existing.sealedAt,
        status: "SEALED",
      });
      continue;
    }

    const oppCase = oppByCase.get(entry.caseId);
    if (!oppCase) throw new Error(`Missing frozen opportunities for ${entry.caseId}`);

    console.log(`[${caseIndex}/${entries.length}] Professor PLAN ${entry.caseId} (${entry.commanders.join(" / ")})`);

    try {
      const ctx = await buildProfessorPlanningContext(entry, oppCase);
      const record = await runProfessorPlanCase(ctx);
      writeFileSync(casePath, JSON.stringify(record, null, 2));
      caseRecords.push({
        caseId: entry.caseId,
        commanders: entry.commanders,
        caseArtifactPath: `cases/${entry.caseId}.json`,
        hypothesisCount: record.proposedHypotheses.length,
        validatedPackageCount: record.finalValidatedPackages.length,
        toolCallCount: record.toolCallTrace.length,
        repairRoundCount: record.repairRounds.length,
        sealedAt: record.sealedAt,
        status: "SEALED",
      });
    } catch (err) {
      const failedAt = new Date().toISOString();
      const errorRecord = {
        caseId: entry.caseId,
        commanders: entry.commanders,
        status: "FAILED",
        error: err instanceof Error ? err.message : String(err),
        sealedAt: failedAt,
        goldComparisonStatus: "NOT_RUN_AWAITING_SEALED_OUTPUTS",
      };
      writeFileSync(casePath, JSON.stringify(errorRecord, null, 2));
      console.error(`FAILED ${entry.caseId}: ${errorRecord.error}`);
      caseRecords.push({
        caseId: entry.caseId,
        commanders: entry.commanders,
        caseArtifactPath: `cases/${entry.caseId}.json`,
        hypothesisCount: 0,
        validatedPackageCount: 0,
        toolCallCount: 0,
        repairRoundCount: 0,
        sealedAt: failedAt,
        status: "FAILED",
      });
    }
  }

  const manifest = {
    version: "phase6a1-professor-plan-experiment-manifest-v1",
    generatedAt,
    authorization: {
      commanderMechanismFacts: "FROZEN_DEV_TRUTH",
      semanticOpportunityV322: "FROZEN_DEV_TRUTH",
      professorPlanExperiment: "AUTHORIZED",
      gateB: "WAIT",
      liveSemanticRetrieval: "WAIT",
      optimizer: "WAIT",
      goldBuildPathComparison: "WAIT_UNTIL_SEALED",
    },
    inputs: {
      frozenOpportunityModel: "phase6a1-semantic-opportunity-model-v3.2.2.json",
      frozenOpportunityModelSha256: FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_SHA256,
      mechanismFacts: "phase6a1-commander-mechanism-facts-v4-implemented.json",
      contractsVersion: PROFESSOR_PLANNING_CONTRACTS_V2_VERSION,
      agentVersion: PROFESSOR_PLAN_AGENT_V1_VERSION,
    },
    experimentIsolation: {
      buildPathV3GoldExcluded: true,
      edhrecTopDeckResearchExcluded: true,
      path: "SEMANTIC_ONLY",
    },
    bounds: {
      maxProfessorToolCalls: 8,
      maxEvidenceChunks: 24,
      maxValidationRepairRounds: 3,
    },
    cases: caseRecords,
    population: {
      cases: caseRecords.length,
      sealedCases: caseRecords.filter((c) => c.status !== "FAILED").length,
      failedCases: caseRecords.filter((c) => c.status === "FAILED").length,
      totalHypotheses: caseRecords.reduce((n, c) => n + c.hypothesisCount, 0),
      totalValidatedPackages: caseRecords.reduce((n, c) => n + c.validatedPackageCount, 0),
    },
  };

  const sealed = {
    version: "phase6a1-professor-plan-experiment-sealed-v1",
    sealedAt: generatedAt,
    caseCount: caseRecords.length,
    manifestSha256: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
    goldEvaluationStatus: "NOT_RUN",
    note: "Professor outputs sealed. Compare against 84 gold BuildPath reference paths only after independent review.",
    caseIds: caseRecords.map((c) => c.caseId),
  };

  const report = {
    version: "phase6a1-professor-plan-experiment-report-v1",
    generatedAt,
    overallStatus: "SEALED_AWAIT_GOLD_COMPARISON",
    manifestPath: "phase6a1-professor-plan-experiment-v1/phase6a1-professor-plan-experiment-manifest-v1.json",
    sealedPath: "phase6a1-professor-plan-experiment-v1/phase6a1-professor-plan-experiment-sealed-v1.json",
    professorPlanRuntime: "COMPLETE",
    gateB: "WAIT",
    optimizer: "WAIT",
    summary: manifest.population,
  };

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  writeFileSync(SEALED_PATH, JSON.stringify(sealed, null, 2));
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log("\n" + JSON.stringify(manifest.population, null, 2));
  console.log(`\nWrote ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
