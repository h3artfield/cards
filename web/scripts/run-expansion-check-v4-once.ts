/**
 * Run sealed expansion-check-v4 holdout exactly once (RC2 fresh generalization gate).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";

async function main() {
  const path = "data/oracle-action-eval-development-generalization-expansion-check-v4.json";
  const envelope = JSON.parse(readFileSync(path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    parserExecutionCount: number;
    sealed: boolean;
  };

  if (!envelope.sealed) throw new Error("check-v4 is not sealed");
  if (envelope.parserExecutionCount !== 0) {
    throw new Error(`check-v4 already executed (${envelope.parserExecutionCount})`);
  }

  const repoRoot = resolve(process.cwd(), "..");
  const parserBlob = execSync(`git hash-object web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const metrics = evaluateCaseSet(envelope.cases, "expansion_check_v4_execution_1");
  const a = metrics.metricsByEmissionTier.acceptedOnly;
  const gatePass =
    a.precision >= 0.95 && a.recall >= 0.85 && a.falsePositives >= 0 && metrics.authoritativeClassification.counts.genuinely_unsupported_by_oracle === 0;

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserBlobSha: parserBlob,
    holdout: path,
    contentHash: envelope.contentHash,
    caseCount: envelope.cases.length,
    parserExecutionCount: 1,
    metrics: {
      tp: a.truePositives,
      fp: a.falsePositives,
      fn: a.falseNegatives,
      precision: a.precision,
      recall: a.recall,
      unsupported: metrics.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    },
    gate: { precision: 0.95, recall: 0.85, unsupported: 0 },
    gatePass,
    rc2Authorized: gatePass,
  };

  envelope.parserExecutionCount = 1;
  envelope.checkHoldout = {
    ...(envelope as { checkHoldout?: Record<string, unknown> }).checkHoldout,
    parserExecutionCount: 1,
    spent: true,
    holdoutStatus: "spent_for_development",
    executedAt: report.generatedAt,
    parserBlobSha: parserBlob,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
  };

  writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const outDir = resolve(process.cwd(), "data/milestones/rc2-development-planning");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "rc2-expansion-check-v4-execution-1.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
