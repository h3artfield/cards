/**
 * Certify current-policy development gold after RC4 policy scrub overlay.
 * Run: cd web && npx tsx scripts/certify-development-gold-policy-v1.ts
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
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";

const DEV_PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

const OUT_DIR = "data/milestones/rc4-development";
const SCRUB_PATH = `${OUT_DIR}/rc4-development-gold-policy-scrub-v1.json`;
const CORRECTIONS_PATH = `${OUT_DIR}/rc4-development-gold-policy-scrub-corrections-v1.json`;

function developmentGoldHash(cases: OracleActionEvalCaseV2[]): string {
  return createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}

function loadCertifiedDevelopmentCases(): OracleActionEvalCaseV2[] {
  return DEV_PATHS.flatMap((p) =>
    applyGoldMigrationV135(
      (JSON.parse(readFileSync(resolve(p), "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
    ),
  );
}

function main() {
  const cases = loadCertifiedDevelopmentCases();
  const developmentGoldHashValue = developmentGoldHash(cases);
  const result = validateBenchmarkGoldPolicy({
    cases,
    benchmarkHash: developmentGoldHashValue,
    benchmarkPath: "rc4-certified-development-with-migration-overlay",
  });

  const registryPath = "data/milestones/rc3-foundations/gold-policy-registry-v1.json";
  const registry = JSON.parse(readFileSync(resolve(registryPath), "utf8"));
  const policyRegistryHash = createHash("sha256")
    .update(JSON.stringify({ ...registry, contentHash: undefined }, null, 2))
    .digest("hex");

  const correctionsHash = createHash("sha256").update(readFileSync(resolve(CORRECTIONS_PATH))).digest("hex");
  const scrubOverlayHash = createHash("sha256").update(readFileSync(resolve(SCRUB_PATH))).digest("hex");

  mkdirSync(resolve(OUT_DIR), { recursive: true });

  if (!result.pass) {
    const fail = {
      certificateVersion: "development-gold-policy-validation-failure-v1",
      validatedAt: new Date().toISOString(),
      developmentGoldHash: developmentGoldHashValue,
      violationCount: result.violations.length,
      census: result.census,
      perPolicyFamily: result.perPolicyFamily,
      topViolations: result.violations.slice(0, 40),
    };
    writeFileSync(resolve(`${OUT_DIR}/rc4-development-gold-policy-validation-failure-v1.json`), `${JSON.stringify(fail, null, 2)}\n`);
    console.log(JSON.stringify(fail, null, 2));
    process.exit(1);
  }

  const cert = {
    certificateVersion: "development-gold-policy-validation-certificate-v1",
    certifiedAt: new Date().toISOString(),
    benchmarkStatus: "current_policy_certified",
    developmentGoldHash: developmentGoldHashValue,
    sourcePaths: DEV_PATHS,
    migrationOverlay: {
      scrubPath: SCRUB_PATH,
      scrubOverlayHash,
      correctionsPath: CORRECTIONS_PATH,
      correctionsHash,
      preScrubViolationCount: 33,
    },
    policyVersion: GOLD_POLICY_VERSION,
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    validatorHash: validatorSourceHash(),
    policyRegistryHash,
    violations: 0,
    census: result.census,
    perPolicyFamily: result.perPolicyFamily,
    note: "Certified development truth for RC4 — raw benchmark files preserved; overlay applied at scoring time.",
  };

  writeFileSync(resolve(`${OUT_DIR}/rc4-development-gold-policy-certificate-v1.json`), `${JSON.stringify(cert, null, 2)}\n`);
  console.log(JSON.stringify({ pass: true, developmentGoldHash: developmentGoldHashValue, violations: 0, correctionsHash }, null, 2));
}

main();
