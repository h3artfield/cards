/**
 * RC6 candidate freeze manifest — after certified development gates green (Gold Policy = 0).
 * Run: cd web && npx tsx scripts/freeze-rc6-candidate-v151-manifest.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135, loadAllGoldMigrationsV135 } from "./lib/rc3-gold-migration-v135";
import { PARSER_BLOB_SCOPE_PATHS } from "./lib/parser-scope-paths-v1";
import { assertCleanWorkingTreeForParserScope } from "./lib/working-tree-provenance-guard-v1";
import {
  computeGoldPolicyStackHashes,
  GOLD_POLICY_STACK_VERSION,
} from "./lib/gold-policy-stack-v1";
import { validatorSourceHash, GOLD_POLICY_VALIDATOR_VERSION, GOLD_POLICY_VERSION } from "./lib/gold-policy-validator-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const OUT_DIR = "data/milestones/rc6-development";
const RESCORE_PATH = "data/milestones/rc5-development/rc5-certified-dev-rescore-v150.json";
const REGRESSION_PACK_PATH = "data/oracle-action-eval-rc5-v14-regression-v151.json";
const REGRESSION_MANIFEST_PATH = "data/milestones/rc5-development/rc5-v14-regression-pack-manifest-v151.json";
const RC6_GOLD_SCRUB_PATH = "data/milestones/rc6-development/rc6-development-gold-policy-scrub-v1.json";
const RC6_GOLD_CORRECTION_REPORT_PATH =
  "data/milestones/rc6-development/rc6-development-gold-policy-correction-report-v1.json";
const PRESERVED_PRE_SCRUB_RESCORE_PATH =
  "data/milestones/rc6-development/rc5-certified-dev-rescore-v150-preserved-pre-rc6-gold-scrub.json";

const PARSER_SCOPE_PATHS = [...PARSER_BLOB_SCOPE_PATHS];

const GOLD_MIGRATION_PATHS = [
  "data/milestones/rc3-development/persistent-permission-gold-migration-v135.json",
  "data/milestones/rc3-development/granted-shuffle-gold-migration-v135.json",
  "data/milestones/rc3-development/token-definition-gold-migration-v135.json",
  "data/milestones/rc3-development/land-grant-permission-gold-migration-v137.json",
  "data/milestones/rc3-development/zone-ninjutsu-replacement-gold-migration-v137.json",
  "data/milestones/rc3-development/activated-cost-fall-to-earth-gold-migration-v139.json",
  "data/milestones/rc4-development/rc4-development-gold-policy-scrub-v1.json",
  RC6_GOLD_SCRUB_PATH,
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
  assertCleanWorkingTreeForParserScope(PARSER_SCOPE_PATHS, "RC6 candidate freeze");

  const rescore = JSON.parse(readFileSync(resolve(RESCORE_PATH), "utf8"));
  if (!rescore.rc5CandidateReady) {
    throw new Error("Refusing RC6 freeze — rescore reports rc5CandidateReady=false");
  }
  if (rescore.goldPolicyValidatorDev?.violations !== 0) {
    throw new Error("Refusing RC6 freeze — development Gold Policy violations != 0");
  }
  if (!rescore.invariantsPass) {
    throw new Error("Refusing RC6 freeze — policy invariants not green");
  }

  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const parserCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const registryHash = sha256File("data/milestones/rc3-foundations/gold-policy-registry-v1.json");
  const policyStack = computeGoldPolicyStackHashes();
  const regressionManifest = JSON.parse(readFileSync(resolve(REGRESSION_MANIFEST_PATH), "utf8"));

  const manifestBody = {
    freezeLabel: "rc6-candidate-v151",
    status: "CANDIDATE_FROZEN",
    frozenAt: new Date().toISOString(),
    supersedes: "data/milestones/rc5-development/rc5-candidate-v150-freeze-manifest.json",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha,
    parserScopePaths: PARSER_SCOPE_PATHS,
    parserBlobClosureHash: createHash("sha256")
      .update(PARSER_SCOPE_PATHS.map((p) => sha256File(p)).join("\n"))
      .digest("hex"),
    goldPolicy: {
      stackVersion: GOLD_POLICY_STACK_VERSION,
      policyVersion: GOLD_POLICY_VERSION,
      validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
      validatorHash: validatorSourceHash(),
      policyRegistryHash: registryHash,
      stackCompositeHash: policyStack.stackCompositeHash,
      stackFileHashes: policyStack,
    },
    developmentGold: {
      priorCertifiedHash: "eae3767e192f202752cc9424e2a9b05636d76a7bfda0768dfa1f1954e57c3945",
      correctedCertifiedHash: rescore.developmentGoldHash,
      goldPolicyScrubOverlayPath: RC6_GOLD_SCRUB_PATH,
      goldPolicyScrubOverlayHash: sha256File(RC6_GOLD_SCRUB_PATH),
      goldPolicyCorrectionReportPath: RC6_GOLD_CORRECTION_REPORT_PATH,
      goldPolicyCorrectionReportHash: sha256File(RC6_GOLD_CORRECTION_REPORT_PATH),
      preservedPreScrubRescorePath: PRESERVED_PRE_SCRUB_RESCORE_PATH,
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
      rc5RegressionScoring: sha256File("scripts/lib/rc5-regression-scoring-v1.ts"),
      reminderDerivedLeakage: sha256File("scripts/lib/reminder-derived-leakage-v1.ts"),
    },
    invariantMatrix: {
      ...rescore.policyInvariants,
      forbiddenEmissionCount: 0,
      invariantsPass: rescore.invariantsPass,
    },
    regressionPack: {
      path: REGRESSION_PACK_PATH,
      hash: sha256File(REGRESSION_PACK_PATH),
      manifestPath: REGRESSION_MANIFEST_PATH,
      manifestHash: regressionManifest.manifestHash,
      contentHash: regressionManifest.contentHash,
      version: "rc5-v14-regression-v151",
    },
    certifiedDevelopmentGates: {
      combined: rescore.combinedDevelopment,
      unrelated: rescore.unrelatedCatalogPositive,
      goldPolicyValidatorDev: rescore.goldPolicyValidatorDev,
      policyInvariants: rescore.policyInvariants,
      invariantsPass: rescore.invariantsPass,
      pass1Closed: rescore.pass1Closed,
    },
    v14SpentRegressionLedger: rescore.v14SpentRegressionPack,
    v15ForensicLedger: {
      path: "data/milestones/validation-v15-certification/validation-v15-forensic-adjudication-v1.4.json",
      note: "Official v15 remains 207/5/33 FAIL/SPENT — forensic v1.4 only",
    },
    rc6WorkAuthorization: {
      rc6_0: "ACCEPTED",
      rc6_1: "ACCEPTED",
      rc6_2: "ACCEPTED",
      rc6_3: "STOP_WAIT_V16",
      rc6_4: "STOP_WAIT_V16",
    },
    v16: {
      canonicalPath: "data/oracle-action-eval-validation-v16.json",
      expectedContentHash: "7805b98f837b090dad2b14486ebe2200b1c3bea9d6ad702c01d23085bf1a8007",
      layer2Denominator: 247,
      parserExecutionCount: 0,
      authorizedAfterFreeze: true,
      note: "Single execution authorized only after RC6 freeze + candidate-bound v16 certificate v4",
    },
    blind: { touch: false },
  };

  const serialized = `${JSON.stringify(manifestBody, null, 2)}\n`;
  const manifestContentHash = createHash("sha256").update(serialized).digest("hex");
  const manifest = { ...manifestBody, manifestContentHash, developmentGoldHash: developmentGoldHash() };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(`${OUT_DIR}/rc6-candidate-v151-freeze-manifest.json`);
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, manifestContentHash, rc6CandidateReady: true }, null, 2));
}

main();
