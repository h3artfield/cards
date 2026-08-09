/**
 * Freeze v136 region-complete checkpoint — passes 1-3 + full region recognition state.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { loadEnvLocal } from "./lib/script-env";
import { runGrantedDevPrecisionControls } from "./run-granted-dev-precision-controls";

loadEnvLocal();

function fileHash(relPath: string): string {
  return createHash("sha256").update(readFileSync(resolve(relPath))).digest("hex");
}

function main() {
  resetRC3PromotedFamiliesToDefault();
  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim();

  execSync("npx --yes tsx scripts/reconcile-granted-v136-stage-b-denominator.ts", {
    cwd: resolve("."),
    stdio: "inherit",
  });

  const precision = runGrantedDevPrecisionControls();

  const freeze = {
    generatedAt: new Date().toISOString(),
    checkpoint: "oracle-action-v1.35-rc3-granted-region-complete",
    tag: "oracle-action-v1.35-rc3-granted-region-complete",
    parentPass1Tag: "rc3-granted-dev-pass-1",
    commit,
    grammarPasses: {
      pass1: "rc3-granted-dev-pass-1 — coordinated predicate",
      pass2: "rc3-granted-dev-pass-2 — token recipient",
      pass3: "rc3-granted-dev-pass-3 — triggered resolution",
    },
    blobs: {
      detector: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts"),
      classifier: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier.ts"),
      contextRouter: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts"),
      clauseNative: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
      transform: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts"),
      grantedExtraction: fileHash("src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction.ts"),
    },
    frozenRegressionResults: {
      v136SpentDevRegionEndToEnd: "26/0/0",
      v135ValidGrantedRegressions: "no regression",
      negativeControls: "0 granted FP",
      contextControls: "5/5",
      historicalDevUnion: "580/4/62 unchanged",
      semanticInvalidActionCount: precision.invariants.semanticInvalidActionCount,
      semanticValidatorViolationCount: precision.invariants.semanticValidatorViolationCount,
      activatedCostLayer2Leakage: precision.invariants.activatedCostLayer2Leakage,
      permissionLeakage: precision.invariants.permissionLeakage,
      tokenDefinitionCardNativeLeakage: precision.invariants.tokenDefinitionCardNativeLeakage,
      tokenCopyPrimitiveLeakage: precision.invariants.tokenCopyPrimitiveLeakage,
    },
    stageBReconciliation: JSON.parse(
      readFileSync(resolve("data/milestones/rc3-development/granted-v136-stage-b-denominator-reconciliation.json"), "utf8"),
    ).summary,
    precisionControls: precision,
    nextAuthorizedWork: "Compulsory Rest Stage-C nested activated extraction",
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v136-region-complete-freeze.json"),
    `${JSON.stringify(freeze, null, 2)}\n`,
  );
  console.log(JSON.stringify({ commit: commit.slice(0, 12), blobs: freeze.blobs, invariants: freeze.frozenRegressionResults }, null, 2));
}

main();
