/**
 * Final v17 Gold Policy certificate v3 — bound to frozen RC7 candidate manifest.
 * Preserves certificate v2; no gold byte changes unless live validator finds violations.
 *
 * Run: cd web && npx tsx scripts/certify-validation-v17-rc7-v3.ts
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

const V17_PATH = "data/oracle-action-eval-validation-v17.json";
const OUT_DIR = "data/milestones/validation-v17-certification";
const EXPECTED_BENCHMARK_HASH = "24765bdc4a07553bbe31851970e383127d2f9adef2cf61641aed9185d3eb459a";
const RC7_MANIFEST_PATH = "data/milestones/rc7-development/rc7-candidate-v152-freeze-manifest.json";
const EXPECTED_RC7_MANIFEST_HASH = "d0939f76671384c1db0995d522a7d3bf1bf2437b2ff5d9f3c4a266339f006d8c";
const CERT_V2_PATH = `${OUT_DIR}/validation-v17-gold-policy-certificate-v2.json`;
const IMMUTABLE_CERTIFIED_PATH = `${OUT_DIR}/validation-v17-certified-24765bdc4a07553b.json`;

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
    throw new Error("RC7 candidate manifest must be CANDIDATE_FROZEN before v17 certificate v3");
  }
  if (rc7Manifest.manifestContentHash !== EXPECTED_RC7_MANIFEST_HASH) {
    throw new Error(`RC7 manifest hash mismatch: expected ${EXPECTED_RC7_MANIFEST_HASH}`);
  }

  const envelope = JSON.parse(readFileSync(V17_PATH, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    parserExecutionCount?: number;
    sealed?: boolean;
  };

  if (envelope.parserExecutionCount !== 0) {
    throw new Error("v17 parserExecutionCount must remain 0 for certification");
  }
  if (envelope.contentHash !== EXPECTED_BENCHMARK_HASH) {
    throw new Error(`Expected v17 benchmark hash ${EXPECTED_BENCHMARK_HASH}, got ${envelope.contentHash}`);
  }

  const validation = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
    benchmarkPath: V17_PATH,
  });
  if (!validation.pass) {
    throw new Error(`Live v17 Gold Policy validation failed: ${validation.violations.length} violations`);
  }

  const policyStack = computeGoldPolicyStackHashes();
  if (policyStack.stackCompositeHash !== rc7Manifest.goldPolicy.stackCompositeHash) {
    throw new Error("Live policy stack composite != RC7 manifest pinned stack");
  }

  const certV2 = JSON.parse(readFileSync(CERT_V2_PATH, "utf8"));
  const immutableBenchmarkHash = sha256File(IMMUTABLE_CERTIFIED_PATH);

  const cert: GoldPolicyCertificateV2 & {
    certificateSequence: number;
    candidateBinding: Record<string, unknown>;
    benchmarkContentHash: string;
    immutableCertifiedArtifactPath: string;
    immutableCertifiedArtifactHash: string;
    priorCertificatePreserved: string;
    layer2Denominator: number;
  } = {
    certificateVersion: "gold-policy-validation-certificate-v3",
    certificateSequence: 3,
    certifiedAt: new Date().toISOString(),
    benchmarkPath: V17_PATH,
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
    immutableCertifiedArtifactPath: IMMUTABLE_CERTIFIED_PATH,
    immutableCertifiedArtifactHash: immutableBenchmarkHash,
    priorCertificatePreserved: CERT_V2_PATH,
    note: "RC7-candidate-bound v17 certificate — supersedes v2 for execution binding; v2 preserved.",
    supersedes: {
      certificateFile: "validation-v17-gold-policy-certificate-v2.json",
      benchmarkHash: EXPECTED_BENCHMARK_HASH,
    },
  };

  writeFileSync(resolve(OUT_DIR, "validation-v17-gold-policy-certificate-v3.json"), `${JSON.stringify(cert, null, 2)}\n`);
  writeFileSync(
    resolve(OUT_DIR, "validation-v17-gold-policy-stack-pin-v3.json"),
    `${JSON.stringify(
      {
        pinnedAt: cert.certifiedAt,
        policyStack,
        certificateFile: "validation-v17-gold-policy-certificate-v3.json",
        certificateHash: sha256File(`${OUT_DIR}/validation-v17-gold-policy-certificate-v3.json`),
        rc7CandidateManifestHash: rc7Manifest.manifestContentHash,
        supersedes: "validation-v17-gold-policy-stack-pin-v2.json",
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
        certificate: "validation-v17-gold-policy-certificate-v3.json",
        benchmarkContentHash: envelope.contentHash,
        layer2Denominator: cert.layer2Denominator,
        rc7CandidateManifestHash: rc7Manifest.manifestContentHash,
        policyStackCompositeHash: policyStack.stackCompositeHash,
        priorCertificateV2: certV2.certificateSequence ?? 2,
        parserExecutionCount: 0,
        violations: 0,
      },
      null,
      2,
    ),
  );
}

main();
