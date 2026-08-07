/**
 * Evaluate development_generalization_expansion_v1 by split (training vs check).
 * Run: npx tsx scripts/eval-expansion-v1-splits.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { loadEnvLocal } from "./lib/script-env";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";

loadEnvLocal();

type ExpansionCase = OracleActionEvalCaseV2 & {
  expansionMetadata?: { split?: string };
};

function splitCases(cases: ExpansionCase[], split: string) {
  return cases.filter((c) => c.expansionMetadata?.split === split);
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  let parserCommit = "unknown";
  try {
    parserCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    /* ignore */
  }

  const path = resolve(process.cwd(), "data/oracle-action-eval-development-generalization-expansion-v1.json");
  const envelope = JSON.parse(readFileSync(path, "utf8")) as {
    contentHash: string;
    cases: ExpansionCase[];
  };

  const training = splitCases(envelope.cases, "expansion-training");
  const check = splitCases(envelope.cases, "expansion-check");

  const trainingResults = evaluateCaseSet(training, "expansion_v1_training");
  const checkResults = evaluateCaseSet(check, "expansion_v1_check");

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    contentHash: envelope.contentHash,
    expansionTraining: {
      caseCount: training.length,
      accepted: trainingResults.metricsByEmissionTier.acceptedOnly,
      unsupported: trainingResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    },
    expansionCheck: {
      caseCount: check.length,
      accepted: checkResults.metricsByEmissionTier.acceptedOnly,
      unsupported: checkResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    },
  };

  const outPath = resolve(process.cwd(), "reports/expansion-v1-baseline-v120-dev.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
