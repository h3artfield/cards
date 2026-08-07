/**
 * Development-only v1.13 baseline report — uses HEAD parser on development_set_v17.
 * Run: npx tsx scripts/eval-catalog-baseline-v13-dev.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  guardOfficialBenchmarkDataset,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { matchGoldToActions, primitiveMatchesExpected } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evidenceMatchesExtracted } from "./oracle-action-eval-shared";

import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

function datasetLabel(path: string): string {
  if (path.includes("v23")) return "development_set_v23";
  if (path.includes("v22")) return "development_set_v22";
  if (path.includes("v21")) return "development_set_v21";
  if (path.includes("v20")) return "development_set_v20";
  if (path.includes("v19")) return "development_set_v19";
  if (path.includes("v18")) return "development_set_v18";
  return "development_set_v17";
}

function reportName(path: string): string {
  if (path.includes("v23")) return "catalog-baseline-v13-dev-v23.json";
  if (path.includes("v22")) return "catalog-baseline-v13-dev-v22.json";
  if (path.includes("v21")) return "catalog-baseline-v13-dev-v21.json";
  if (path.includes("v20")) return "catalog-baseline-v13-dev-v20.json";
  if (path.includes("v19")) return "catalog-baseline-v13-dev-v19.json";
  if (path.includes("v18")) return "catalog-baseline-v13-dev-v18.json";
  return "catalog-baseline-v13-dev.json";
}

const DEV_PATH =
  process.argv.find((a) => a.startsWith("--dataset="))?.slice("--dataset=".length) ??
  "data/oracle-action-eval-development-v23.json";
const DATASET_LABEL = datasetLabel(DEV_PATH);
const REPORT_NAME = reportName(DEV_PATH);
const V16_BASELINE_PATH = "reports/catalog-baseline-v12-official.json";

const TRACKED_PAIRS = [
  "none/Layer1 → cast",
  "draw → sacrifice",
  "draw → discard",
  "exile → sacrifice",
  "create_token → sacrifice",
  "create_token → add_mana",
] as const;

function inferExpectedLabel(testCase: OracleActionEvalCaseV2, evidenceText: string, predicted: string): string {
  const gold = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  for (const exp of gold) {
    if (evidenceMatchesExtracted(evidenceText, exp.evidenceContains)) return exp.actionType;
  }
  if (gold.length === 0 || (testCase.expectedStructure && Object.keys(testCase.expectedStructure).length > 0)) {
    return "none/Layer1";
  }
  return "none/Layer1";
}

function countConfusionPairs(cases: OracleActionEvalCaseV2[]): Map<string, number> {
  const matrix = new Map<string, number>();
  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      textRole: a.textRole,
    }));
    const accepted = matchGoldToActions({ expected, actions, tier: "accepted" });
    for (const actionIdx of accepted.unmatchedActionIndices) {
      const a = actions[actionIdx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      if (expected.some((exp) => exp.actionType === a.primitive)) continue;
      const expectedLabel = inferExpectedLabel(testCase, a.evidenceText, a.primitive);
      if (expectedLabel === a.primitive) continue;
      const key = `${expectedLabel} → ${a.primitive}`;
      matrix.set(key, (matrix.get(key) ?? 0) + 1);
    }
  }
  return matrix;
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  let parserCommit = "unknown";
  try {
    parserCommit = execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    /* ignore */
  }

  const dev = JSON.parse(readFileSync(resolve(process.cwd(), DEV_PATH), "utf8")) as EvalDatasetEnvelope & {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  };

  const SKIP_PROVENANCE = process.argv.includes("--skip-provenance");
  let provenancePass = true;
  if (!SKIP_PROVENANCE) {
    try {
      const catalog = await loadGoldenCatalogIndex();
      guardOfficialBenchmarkDataset({ envelope: dev, catalog, manifestContentHash: dev.contentHash });
    } catch (err) {
      provenancePass = false;
      console.warn("[v1.13 dev] Provenance guard skipped:", err instanceof Error ? err.message : String(err));
    }
  }

  const results = evaluateCaseSet(dev.cases, DATASET_LABEL);
  const accepted = results.metricsByEmissionTier.acceptedOnly;
  const needsReview = results.metricsByEmissionTier.needsReviewOnly;
  const allEmission = results.metricsByEmissionTier.allEmission;
  const acceptedUnsupported = results.authoritativeClassification.counts.genuinely_unsupported_by_oracle;

  const confusion = countConfusionPairs(dev.cases);

  let v16Before: Record<string, number> = {};
  try {
    const prior = JSON.parse(readFileSync(resolve(process.cwd(), V16_BASELINE_PATH), "utf8"));
    const priorMatrix = JSON.parse(
      readFileSync(resolve(process.cwd(), "reports/wrong-primitive-confusion-matrix-audited-v17.json"), "utf8"),
    );
    for (const row of priorMatrix.confusionMatrix ?? []) {
      v16Before[`${row.expected} → ${row.predicted}`] = row.count;
    }
    void prior;
  } catch {
    /* no prior */
  }

  const errorsByTextRole = new Map<string, number>();
  const errorsByPrimitive = new Map<string, number>();
  let reminderDerived = 0;
  let costAsEffect = 0;
  let triggerEventAsAction = 0;
  let staticPermissionAsAction = 0;
  let replacementEventAsAction = 0;

  for (const testCase of dev.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      textRole: a.textRole,
      optionalEffect: a.optionalEffect,
      optionalCost: a.optionalCost,
      optional: a.optional,
    }));
    const acceptedMatch = matchGoldToActions({ expected, actions, tier: "accepted" });
    for (const actionIdx of acceptedMatch.unmatchedActionIndices) {
      const a = actions[actionIdx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      errorsByPrimitive.set(a.primitive, (errorsByPrimitive.get(a.primitive) ?? 0) + 1);
      const role = a.textRole ?? "unknown";
      errorsByTextRole.set(role, (errorsByTextRole.get(role) ?? 0) + 1);
    }
  }

  for (const testCase of dev.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    for (const ann of raw.structureAnnotations) {
      if (ann.kind === "reminder_text" || ann.kind === "mechanic_reminder") reminderDerived++;
      if (ann.kind === "cost") costAsEffect++;
      if (ann.kind === "trigger_event") triggerEventAsAction++;
      if (ann.kind === "static_permission") staticPermissionAsAction++;
      if (ann.kind === "replacement_event") replacementEventAsAction++;
    }
  }

  const trackedBeforeAfter = TRACKED_PAIRS.map((pair) => {
    const [exp, pred] = pair.split(" → ");
    const key = `${exp} → ${pred}`;
    return {
      pair,
      before: v16Before[key] ?? null,
      after: confusion.get(key) ?? 0,
    };
  });

  const confusionRows = [...confusion.entries()]
    .map(([pair, count]) => {
      const [expected, predicted] = pair.split(" → ");
      return { expected, predicted, count };
    })
    .sort((a, b) => b.count - a.count);

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    dataset: DATASET_LABEL,
    contentHash: dev.contentHash,
    caseCount: dev.cases.length,
    provenanceGuardPass: provenancePass,
    accepted: {
      tp: accepted.truePositives,
      fp: accepted.falsePositives,
      fn: accepted.falseNegatives,
      precision: accepted.precision,
      recall: accepted.recall,
      unsupported: acceptedUnsupported,
    },
    needsReview: {
      tp: needsReview.truePositives,
      fp: needsReview.falsePositives,
    },
    allEmission: {
      tp: allEmission.truePositives,
      fp: allEmission.falsePositives,
      fn: allEmission.falseNegatives,
      precision: allEmission.precision,
      recall: allEmission.recall,
    },
    errorsByTextRole: Object.fromEntries([...errorsByTextRole.entries()].sort((a, b) => b[1] - a[1])),
    errorsByPrimitive: Object.fromEntries([...errorsByPrimitive.entries()].sort((a, b) => b[1] - a[1])),
    confusionMatrix: confusionRows,
    topConfusionFamilies: confusionRows.slice(0, 15),
    trackedPairsBeforeAfter: trackedBeforeAfter,
    spanRoleMetrics: {
      reminderDerivedEmissionCount: reminderDerived,
      costAsEffectEmissionCount: costAsEffect,
      triggerEventAsActionCount: triggerEventAsAction,
      staticPermissionAsActionCount: staticPermissionAsAction,
      replacementEventAsActionCount: replacementEventAsAction,
    },
    structureAnnotationCount: dev.cases.length,
  };

  const outPath = resolve(process.cwd(), `reports/${REPORT_NAME}`);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify({
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    devHash: dev.contentHash,
    accepted: report.accepted,
    needsReview: report.needsReview,
    allEmission: report.allEmission,
    trackedPairsBeforeAfter: trackedBeforeAfter,
    top5Confusion: confusionRows.slice(0, 5),
    spanRoleMetrics: report.spanRoleMetrics,
    outPath,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
