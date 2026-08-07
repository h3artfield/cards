/**
 * RC1 validation milestone — single execution against validation_set_v9.
 * Run: npx tsx scripts/eval-validation-milestone-rc1.ts
 */
import { readFileSync, mkdirSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
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
import {
  matchGoldToActions,
  evaluateCaseUnified,
  sumUnifiedMetrics,
  verifyTierInvariants,
} from "./oracle-action-unified-matcher";
import { evidenceMatchesExtracted } from "./oracle-action-eval-shared";
import { migrationPolicyHash } from "./lib/taxonomy-v13-shuffle-migration";

const RC_NAME = "oracle-action-rc1";
const EXPECTED_PARSER = "oracle-action-v1.19-precision-pass";
const VALIDATION_V9_PATH = "data/oracle-action-eval-validation-v9.json";

type ErrorFamily =
  | "wrong_primitive"
  | "parser_defect"
  | "wrong_span_role"
  | "reminder_leakage"
  | "cost_leakage"
  | "quoted_granted_failure"
  | "compound_clause_failure"
  | "face_component_failure"
  | "shuffle_taxonomy_failure"
  | "missing_grammar"
  | "needs_review_only_tp"
  | "evaluator_defect"
  | "gold_omission";

function classifyAcceptedFp(input: {
  testCase: OracleActionEvalCaseV2;
  actionType: string;
  evidenceText: string;
  textRole?: string;
}): ErrorFamily {
  const { testCase, actionType, evidenceText, textRole } = input;
  const ot = testCase.oracleText;

  if (actionType === "shuffle_library" || actionType === "shuffle_into_library") {
    return "shuffle_taxonomy_failure";
  }
  if (/\bCycling \{|\bAftermath \(|\bFlashback \{/i.test(ot) && /Discard|Draw a card|Cast this/i.test(evidenceText)) {
    return "reminder_leakage";
  }
  if (/\bAs an additional cost|\bEvoke—|\bRather than pay/i.test(ot) && /Discard|Sacrifice|Exile/i.test(evidenceText)) {
    return "cost_leakage";
  }
  if (textRole === "reminder_text" || textRole === "mechanic_reminder") return "reminder_leakage";
  if (textRole === "cost") return "cost_leakage";
  if (/"/.test(ot) && /has "/i.test(ot)) return "quoted_granted_failure";
  if (/\bthen\b/i.test(ot) && !/\bthen shuffle\b/i.test(evidenceText)) return "compound_clause_failure";
  if (testCase.cardFace && ot.includes("\n//\n")) return "face_component_failure";

  const goldHasType = testCase.expectedPrimitiveActions.some(
    (e) => !e.negative && e.actionType === actionType,
  );
  if (goldHasType) return "parser_defect";
  if (testCase.expectedPrimitiveActions.some((e) => !e.negative && e.actionType !== actionType && evidenceMatchesExtracted(evidenceText, e.evidenceContains))) {
    return "wrong_primitive";
  }
  return "parser_defect";
}

function inferExpectedForConfusion(testCase: OracleActionEvalCaseV2, evidence: string, emitted: string): string {
  for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
    if (exp.actionType === emitted && evidenceMatchesExtracted(evidence, exp.evidenceContains)) return exp.actionType;
  }
  for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
    if (evidenceMatchesExtracted(evidence, exp.evidenceContains)) return exp.actionType;
  }
  return "none";
}

function main() {
  if (ORACLE_ACTION_PARSER_VERSION !== EXPECTED_PARSER) {
    throw new Error(`Parser must be ${EXPECTED_PARSER}, got ${ORACLE_ACTION_PARSER_VERSION}`);
  }

  const repoRoot = resolve(process.cwd(), "..");
  let commitSha = "unknown";
  try {
    commitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    commitSha = "uncommitted";
  }

  if (!existsSync(resolve(process.cwd(), VALIDATION_V9_PATH))) {
    throw new Error("Run create-validation-set-v9.ts first");
  }

  const v9 = JSON.parse(readFileSync(resolve(process.cwd(), VALIDATION_V9_PATH), "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    setClassification: string;
    taxonomyVersion: string;
    parentContentHash: string;
    taxonomyMigration?: { migrationHash: string };
  };

  const t0 = performance.now();
  const results = evaluateCaseSet(v9.cases, "validation_set_v9");
  const runtimeMs = Math.round(performance.now() - t0);

  const accepted = results.metricsByEmissionTier.acceptedOnly;
  const needsReview = results.metricsByEmissionTier.needsReviewOnly;
  const allEmission = results.metricsByEmissionTier.allEmission;
  const tierInvariants = results.metricsByEmissionTier.tierInvariants;

  const audit = auditValidationSet(v9.cases);
  const errorFamilies: Record<ErrorFamily, number> = {
    wrong_primitive: 0,
    parser_defect: 0,
    wrong_span_role: 0,
    reminder_leakage: 0,
    cost_leakage: 0,
    quoted_granted_failure: 0,
    compound_clause_failure: 0,
    face_component_failure: 0,
    shuffle_taxonomy_failure: 0,
    missing_grammar: 0,
    needs_review_only_tp: 0,
    evaluator_defect: 0,
    gold_omission: 0,
  };

  const confusion = new Map<string, number>();
  let needsReviewOnlyTp = 0;

  for (const testCase of v9.cases) {
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
      textRole: a.textRole,
      optionalEffect: a.optionalEffect,
    }));

    const acceptedMatch = matchGoldToActions({
      expected,
      actions,
      tier: "accepted",
      oracleText: testCase.oracleText,
    });
    const needsReviewMatch = matchGoldToActions({
      expected,
      actions,
      tier: "needs_review",
      oracleText: testCase.oracleText,
    });
    const allMatch = matchGoldToActions({
      expected,
      actions,
      tier: "all",
      oracleText: testCase.oracleText,
    });

    const acceptedMatchedGold = new Set(
      acceptedMatch.matches.filter((m) => m.matched).map((m) => m.expectedIndex),
    );
    for (const expIdx of allMatch.unmatchedExpectedIndices) {
      const exp = expected[expIdx];
      const nrHit = needsReviewMatch.matches.find((m) => m.expectedIndex === expIdx && m.matched);
      if (nrHit) {
        needsReviewOnlyTp += 1;
        errorFamilies.needs_review_only_tp += 1;
        continue;
      }
      if (evidenceMatchesExtracted(testCase.oracleText, exp.evidenceContains)) {
        errorFamilies.missing_grammar += 1;
      } else {
        errorFamilies.gold_omission += 1;
      }
    }

    for (const actionIdx of acceptedMatch.unmatchedActionIndices) {
      const a = actions[actionIdx];
      const family = classifyAcceptedFp({
        testCase,
        actionType: a.actionType,
        evidenceText: a.evidenceText,
        textRole: a.textRole,
      });
      errorFamilies[family] += 1;
      const expLabel = inferExpectedForConfusion(testCase, a.evidenceText, a.actionType);
      if (expLabel !== "none" && expLabel !== a.actionType) {
        const key = `${expLabel} → ${a.actionType}`;
        confusion.set(key, (confusion.get(key) ?? 0) + 1);
      } else if (expLabel === "none") {
        errorFamilies.parser_defect += family === "parser_defect" ? 0 : 0;
      }
    }

    void acceptedMatchedGold;
  }

  for (const rec of audit.records) {
    if (rec.classification === "wrong_parser_primitive") errorFamilies.wrong_primitive += 1;
    if (rec.classification === "missing_parser_grammar") errorFamilies.missing_grammar += 1;
    if (rec.classification === "evaluator_defect") errorFamilies.evaluator_defect += 1;
    if (rec.classification === "missing_gold_label") errorFamilies.gold_omission += 1;
    if (rec.classification === "wrong_face") errorFamilies.face_component_failure += 1;
  }

  const pass =
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
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    taxonomyVersion: ORACLE_ACTION_TAXONOMY_VERSION,
    validationSet: "validation_set_v9",
    validationSetHash: v9.contentHash,
    validationSetV8ParentHash: v9.parentContentHash,
    taxonomyMigrationHash: v9.taxonomyMigration?.migrationHash ?? migrationPolicyHash(),
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
    errorFamilies,
    confusionMatrix: [...confusion.entries()]
      .map(([pair, count]) => {
        const [expected, emitted] = pair.split(" → ");
        return { expected, emitted, count };
      })
      .sort((a, b) => b.count - a.count),
    validationPass: pass,
    gates: {
      acceptedPrecisionMin: 0.98,
      acceptedRecallMin: 0.9,
      acceptedUnsupportedMax: 0,
    },
    auditMismatchCount: audit.records.length,
    note: "Single validation execution for oracle-action-rc1. No parser changes during run.",
  };

  const milestoneDir = resolve(process.cwd(), "data/milestones/oracle-action-rc1-validation");
  mkdirSync(milestoneDir, { recursive: true });
  const reportPath = resolve(milestoneDir, "validation-milestone-report.json");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(
    resolve(process.cwd(), "reports/validation-rc1-milestone-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  const accessLogPath = resolve(process.cwd(), "data/oracle-action-validation-access-log.json");
  const log = JSON.parse(readFileSync(accessLogPath, "utf8")) as unknown[];
  log.push({
    timestamp: report.generatedAt,
    reason: "validation-milestone-rc1",
    rcName: RC_NAME,
    commitSha,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    validationSet: "validation_set_v9",
    validationSetContentHash: v9.contentHash,
    developmentSetV25Hash: devV25.contentHash,
    metrics: report.metrics,
    acceptedUnsupported: report.acceptedUnsupported,
    validationPass: pass,
  });
  writeFileSync(accessLogPath, `${JSON.stringify(log, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(report, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
