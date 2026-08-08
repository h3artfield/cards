/**
 * Measure per-family clause-native promotion impact.
 * Run: cd web && npx tsx scripts/eval-rc3-family-promotion-v132.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  clearRC3PromotedFamilies,
  setRC3PromotedFamilies,
  type PromotedNativeFamily,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import { isForbiddenPolicyLeak } from "./lib/rc3-case-scope-scoring";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & { coverageStratum?: string; spentV12Regression?: boolean };

function loadPositive(): Case[] {
  try {
    return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-v132.json", "utf8")) as { cases: Case[] }).cases;
  } catch {
    return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-v130.json", "utf8")) as { cases: Case[] }).cases;
  }
}

function evalFamily(cases: Case[], family: string) {
  const slice = cases.filter((c) => c.coverageStratum === family);
  const rows = slice.map((testCase) => {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    return evaluateCaseSemantic(testCase, parsed);
  });
  return { caseCount: slice.length, metrics: sumSemanticMetrics(rows) };
}

function policyViolations(cases: Case[]): number {
  const guardrail = JSON.parse(
    readFileSync("data/oracle-action-eval-rc3-policy-guardrail-v132.json", "utf8"),
  ) as { cases: Array<OracleActionEvalCaseV2 & { forbiddenPrimitiveActions?: string[] }> };
  let n = 0;
  for (const testCase of guardrail.cases) {
    const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
    for (const action of parsed.actions.filter((a) => a.reviewStatus === "accepted")) {
      if (
        isForbiddenPolicyLeak({
          testCase: testCase as never,
          actionType: action.actionType,
          cardStart: action.provenance.actionSpan.cardStart,
          cardEnd: action.provenance.actionSpan.cardEnd,
        })
      ) {
        n++;
      }
    }
  }
  return n;
}

function semanticInvalidCount(cases: Case[]): number {
  let n = 0;
  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    n += parsed.semanticValidation.invalidCount;
  }
  return n;
}

function promotionReport(family: PromotedNativeFamily, positive: Case[]) {
  clearRC3PromotedFamilies();
  const before = evalFamily(positive, family);
  const beforeInvalid = semanticInvalidCount(positive.filter((c) => c.coverageStratum === family));
  const beforePolicy = policyViolations(positive);

  setRC3PromotedFamilies([family]);
  const after = evalFamily(positive, family);
  const afterInvalid = semanticInvalidCount(positive.filter((c) => c.coverageStratum === family));
  const afterPolicy = policyViolations(positive);
  clearRC3PromotedFamilies();

  return {
    family,
    before: before.metrics,
    after: after.metrics,
    delta: {
      tp: after.metrics.tp - before.metrics.tp,
      fp: after.metrics.fp - before.metrics.fp,
      fn: before.metrics.fn - after.metrics.fn,
      fnRemoved: before.metrics.fn - after.metrics.fn,
      tpLost: Math.max(0, before.metrics.tp - after.metrics.tp),
      newFp: Math.max(0, after.metrics.fp - before.metrics.fp),
    },
    semanticInvalid: { before: beforeInvalid, after: afterInvalid, introduced: afterInvalid - beforeInvalid },
    policyViolations: { before: beforePolicy, after: afterPolicy, introduced: afterPolicy - beforePolicy },
  };
}

function main() {
  const positive = loadPositive();
  const granted = promotionReport("granted_ability_quote", positive);
  setRC3PromotedFamilies(["granted_ability_quote"]);
  const grantedActive = evalFamily(positive, "granted_ability_quote");
  clearRC3PromotedFamilies();

  setRC3PromotedFamilies(["granted_ability_quote", "search_put_shuffle_chain"]);
  const search = promotionReport("search_put_shuffle_chain", positive);
  clearRC3PromotedFamilies();

  const report = {
    generatedAt: new Date().toISOString(),
    promotions: [granted, search],
    grantedAbilityActiveMetrics: grantedActive.metrics,
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "rc3-family-promotion-v132-report.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
