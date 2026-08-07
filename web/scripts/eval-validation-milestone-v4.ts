/**
 * Logged validation milestone — validation_set_v4 with current parser (v1.13+).
 * Run: npx tsx scripts/eval-validation-milestone-v4.ts
 */
import { readFileSync, mkdirSync, writeFileSync, execSync } from "node:fs";
import { resolve } from "node:path";
import {
  ORACLE_ACTION_PARSER_VERSION,
  ORACLE_ACTION_TAXONOMY_VERSION,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { auditValidationSet } from "./audit-validation-errors-v12";

const VALIDATION_V4_HASH = "c422988bc2816a86725cd7042c35d844c2b1cbd80ca5430c08a7f32bb403a076";

function main() {
  const v4 = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-validation-v4.json"), "utf8"),
  );
  let commitSha = "unknown";
  try {
    commitSha = execSync("git rev-parse HEAD", { cwd: resolve(process.cwd(), ".."), encoding: "utf8" }).trim();
  } catch {
    commitSha = "uncommitted";
  }

  const results = evaluateCaseSet(v4.cases, "validation_set_v4");
  const audit = auditValidationSet(v4.cases);
  const accepted = results.metricsByEmissionTier.acceptedOnly;

  const report = {
    generatedAt: new Date().toISOString(),
    evaluationVersion: "validation-v4-milestone-post-v9-gates",
    commitSha,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    taxonomyVersion: ORACLE_ACTION_TAXONOMY_VERSION,
    validationSet: "validation_set_v4",
    validationSetHash: v4.contentHash,
    developmentSetUsedForTuning: "development_set_v9",
    metrics: {
      accepted,
      needsReview: results.metricsByEmissionTier.needsReviewOnly,
      allEmission: results.metricsByEmissionTier.allEmission,
      tierInvariants: results.metricsByEmissionTier.tierInvariants,
    },
    acceptedUnsupportedCount: results.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    auditMismatchCount: audit.records.length,
    note: "Logged validation milestone after development_set_v9 gates passed. Blind test and pilot remain blocked.",
  };

  const milestoneDir = resolve(process.cwd(), "data", "milestones", "validation-v4-post-v9-gates");
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(resolve(milestoneDir, "milestone-report.json"), JSON.stringify(report, null, 2), "utf8");
  writeFileSync(resolve(process.cwd(), "reports", "validation-v4-milestone-post-v9-gates.json"), JSON.stringify(report, null, 2), "utf8");

  console.log("validation v4 milestone");
  console.log("accepted P/R:", (accepted.precision * 100).toFixed(1) + "%", (accepted.recall * 100).toFixed(1) + "%");
  console.log("unsupported:", report.acceptedUnsupportedCount);
  console.log("→", milestoneDir);
}

main();
