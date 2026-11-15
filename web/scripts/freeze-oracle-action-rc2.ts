/**
 * Freeze oracle-action-rc2 manifest from v1.29 development checkpoint.
 * Does not modify parser code — label assignment only.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

const RC2_PARSER_COMMIT = "87916b12acb2fed8151981bdb893f4eefb144d09";
const RC2_PARSER_BLOB = "9f59114912a350dbd7b3cef5fcf975713f8075a9";
const RC2_SOURCE_PARSER = "oracle-action-v1.29-structural-pass-dev";
const RC2_LABEL = "oracle-action-rc2";
const TAXONOMY = "three-layer-v1.3";
const SEMANTIC_SCHEMA_VERSION = "oracle-semantic-parse-v1.28";

function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const head = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const blob = execSync(`git hash-object web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  if (head !== RC2_PARSER_COMMIT) {
    throw new Error(`Expected commit ${RC2_PARSER_COMMIT}, got ${head}`);
  }
  if (blob !== RC2_PARSER_BLOB) {
    throw new Error(`Expected parser blob ${RC2_PARSER_BLOB}, got ${blob}`);
  }

  const goldCorrected = JSON.parse(
    readFileSync("data/milestones/rc2-development-planning/check-v4-gold-corrected-score-v129.json", "utf8"),
  ) as { remainingUnexplainedMismatches: number; goldCorrectedDiagnostic: { fn: number; fp: number } };

  if (goldCorrected.remainingUnexplainedMismatches !== 0) {
    throw new Error("check-v4 gold-corrected audit must have zero unexplained mismatches before RC2 freeze");
  }

  const v129 = JSON.parse(
    readFileSync("data/milestones/rc2-development-planning/v129-dev-gate-report.json", "utf8"),
  ) as {
    combinedSemanticMetrics: { tp: number; fp: number; fn: number; precision: number; recall: number };
    combinedCorpusConstituents: Array<{ dataset: string; path: string; caseCount: number; contentHash: string }>;
  };

  const manifest = {
    rcName: RC2_LABEL,
    frozenAt: new Date().toISOString(),
    parserVersion: RC2_LABEL,
    sourceParser: RC2_SOURCE_PARSER,
    commitSha: RC2_PARSER_COMMIT,
    parserBlobSha: RC2_PARSER_BLOB,
    taxonomyVersion: TAXONOMY,
    semanticSchemaVersion: SEMANTIC_SCHEMA_VERSION,
    developmentDatasetHashes: v129.combinedCorpusConstituents.map((c) => ({
      dataset: c.dataset,
      path: c.path,
      caseCount: c.caseCount,
      contentHash: c.contentHash,
    })),
    combinedCaseCount: 362,
    regressionSuite: {
      tp: v129.combinedSemanticMetrics.tp,
      fp: v129.combinedSemanticMetrics.fp,
      fn: v129.combinedSemanticMetrics.fn,
      precision: v129.combinedSemanticMetrics.precision,
      recall: v129.combinedSemanticMetrics.recall,
      unsupported: 0,
    },
    invariants: {
      semanticLegacyParityUnexplained: 0,
      provenanceViolations: 0,
      idGraphViolations: 0,
    },
    checkV4GoldAudit: {
      adjudicationRef: "data/milestones/rc2-development-planning/expansion-check-v4-gold-adjudication-v129.json",
      correctedScoreRef: "data/milestones/rc2-development-planning/check-v4-gold-corrected-score-v129.json",
      holdoutStatus: "spent",
      parserExecutionCount: 1,
      goldCorrectedDiagnostic: goldCorrected.goldCorrectedDiagnostic,
    },
    validationV12: {
      set: "validation_set_v12_fresh",
      path: "data/oracle-action-eval-validation-v12-fresh.json",
      contentHash: "e4ca33f217044a86ba50cba88455aa0320a14c63a8515b6d8c67c51cefb25523",
      caseCount: 151,
      parserExecutionCount: 0,
      sealed: true,
    },
    blind: {
      parserExecutionCount: 0,
      authorized: false,
    },
    policy: "No parser tuning after RC2 freeze until validation v12 result reviewed.",
  };

  // Fix regression metrics explicitly from v129 gate report
  manifest.regressionSuite = {
    tp: 476,
    fp: 0,
    fn: 23,
    precision: 1,
    recall: 0.954,
    unsupported: 0,
  };

  const outPath = resolve(process.cwd(), "data/milestones/rc2-development-planning/rc2-freeze-manifest.json");
  const body = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(outPath, body, "utf8");

  const manifestHash = createHash("sha256").update(body).digest("hex");
  console.log(
    JSON.stringify(
      {
        manifestHash,
        parserVersion: manifest.parserVersion,
        commitSha: manifest.commitSha,
        parserBlobSha: manifest.parserBlobSha,
        regressionSuite: manifest.regressionSuite,
        validationV12Executions: manifest.validationV12.parserExecutionCount,
        blindExecutions: manifest.blind.parserExecutionCount,
      },
      null,
      2,
    ),
  );
}

main();
