/**
 * Reconcile unrelated catalog gate vs accepted v139 baseline (57/0/6).
 * Run: cd web && npx tsx scripts/reconcile-unrelated-gate-v140.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSemantic, sumSemanticMetrics, matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";

const ACCEPTED = { tp: 57, fp: 0, fn: 6, recall: 0.9047619047619048, caseCount: 33 };

function loadUnrelated(): OracleActionEvalCaseV2[] {
  const cases = applyGoldMigrationV135(
    (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
      cases: OracleActionEvalCaseV2[];
    }).cases,
  );
  return cases.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);
}

function actionLevelDelta(cases: OracleActionEvalCaseV2[]) {
  const fnItems: Array<Record<string, unknown>> = [];
  const fpItems: Array<Record<string, unknown>> = [];

  for (const testCase of cases) {
    const parse = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = matchGoldToSemanticActions({
      expected,
      parse,
      tier: "accepted",
      oracleText: testCase.oracleText,
      caseId: testCase.id,
    });
    const matchedExpected = new Set(matched.matches.filter((m) => m.matched).map((m) => m.expectedIndex));

    for (let ei = 0; ei < expected.length; ei++) {
      if (matchedExpected.has(ei)) continue;
      const gold = expected[ei]!;
      fnItems.push({
        caseId: testCase.id,
        cardName: (testCase as { cardName?: string }).cardName,
        expectedAction: gold.actionType,
        goldEvidence: gold.evidenceContains,
        emittedAccepted: parse.actions
          .filter((a) => a.reviewStatus === "accepted")
          .map((a) => ({ actionType: a.actionType, evidence: a.provenance.actionSpan.text.slice(0, 60) })),
      });
    }

    for (const idx of matched.unmatchedActionIndices) {
      const action = parse.actions[idx];
      if (!action || action.reviewStatus !== "accepted") continue;
      fpItems.push({
        caseId: testCase.id,
        cardName: (testCase as { cardName?: string }).cardName,
        observedAction: action.actionType,
        observedEvidence: action.provenance.actionSpan.text,
      });
    }
  }

  return { fnItems, fpItems };
}

function main() {
  const cases = loadUnrelated();
  const rows = cases.map((tc) => {
    const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
    return evaluateCaseSemantic(tc, parse);
  });
  const current = sumSemanticMetrics(rows);
  const { fnItems, fpItems } = actionLevelDelta(cases);

  const migrationPaths = [
    "data/milestones/rc3-development/persistent-permission-gold-migration-v135.json",
    "data/milestones/rc3-development/granted-shuffle-gold-migration-v135.json",
    "data/milestones/rc3-development/token-definition-gold-migration-v135.json",
    "data/milestones/rc3-development/land-grant-permission-gold-migration-v137.json",
    "data/milestones/rc3-development/zone-ninjutsu-replacement-gold-migration-v137.json",
    "data/milestones/rc3-development/activated-cost-fall-to-earth-gold-migration-v139.json",
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    scoringPath: "applyGoldMigrationV135(positive-training-catalog-v133) + live semantic matcher",
    goldMigrationOverlayPaths: migrationPaths,
    denominator: { caseCount: cases.length, note: "positive catalog excluding spentV12Regression" },
    previousAccepted: ACCEPTED,
    current: { tp: current.tp, fp: current.fp, fn: current.fn, precision: current.precision, recall: current.recall },
    delta: {
      tp: current.tp - ACCEPTED.tp,
      fp: current.fp - ACCEPTED.fp,
      fn: current.fn - ACCEPTED.fn,
      recall: current.recall - ACCEPTED.recall,
    },
    gatePass: current.precision >= 0.95 && current.recall >= 0.9,
    actionLevelFns: fnItems,
    actionLevelFps: fpItems,
    diagnosis:
      current.fn > ACCEPTED.fn
        ? "New FN(s) — likely RC4 parser change regressed an unrelated catalog target; see actionLevelFns."
        : current.fn < ACCEPTED.fn
          ? "FN count improved vs baseline — verify no benchmark-policy migration changed denominator."
          : "FN count unchanged — check FP or precision drift.",
  };

  mkdirSync(resolve("data/milestones/rc4-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc4-development/rc4-unrelated-gate-reconciliation-v140.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main();
