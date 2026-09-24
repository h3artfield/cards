/**
 * Issue candidate-bound Gold Policy certificate v2 for sealed validation v15.
 * Same benchmark bytes; re-pins policy stack to RC5 frozen live stack.
 * Run: cd web && npx tsx scripts/issue-validation-v15-certificate-v2-rc5.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
  validateBenchmarkGoldPolicy,
  validatorSourceHash,
} from "./lib/gold-policy-validator-v1";
import { computeGoldPolicyStackHashes, type GoldPolicyCertificateV2 } from "./lib/gold-policy-stack-v1";

const OUT_DIR = "data/milestones/validation-v15-certification";
const BENCHMARK_PATH = "data/oracle-action-eval-validation-v15.json";
const EXPECTED_BENCHMARK_HASH = "300929da9a640b93d3ad5bb0abce92a3c0614a1399b18248c1319bbaf4d7ef17";
const RC5_MANIFEST_PATH = "data/milestones/rc5-development/rc5-candidate-v150-freeze-manifest.json";
const EXPECTED_RC5_MANIFEST_HASH = "14e4d616086bbc6edc35fc7ad7f8d69637c907b21d2af45036ca54feffd759ca";
const EXPECTED_STACK_COMPOSITE = "aaf59085974d7c18e2aeef36145f7e22a87e37083c7572466fcb808f9831edc3";
const V1_CERT_PATH = `${OUT_DIR}/validation-v15-gold-policy-certificate-v1.json`;
const V2_CERT_PATH = `${OUT_DIR}/validation-v15-gold-policy-certificate-v2.json`;
const V1_PRESERVATION_PATH = `${OUT_DIR}/validation-v15-gold-policy-certificate-v1-preservation.json`;
const V2_STACK_PIN_PATH = `${OUT_DIR}/validation-v15-gold-policy-stack-pin-v2.json`;

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function main() {
  const envelope = JSON.parse(readFileSync(resolve(BENCHMARK_PATH), "utf8")) as {
    contentHash: string;
    parserExecutionCount: number;
    sealed: boolean;
    cases: unknown[];
  };

  if (envelope.contentHash !== EXPECTED_BENCHMARK_HASH) {
    throw new Error(`benchmarkHash mismatch: expected ${EXPECTED_BENCHMARK_HASH} got ${envelope.contentHash}`);
  }
  if ((envelope.parserExecutionCount ?? 0) !== 0) {
    throw new Error(`parserExecutionCount must be 0, got ${envelope.parserExecutionCount}`);
  }
  if (!envelope.sealed) {
    throw new Error("benchmark must remain sealed");
  }

  const rc5Manifest = JSON.parse(readFileSync(resolve(RC5_MANIFEST_PATH), "utf8")) as {
    manifestContentHash: string;
    status: string;
    goldPolicy: { stackCompositeHash: string; stackFileHashes: ReturnType<typeof computeGoldPolicyStackHashes> };
  };

  if (rc5Manifest.manifestContentHash !== EXPECTED_RC5_MANIFEST_HASH) {
    throw new Error(`RC5 manifest hash mismatch`);
  }
  if (rc5Manifest.status !== "CANDIDATE_FROZEN") {
    throw new Error(`RC5 candidate not frozen: ${rc5Manifest.status}`);
  }

  const liveStack = computeGoldPolicyStackHashes();
  if (liveStack.stackCompositeHash !== EXPECTED_STACK_COMPOSITE) {
    throw new Error(
      `live stack composite mismatch: expected ${EXPECTED_STACK_COMPOSITE} got ${liveStack.stackCompositeHash}`,
    );
  }
  if (liveStack.stackCompositeHash !== rc5Manifest.goldPolicy.stackCompositeHash) {
    throw new Error("live stack != RC5 frozen stack");
  }

  const validation = validateBenchmarkGoldPolicy({
    cases: envelope.cases as Parameters<typeof validateBenchmarkGoldPolicy>[0]["cases"],
    benchmarkHash: envelope.contentHash,
    benchmarkPath: BENCHMARK_PATH,
  });
  if (!validation.pass || validation.violations.length > 0) {
    throw new Error(`live violations=${validation.violations.length} — certification blocked`);
  }

  const v1CertHash = sha256File(V1_CERT_PATH);
  const v1Cert = JSON.parse(readFileSync(resolve(V1_CERT_PATH), "utf8")) as GoldPolicyCertificateV2;
  const certifiedAt = new Date().toISOString();

  const preservation = {
    preservationVersion: "gold-policy-certificate-preservation-v1",
    preservedAt: certifiedAt,
    certificatePath: V1_CERT_PATH,
    certificateContentHash: v1CertHash,
    preservationRole: "pre-RC5 certificate",
    executionStatus: "superseded_for_execution_due_to_stack_drift",
    supersededBy: "validation-v15-gold-policy-certificate-v2.json",
    benchmarkHash: v1Cert.benchmarkHash,
    policyStackCompositeHash: v1Cert.policyStack.stackCompositeHash,
    note: "Original v15 gold-policy certificate preserved unchanged — benchmark bytes identical; execution re-pinned to RC5 live stack via certificate v2.",
  };
  writeFileSync(resolve(V1_PRESERVATION_PATH), `${JSON.stringify(preservation, null, 2)}\n`, "utf8");

  const cert: GoldPolicyCertificateV2 & {
    certificateSequence: 2;
    supersedes: string;
    candidateBinding: {
      candidateLabel: string;
      candidateManifestPath: string;
      candidateManifestHash: string;
    };
    supersededCertificate: {
      path: string;
      contentHash: string;
      policyStackCompositeHash: string;
      executionStatus: string;
    };
  } = {
    certificateVersion: "gold-policy-validation-certificate-v2",
    certificateSequence: 2,
    supersedes: "validation-v15-gold-policy-certificate-v1.json",
    certifiedAt,
    benchmarkPath: BENCHMARK_PATH,
    benchmarkHash: envelope.contentHash,
    benchmarkStatus: "sealed_policy_certified",
    candidateBinding: {
      candidateLabel: "rc5-candidate-v150",
      candidateManifestPath: RC5_MANIFEST_PATH,
      candidateManifestHash: rc5Manifest.manifestContentHash,
    },
    policyVersion: GOLD_POLICY_VERSION,
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    validatorHash: validatorSourceHash(),
    policyRegistryHash: liveStack.policyRegistryHash,
    policyStack: liveStack,
    parserExecutionCount: 0,
    violations: 0,
    census: validation.census,
    perPolicyFamily: validation.perPolicyFamily,
    supersededCertificate: {
      path: V1_CERT_PATH,
      contentHash: v1CertHash,
      policyStackCompositeHash: v1Cert.policyStack.stackCompositeHash,
      executionStatus: "superseded_for_execution_due_to_stack_drift",
    },
    note: "Candidate-bound re-pin for RC5 frozen live stack — same benchmark bytes as v1; no gold corrections.",
  };

  writeFileSync(resolve(V2_CERT_PATH), `${JSON.stringify(cert, null, 2)}\n`, "utf8");
  const v2CertHash = sha256File(V2_CERT_PATH);

  writeFileSync(
    resolve(V2_STACK_PIN_PATH),
    `${JSON.stringify(
      {
        pinnedAt: certifiedAt,
        certificateSequence: 2,
        supersedes: "validation-v15-gold-policy-stack-pin-v1.json",
        policyStack: liveStack,
        certificateFile: "validation-v15-gold-policy-certificate-v2.json",
        certificateContentHash: v2CertHash,
        candidateManifestHash: rc5Manifest.manifestContentHash,
        immutableCertName: "validation-v15-certified-300929da9a640b93.json",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        issued: V2_CERT_PATH,
        certificateContentHash: v2CertHash,
        preservation: V1_PRESERVATION_PATH,
        stackPin: V2_STACK_PIN_PATH,
        benchmarkHash: envelope.contentHash,
        candidateManifestHash: rc5Manifest.manifestContentHash,
        stackCompositeHash: liveStack.stackCompositeHash,
        violations: 0,
        parserExecutionCount: 0,
      },
      null,
      2,
    ),
  );
}

main();
