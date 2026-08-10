/**
 * RC8 candidate freeze manifest — after certified development gates green.
 * Run: cd web && npx tsx scripts/freeze-rc8-candidate-v152-manifest.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { PARSER_BLOB_SCOPE_PATHS } from "./lib/parser-scope-paths-v1";
import {
  computeGoldPolicyStackHashes,
  GOLD_POLICY_STACK_VERSION,
} from "./lib/gold-policy-stack-v1";
import { validatorSourceHash, GOLD_POLICY_VALIDATOR_VERSION, GOLD_POLICY_VERSION } from "./lib/gold-policy-validator-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const OUT_DIR = "data/milestones/rc8-development";
const RESCORE_PATH = `${OUT_DIR}/rc8-certified-dev-rescore-v152.json`;
const RC7_FREEZE_MANIFEST = "data/milestones/rc7-development/rc7-candidate-v152-freeze-manifest.json";

const PARSER_SCOPE_PATHS = [
  ...PARSER_BLOB_SCOPE_PATHS,
  "src/lib/deck-builder/golden-catalog/oracle-semantic-integrity.ts",
  "scripts/test-rc8-action-ownership-regressions.ts",
];

const RC8_REGRESSION_ARTIFACTS = [
  `${OUT_DIR}/rc8-grant-matrix-v17-v1.json`,
  `${OUT_DIR}/rc8-v1-legacy-containment-audit-v1.json`,
  `${OUT_DIR}/validation-v17-spent-rc8-diagnostic-v1.json`,
  `${OUT_DIR}/rc8-certified-dev-rescore-v152.json`,
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
  const rescore = JSON.parse(readFileSync(resolve(RESCORE_PATH), "utf8"));
  if (!rescore.rc8CandidateReady) {
    throw new Error("Refusing RC8 freeze — rescore reports rc8CandidateReady=false");
  }
  if (!rescore.invariantsPass) {
    throw new Error("Refusing RC8 freeze — policy invariants not green");
  }
  if (rescore.policyInvariants.acceptedActionOutsideOwnerSpanCount !== 0) {
    throw new Error("Refusing RC8 freeze — acceptedActionOutsideOwnerSpanCount != 0");
  }

  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const parserCommitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const policyStack = computeGoldPolicyStackHashes();
  const rc7Manifest = JSON.parse(readFileSync(resolve(RC7_FREEZE_MANIFEST), "utf8"));

  const manifest = {
    freezeLabel: "rc8-candidate-v152",
    status: "CANDIDATE_FROZEN",
    frozenAt: new Date().toISOString(),
    supersedes: RC7_FREEZE_MANIFEST,
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
      stackCompositeHash: policyStack.stackCompositeHash,
      stackFileHashes: policyStack,
      inheritedFromRc7: rc7Manifest.goldPolicy?.stackCompositeHash,
    },
    developmentGold: {
      certifiedHash: developmentGoldHash(),
      rescorePath: RESCORE_PATH,
    },
    invariantMatrix: {
      semanticInvalid: 0,
      validatorViolations: 0,
      idViolations: 0,
      provenanceViolations: 0,
      acceptedActionOutsideOwnerSpanCount: 0,
      acceptedReminderDerivedLayer2Count: 0,
      forbiddenEmissionCount: 0,
    },
    rc8WorkDelivered: {
      rc8_0: "modal_trigger_action_ownership_containment",
      rc8_1: "generalized_grant_recipient_grammar_and_subability_materialization",
      deferred: ["immediate_cast_grammar_vh17_0020", "referent_resolution", "replacement_long_tail"],
    },
    regressionArtifacts: Object.fromEntries(RC8_REGRESSION_ARTIFACTS.map((p) => [p, sha256File(p)])),
    v18Status: "SEALED_DARK",
    blindStatus: "DO_NOT_TOUCH",
    officialV17: { tp: 232, fp: 7, fn: 33, verdict: "FAIL_SPENT_PRESERVED" },
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(`${OUT_DIR}/rc8-candidate-v152-freeze-manifest.json`);
  writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
