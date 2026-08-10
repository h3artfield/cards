/**
 * Run Gold Policy Validator on a sealed benchmark (parser-blind).
 * Usage: npx tsx scripts/run-gold-policy-validator.ts [benchmark-path] [--out-dir DIR] [--set-version validation-v15]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import type { EvalDatasetEnvelope } from "./lib/eval-provenance-guard";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
  validateBenchmarkGoldPolicy,
  validatorSourceHash,
} from "./lib/gold-policy-validator-v1";
import { computeGoldPolicyStackHashes, type GoldPolicyCertificateV2 } from "./lib/gold-policy-stack-v1";
import {
  immutableBenchmarkFilename,
  writeImmutableBenchmarkCopy,
} from "./lib/immutable-benchmark-storage-v1";

function parseArgs(argv: string[]) {
  let benchmarkPath = "data/oracle-action-eval-validation-v14.json";
  let outDir = "data/milestones/validation-v14-certification";
  let setVersion = "validation-v14";
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--out-dir" && argv[i + 1]) {
      outDir = argv[++i]!;
    } else if (argv[i] === "--set-version" && argv[i + 1]) {
      setVersion = argv[++i]!;
    } else if (!argv[i]!.startsWith("--")) {
      benchmarkPath = argv[i]!;
    }
  }
  return { benchmarkPath, outDir, setVersion };
}

function main() {
  const { benchmarkPath, outDir, setVersion } = parseArgs(process.argv);
  const path = resolve(benchmarkPath);
  const envelope = JSON.parse(readFileSync(path, "utf8")) as EvalDatasetEnvelope & {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    parserExecutionCount?: number;
  };

  if ((envelope.parserExecutionCount ?? 0) > 0) {
    throw new Error(`Benchmark ${benchmarkPath} already has parserExecutionCount > 0`);
  }

  const result = validateBenchmarkGoldPolicy({
    cases: envelope.cases,
    benchmarkHash: envelope.contentHash,
    benchmarkPath,
  });

  mkdirSync(resolve(outDir), { recursive: true });
  const policyStack = computeGoldPolicyStackHashes();

  const reportPath = resolve(outDir, `${setVersion}-gold-policy-validation-report-v1.json`);
  writeFileSync(reportPath, `${JSON.stringify({ ...result, policyStack }, null, 2)}\n`);

  if (result.pass) {
    const cert: GoldPolicyCertificateV2 = {
      certificateVersion: "gold-policy-validation-certificate-v2",
      certifiedAt: new Date().toISOString(),
      benchmarkPath,
      benchmarkHash: envelope.contentHash,
      benchmarkStatus: "sealed_policy_certified",
      policyVersion: GOLD_POLICY_VERSION,
      validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
      validatorHash: validatorSourceHash(),
      policyRegistryHash: policyStack.policyRegistryHash,
      policyStack,
      parserExecutionCount: 0,
      violations: 0,
      census: result.census,
      perPolicyFamily: result.perPolicyFamily,
      note: "Policy stack hashes pinned — execution preflight HARD STOP if live stack != certificate stack.",
    };

    const certFilename = `${setVersion}-gold-policy-certificate-v1.json`;
    writeFileSync(resolve(outDir, certFilename), `${JSON.stringify(cert, null, 2)}\n`);

    const immutableCertName = immutableBenchmarkFilename(setVersion, "certified", envelope.contentHash);
    writeImmutableBenchmarkCopy({
      setVersion,
      phase: "certified",
      contentHash: envelope.contentHash,
      sourcePath: benchmarkPath,
      outDir,
    });

    writeFileSync(
      resolve(outDir, `${setVersion}-gold-policy-stack-pin-v1.json`),
      `${JSON.stringify({ pinnedAt: cert.certifiedAt, policyStack, certificateFile: certFilename, immutableCertName }, null, 2)}\n`,
    );
  } else {
    const fail = {
      validationVersion: "gold-policy-validation-failure-v1",
      validatedAt: new Date().toISOString(),
      benchmarkPath,
      preservedBenchmarkHash: envelope.contentHash,
      preservedStatus: "sealed_pre_policy_validation",
      supersededBeforeParserContact: true,
      parserExecutionCount: 0,
      policyVersion: GOLD_POLICY_VERSION,
      validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
      validatorHash: validatorSourceHash(),
      policyStack,
      violationCount: result.violations.length,
      census: result.census,
      perPolicyFamily: result.perPolicyFamily,
      topViolations: result.violations.slice(0, 40),
      caseResults: result.caseResults.slice(0, 40),
      note: "Do NOT execute benchmark until gold corrected and validator re-run with violations=0.",
    };
    writeFileSync(resolve(outDir, `${setVersion}-gold-policy-validation-failure-v1.json`), `${JSON.stringify(fail, null, 2)}\n`);
  }

  console.log(
    JSON.stringify(
      {
        pass: result.pass,
        benchmarkHash: envelope.contentHash,
        setVersion,
        outDir,
        violationCount: result.violations.length,
        policyStackCompositeHash: policyStack.stackCompositeHash,
        census: result.census,
        perPolicyFamily: result.perPolicyFamily,
      },
      null,
      2,
    ),
  );

  if (!result.pass) process.exit(1);
}

main();
