/**
 * Gold Policy stack v1.8 — independent versioning from frozen v1.7 (RC8 parser scope).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
  validatorSourceHash,
} from "./gold-policy-validator-v1.8";

export const GOLD_POLICY_STACK_V18_VERSION = "gold-policy-stack-v1.8";

export const GOLD_POLICY_STACK_V18_PATHS = {
  policyRegistry: "data/milestones/rc3-foundations/gold-policy-registry-v1.8.json",
  validatorSource: "scripts/lib/gold-policy-validator-v1.8.ts",
  semanticEnrichment: "scripts/lib/gold-semantic-enrichment-v1.ts",
  spanRoleClassifier: "src/lib/deck-builder/golden-catalog/oracle-span-role-classifier.ts",
  policyAdjudication: "scripts/lib/validation-v18-policy-adjudication.ts",
  policyExtensions: "scripts/lib/gold-policy-adjudication-v1.8-extensions.ts",
  runnerConfig: "scripts/run-gold-policy-validator.ts",
} as const;

export type GoldPolicyStackV18Hashes = {
  stackVersion: typeof GOLD_POLICY_STACK_V18_VERSION;
  policyVersion: string;
  validatorVersion: string;
  validatorSourceHash: string;
  policyRegistryHash: string;
  validatorFileHash: string;
  semanticEnrichmentFileHash: string;
  spanRoleClassifierFileHash: string;
  policyAdjudicationFileHash: string;
  policyExtensionsFileHash: string;
  runnerConfigFileHash: string;
  stackCompositeHash: string;
};

function sha256File(relPath: string): string {
  return createHash("sha256").update(readFileSync(resolve(relPath))).digest("hex");
}

export function computeGoldPolicyStackV18Hashes(): GoldPolicyStackV18Hashes {
  const registry = JSON.parse(readFileSync(resolve(GOLD_POLICY_STACK_V18_PATHS.policyRegistry), "utf8"));
  const policyRegistryHash = createHash("sha256")
    .update(JSON.stringify({ ...registry, contentHash: undefined }, null, 2))
    .digest("hex");
  const validatorFileHash = sha256File(GOLD_POLICY_STACK_V18_PATHS.validatorSource);
  const semanticEnrichmentFileHash = sha256File(GOLD_POLICY_STACK_V18_PATHS.semanticEnrichment);
  const spanRoleClassifierFileHash = sha256File(GOLD_POLICY_STACK_V18_PATHS.spanRoleClassifier);
  const policyAdjudicationFileHash = sha256File(GOLD_POLICY_STACK_V18_PATHS.policyAdjudication);
  const policyExtensionsFileHash = sha256File(GOLD_POLICY_STACK_V18_PATHS.policyExtensions);
  const runnerConfigFileHash = sha256File(GOLD_POLICY_STACK_V18_PATHS.runnerConfig);
  const sourceHash = validatorSourceHash();

  const stackCompositeHash = createHash("sha256")
    .update(
      [
        GOLD_POLICY_STACK_V18_VERSION,
        sourceHash,
        policyRegistryHash,
        validatorFileHash,
        semanticEnrichmentFileHash,
        spanRoleClassifierFileHash,
        policyAdjudicationFileHash,
        policyExtensionsFileHash,
        runnerConfigFileHash,
      ].join("\n"),
    )
    .digest("hex");

  return {
    stackVersion: GOLD_POLICY_STACK_V18_VERSION,
    policyVersion: GOLD_POLICY_VERSION,
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    validatorSourceHash: sourceHash,
    policyRegistryHash,
    validatorFileHash,
    semanticEnrichmentFileHash,
    spanRoleClassifierFileHash,
    policyAdjudicationFileHash,
    policyExtensionsFileHash,
    runnerConfigFileHash,
    stackCompositeHash,
  };
}
