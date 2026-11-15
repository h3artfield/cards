/**
 * Initial v18 Gold Policy certificate v1 — bound to frozen RC7 candidate manifest.
 * Seals parser-blind holdout before any v17 forensic detail work.
 *
 * Run: cd web && npx tsx scripts/certify-validation-v18-rc7-v1.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
  validateBenchmarkGoldPolicy,
  validatorSourceHash,
} from "./lib/gold-policy-validator-v1";
import { computeGoldPolicyStackHashes, type GoldPolicyCertificateV2 } from "./lib/gold-policy-stack-v1";
import { immutableBenchmarkFilename } from "./lib/immutable-benchmark-storage-v1";

const V18_PATH = "data/oracle-action-eval-validation-v18.json";
const OUT_DIR = "data/milestones/validation-v18-certification";
const RC7_MANIFEST_PATH = "data/milestones/rc7-development/rc7-candidate-v152-freeze-manifest.json";
const EXPECTED_RC7_MANIFEST_HASH = "d0939f76671384c1db0995d522a7d3bf1bf2437b2ff5d9f3c4a266339f006d8c";
const FREEZE_MANIFEST_PATH = `${OUT_DIR}/validation-v18-freeze-manifest-v152.json`;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function countLayer2Gold(cases: OracleActionEvalCaseV2[]): number {
  return cases.reduce((n, c) => n + c.expectedPrimitiveActions.filter((g) => !g.negative).length, 0);
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const rc7Manifest = JSON.parse(readFileSync(resolve(RC7_MANIFEST_PATH), "utf8")) as {
    manifestContentHash: string;
    status: string;
    parserVersion: string;
    goldPolicy: { stackCompositeHash: string };
  };
  if (rc7Manifest.status !== "CANDIDATE_FROZEN") {
    throw new Error("RC7 candidate manifest must be CANDIDATE_FROZEN before v18 certificate v1");
  }
  if (rc7Manifest.manifestContentHash !== EXPECTED_RC7_MANIFEST_HASH) {
    throw new Error(`RC7 manifest hash mismatch: expected ${EXPECTED_RC7_MANIFEST_HASH}`);
  }

  const envelope = JSON.parse(readFileSync(V18_PATH, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    parserExecutionCount?: number;
    sealed?: boolean;
  };

  if (envelope.parserExecutionCount !== 0) {
    throw new Error("v18 parserExecutionCount must remain 0 for certification");
  }

  const validation = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
    benchmarkPath: V18_PATH,
  });
  if (!validation.pass) {
    throw new Error(`Live v18 Gold Policy validation failed: ${validation.violations.length} violations`);
  }

  const policyStack = computeGoldPolicyStackHashes();
  if (policyStack.stackCompositeHash !== rc7Manifest.goldPolicy.stackCompositeHash) {
    throw new Error("Live policy stack composite != RC7 manifest pinned stack");
  }

  const freezeManifest = JSON.parse(readFileSync(FREEZE_MANIFEST_PATH, "utf8")) as {
    validationV18: { contentHash: string };
  };
  if (freezeManifest.validationV18.contentHash !== envelope.contentHash) {
    throw new Error("v18 freeze manifest contentHash != canonical benchmark contentHash");
  }

  const immutableCertifiedPath = `${OUT_DIR}/${immutableBenchmarkFilename("validation-v18", "certified", envelope.contentHash)}`;
  const immutableBenchmarkHash = sha256File(immutableCertifiedPath);

  const cert: GoldPolicyCertificateV2 & {
    certificateSequence: number;
    candidateBinding: Record<string, unknown>;
    benchmarkContentHash: string;
    immutableCertifiedArtifactPath: string;
    immutableCertifiedArtifactHash: string;
    layer2Denominator: number;
  } = {
    certificateVersion: "gold-policy-validation-certificate-v1",
    certificateSequence: 1,
    certifiedAt: new Date().toISOString(),
    benchmarkPath: V18_PATH,
    benchmarkHash: envelope.contentHash,
    benchmarkContentHash: envelope.contentHash,
    benchmarkStatus: "sealed_policy_certified",
    candidateBinding: {
      candidateLabel: "rc7-candidate-v152",
      candidateManifestPath: RC7_MANIFEST_PATH,
      candidateManifestHash: rc7Manifest.manifestContentHash,
      parserVersion: rc7Manifest.parserVersion,
    },
    policyVersion: GOLD_POLICY_VERSION,
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    validatorHash: validatorSourceHash(),
    policyRegistryHash: policyStack.policyRegistryHash,
    policyStack,
    parserExecutionCount: 0,
    violations: 0,
    census: validation.census,
    perPolicyFamily: validation.perPolicyFamily,
    layer2Denominator: countLayer2Gold(envelope.cases),
    immutableCertifiedArtifactPath: immutableCertifiedPath,
    immutableCertifiedArtifactHash: immutableBenchmarkHash,
    note: "RC7-candidate-bound v18 parser-blind holdout — sealed before v17 forensic work; DO NOT EXECUTE.",
  };

  writeFileSync(resolve(OUT_DIR, "validation-v18-gold-policy-certificate-v1.json"), `${JSON.stringify(cert, null, 2)}\n`);
  writeFileSync(
    resolve(OUT_DIR, "validation-v18-gold-policy-stack-pin-v1.json"),
    `${JSON.stringify(
      {
        pinnedAt: cert.certifiedAt,
        policyStack,
        certificateFile: "validation-v18-gold-policy-certificate-v1.json",
        certificateHash: sha256File(`${OUT_DIR}/validation-v18-gold-policy-certificate-v1.json`),
        rc7CandidateManifestHash: rc7Manifest.manifestContentHash,
        benchmarkContentHash: envelope.contentHash,
        layer2Denominator: cert.layer2Denominator,
        parserExecutionCount: 0,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        certificate: "validation-v18-gold-policy-certificate-v1.json",
        benchmarkContentHash: envelope.contentHash,
        layer2Denominator: cert.layer2Denominator,
        rc7CandidateManifestHash: rc7Manifest.manifestContentHash,
        policyStackCompositeHash: policyStack.stackCompositeHash,
        parserExecutionCount: 0,
        violations: 0,
      },
      null,
      2,
    ),
  );
}

main();
