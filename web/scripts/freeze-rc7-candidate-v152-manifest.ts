/**
 * RC7 candidate freeze manifest — after certified development gates green (Gold Policy = 0).
 * Run: cd web && npx tsx scripts/freeze-rc7-candidate-v152-manifest.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135, loadAllGoldMigrationsV135 } from "./lib/rc3-gold-migration-v135";
import { PARSER_BLOB_SCOPE_PATHS } from "./lib/parser-scope-paths-v1";
import { assertCleanRepositoryForHoldoutExecution } from "./lib/working-tree-provenance-guard-v1";
import {
  computeGoldPolicyStackHashes,
  GOLD_POLICY_STACK_VERSION,
} from "./lib/gold-policy-stack-v1";
import { validatorSourceHash, GOLD_POLICY_VALIDATOR_VERSION, GOLD_POLICY_VERSION } from "./lib/gold-policy-validator-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const OUT_DIR = "data/milestones/rc7-development";
const RESCORE_PATH = `${OUT_DIR}/rc7-certified-dev-rescore-v152.json`;
const REGRESSION_PACK_PATH = "data/oracle-action-eval-rc5-v14-regression-v151.json";
const REGRESSION_MANIFEST_PATH = "data/milestones/rc5-development/rc5-v14-regression-pack-manifest-v151.json";
const RC6_GOLD_SCRUB_PATH = "data/milestones/rc6-development/rc6-development-gold-policy-scrub-v1.json";
const RC7_GOLD_SCRUB_PATH = `${OUT_DIR}/rc7-development-gold-policy-scrub-v1.json`;
const RC7_GOLD_CORRECTION_REPORT_PATH = `${OUT_DIR}/rc7-development-gold-policy-correction-report-v1.json`;
const RC6_FREEZE_MANIFEST = "data/milestones/rc6-development/rc6-candidate-v151-freeze-manifest.json";

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
  RC7_GOLD_SCRUB_PATH,
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
  assertCleanRepositoryForHoldoutExecution("RC7 candidate freeze");

  const rescore = JSON.parse(readFileSync(resolve(RESCORE_PATH), "utf8"));
  if (!rescore.rc7CandidateReady) {
    throw new Error("Refusing RC7 freeze — rescore reports rc7CandidateReady=false");
  }
  if (rescore.goldPolicyValidatorDev?.violations !== 0) {
    throw new Error("Refusing RC7 freeze — development Gold Policy violations != 0");
  }
  if (!rescore.invariantsPass) {
    throw new Error("Refusing RC7 freeze — policy invariants not green");
  }

  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const parserCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const registryHash = sha256File("data/milestones/rc3-foundations/gold-policy-registry-v1.json");
  const policyStack = computeGoldPolicyStackHashes();
  const regressionManifest = JSON.parse(readFileSync(resolve(REGRESSION_MANIFEST_PATH), "utf8"));
  const rc6Manifest = JSON.parse(readFileSync(resolve(RC6_FREEZE_MANIFEST), "utf8"));

  const manifestBody = {
    freezeLabel: "rc7-candidate-v152",
    status: "CANDIDATE_FROZEN",
    frozenAt: new Date().toISOString(),
    supersedes: RC6_FREEZE_MANIFEST,
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
      priorCertifiedHash: rc6Manifest.developmentGold?.correctedCertifiedHash,
      correctedCertifiedHash: rescore.developmentGoldHash,
      rc6GoldPolicyScrubOverlayPath: RC6_GOLD_SCRUB_PATH,
      rc7GoldPolicyScrubOverlayPath: RC7_GOLD_SCRUB_PATH,
      rc7GoldPolicyScrubOverlayHash: sha256File(RC7_GOLD_SCRUB_PATH),
      rc7GoldPolicyCorrectionReportPath: RC7_GOLD_CORRECTION_REPORT_PATH,
      rc7GoldPolicyCorrectionReportHash: sha256File(RC7_GOLD_CORRECTION_REPORT_PATH),
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
    },
    rc7WorkAuthorization: {
      rc7_1_player_possessive_discard_your_hand: {
        status: "IMPLEMENTED",
        targets: { v15: ["vh15-0064"], v16: ["vh16-0047"] },
        goldActionTargetCount: { v15: 1, v16: 2, totalScoredTargets: 3 },
      },
      rc7_2_replacement_consequence_exile_instead: {
        status: "IMPLEMENTED",
        sharedRootCause: "possessive_graveyard_intercept_extension",
        targets: { v16: ["vh16-0027", "vh16-0038"] },
      },
      deferredFamilies: rescore.rc7WorkAuthorization?.deferred ?? [],
    },
    v17: {
      canonicalCertPath: "data/milestones/validation-v17-certification/validation-v17-gold-policy-certificate-v2.json",
      currentBenchmarkHashPrefix: "24765bdc",
      layer2Denominator: 265,
      parserExecutionCount: 0,
      authorizedAfterFreeze: true,
      note: "Single blind execution only after RC7 freeze + candidate-bound preflight green",
    },
    provenanceGuard: {
      required: true,
      assertCleanWorkingTreeForParserScope: true,
      parserBlobClosureReproducibleFromHead: true,
    },
    blind: { touch: false },
  };

  const serialized = `${JSON.stringify(manifestBody, null, 2)}\n`;
  const manifestContentHash = createHash("sha256").update(serialized).digest("hex");
  const manifest = { ...manifestBody, manifestContentHash, developmentGoldHash: developmentGoldHash() };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(`${OUT_DIR}/rc7-candidate-v152-freeze-manifest.json`);
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, manifestContentHash, rc7CandidateReady: true }, null, 2));
}

main();
