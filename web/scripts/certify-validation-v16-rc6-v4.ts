/**
 * Final v16 Gold Policy certificate v4 — bound to frozen RC6 candidate manifest.
 * Preserves certificate v3; no gold byte changes unless live validator finds violations.
 *
 * Run: cd web && npx tsx scripts/certify-validation-v16-rc6-v4.ts
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

const V16_PATH = "data/oracle-action-eval-validation-v16.json";
const OUT_DIR = "data/milestones/validation-v16-certification";
const EXPECTED_BENCHMARK_HASH = "7805b98f837b090dad2b14486ebe2200b1c3bea9d6ad702c01d23085bf1a8007";
const PRIOR_BENCHMARK_HASH = "a72cb634ad9e7d8a5feb8705485b533cccdae67e1be17602829807c6848ea5fe";
const RC6_MANIFEST_PATH = "data/milestones/rc6-development/rc6-candidate-v151-freeze-manifest.json";
const CERT_V3_PATH = `${OUT_DIR}/validation-v16-gold-policy-certificate-v3.json`;
const CORRECTION_REPORT_V3_PATH = `${OUT_DIR}/validation-v16-gold-policy-correction-report-v3.json`;
const IMMUTABLE_CERTIFIED_PATH = `${OUT_DIR}/validation-v16-certified-7805b98f837b090d.json`;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function countLayer2Gold(cases: OracleActionEvalCaseV2[]): number {
  return cases.reduce((n, c) => n + c.expectedPrimitiveActions.filter((g) => !g.negative).length, 0);
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const rc6Manifest = JSON.parse(readFileSync(resolve(RC6_MANIFEST_PATH), "utf8")) as {
    manifestContentHash: string;
    status: string;
    parserVersion: string;
    goldPolicy: { stackCompositeHash: string };
  };
  if (rc6Manifest.status !== "CANDIDATE_FROZEN") {
    throw new Error("RC6 candidate manifest must be CANDIDATE_FROZEN before v16 certificate v4");
  }

  const envelope = JSON.parse(readFileSync(V16_PATH, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    parserExecutionCount?: number;
    sealed?: boolean;
  };

  if (envelope.parserExecutionCount !== 0) {
    throw new Error("v16 parserExecutionCount must remain 0 for certification");
  }
  if (envelope.contentHash !== EXPECTED_BENCHMARK_HASH) {
    throw new Error(`Expected v16 benchmark hash ${EXPECTED_BENCHMARK_HASH}, got ${envelope.contentHash}`);
  }

  const validation = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
    benchmarkPath: V16_PATH,
  });
  if (!validation.pass) {
    throw new Error(`Live v16 Gold Policy validation failed: ${validation.violations.length} violations`);
  }

  const policyStack = computeGoldPolicyStackHashes();
  if (policyStack.stackCompositeHash !== rc6Manifest.goldPolicy.stackCompositeHash) {
    throw new Error("Live policy stack composite != RC6 manifest pinned stack");
  }

  const certV3 = JSON.parse(readFileSync(CERT_V3_PATH, "utf8"));
  const correctionReportHash = sha256File(CORRECTION_REPORT_V3_PATH);
  const immutableBenchmarkHash = sha256File(IMMUTABLE_CERTIFIED_PATH);

  const cert: GoldPolicyCertificateV2 & {
    certificateSequence: number;
    candidateBinding: Record<string, unknown>;
    benchmarkContentHash: string;
    correctionReportHash: string;
    immutableCertifiedArtifactPath: string;
    immutableCertifiedArtifactHash: string;
    priorCertificatePreserved: string;
  } = {
    certificateVersion: "gold-policy-validation-certificate-v4",
    certificateSequence: 4,
    certifiedAt: new Date().toISOString(),
    benchmarkPath: V16_PATH,
    benchmarkHash: envelope.contentHash,
    benchmarkContentHash: envelope.contentHash,
    benchmarkStatus: "sealed_policy_certified",
    candidateBinding: {
      candidateLabel: "rc6-candidate-v151",
      candidateManifestPath: RC6_MANIFEST_PATH,
      candidateManifestHash: rc6Manifest.manifestContentHash,
      parserVersion: rc6Manifest.parserVersion,
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
    correctionReportPath: CORRECTION_REPORT_V3_PATH,
    correctionReportHash,
    immutableCertifiedArtifactPath: IMMUTABLE_CERTIFIED_PATH,
    immutableCertifiedArtifactHash: immutableBenchmarkHash,
    priorCertificatePreserved: CERT_V3_PATH,
    note: "Final RC6-candidate-bound v16 certificate — supersedes v3 for execution binding only; v3 preserved.",
    supersedes: {
      certificateFile: "validation-v16-gold-policy-certificate-v3.json",
      benchmarkHash: EXPECTED_BENCHMARK_HASH,
      priorUncorrectedBenchmarkHash: PRIOR_BENCHMARK_HASH,
    },
  };

  writeFileSync(resolve(OUT_DIR, "validation-v16-gold-policy-certificate-v4.json"), `${JSON.stringify(cert, null, 2)}\n`);
  writeFileSync(
    resolve(OUT_DIR, "validation-v16-gold-policy-stack-pin-v4.json"),
    `${JSON.stringify(
      {
        pinnedAt: cert.certifiedAt,
        policyStack,
        certificateFile: "validation-v16-gold-policy-certificate-v4.json",
        certificateHash: createHash("sha256")
          .update(readFileSync(resolve(OUT_DIR, "validation-v16-gold-policy-certificate-v4.json")))
          .digest("hex"),
        rc6CandidateManifestHash: rc6Manifest.manifestContentHash,
        supersedes: "validation-v16-gold-policy-stack-pin-v3.json",
        benchmarkContentHash: envelope.contentHash,
        layer2Denominator: cert.layer2Denominator,
        parserExecutionCount: 0,
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    resolve(OUT_DIR, "validation-v16-gold-policy-validation-report-v4.json"),
    `${JSON.stringify(
      {
        validation,
        policyStack,
        rc6CandidateManifestHash: rc6Manifest.manifestContentHash,
        benchmarkHashes: {
          previous: PRIOR_BENCHMARK_HASH,
          corrected: EXPECTED_BENCHMARK_HASH,
          immutableArtifact: immutableBenchmarkHash,
        },
        layer2Denominator: cert.layer2Denominator,
        preservedCertificateV3: certV3,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        certificate: "validation-v16-gold-policy-certificate-v4.json",
        benchmarkContentHash: envelope.contentHash,
        layer2Denominator: cert.layer2Denominator,
        rc6CandidateManifestHash: rc6Manifest.manifestContentHash,
        policyStackCompositeHash: policyStack.stackCompositeHash,
        correctionReportHash,
        parserExecutionCount: 0,
        violations: 0,
      },
      null,
      2,
    ),
  );
}

main();
