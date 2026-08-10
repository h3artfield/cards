/**
 * RC5 candidate freeze manifest — after certified development gates green.
 * Run: cd web && npx tsx scripts/freeze-rc5-candidate-v150-manifest.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135, loadAllGoldMigrationsV135 } from "./lib/rc3-gold-migration-v135";
import {
  computeGoldPolicyStackHashes,
  GOLD_POLICY_STACK_VERSION,
} from "./lib/gold-policy-stack-v1";
import { validatorSourceHash, GOLD_POLICY_VALIDATOR_VERSION, GOLD_POLICY_VERSION } from "./lib/gold-policy-validator-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { PARSER_BLOB_SCOPE_PATHS } from "./lib/parser-scope-paths-v1";
import { assertCleanWorkingTreeForParserScope } from "./lib/working-tree-provenance-guard-v1";

const OUT_DIR = "data/milestones/rc5-development";
const RESCORE_PATH = `${OUT_DIR}/rc5-certified-dev-rescore-v150.json`;
const REGRESSION_PACK_PATH = "data/oracle-action-eval-rc5-v14-regression-v151.json";
const REGRESSION_MANIFEST_PATH = `${OUT_DIR}/rc5-v14-regression-pack-manifest-v151.json`;

const PARSER_SCOPE_PATHS = [
  "src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block.ts",
  "src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts",
  "src/lib/deck-builder/golden-catalog/oracle-span-role-classifier.ts",
  "src/lib/deck-builder/golden-catalog/oracle-compound-clause-segmentation.ts",
  "src/lib/deck-builder/golden-catalog/oracle-modal-option-parse.ts",
  "src/lib/deck-builder/golden-catalog/oracle-action-structural-blocks.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3.ts",
  "src/lib/deck-builder/golden-catalog/oracle-semantic-parse-builder.ts",
  "src/lib/deck-builder/golden-catalog/oracle-ability-segmentation.ts",
  "scripts/oracle-action-semantic-matcher.ts",
  "scripts/oracle-action-unified-matcher.ts",
  "scripts/lib/gold-policy-validator-v1.ts",
  "scripts/lib/rc5-regression-scoring-v1.ts",
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

const KNOWN_BACKLOG_DEFECTS = [
  {
    id: "action-patterns-lowercase-put",
    summary: "ACTION_PATTERNS / PRIMITIVE_PATTERNS case-sensitivity — lowercase 'put' not matched",
    examples: ["put a stun counter", "put three stun counters"],
    exposedBy: ["vh14-0094", "vh14-0098"],
    status: "backlog_wait_v15",
    note: "Normalize case at match time — do not add one-off lowercase variants",
  },
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
  assertCleanWorkingTreeForParserScope(PARSER_BLOB_SCOPE_PATHS, "RC5 candidate freeze");

  const rescore = JSON.parse(readFileSync(resolve(RESCORE_PATH), "utf8"));
  if (!rescore.rc5CandidateReady) {
    throw new Error("Refusing RC5 freeze — rescore reports rc5CandidateReady=false");
  }

  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const parserCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const registryHash = sha256File("data/milestones/rc3-foundations/gold-policy-registry-v1.json");
  const policyStack = computeGoldPolicyStackHashes();
  const regressionManifest = JSON.parse(readFileSync(resolve(REGRESSION_MANIFEST_PATH), "utf8"));

  const manifestBody = {
    freezeLabel: "rc5-candidate-v150",
    status: "CANDIDATE_FROZEN",
    frozenAt: new Date().toISOString(),
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
      certifiedHash: rescore.developmentGoldHash,
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
    v14SpentRegressionLedger: rescore.v14SpentRegressionPack,
    knownBacklogDefects: KNOWN_BACKLOG_DEFECTS,
    waitThroughV15: [
      "variable_draw",
      "compound_mill",
      "saga_planeswalker",
      "scattered_one_offs",
      "action-patterns-lowercase-put",
    ],
    v15: {
      sealed: true,
      freezeManifestPath: "data/milestones/validation-v15-certification/validation-v15-freeze-manifest-v150.json",
      canonicalPath: "data/oracle-action-eval-validation-v15.json",
      expectedContentHash: "300929da9a640b93d3ad5bb0abce92a3c0614a1399b18248c1319bbaf4d7ef17",
      parserExecutionCount: 0,
      authorizedAfterFreeze: true,
      note: "Single execution authorized only after this RC5 freeze; v15 stack pin is separate from RC5 live stack",
    },
    blind: { touch: false },
  };

  const serialized = `${JSON.stringify(manifestBody, null, 2)}\n`;
  const manifestContentHash = createHash("sha256").update(serialized).digest("hex");
  const manifest = { ...manifestBody, manifestContentHash, developmentGoldHash: developmentGoldHash() };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(`${OUT_DIR}/rc5-candidate-v150-freeze-manifest.json`);
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, manifestContentHash, rc5CandidateReady: true }, null, 2));
}

main();
