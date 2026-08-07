/**
 * Record oracle-action-rc1 freeze metadata from current HEAD.
 * Run after commit: npx tsx scripts/freeze-oracle-action-rc1.ts
 */
import { readFileSync, writeFileSync, execSync } from "node:fs";
import { resolve } from "node:path";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { migrationPolicyHash } from "./lib/taxonomy-v13-shuffle-migration";

const RC_NAME = "oracle-action-rc1";
const EXPECTED_PARSER = "oracle-action-v1.19-precision-pass";

function main() {
  if (ORACLE_ACTION_PARSER_VERSION !== EXPECTED_PARSER) {
    throw new Error(`Expected parser ${EXPECTED_PARSER}`);
  }

  const repoRoot = resolve(process.cwd(), "..");
  const commitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const status = execSync("git status --porcelain", { cwd: repoRoot, encoding: "utf8" }).trim();

  const devV25 = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v25.json"), "utf8"),
  );
  const valV9 = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-validation-v9.json"), "utf8"),
  );
  const blindManifest = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-final-blind-v2-manifest.json"), "utf8"),
  );

  const manifest = {
    rcName: RC_NAME,
    frozenAt: new Date().toISOString(),
    commitSha,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    taxonomyVersion: "three-layer-v1.3",
    developmentSet: {
      classification: "development_set_v25",
      path: "data/oracle-action-eval-development-v25.json",
      contentHash: devV25.contentHash,
    },
    validationSet: {
      classification: "validation_set_v9",
      path: "data/oracle-action-eval-validation-v9.json",
      contentHash: valV9.contentHash,
      parentContentHash: valV9.parentContentHash,
    },
    blindBenchmark: {
      path: blindManifest.path,
      contentHash: blindManifest.contentHash,
      goldTaxonomyVersion: blindManifest.goldTaxonomyVersion,
      parserExecutionCount: blindManifest.parserExecutionCount ?? 0,
      sealed: blindManifest.sealed ?? true,
    },
    taxonomyMigrationHash: migrationPolicyHash(),
    workingTreeClean: status.length === 0,
    workingTreeStatus: status || "(clean)",
    reproduction: {
      devBaseline: "npx tsx scripts/eval-catalog-baseline-v13-dev.ts",
      regressionTests: "npx tsx scripts/test-oracle-span-role-v13.ts",
      validationMilestone: "npx tsx scripts/eval-validation-milestone-rc1.ts",
    },
    validationPolicy: "Single validation execution only. No parser changes before or during milestone.",
    blindPolicy: "Parser blocked on blind until final candidate after validation pass.",
  };

  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-rc1-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(manifest, null, 2));
}

main();
