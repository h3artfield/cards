/**
 * Write expansion v1 training/check split manifests and update execution metadata.
 * Run: npx tsx scripts/write-expansion-v1-manifests.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const EXPANSION_PATH = "data/oracle-action-eval-development-generalization-expansion-v1.json";
const BASELINE_EXECUTION = {
  parserExecutionCount: 1,
  firstExecutionPurpose: "pre_tuning_baseline",
  parserVersion: "oracle-action-v1.20-variable-lose-life-dev",
  parserSHA: "bbef615db0c1aa562e87f9da858684458f35535b",
  executionTimestamp: "2026-08-07T18:18:23.485Z",
  accepted: {
    precision: 0.5217391304347826,
    recall: 0.6666666666666666,
    unsupported: 2,
  },
};

type ExpansionCase = {
  id: string;
  oracleId: string;
  cardName?: string;
  expansionMetadata?: { split?: string; family?: string };
};

const envelope = JSON.parse(readFileSync(resolve(process.cwd(), EXPANSION_PATH), "utf8")) as {
  contentHash: string;
  cases: ExpansionCase[];
  expansionSplit?: Record<string, unknown>;
};

const training = envelope.cases.filter((c) => c.expansionMetadata?.split === "expansion-training");
const check = envelope.cases.filter((c) => c.expansionMetadata?.split === "expansion-check");

const dir = resolve(process.cwd(), "data/milestones/development-expansion-v1-certification");
mkdirSync(dir, { recursive: true });

writeFileSync(
  resolve(dir, "expansion-v1-training-manifest.json"),
  `${JSON.stringify(
    {
      split: "expansion-training",
      contentHash: envelope.contentHash,
      caseCount: training.length,
      usagePolicy: "freely_usable_during_development",
      parserExecutionCount: 0,
      caseIds: training.map((c) => c.id),
      families: [...new Set(training.map((c) => c.expansionMetadata?.family).filter(Boolean))],
    },
    null,
    2,
  )}\n`,
  "utf8",
);

writeFileSync(
  resolve(dir, "expansion-v1-check-manifest.json"),
  `${JSON.stringify(
    {
      split: "expansion-check",
      contentHash: envelope.contentHash,
      caseCount: check.length,
      usagePolicy: "milestone_only",
      checkFrozenAt: "2026-08-07T18:04:37.600Z",
      checkFrozenBeforeParserTuning: true,
      ...BASELINE_EXECUTION,
      caseIds: check.map((c) => c.id),
      families: [...new Set(check.map((c) => c.expansionMetadata?.family).filter(Boolean))],
      note: "Prefer aggregate check metrics at milestones; do not inspect individual check cases during tuning.",
    },
    null,
    2,
  )}\n`,
  "utf8",
);

writeFileSync(
  resolve(dir, "expansion-v1-freeze.json"),
  `${JSON.stringify(
    {
      setClassification: "development_generalization_expansion_v1",
      contentHash: envelope.contentHash,
      caseCount: envelope.cases.length,
      trainingCount: training.length,
      checkCount: check.length,
      checkFrozenAt: "2026-08-07T18:04:37.600Z",
      frozenAt: "2026-08-07T18:04:37.600Z",
      trainingUsagePolicy: "freely_usable_during_development",
      checkUsagePolicy: "milestone_only",
      envelopeParserExecutionCount: 0,
      checkSplitExecution: BASELINE_EXECUTION,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(JSON.stringify({ training: training.length, check: check.length, checkExecution: BASELINE_EXECUTION }, null, 2));
