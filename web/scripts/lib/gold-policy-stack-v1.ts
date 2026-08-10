/**
 * Pinned Gold Policy stack — all certification and execution preflight must bind these hashes.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
  validatorSourceHash,
} from "./gold-policy-validator-v1";

export const GOLD_POLICY_STACK_VERSION = "gold-policy-stack-v1";

export const GOLD_POLICY_STACK_PATHS = {
  policyRegistry: "data/milestones/rc3-foundations/gold-policy-registry-v1.json",
  validatorSource: "scripts/lib/gold-policy-validator-v1.ts",
  semanticEnrichment: "scripts/lib/gold-semantic-enrichment-v1.ts",
  spanRoleClassifier: "src/lib/deck-builder/golden-catalog/oracle-span-role-classifier.ts",
  policyAdjudication: "scripts/lib/validation-v13-policy-adjudication.ts",
  runnerConfig: "scripts/run-gold-policy-validator.ts",
} as const;

export type GoldPolicyStackHashes = {
  stackVersion: typeof GOLD_POLICY_STACK_VERSION;
  policyVersion: string;
  validatorVersion: string;
  validatorSourceHash: string;
  policyRegistryHash: string;
  validatorFileHash: string;
  semanticEnrichmentFileHash: string;
  spanRoleClassifierFileHash: string;
  policyAdjudicationFileHash: string;
  runnerConfigFileHash: string;
  stackCompositeHash: string;
};

export type GoldPolicyCertificateV2 = {
  certificateVersion: "gold-policy-validation-certificate-v2";
  certifiedAt: string;
  benchmarkPath: string;
  benchmarkHash: string;
  benchmarkStatus: "sealed_policy_certified";
  policyVersion: string;
  validatorVersion: string;
  validatorHash: string;
  policyRegistryHash: string;
  policyStack: GoldPolicyStackHashes;
  parserExecutionCount: 0;
  violations: 0;
  census: Record<string, number>;
  perPolicyFamily: Record<string, number>;
  note?: string;
};

function sha256File(relPath: string): string {
  return createHash("sha256").update(readFileSync(resolve(relPath))).digest("hex");
}

export function computePolicyRegistryHash(): string {
  const registry = JSON.parse(readFileSync(resolve(GOLD_POLICY_STACK_PATHS.policyRegistry), "utf8"));
  return createHash("sha256")
    .update(JSON.stringify({ ...registry, contentHash: undefined }, null, 2))
    .digest("hex");
}

export function computeGoldPolicyStackHashes(): GoldPolicyStackHashes {
  const policyRegistryHash = computePolicyRegistryHash();
  const validatorFileHash = sha256File(GOLD_POLICY_STACK_PATHS.validatorSource);
  const semanticEnrichmentFileHash = sha256File(GOLD_POLICY_STACK_PATHS.semanticEnrichment);
  const spanRoleClassifierFileHash = sha256File(GOLD_POLICY_STACK_PATHS.spanRoleClassifier);
  const policyAdjudicationFileHash = sha256File(GOLD_POLICY_STACK_PATHS.policyAdjudication);
  const runnerConfigFileHash = sha256File(GOLD_POLICY_STACK_PATHS.runnerConfig);
  const sourceHash = validatorSourceHash();

  const stackCompositeHash = createHash("sha256")
    .update(
      [
        GOLD_POLICY_STACK_VERSION,
        sourceHash,
        policyRegistryHash,
        validatorFileHash,
        semanticEnrichmentFileHash,
        spanRoleClassifierFileHash,
        policyAdjudicationFileHash,
        runnerConfigFileHash,
      ].join("\n"),
    )
    .digest("hex");

  return {
    stackVersion: GOLD_POLICY_STACK_VERSION,
    policyVersion: GOLD_POLICY_VERSION,
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    validatorSourceHash: sourceHash,
    policyRegistryHash,
    validatorFileHash,
    semanticEnrichmentFileHash,
    spanRoleClassifierFileHash,
    policyAdjudicationFileHash,
    runnerConfigFileHash,
    stackCompositeHash,
  };
}

export type StackVerificationResult = {
  pass: boolean;
  mismatches: Array<{ field: string; certified: string; live: string }>;
};

export function verifyGoldPolicyStackAgainstCertificate(
  cert: { policyStack?: GoldPolicyStackHashes; policyRegistryHash?: string; validatorHash?: string },
): StackVerificationResult {
  const live = computeGoldPolicyStackHashes();
  const mismatches: StackVerificationResult["mismatches"] = [];

  if (cert.policyStack) {
    const fields: Array<keyof Omit<GoldPolicyStackHashes, "stackVersion" | "policyVersion" | "validatorVersion">> = [
      "validatorSourceHash",
      "policyRegistryHash",
      "validatorFileHash",
      "semanticEnrichmentFileHash",
      "spanRoleClassifierFileHash",
      "policyAdjudicationFileHash",
      "runnerConfigFileHash",
      "stackCompositeHash",
    ];
    for (const field of fields) {
      const certified = cert.policyStack[field];
      const liveVal = live[field];
      if (certified !== liveVal) {
        mismatches.push({ field, certified, live: liveVal });
      }
    }
  } else {
    if (cert.validatorHash && cert.validatorHash !== live.validatorSourceHash) {
      mismatches.push({ field: "validatorSourceHash", certified: cert.validatorHash, live: live.validatorSourceHash });
    }
    if (cert.policyRegistryHash && cert.policyRegistryHash !== live.policyRegistryHash) {
      mismatches.push({ field: "policyRegistryHash", certified: cert.policyRegistryHash, live: live.policyRegistryHash });
    }
    mismatches.push({
      field: "policyStack",
      certified: "missing-v1-certificate",
      live: live.stackCompositeHash,
    });
  }

  return { pass: mismatches.length === 0, mismatches };
}
