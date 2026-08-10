/**
 * RC4 candidate freeze manifest — after certified development gold + gate matrix green.
 * Run: cd web && npx tsx scripts/freeze-rc4-candidate-v140-manifest.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135, loadAllGoldMigrationsV135 } from "./lib/rc3-gold-migration-v135";
import { validatorSourceHash, GOLD_POLICY_VALIDATOR_VERSION, GOLD_POLICY_VERSION } from "./lib/gold-policy-validator-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { assertCleanWorkingTreeForParserScope } from "./lib/working-tree-provenance-guard-v1";

const OUT_DIR = "data/milestones/rc4-development";
const RESCORE_PATH = `${OUT_DIR}/rc4-full-rescore-v140.json`;
const DEV_CERT_PATH = `${OUT_DIR}/rc4-development-gold-policy-certificate-v1.json`;
const V14_CERT_PATH = "data/milestones/validation-v14-certification/validation-v14-gold-policy-certificate-v1.json";
const REGRESSION_PACK_PATH = "data/oracle-action-eval-rc4-v13-regression-v140.json";

const PARSER_SCOPE_PATHS = [
  "src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-promotion.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-action-builder.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-schema.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-scoring-scope.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-extraction-metadata.ts",
  "scripts/oracle-action-unified-matcher.ts",
  "scripts/oracle-action-semantic-matcher.ts",
  "scripts/lib/rc3-case-scope-scoring.ts",
  "scripts/lib/gold-policy-validator-v1.ts",
  "scripts/lib/rc4-regression-scoring-v1.ts",
];

const GOLD_MIGRATION_PATHS = [
  "data/milestones/rc3-development/persistent-permission-gold-migration-v135.json",
  "data/milestones/rc3-development/granted-shuffle-gold-migration-v135.json",
  "data/milestones/rc3-development/token-definition-gold-migration-v135.json",
  "data/milestones/rc3-development/land-grant-permission-gold-migration-v137.json",
  "data/milestones/rc3-development/zone-ninjutsu-replacement-gold-migration-v137.json",
  "data/milestones/rc3-development/activated-cost-fall-to-earth-gold-migration-v139.json",
  "data/milestones/rc4-development/rc4-development-gold-policy-scrub-v1.json",
];

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function developmentGoldHash(): string {
  const paths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
    "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
  ];
  const cases = paths.flatMap((p) =>
    applyGoldMigrationV135(
      (JSON.parse(readFileSync(resolve(p), "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
    ),
  );
  return createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}

function main() {
  assertCleanWorkingTreeForParserScope(PARSER_SCOPE_PATHS, "RC4 candidate freeze");

  const rescore = JSON.parse(readFileSync(resolve(RESCORE_PATH), "utf8"));
  if (!rescore.candidateReady) {
    throw new Error("Refusing RC4 freeze — rescore reports candidateReady=false");
  }

  const devCert = JSON.parse(readFileSync(resolve(DEV_CERT_PATH), "utf8"));
  if (devCert.violations !== 0) {
    throw new Error("Refusing RC4 freeze — development gold certificate not clean");
  }

  const v14Cert = JSON.parse(readFileSync(resolve(V14_CERT_PATH), "utf8"));
  if (v14Cert.benchmarkHash !== "07675ba1f73672460c17788c4adbb8898877e677d6cdbe66a381e417adf7d5a3") {
    throw new Error("Refusing RC4 freeze — v14 certificate hash mismatch");
  }
  if (v14Cert.violations !== 0 || v14Cert.parserExecutionCount !== 0) {
    throw new Error("Refusing RC4 freeze — v14 not sealed/certified");
  }

  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const parserCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const registryHash = sha256File("data/milestones/rc3-foundations/gold-policy-registry-v1.json");

  const manifestBody = {
    freezeLabel: "rc4-candidate-v140",
    status: "CANDIDATE_FROZEN",
    frozenAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha,
    parserScopePaths: PARSER_SCOPE_PATHS,
    parserBlobClosureHash: createHash("sha256")
      .update(PARSER_SCOPE_PATHS.map((p) => sha256File(p)).join("\n"))
      .digest("hex"),
    goldPolicy: {
      policyVersion: GOLD_POLICY_VERSION,
      validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
      validatorHash: validatorSourceHash(),
      policyRegistryHash: registryHash,
    },
    developmentGold: {
      certifiedHash: devCert.developmentGoldHash,
      certificatePath: DEV_CERT_PATH,
      correctionsHash: devCert.migrationOverlay.correctionsHash,
      scrubOverlayHash: devCert.migrationOverlay.scrubOverlayHash,
    },
    goldMigrationOverlay: {
      paths: GOLD_MIGRATION_PATHS,
      hashes: Object.fromEntries(GOLD_MIGRATION_PATHS.map((p) => [p, sha256File(p)])),
      recordCount: loadAllGoldMigrationsV135().length,
    },
    evaluators: {
      semanticMatcher: sha256File("scripts/oracle-action-semantic-matcher.ts"),
      unifiedMatcher: sha256File("scripts/oracle-action-unified-matcher.ts"),
      goldPolicyValidator: sha256File("scripts/lib/gold-policy-validator-v1.ts"),
      rc4RegressionScoring: sha256File("scripts/lib/rc4-regression-scoring-v1.ts"),
    },
    regressionPack: {
      path: REGRESSION_PACK_PATH,
      hash: sha256File(REGRESSION_PACK_PATH),
    },
    authoritativeDevelopment: rescore.development,
    v13RegressionLedger: rescore.v13Regression.ledger,
    policyInvariants: rescore.policyInvariants,
    goldPolicyValidatorDevViolations: rescore.goldPolicyValidator.violations,
    v14: {
      sealed: true,
      benchmarkHash: v14Cert.benchmarkHash,
      certificatePath: V14_CERT_PATH,
      parserExecutionCount: 0,
      authorized: false,
      note: "Single execution authorized only after this RC4 freeze",
    },
    spentV13Residuals: {
      remainingKnownFn: rescore.v13Regression.ledger.remainingKnownFn,
      doNotFixBeforeFreeze: true,
    },
  };

  const serialized = `${JSON.stringify(manifestBody, null, 2)}\n`;
  const manifestContentHash = createHash("sha256").update(serialized).digest("hex");
  const manifest = { ...manifestBody, manifestContentHash, developmentGoldHash: developmentGoldHash() };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(`${OUT_DIR}/rc4-candidate-v140-freeze-manifest.json`);
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, manifestContentHash, candidateReady: true }, null, 2));
}

main();
