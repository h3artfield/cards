/**
 * Split granted_ability_quote metrics: nested-only vs co-occurring primary effects.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { evaluateCaseSemantic, matchGoldToSemanticActions, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function isPrimaryCoOccurring(gold: { actionType: string; evidenceContains?: string }): boolean {
  const ev = gold.evidenceContains ?? "";
  if (/cast from exile|you may cast .*for as long as it remains exiled/i.test(ev)) return true;
  if (gold.actionType === "discard" && /whenever you discard|discard one or more artifact/i.test(ev)) return true;
  return false;
}

function main() {
  const cases = (
    JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
      cases: OracleActionEvalCaseV2[];
    }
  ).cases.filter((c) => (c as { coverageStratum?: string }).coverageStratum === "granted_ability_quote");

  const nestedRows: ReturnType<typeof evaluateCaseSemantic>[] = [];
  const primaryRows: ReturnType<typeof evaluateCaseSemantic>[] = [];

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
    const nestedGold = testCase.expectedPrimitiveActions.filter((g) => !g.negative && !isPrimaryCoOccurring(g));
    const primaryGold = testCase.expectedPrimitiveActions.filter((g) => !g.negative && isPrimaryCoOccurring(g));

    if (nestedGold.length > 0) {
      nestedRows.push(
        evaluateCaseSemantic(
          { ...testCase, expectedPrimitiveActions: [...nestedGold, ...testCase.expectedPrimitiveActions.filter((g) => g.negative)] },
          parsed,
        ),
      );
    }
    if (primaryGold.length > 0) {
      primaryRows.push(
        evaluateCaseSemantic(
          { ...testCase, expectedPrimitiveActions: [...primaryGold, ...testCase.expectedPrimitiveActions.filter((g) => g.negative)] },
          parsed,
        ),
      );
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    family: "granted_ability_quote",
    A_nestedSemanticActions: {
      description: "Granted span → rules classification → nested AbilityBlock → nested SemanticAction",
      caseCount: cases.length,
      goldActionCount: nestedRows.reduce((n, r) => n + r.accepted.tp + r.accepted.fn, 0),
      metrics: sumSemanticMetrics(nestedRows),
    },
    B_coOccurringPrimaryEffects: {
      description: "Card-native primary effects co-located in granted family pack — not nested granted pipeline",
      caseCount: cases.filter((c) => c.expectedPrimitiveActions.some((g) => !g.negative && isPrimaryCoOccurring(g))).length,
      goldActionCount: primaryRows.reduce((n, r) => n + r.accepted.tp + r.accepted.fn, 0),
      metrics: sumSemanticMetrics(primaryRows),
    },
    combinedHeadline: sumSemanticMetrics(cases.map((tc) => evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })))),
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "granted-split-metrics-v134.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
