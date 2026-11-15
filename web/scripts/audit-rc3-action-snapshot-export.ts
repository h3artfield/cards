/**
 * Export action-level parse snapshot for checkpoint diff (stdout JSON).
 * Usage: npx tsx scripts/audit-rc3-action-snapshot-export.ts --label v132
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  clearRC3PromotedFamilies,
  resetRC3PromotedFamiliesToDefault,
  setRC3PromotedFamilies,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { evaluateCaseSemantic, matchGoldToSemanticActions, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & { coverageStratum?: string; spentV12Regression?: boolean; cardName?: string };

function loadCombined(): Case[] {
  const paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
    "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
  ];
  const all: Case[] = [];
  for (const p of paths) all.push(...(JSON.parse(readFileSync(p, "utf8")) as { cases: Case[] }).cases);
  return all;
}

function main() {
  const label = process.argv.find((a) => a.startsWith("--label="))?.split("=")[1] ?? "snapshot";
  const promotion = process.argv.find((a) => a.startsWith("--promotion="))?.split("=")[1] ?? "default";

  if (promotion === "none") clearRC3PromotedFamilies();
  else if (promotion === "search") {
    clearRC3PromotedFamilies();
    setRC3PromotedFamilies(["search_put_shuffle_chain"]);
  } else resetRC3PromotedFamiliesToDefault();

  const cases = loadCombined();
  const rows = cases.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
  );
  const unrelatedRows = cases
    .filter((c) => c.coverageStratum && !c.spentV12Regression && c.id.startsWith("rc3-pos"))
    .map((tc) =>
      evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
    );

  const goldRows: Array<{
    caseId: string;
    goldIndex: number;
    actionType: string;
    evidenceContains?: string;
    matched: boolean;
    extractionSource?: string;
  }> = [];
  const fps: Array<{ caseId: string; actionType: string; evidenceText: string; extractionSource?: string }> = [];

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const outcome = matchGoldToSemanticActions({ expected, parse: parsed, tier: "accepted", oracleText: testCase.oracleText });
    expected.forEach((gold, goldIndex) => {
      const match = outcome.matches.find((m) => m.expectedIndex === goldIndex);
      const action = match?.actionIndex != null ? parsed.actions[match.actionIndex] : undefined;
      goldRows.push({
        caseId: testCase.id,
        goldIndex,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains,
        matched: match?.matched ?? false,
        extractionSource: action
          ? (parsed.legacy.actions.find((a) => a.actionId === action.actionId) as { extractionSource?: string })?.extractionSource
          : undefined,
      });
    });
    for (const idx of outcome.unmatchedActionIndices) {
      const action = parsed.actions[idx];
      fps.push({
        caseId: testCase.id,
        actionType: action.actionType,
        evidenceText: action.provenance.actionSpan.text,
        extractionSource: (parsed.legacy.actions.find((a) => a.actionId === action.actionId) as { extractionSource?: string })
          ?.extractionSource,
      });
    }
  }

  const out = {
    label,
    promotion,
    metrics: sumSemanticMetrics(rows),
    unrelatedMetrics: sumSemanticMetrics(unrelatedRows),
    goldRows,
    fps,
  };

  const outPath = resolve(`data/milestones/rc3-development/action-snapshot-${label}.json`);
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ label, metrics: out.metrics, unrelatedMetrics: out.unrelatedMetrics, outPath }, null, 2));
}

main();
