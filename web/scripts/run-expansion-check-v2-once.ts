/**
 * One-shot expansion-check-v2 execution on current parser.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const path = "data/oracle-action-eval-development-generalization-expansion-check-v2.json";
const envelope = JSON.parse(readFileSync(path, "utf8")) as {
  cases: OracleActionEvalCaseV2[];
  contentHash: string;
  parserExecutionCount: number;
};

if (envelope.parserExecutionCount > 0) {
  throw new Error(`expansion-check-v2 already executed ${envelope.parserExecutionCount} time(s)`);
}

const metrics = evaluateCaseSet(envelope.cases, "expansion_check_v2");
const accepted = metrics.metricsByEmissionTier.acceptedOnly;

const report = {
  generatedAt: new Date().toISOString(),
  parserVersion: ORACLE_ACTION_PARSER_VERSION,
  executionNumber: 1,
  caseCount: envelope.cases.length,
  contentHash: envelope.contentHash,
  metrics: {
    precision: accepted.precision,
    recall: accepted.recall,
    tp: accepted.truePositives,
    fp: accepted.falsePositives,
    fn: accepted.falseNegatives,
    unsupported: metrics.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
  },
  gate: {
    precisionTarget: 0.95,
    recallTarget: 0.85,
    passed: accepted.precision >= 0.95 && accepted.recall >= 0.85 && metrics.authoritativeClassification.counts.genuinely_unsupported_by_oracle === 0,
  },
};

envelope.parserExecutionCount = 1;
(envelope as { checkHoldout?: Record<string, unknown> }).checkHoldout = {
  ...(envelope as { checkHoldout?: Record<string, unknown> }).checkHoldout,
  parserExecutionCount: 1,
  firstExecutionAt: report.generatedAt,
  firstExecutionResult: report.gate.passed ? "passed" : "failed",
};

writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/expansion-check-v2-execution-1.json");
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
