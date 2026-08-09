/**
 * Emit per-action match ledger JSON for TP→FN delta audits.
 * Usage: npx tsx scripts/emit-action-match-ledger.ts [outPath]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { matchGoldToSemanticActions, evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

type Envelope = { cases: OracleActionEvalCaseV2[] };

function loadScoringCases(path: string): OracleActionEvalCaseV2[] {
  return applyGoldMigrationV135((JSON.parse(readFileSync(resolve(path), "utf8")) as Envelope).cases);
}

function loadCombinedCases() {
  const legacyV14Paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  ];
  const positiveCatalog = loadScoringCases("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  return [...legacyV14Paths.flatMap(loadScoringCases), ...positiveCatalog];
}

function main() {
  const cases = loadCombinedCases();
  const rows: Array<Record<string, unknown>> = [];
  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = matchGoldToSemanticActions({
      expected,
      parse: parsed,
      tier: "accepted",
      oracleText: testCase.oracleText,
      caseId: testCase.id,
    });
    const matchedExpected = new Set(matched.matches.filter((m) => m.matched).map((m) => m.expectedIndex));
    for (let ei = 0; ei < expected.length; ei++) {
      const gold = expected[ei]!;
      rows.push({
        caseId: testCase.id,
        cardName: (testCase as { cardName?: string }).cardName,
        actionType: gold.actionType,
        evidenceContains: gold.evidenceContains ?? "",
        matched: matchedExpected.has(ei),
        optionalEffect: gold.optionalEffect,
        oracleSnippet: testCase.oracleText.slice(0, 120).replace(/\n/g, " "),
      });
    }
  }
  const metrics = sumSemanticMetrics(
    cases.map((c) =>
      evaluateCaseSemantic(c, parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace })),
    ),
  );
  const outPath = process.argv[2] ?? "data/milestones/rc3-development/action-match-ledger-current.json";
  writeFileSync(
    resolve(outPath),
    `${JSON.stringify({ parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION, metrics, rows }, null, 2)}\n`,
  );
  console.log(JSON.stringify({ outPath, metrics }, null, 2));
}

main();
