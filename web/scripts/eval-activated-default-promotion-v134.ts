/**
 * Activated default promotion — isolated experiment + full corpus regression.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import {
  clearRC3PromotedFamilies,
  resetRC3PromotedFamiliesToDefault,
  setRC3PromotedFamilies,
} from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import { isForbiddenPolicyLeak } from "./lib/rc3-case-scope-scoring";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Case = OracleActionEvalCaseV2 & { coverageStratum?: string };

function loadCatalog(): Case[] {
  return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: Case[];
  }).cases;
}

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

function evalFamily(cases: Case[], family: string) {
  const slice = cases.filter((c) => c.coverageStratum === family);
  const rows = slice.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
  );
  return sumSemanticMetrics(rows);
}

function evalCorpus(cases: Case[]) {
  const rows = cases.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace })),
  );
  return sumSemanticMetrics(rows);
}

function guardrailViolations(): number {
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

function semanticInvalid(cases: Case[]): number {
  let n = 0;
  for (const tc of cases) n += parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText }).semanticValidation.invalidCount;
  return n;
}

function extractionSources(cases: Case[]) {
  let v1 = 0;
  let transform = 0;
  let native = 0;
  for (const tc of cases) {
    for (const a of parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText }).legacy.actions) {
      const src = (a as { extractionSource?: string }).extractionSource;
      if (src === "v1_legacy") v1++;
      else if (src === "rc3_transform") transform++;
      else if (src === "rc3_clause_native") native++;
    }
  }
  return { v1_legacy: v1, rc3_transform: transform, rc3_clause_native: native };
}

function main() {
  const catalog = loadCatalog();
  const combined = loadCombined();

  clearRC3PromotedFamilies();
  setRC3PromotedFamilies(["search_put_shuffle_chain"]);
  const beforeActivated = evalFamily(catalog, "activated_post_colon_effect");
  const beforeCombined = evalCorpus(combined);
  const beforeGuard = guardrailViolations();
  const beforeInvalid = semanticInvalid(combined);

  resetRC3PromotedFamiliesToDefault();
  const afterActivated = evalFamily(catalog, "activated_post_colon_effect");
  const afterCombined = evalCorpus(combined);
  const afterGuard = guardrailViolations();
  const afterInvalid = semanticInvalid(combined);
  const sources = extractionSources(combined);

  const report = {
    generatedAt: new Date().toISOString(),
    defaultPromotedFamilies: ["search_put_shuffle_chain", "activated_post_colon_effect"],
    activatedFamilyExperiment: {
      beforeFamilies: ["search_put_shuffle_chain"],
      afterFamilies: ["search_put_shuffle_chain", "activated_post_colon_effect"],
      before: beforeActivated,
      after: afterActivated,
      delta: {
        tp: afterActivated.tp - beforeActivated.tp,
        fp: afterActivated.fp - beforeActivated.fp,
        fn: beforeActivated.fn - afterActivated.fn,
      },
    },
    fullCorpusRegression: {
      caseCount: combined.length,
      beforeCombined,
      afterCombined,
      delta: {
        tp: afterCombined.tp - beforeCombined.tp,
        fp: afterCombined.fp - beforeCombined.fp,
        fn: beforeCombined.fn - afterCombined.fn,
      },
      guardrailViolations: { before: beforeGuard, after: afterGuard },
      semanticInvalid: { before: beforeInvalid, after: afterInvalid },
      accepted:
        afterGuard === 0 &&
        afterInvalid <= beforeInvalid &&
        afterCombined.fp <= beforeCombined.fp,
    },
    extractionSourceCounts: sources,
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "activated-default-promotion-v134-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
