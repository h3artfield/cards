/**
 * Post-v137 nested-grant-complete parser freeze — immutable checkpoint after five primitive passes.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { loadAllGoldMigrationsV135 } from "./lib/rc3-gold-migration-v135";
import { loadEnvLocal } from "./lib/script-env";
import { runGrantedDevPrecisionControls } from "./run-granted-dev-precision-controls";

loadEnvLocal();

function fileHash(relPath: string): string {
  const p = resolve(relPath);
  if (!existsSync(p)) return "missing";
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function main() {
  resetRC3PromotedFamiliesToDefault();
  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();
  const cleanTreeFull = execSync("git status --porcelain", { cwd: gitRoot, encoding: "utf8" }).trim();
  const precision = runGrantedDevPrecisionControls();

  const optionalityAudit = execSync("npx --yes tsx scripts/eval-optionality-scope-regression.ts", {
    cwd: resolve("."),
    encoding: "utf8",
  });
  const optionalityReport = JSON.parse(optionalityAudit.trim());

  const v137SpentRun1 = JSON.parse(
    readFileSync(resolve("data/milestones/rc3-development/granted-v137-transfer-run-1-measurement-closure.json"), "utf8"),
  );

  const freeze = {
    generatedAt: new Date().toISOString(),
    checkpoint: "oracle-action-v1.37-rc3-granted-nested-complete",
    tag: "oracle-action-v1.37-rc3-granted-nested-complete",
    parentCheckpoint: "oracle-action-v1.36-rc3-granted-nested-dev",
    parentCommit: "c446b6baa1648b7d8d922631b9f6d996b5edc39e",
    workingParserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: commit,
    immutableParserCheckpoint: cleanTreeFull.length === 0,
    cleanTree: cleanTreeFull.length === 0,
    cleanTreeStatus: cleanTreeFull || "clean",
    workingParserBlobClosure: {
      transform: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts"),
      clauseNative: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
      actionBuilder: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-action-builder.ts"),
      optionality: fileHash("src/lib/deck-builder/golden-catalog/oracle-action-optionality.ts"),
      detector: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts"),
      classifier: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier.ts"),
      contextRouter: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts"),
      grantedExtraction: fileHash("src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction.ts"),
      abilityBlock: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block.ts"),
      semanticMatcher: fileHash("scripts/oracle-action-semantic-matcher.ts"),
      unifiedMatcher: fileHash("scripts/oracle-action-unified-matcher.ts"),
      semanticDedupeHash: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
    },
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    policyOverlayHash: createHash("sha256").update(JSON.stringify(loadAllGoldMigrationsV135())).digest("hex"),
    optionalityScopeAudit: optionalityReport,
    frozenRegressionState: {
      v137SpentDevRun1: "4/0/6 unique L2=10 P=100% R=40%",
      v137PostTuningDev: "10/0/0",
      v136Regions: "26/0/0",
      v136StageC: "2/0/0",
      staticStructuralControls: "1/1 PASS",
      contextControls: "5/5",
      negatives: "0 grant FP",
      historicalDevUnion: "580/4/62",
      semanticInvalid: precision.invariants.semanticInvalidActionCount,
      validatorViolations: precision.invariants.semanticValidatorViolationCount,
      activatedCostLayer2Leakage: precision.invariants.activatedCostLayer2Leakage,
      permissionLeakage: precision.invariants.permissionLeakage,
      tokenDefinitionSourceCardLeakage: precision.invariants.tokenDefinitionCardNativeLeakage,
      tokenCopyPrimitiveLeakage: precision.invariants.tokenCopyPrimitiveLeakage,
    },
    immutableSpentBaseline: {
      source: "granted-v137-transfer-run-1-measurement-closure.json",
      uniqueLayer2GoldCount: v137SpentRun1.uniqueLayer2Gold?.count ?? 10,
      regionLinked: v137SpentRun1.regionLinkedLayer2 ?? v137SpentRun1.uniqueLayer2Gold,
    },
    fivePrimitivePasses: [
      "optionality propagation (scoped may via attachOptionalityToAction)",
      "choice semantics (tap-or-untap choiceGroup)",
      "add_mana any-color grammar",
      "untap self grammar",
      "negative-counter grammar",
    ],
    authorizedNextStep: "v138 fresh transfer pack — single run only",
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v137-nested-complete-freeze.json"),
    `${JSON.stringify(freeze, null, 2)}\n`,
  );
  console.log(JSON.stringify({ commit: commit.slice(0, 12), tag: freeze.tag, optionality: optionalityReport.summary }, null, 2));
}

main();
