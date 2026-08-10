/**
 * Gold Policy preflight — HARD STOP if live stack or live violations diverge from certificate.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateBenchmarkGoldPolicy } from "./gold-policy-validator-v1";
import {
  computeGoldPolicyStackHashes,
  verifyGoldPolicyStackAgainstCertificate,
  type GoldPolicyCertificateV2,
} from "./gold-policy-stack-v1";
import type { OracleActionEvalCaseV2 } from "../audit-oracle-action-eval-cases";

export type GoldPolicyPreflightResult = {
  pass: boolean;
  hardStopReasons: string[];
  certificateViolations: number;
  liveViolationCount: number;
  stackVerification: ReturnType<typeof verifyGoldPolicyStackAgainstCertificate>;
  liveStack: ReturnType<typeof computeGoldPolicyStackHashes>;
};

export function runGoldPolicyPreflight(input: {
  certificatePath: string;
  benchmarkPath: string;
  cases: OracleActionEvalCaseV2[];
  benchmarkHash: string;
}): GoldPolicyPreflightResult {
  const cert = JSON.parse(readFileSync(resolve(input.certificatePath), "utf8")) as GoldPolicyCertificateV2 & {
    violations: number;
    benchmarkHash: string;
    benchmarkStatus: string;
  };

  const hardStopReasons: string[] = [];
  const liveStack = computeGoldPolicyStackHashes();
  const stackVerification = verifyGoldPolicyStackAgainstCertificate(cert);

  if (cert.benchmarkHash !== input.benchmarkHash) {
    hardStopReasons.push(
      `benchmarkHash mismatch: certificate=${cert.benchmarkHash} live=${input.benchmarkHash}`,
    );
  }

  if (cert.benchmarkStatus !== "sealed_policy_certified") {
    hardStopReasons.push(`certificate benchmarkStatus=${cert.benchmarkStatus} (expected sealed_policy_certified)`);
  }

  if ((cert.violations ?? -1) !== 0) {
    hardStopReasons.push(`certificate violations=${cert.violations} (expected 0)`);
  }

  if (!stackVerification.pass) {
    for (const m of stackVerification.mismatches) {
      hardStopReasons.push(`policyStack.${m.field}: certificate=${m.certified} live=${m.live}`);
    }
  }

  const liveValidation = validateBenchmarkGoldPolicy({
    cases: input.cases,
    benchmarkHash: input.benchmarkHash,
    benchmarkPath: input.benchmarkPath,
  });

  if (liveValidation.violations.length > 0) {
    hardStopReasons.push(
      `live validator found ${liveValidation.violations.length} violation(s) — stale certificate must NOT override live validator`,
    );
  }

  return {
    pass: hardStopReasons.length === 0,
    hardStopReasons,
    certificateViolations: cert.violations ?? -1,
    liveViolationCount: liveValidation.violations.length,
    stackVerification,
    liveStack,
  };
}
