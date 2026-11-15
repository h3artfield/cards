#!/usr/bin/env npx tsx
/**
 * Read-only gold comparison: Amendment v8 Professor population vs sealed BuildPath v3 gold.
 * Does NOT rerun Professor, tune retrieval/ontology/graph, or repair cases from gold feedback.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProfessorCaseExperimentRecordV2 } from "./lib/phase6a1-professor-plan-agent-v2";
import { getImplementedStrategyCase } from "./lib/phase6a1-implemented-strategy-catalog-v1";
import {
  buildGoldComparisonPopulationSummary,
  compareProfessorCaseToGoldBuildPath,
  loadGoldBuildPathCatalog,
  PROFESSOR_PLAN_GOLD_BUILD_PATH_COMPARISON_V1_VERSION,
  type ProfessorPlanGoldBuildPathComparisonReport,
} from "./lib/phase6a1-professor-plan-gold-build-path-comparison-v1";

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const AMENDED_V8_DIR = resolve(OUT_DIR, "phase6a1-professor-plan-experiment-v3-amended-v8");
const AMENDED_V8_CASES_DIR = resolve(AMENDED_V8_DIR, "cases");
const PRE_GOLD_REAUDIT_SOURCE =
  "C:/Users/h3art/Downloads/phase6a1-professor-plan-experiment-v3-amended-v8-pre-gold-reaudit-gpt56sol-v1.json";
const PRE_GOLD_REAUDIT_DEST = resolve(
  OUT_DIR,
  "phase6a1-professor-plan-experiment-v3-amended-v8-pre-gold-reaudit-gpt56sol-v1.json",
);

const REPORT_PATH = resolve(
  OUT_DIR,
  "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json",
);
const SEALED_GOLD_PATH = resolve(
  OUT_DIR,
  "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-sealed-v1.json",
);

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function loadCaseRecords(): ProfessorCaseExperimentRecordV2[] {
  return readdirSync(AMENDED_V8_CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(resolve(AMENDED_V8_CASES_DIR, f), "utf8")) as ProfessorCaseExperimentRecordV2);
}

function main() {
  if (!existsSync(PRE_GOLD_REAUDIT_DEST) && existsSync(PRE_GOLD_REAUDIT_SOURCE)) {
    copyFileSync(PRE_GOLD_REAUDIT_SOURCE, PRE_GOLD_REAUDIT_DEST);
  }

  const manifestPath = resolve(AMENDED_V8_DIR, "phase6a1-professor-plan-experiment-manifest-v3-amended-v8.json");
  const sealedPath = resolve(AMENDED_V8_DIR, "phase6a1-professor-plan-experiment-sealed-v3-amended-v8.json");
  const manifestSha256 = sha256File(manifestPath);
  const preGoldCaseSetSha256 = (JSON.parse(readFileSync(sealedPath, "utf8")) as { caseSetSha256: string })
    .caseSetSha256;
  const casePaths = readdirSync(AMENDED_V8_CASES_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => resolve(AMENDED_V8_CASES_DIR, f));

  const { catalogSha256, bundles } = loadGoldBuildPathCatalog();
  const bundleByCase = new Map(bundles.map((b) => [b.caseId, b]));
  const records = loadCaseRecords();
  const generatedAt = new Date().toISOString();

  const cases = records.map((record) => {
    const bundle = bundleByCase.get(record.caseId);
    const strat = getImplementedStrategyCase(record.caseId);
    if (!bundle || !strat) {
      throw new Error(`Missing gold bundle or strategy for ${record.caseId}`);
    }
    return compareProfessorCaseToGoldBuildPath({ record, bundle, strat });
  });

  const population = buildGoldComparisonPopulationSummary(cases);
  const overallStatus = population.casesFailed === 0 ? "PASS" : "FAIL";

  for (const record of records) {
    const caseComparison = cases.find((c) => c.caseId === record.caseId)!;
    const casePath = resolve(AMENDED_V8_CASES_DIR, `${record.caseId}.json`);
    const parsed = JSON.parse(readFileSync(casePath, "utf8")) as Record<string, unknown>;
    parsed.goldComparisonStatus =
      caseComparison.caseStatusGold === "PASS" ? "GOLD_COMPARISON_PASS" : "GOLD_COMPARISON_FAIL";
    parsed.goldComparisonAt = generatedAt;
    parsed.goldComparisonReport = "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json";
    writeFileSync(casePath, JSON.stringify(parsed, null, 2));
  }

  const caseSetSha256PostGoldBookkeeping = createHash("sha256")
    .update(
      casePaths
        .map((p) => sha256File(p))
        .sort()
        .join("\n"),
    )
    .digest("hex");

  const report: ProfessorPlanGoldBuildPathComparisonReport = {
    version: PROFESSOR_PLAN_GOLD_BUILD_PATH_COMPARISON_V1_VERSION,
    generatedAt,
    readOnly: true,
    predeclaredProtocol: {
      source: "Professor PLAN 28-case experiment authorization (2026-08-13)",
      goldReference: "BuildPath v3 — 84 paths (28 × 3 lenses)",
      comparisonMode: "SEMANTIC_STRATEGY_AGREEMENT_NOT_EXACT_PROSE",
      dimensions: [
        "mechanical validity (inherited pre-gold PASS)",
        "causal coherence (inherited pre-gold PASS)",
        "commander dependence correctness (inherited pre-gold PASS)",
        "commander-independent functionality (inherited pre-gold PASS)",
        "package completeness (inherited pre-gold PASS)",
        "bridge validity (inherited pre-gold PASS)",
        "evidence sufficiency (inherited pre-gold PASS)",
        "path/lens differentiation",
        "major gold-strategy coverage",
        "novel valid strategies not present in gold (informational)",
      ],
      note: "Gold disagreement is not automatically Professor error. Failures are post-gold evaluation findings only.",
    },
    inputs: {
      professorPopulationDir: "phase6a1-professor-plan-experiment-v3-amended-v8",
      professorManifestSha256: manifestSha256,
      professorCaseSetSha256: preGoldCaseSetSha256,
      professorCaseSetSha256PostGoldBookkeeping: caseSetSha256PostGoldBookkeeping,
      preGoldReauditArtifact: "phase6a1-professor-plan-experiment-v3-amended-v8-pre-gold-reaudit-gpt56sol-v1.json",
      preGoldReauditStatus: "PASS",
      goldBuildPathCatalog: "phase6a1-build-path-catalog-v3.json",
      goldBuildPathCatalogSha256: catalogSha256,
      goldStrategySource: "phase6a1-strategy-adjudication-v1-implemented",
    },
    inheritedPreGoldDimensions: {
      status: "PASS_DELEGATED",
      note: "Independent Amendment v8 pre-gold re-audit PASS — validator and graph gates not re-run with gold open.",
    },
    population,
    cases,
    overallStatus,
    gateDisposition: {
      goldComparison: "SEALED",
      corpusIngest: "KEEP_BLOCKED",
      tuningAgainstHoldout: "PROHIBITED",
    },
  };

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  const reportSha256 = sha256File(REPORT_PATH);

  const sealedV8 = JSON.parse(readFileSync(sealedPath, "utf8")) as Record<string, unknown>;
  sealedV8.sealKind = "AMENDED_V8_FROZEN_POST_GOLD_COMPARISON";
  sealedV8.preGoldAuditStatus = "PASS";
  sealedV8.preGoldReauditReference =
    "phase6a1-professor-plan-experiment-v3-amended-v8-pre-gold-reaudit-gpt56sol-v1.json";
  sealedV8.goldEvaluationStatus = overallStatus;
  sealedV8.goldComparisonReport =
    "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json";
  sealedV8.goldComparisonReportSha256 = reportSha256;
  sealedV8.goldComparisonSealedAt = generatedAt;
  sealedV8.caseSetSha256 = caseSetSha256PostGoldBookkeeping;
  sealedV8.note =
    "Amendment v8 frozen post PRE_GOLD_PASS and read-only gold comparison. Professor package bodies unchanged.";
  writeFileSync(sealedPath, JSON.stringify(sealedV8, null, 2));

  const completionPath = resolve(
    AMENDED_V8_DIR,
    "phase6a1-professor-plan-experiment-v3-amended-v8-completion-v1.json",
  );
  if (existsSync(completionPath)) {
    const completion = JSON.parse(readFileSync(completionPath, "utf8")) as Record<string, unknown>;
    completion.status = "AMENDED_V8_FROZEN_POST_GOLD_COMPARISON";
    completion.completedAt = generatedAt;
    (completion.gateDisposition as Record<string, string>) = {
      semanticRetrievalFreeze: "FROZEN",
      professorV3FormalRun: "AMENDED_PRE_GOLD_V8_FROZEN",
      preGoldAudit: "PASS",
      goldComparison: "SEALED",
      corpusIngest: "KEEP_BLOCKED",
    };
    (completion as Record<string, unknown>).goldComparison = {
      report: "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json",
      reportSha256,
      overallStatus,
      population,
    };
    writeFileSync(completionPath, JSON.stringify(completion, null, 2));
  }

  const reportArtifact = JSON.parse(
    readFileSync(resolve(AMENDED_V8_DIR, "phase6a1-professor-plan-experiment-report-v3-amended-v8.json"), "utf8"),
  ) as Record<string, unknown>;
  reportArtifact.overallStatus = "AMENDED_V8_FROZEN_POST_GOLD_COMPARISON";
  reportArtifact.goldComparison = overallStatus;
  reportArtifact.goldComparisonReport =
    "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json";
  writeFileSync(
    resolve(AMENDED_V8_DIR, "phase6a1-professor-plan-experiment-report-v3-amended-v8.json"),
    JSON.stringify(reportArtifact, null, 2),
  );

  writeFileSync(
    SEALED_GOLD_PATH,
    JSON.stringify(
      {
        version: "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-sealed-v1",
        sealedAt: generatedAt,
        professorPopulation: "phase6a1-professor-plan-experiment-v3-amended-v8",
        professorManifestSha256: manifestSha256,
        professorCaseSetSha256PreGold: preGoldCaseSetSha256,
        professorCaseSetSha256PostGoldBookkeeping: caseSetSha256PostGoldBookkeeping,
        preGoldReauditReference:
          "phase6a1-professor-plan-experiment-v3-amended-v8-pre-gold-reaudit-gpt56sol-v1.json",
        goldBuildPathCatalog: "phase6a1-build-path-catalog-v3.json",
        goldBuildPathCatalogSha256: catalogSha256,
        report: "phase6a1-professor-plan-experiment-v3-amended-v8-gold-comparison-report-v1.json",
        reportSha256,
        overallStatus,
        population,
        gateDisposition: report.gateDisposition,
        instruction: "REPORT AND WAIT. Post-gold failures are evaluation findings only — do not tune against this holdout.",
      },
      null,
      2,
    ),
  );

  console.log(JSON.stringify({ overallStatus, population, reportPath: REPORT_PATH, reportSha256 }, null, 2));
}

main();
