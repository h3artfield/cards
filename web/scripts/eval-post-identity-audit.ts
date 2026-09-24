/**
 * Post-identity-audit eval — development_set_v10 + validation_set_v5 with current parser (v1.13 paused).
 * Run: npx tsx scripts/eval-post-identity-audit.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function main() {
  const dev = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-development-v10.json"), "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string; setClassification: string };
  const val = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-validation-v5.json"), "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string; setClassification: string };

  const devResults = evaluateCaseSet(dev.cases, "development_set_v10");
  const valResults = evaluateCaseSet(val.cases, "validation_set_v5");

  const report = {
    auditedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    note: "Parser v1.13 development paused; metrics are diagnostic on catalog-corrected datasets only.",
    finalBlindExecuted: false,
    developmentSetV10: {
      contentHash: dev.contentHash,
      caseCount: dev.cases.length,
      metrics: devResults.metricsByEmissionTier.acceptedOnly,
      unsupported: devResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    },
    validationSetV5: {
      contentHash: val.contentHash,
      caseCount: val.cases.length,
      metrics: valResults.metricsByEmissionTier.acceptedOnly,
      unsupported: valResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    },
  };

  const outPath = resolve(process.cwd(), "reports", "eval-post-identity-audit.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Post-identity-audit eval");
  console.log(`  parser: ${ORACLE_ACTION_PARSER_VERSION}`);
  console.log(`  dev v10 accepted P=${(report.developmentSetV10.metrics.precision * 100).toFixed(1)}% R=${(report.developmentSetV10.metrics.recall * 100).toFixed(1)}% unsupported=${report.developmentSetV10.unsupported}`);
  console.log(`  val v5  accepted P=${(report.validationSetV5.metrics.precision * 100).toFixed(1)}% R=${(report.validationSetV5.metrics.recall * 100).toFixed(1)}% unsupported=${report.validationSetV5.unsupported}`);
  console.log(`  report: ${outPath}`);
}

main();
