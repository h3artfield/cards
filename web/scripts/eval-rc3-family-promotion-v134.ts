/**
 * Per-family clause-native promotion impact (v134 — search default-promoted).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  clearRC3PromotedFamilies,
  resetRC3PromotedFamiliesToDefault,
  setRC3PromotedFamilies,
  type PromotedNativeFamily,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import { isForbiddenPolicyLeak } from "./lib/rc3-case-scope-scoring";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & { coverageStratum?: string; spentV12Regression?: boolean };

function loadPositive(): Case[] {
  return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: Case[];
  }).cases;
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
  const guardrail = JSON.parse(readFileSync("data/oracle-action-eval-rc3-policy-guardrail-v132.json", "utf8")) as {
    cases: Array<OracleActionEvalCaseV2 & { forbiddenPrimitiveActions?: string[] }>;
  };
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

function costLeakage(cases: Case[]): number {
  let n = 0;
  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    for (const action of parsed.actions) {
      if (action.actionType === "sacrifice" && /^\{[^}]+\}/.test(testCase.oracleText) && testCase.oracleText.indexOf(":") > 0) {
        const colon = testCase.oracleText.indexOf(":");
        if (action.provenance.actionSpan.cardStart < colon) n++;
      }
    }
  }
  return n;
}

function promotionReport(family: PromotedNativeFamily, positive: Case[], beforeFamilies: PromotedNativeFamily[]) {
  clearRC3PromotedFamilies();
  setRC3PromotedFamilies(beforeFamilies);
  const before = evalFamily(positive, family);
  const beforePolicy = policyViolations(positive);
  const beforeInvalid = semanticInvalidCount(positive.filter((c) => c.coverageStratum === family));
  const beforeCost = costLeakage(positive.filter((c) => c.coverageStratum === family));

  setRC3PromotedFamilies([...new Set([...beforeFamilies, family])]);
  const after = evalFamily(positive, family);
  const afterPolicy = policyViolations(positive);
  const afterInvalid = semanticInvalidCount(positive.filter((c) => c.coverageStratum === family));
  const afterCost = costLeakage(positive.filter((c) => c.coverageStratum === family));

  resetRC3PromotedFamiliesToDefault();

  return {
    family,
    beforeFamilies,
    afterFamilies: [...new Set([...beforeFamilies, family])],
    before: before.metrics,
    after: after.metrics,
    delta: {
      tp: after.metrics.tp - before.metrics.tp,
      fp: after.metrics.fp - before.metrics.fp,
      fn: before.metrics.fn - after.metrics.fn,
      fnRemoved: before.metrics.fn - after.metrics.fn,
      newFp: Math.max(0, after.metrics.fp - before.metrics.fp),
    },
    semanticInvalid: { before: beforeInvalid, after: afterInvalid, introduced: afterInvalid - beforeInvalid },
    policyViolations: { before: beforePolicy, after: afterPolicy, introduced: afterPolicy - beforePolicy },
    costLeakage: { before: beforeCost, after: afterCost, introduced: afterCost - beforeCost },
  };
}

function countExtractionSources(cases: Case[]) {
  let v1Legacy = 0;
  let rc3Transform = 0;
  let rc3ClauseNative = 0;
  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    for (const action of parsed.legacy.actions) {
      const src = (action as { extractionSource?: string }).extractionSource;
      if (src === "v1_legacy") v1Legacy++;
      else if (src === "rc3_transform") rc3Transform++;
      else if (src === "rc3_clause_native") rc3ClauseNative++;
    }
  }
  return { v1_legacy: v1Legacy, rc3_transform: rc3Transform, rc3_clause_native: rc3ClauseNative };
}

function main() {
  const positive = loadPositive();
  resetRC3PromotedFamiliesToDefault();

  const searchDefault = evalFamily(positive, "search_put_shuffle_chain");
  const extractionSources = countExtractionSources(positive);

  const granted = promotionReport("granted_ability_quote", positive, ["search_put_shuffle_chain"]);
  const activated = promotionReport("activated_post_colon_effect", positive, ["search_put_shuffle_chain"]);

  const report = {
    generatedAt: new Date().toISOString(),
    defaultPromotedFamilies: ["search_put_shuffle_chain"],
    searchChainDefaultPromotion: searchDefault,
    extractionSourceCountsCatalog: extractionSources,
    promotions: [granted, activated],
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "rc3-family-promotion-v134-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
