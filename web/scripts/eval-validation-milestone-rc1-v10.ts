/**
 * RC1 validation milestone against certified validation_set_v10.
 * Same RC1 parser — no RC2, no threshold changes.
 * Run: npx tsx scripts/eval-validation-milestone-rc1-v10.ts
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import {
  ORACLE_ACTION_PARSER_VERSION,
  ORACLE_ACTION_TAXONOMY_VERSION,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { auditValidationSet } from "./audit-validation-errors-v12";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evidenceMatchesExtracted } from "./oracle-action-eval-shared";
import {
  matchGoldToActions,
} from "./oracle-action-unified-matcher";
import {
  assignPrimaryRootCause,
  summarizePrimaryRootCauses,
  type PrimaryRootCause,
} from "./lib/validation-primary-root-cause";

const RC_NAME = "oracle-action-rc1";
const EXPECTED_RC1_SHA = "e38ce568e3cb98f85a1d559f4efb8869afe2aa7f";
const EXPECTED_PARSER = "oracle-action-v1.19-precision-pass";
const VALIDATION_V10_PATH = "data/oracle-action-eval-validation-v10.json";
const V9_HASH = "81676cb6270ea004d80aac23d2e945ce19fdf98bfbb3b46a4c96c397c0624433";

function main() {
  if (ORACLE_ACTION_PARSER_VERSION !== EXPECTED_PARSER) {
    throw new Error(`Parser must be ${EXPECTED_PARSER} (RC1 frozen), got ${ORACLE_ACTION_PARSER_VERSION}`);
  }

  const repoRoot = resolve(process.cwd(), "..");
  let commitSha = "unknown";
  try {
    commitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    commitSha = "uncommitted";
  }

  if (!commitSha.startsWith(EXPECTED_RC1_SHA.slice(0, 7)) && commitSha !== EXPECTED_RC1_SHA) {
    console.warn(
      `WARN: HEAD ${commitSha} differs from frozen RC1 ${EXPECTED_RC1_SHA}. Parser version gate is ${EXPECTED_PARSER}.`,
    );
  }

  if (!existsSync(resolve(process.cwd(), VALIDATION_V10_PATH))) {
    throw new Error("Run certify-validation-gold-v10.ts first");
  }

  const v10 = JSON.parse(readFileSync(resolve(process.cwd(), VALIDATION_V10_PATH), "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    setClassification: string;
    parentContentHash: string;
    goldCertification?: {
      goldCompletenessStatus: string;
      incompleteCaseCount: number;
    };
  };

  if (v10.goldCertification?.goldCompletenessStatus !== "complete") {
    throw new Error("validation_set_v10 goldCompletenessStatus must be complete before RC1 rerun");
  }

  const t0 = performance.now();
  const results = evaluateCaseSet(v10.cases, "validation_set_v10");
  const runtimeMs = Math.round(performance.now() - t0);

  const accepted = results.metricsByEmissionTier.acceptedOnly;
  const needsReview = results.metricsByEmissionTier.needsReviewOnly;
  const allEmission = results.metricsByEmissionTier.allEmission;
  const tierInvariants = results.metricsByEmissionTier.tierInvariants;

  const audit = auditValidationSet(v10.cases);

  const primaryRecords: Array<{
    caseId: string;
    mismatchKind: "false_positive" | "false_negative";
    primaryRootCause: PrimaryRootCause;
    auditClassification: string;
  }> = [];

  for (const rec of audit.records) {
    primaryRecords.push({
      caseId: rec.caseId,
      mismatchKind: rec.mismatchKind,
      primaryRootCause: assignPrimaryRootCause({
        mismatchKind: rec.mismatchKind,
        auditClassification: rec.classification,
        testCase: v10.cases.find((c) => c.id === rec.caseId)!,
        parserPrimitive: rec.parserPrimitive,
        parserEvidence: rec.parserEvidence,
        expectedPrimitive: rec.expectedPrimitive,
      }),
      auditClassification: rec.classification,
    });
  }

  const primaryRootCauses = summarizePrimaryRootCauses(primaryRecords);
  const evaluatorDefects = primaryRootCauses.evaluator_defect;
  const unresolvedGoldDefects = primaryRootCauses.gold_defect;

  const confusion = new Map<string, number>();
  for (const testCase of v10.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      actionType: a.actionType,
      evidenceText: a.evidenceText,
      cardFaceId: a.faceId,
      abilityIndex: a.abilityIndex,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      optionalEffect: a.optionalEffect,
    }));
    const acceptedMatch = matchGoldToActions({
      expected,
      actions,
      tier: "accepted",
      oracleText: testCase.oracleText,
    });
    for (const actionIdx of acceptedMatch.unmatchedActionIndices) {
      const a = actions[actionIdx];
      for (const exp of expected) {
        if (exp.actionType !== a.actionType && evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains)) {
          const key = `${exp.actionType} → ${a.actionType}`;
          confusion.set(key, (confusion.get(key) ?? 0) + 1);
        }
      }
    }
  }

  const benchmarkQualityOk = evaluatorDefects === 0 && unresolvedGoldDefects === 0;
  const pass =
    benchmarkQualityOk &&
    accepted.precision >= 0.98 &&
    accepted.recall >= 0.9 &&
    results.authoritativeClassification.counts.genuinely_unsupported_by_oracle === 0 &&
    tierInvariants.tpSumHolds &&
    tierInvariants.fpSumHolds;

  const devV25 = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v25.json"), "utf8"),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    rcName: RC_NAME,
    commitSha,
    frozenRc1CommitSha: EXPECTED_RC1_SHA,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    taxonomyVersion: ORACLE_ACTION_TAXONOMY_VERSION,
    validationSet: "validation_set_v10",
    validationSetHash: v10.contentHash,
    validationSetV9ParentHash: V9_HASH,
    validationSetV10ParentHash: v10.parentContentHash,
    developmentSetV25Hash: devV25.contentHash,
    runtimeMs,
    metrics: {
      accepted: {
        tp: accepted.truePositives,
        fp: accepted.falsePositives,
        fn: accepted.falseNegatives,
        precision: accepted.precision,
        recall: accepted.recall,
      },
      needsReview: {
        tp: needsReview.truePositives,
        fp: needsReview.falsePositives,
      },
      allEmission: {
        tp: allEmission.truePositives,
        fp: allEmission.falsePositives,
        fn: allEmission.falseNegatives,
        precision: allEmission.precision,
        recall: allEmission.recall,
      },
    },
    acceptedUnsupported: results.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    provenanceInvariants: tierInvariants,
    primaryRootCauses,
    benchmarkQuality: {
      evaluatorDefects,
      unresolvedGoldDefects,
      benchmarkQualityOk,
    },
    confusionMatrix: [...confusion.entries()]
      .map(([pair, count]) => {
        const [expected, emitted] = pair.split(" → ");
        return { expected, emitted, count };
      })
      .sort((a, b) => b.count - a.count),
    validationPass: pass,
    rc1GeneralizationPass: pass,
    gates: {
      acceptedPrecisionMin: 0.98,
      acceptedRecallMin: 0.9,
      acceptedUnsupportedMax: 0,
      evaluatorDefectsMax: 0,
      unresolvedGoldDefectsMax: 0,
    },
    auditMismatchCount: audit.records.length,
    v9MilestoneConclusion: "inconclusive_due_to_uncertified_validation_gold",
    note: "RC1 frozen parser rerun on certified validation_set_v10. No parser changes. RC2 not authorized from this run alone unless gates pass.",
  };

  const milestoneDir = resolve(process.cwd(), "data/milestones/oracle-action-rc1-validation-v10");
  mkdirSync(milestoneDir, { recursive: true });
  writeFileSync(
    resolve(milestoneDir, "validation-milestone-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  writeFileSync(
    resolve(process.cwd(), "reports/validation-rc1-v10-milestone-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  const accessLogPath = resolve(process.cwd(), "data/oracle-action-validation-access-log.json");
  if (existsSync(accessLogPath)) {
    const log = JSON.parse(readFileSync(accessLogPath, "utf8")) as unknown[];
    log.push({
      timestamp: report.generatedAt,
      reason: "validation-milestone-rc1-v10",
      rcName: RC_NAME,
      commitSha,
      frozenRc1CommitSha: EXPECTED_RC1_SHA,
      parserVersion: ORACLE_ACTION_PARSER_VERSION,
      validationSet: "validation_set_v10",
      validationSetContentHash: v10.contentHash,
      metrics: report.metrics,
      acceptedUnsupported: report.acceptedUnsupported,
      benchmarkQuality: report.benchmarkQuality,
      validationPass: pass,
    });
    writeFileSync(accessLogPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
