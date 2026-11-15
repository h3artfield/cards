/**
 * RC8-candidate-bound v18 Gold Policy certificate v2.
 * Preserves validation-v18-gold-policy-certificate-v1.json (RC7 binding).
 *
 * Run: cd web && npx tsx scripts/certify-validation-v18-rc8-v1.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
  validateBenchmarkGoldPolicy,
  validatorSourceHash,
} from "./lib/gold-policy-validator-v1";
import { computeGoldPolicyStackHashes, type GoldPolicyCertificateV2 } from "./lib/gold-policy-stack-v1";
import { assertCleanRepositoryForHoldoutExecution } from "./lib/working-tree-provenance-guard-v1";
import { PARSER_BLOB_SCOPE_PATHS } from "./lib/parser-scope-paths-v1";

const V18_PATH = "data/oracle-action-eval-validation-v18.json";
const OUT_DIR = "data/milestones/validation-v18-certification";
const RC8_MANIFEST_PATH = "data/milestones/rc8-development/rc8-candidate-v152-freeze-manifest.json";
const FREEZE_MANIFEST_PATH = `${OUT_DIR}/validation-v18-freeze-manifest-v152.json`;
const V1_CERT_PATH = `${OUT_DIR}/validation-v18-gold-policy-certificate-v1.json`;

const EXPECTED_V18_HASH = "9ead3268e946709501ab1f36e212161b819f2f64c95c7b363bb4f97cdd84d94e";
const EXPECTED_RC8_SHA = "2b0bb6d1eed52bf3c1ca860d0e2d68c0fe1265fb";
const EXPECTED_PARSER_BLOB = "e5c2f7054cda29cb512a0d6be133661f85ce9eee444d6b60884ecc4739df32b3";
const EXPECTED_STACK = "bff641dc3be90e053e243c6c30da8f05e22450eeba10edf0d0cbdec87398062a";

const RC8_PARSER_SCOPE = [
  ...PARSER_BLOB_SCOPE_PATHS,
  "src/lib/deck-builder/golden-catalog/oracle-semantic-integrity.ts",
  "scripts/test-rc8-action-ownership-regressions.ts",
];

const EVALUATOR_PATHS: Record<string, string> = {
  semanticMatcher: "scripts/oracle-action-semantic-matcher.ts",
  unifiedMatcher: "scripts/oracle-action-unified-matcher.ts",
  goldPolicyValidator: "scripts/lib/gold-policy-validator-v1.ts",
  rc5RegressionScoring: "scripts/lib/rc5-regression-scoring-v1.ts",
  reminderDerivedLeakage: "scripts/lib/reminder-derived-leakage-v1.ts",
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function computeRc8ManifestContentHash(manifestBody: Record<string, unknown>): string {
  const { manifestContentHash: _a, ...body } = manifestBody;
  return createHash("sha256").update(`${JSON.stringify(body, null, 2)}\n`).digest("hex");
}

function countLayer2Gold(cases: OracleActionEvalCaseV2[]): number {
  return cases.reduce((n, c) => n + c.expectedPrimitiveActions.filter((g) => !g.negative).length, 0);
}

function main() {
  assertCleanRepositoryForHoldoutExecution("v18 RC8 candidate-bound certification");

  const repoRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const head = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const parserDiff = execSync(
    `git diff ${EXPECTED_RC8_SHA} HEAD -- web/src/lib/deck-builder/golden-catalog/`,
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
  if (parserDiff.length > 0) {
    throw new Error(`Parser sources must match RC8 candidate ${EXPECTED_RC8_SHA} — diff detected`);
  }

  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const rc8ManifestRaw = JSON.parse(readFileSync(resolve(RC8_MANIFEST_PATH), "utf8")) as Record<string, unknown> & {
    status: string;
    parserVersion: string;
    parserBlobClosureHash: string;
    goldPolicy: { stackCompositeHash: string };
  };
  if (rc8ManifestRaw.status !== "CANDIDATE_FROZEN") {
    throw new Error("RC8 candidate manifest must be CANDIDATE_FROZEN");
  }
  if (rc8ManifestRaw.parserBlobClosureHash !== EXPECTED_PARSER_BLOB) {
    throw new Error(`RC8 parserBlobClosure mismatch: ${rc8ManifestRaw.parserBlobClosureHash}`);
  }

  const parserBlobActual = createHash("sha256")
    .update(RC8_PARSER_SCOPE.map((p) => sha256File(p)).join("\n"))
    .digest("hex");
  if (parserBlobActual !== EXPECTED_PARSER_BLOB) {
    throw new Error(`Live parser blob closure mismatch: ${parserBlobActual}`);
  }

  const evaluatorClosure = Object.fromEntries(
    Object.entries(EVALUATOR_PATHS).map(([key, path]) => [key, sha256File(path)]),
  );

  const rc8ManifestContentHash = computeRc8ManifestContentHash(rc8ManifestRaw);

  const envelope = JSON.parse(readFileSync(V18_PATH, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    parserExecutionCount?: number;
    sealed?: boolean;
  };

  if (envelope.contentHash !== EXPECTED_V18_HASH) {
    throw new Error(`v18 benchmark hash mismatch: ${envelope.contentHash}`);
  }
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
  if (policyStack.stackCompositeHash !== EXPECTED_STACK) {
    throw new Error("Live policy stack composite != RC8 pinned stack");
  }
  if (policyStack.stackCompositeHash !== rc8ManifestRaw.goldPolicy.stackCompositeHash) {
    throw new Error("Live policy stack != RC8 manifest pinned stack");
  }

  const freezeManifest = JSON.parse(readFileSync(FREEZE_MANIFEST_PATH, "utf8")) as {
    validationV18: { contentHash: string };
    parserExecutionCount: number;
  };
  if (freezeManifest.validationV18.contentHash !== envelope.contentHash) {
    throw new Error("v18 freeze manifest contentHash != canonical benchmark contentHash");
  }
  if (freezeManifest.parserExecutionCount !== 0) {
    throw new Error("v18 freeze manifest parserExecutionCount must be 0");
  }

  if (!readFileSync(V1_CERT_PATH, "utf8")) {
    throw new Error("RC7-bound certificate v1 must be preserved");
  }

  const immutableCertifiedPath = `${OUT_DIR}/validation-v18-certified-9ead3268e9467095.json`;
  const immutableBenchmarkHash = sha256File(immutableCertifiedPath);

  const cert: GoldPolicyCertificateV2 & {
    certificateSequence: number;
    candidateBinding: Record<string, unknown>;
    benchmarkContentHash: string;
    immutableCertifiedArtifactPath: string;
    immutableCertifiedArtifactHash: string;
    layer2Denominator: number;
    evaluatorClosure: Record<string, string>;
    parserBlobClosure: string;
    gitCommitSha: string;
  } = {
    certificateVersion: "gold-policy-validation-certificate-v1",
    certificateSequence: 2,
    certifiedAt: new Date().toISOString(),
    benchmarkPath: V18_PATH,
    benchmarkHash: envelope.contentHash,
    benchmarkContentHash: envelope.contentHash,
    benchmarkStatus: "sealed_policy_certified",
    candidateBinding: {
      candidateLabel: "rc8-candidate-v152",
      candidateManifestPath: RC8_MANIFEST_PATH,
      candidateManifestHash: rc8ManifestContentHash,
      candidateGitCommitSha: EXPECTED_RC8_SHA,
      parserVersion: rc8ManifestRaw.parserVersion,
      parserBlobClosure: EXPECTED_PARSER_BLOB,
      supersedesCertificate: "validation-v18-gold-policy-certificate-v1.json",
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
    evaluatorClosure,
    parserBlobClosure: EXPECTED_PARSER_BLOB,
    gitCommitSha: EXPECTED_RC8_SHA,
    note: "RC8-candidate-bound v18 parser-blind holdout — authorized for single execution after green preflight.",
  };

  writeFileSync(resolve(OUT_DIR, "validation-v18-gold-policy-certificate-v2-rc8.json"), `${JSON.stringify(cert, null, 2)}\n`);
  writeFileSync(
    resolve(OUT_DIR, "validation-v18-gold-policy-stack-pin-v2-rc8.json"),
    `${JSON.stringify(
      {
        pinnedAt: cert.certifiedAt,
        policyStack,
        certificateFile: "validation-v18-gold-policy-certificate-v2-rc8.json",
        certificateHash: sha256File(`${OUT_DIR}/validation-v18-gold-policy-certificate-v2-rc8.json`),
        rc8CandidateManifestHash: rc8ManifestContentHash,
        rc8GitCommitSha: EXPECTED_RC8_SHA,
        benchmarkContentHash: envelope.contentHash,
        layer2Denominator: cert.layer2Denominator,
        parserExecutionCount: 0,
        parserBlobClosure: EXPECTED_PARSER_BLOB,
        evaluatorClosure,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        certificate: "validation-v18-gold-policy-certificate-v2-rc8.json",
        preservedV1: "validation-v18-gold-policy-certificate-v1.json",
        benchmarkContentHash: envelope.contentHash,
        layer2Denominator: cert.layer2Denominator,
        rc8CandidateManifestHash: rc8ManifestContentHash,
        rc8GitCommitSha: EXPECTED_RC8_SHA,
        policyStackCompositeHash: policyStack.stackCompositeHash,
        parserBlobClosure: EXPECTED_PARSER_BLOB,
        parserExecutionCount: 0,
        violations: 0,
      },
      null,
      2,
    ),
  );
}

main();
