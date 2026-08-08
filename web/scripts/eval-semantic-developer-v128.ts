/**
 * Development metrics using semantic evaluator (v1.28).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

function evalCorpus(cases: OracleActionEvalCaseV2[], label: string) {
  const semanticRows = cases.map((testCase) => {
    const parsed = parseOracleSemantics({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    return evaluateCaseSemantic(testCase, parsed);
  });
  const legacyRows = cases.map((testCase) => {
    const parsed = parseOracleSemantics({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    return evaluateCaseUnified(
      testCase,
      parsed.legacy.actions.map((a) => ({
        actionType: a.actionType,
        evidenceText: a.evidenceText,
        evidenceStart: a.evidenceStart,
        evidenceEnd: a.evidenceEnd,
        faceId: a.faceId,
        abilityIndex: a.abilityIndex,
        loyaltyCost: a.loyaltyCost,
        modalOptionId: a.modalOptionId,
        reviewStatus: a.reviewStatus,
        optionalEffect: a.optionalEffect,
        optional: a.optional,
      })),
    ).accepted;
  });

  const semantic = sumSemanticMetrics(semanticRows);
  const legacy = {
    tp: legacyRows.reduce((s, r) => s + r.tp, 0),
    fp: legacyRows.reduce((s, r) => s + r.fp, 0),
    fn: legacyRows.reduce((s, r) => s + r.fn, 0),
    precision: 0,
    recall: 0,
  };
  legacy.precision = legacy.tp + legacy.fp > 0 ? legacy.tp / (legacy.tp + legacy.fp) : 1;
  legacy.recall = legacy.tp + legacy.fn > 0 ? legacy.tp / (legacy.tp + legacy.fn) : 1;

  return { label, caseCount: cases.length, semantic, legacy };
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const parserCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const parserBlob = execSync(`git hash-object web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const expV2 = JSON.parse(readFileSync("data/oracle-action-eval-development-generalization-expansion-v2.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const expV3 = JSON.parse(readFileSync("data/oracle-action-eval-development-generalization-expansion-v3.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const expV5 = JSON.parse(readFileSync("data/oracle-action-eval-development-generalization-expansion-v5.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };

  const expV2Training = expV2.cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );
  const combined = [...dev.cases, ...expV2Training, ...expV3.cases, ...expV5.cases];

  const corpora = [
    evalCorpus(dev.cases, "development_v26"),
    evalCorpus(expV5.cases, "expansion_training_v5"),
    evalCorpus(combined, "combined_development"),
  ];

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    parserBlobSha: parserBlob,
    evaluator: "semantic-matcher-v128",
    corpora,
  };

  const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/semantic-evaluator-dev-metrics-v128.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(corpora, null, 2));
}

main();
