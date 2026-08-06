/**
 * Oracle-action evaluation v7 — separated optionality metrics, N/A zero-support reporting.
 * Run: npx tsx scripts/eval-oracle-action-extraction-v7.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import {
  extractOracleActionsV1,
  toLegacyExtractionResult,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { findMayScopesInParagraph } from "../src/lib/deck-builder/golden-catalog/oracle-action-optionality";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { computeMetrics, evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { evidenceMatchesExtracted } from "./oracle-action-eval-shared";

interface Counters {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  positiveGoldSupport: number;
}

interface MetricReport {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  trueNegatives: number;
  positiveGoldSupport: number;
  precision: number | null;
  recall: number | null;
  falsePositiveRate: number | null;
  status: "computed" | "N/A — zero gold support";
  note?: string;
}

function emptyCounters(): Counters {
  return { tp: 0, fp: 0, fn: 0, tn: 0, positiveGoldSupport: 0 };
}

function finalizeMetric(c: Counters, note?: string): MetricReport {
  if (c.positiveGoldSupport === 0) {
    return {
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: c.tn,
      positiveGoldSupport: 0,
      precision: null,
      recall: null,
      falsePositiveRate: null,
      status: "N/A — zero gold support",
      note,
    };
  }
  if (c.positiveGoldSupport <= 3) {
    const m = computeMetrics(c.tp, c.fp, c.fn);
    return {
      truePositives: c.tp,
      falsePositives: c.fp,
      falseNegatives: c.fn,
      trueNegatives: c.tn,
      positiveGoldSupport: c.positiveGoldSupport,
      precision: c.tp + c.fp > 0 ? m.precision : null,
      recall: m.recall,
      falsePositiveRate: c.tp + c.fp > 0 ? m.falsePositiveRate : null,
      status: "computed",
      note: `${note ?? ""} Insufficient gold support (≤3 labels) — interpret with caution.`.trim(),
    };
  }
  const m = computeMetrics(c.tp, c.fp, c.fn);
  return {
    truePositives: c.tp,
    falsePositives: c.fp,
    falseNegatives: c.fn,
    trueNegatives: c.tn,
    positiveGoldSupport: c.positiveGoldSupport,
    precision: c.tp + c.fp > 0 ? m.precision : null,
    recall: c.positiveGoldSupport > 0 ? m.recall : null,
    falsePositiveRate: c.tp + c.fp > 0 ? m.falsePositiveRate : null,
    status: "computed",
    note,
  };
}

function scoreBinary(c: Counters, expected: boolean, actual: boolean) {
  if (expected) {
    c.positiveGoldSupport += 1;
    if (actual) c.tp += 1;
    else c.fn += 1;
  } else if (actual) {
    c.fp += 1;
  } else {
    c.tn += 1;
  }
}

function conditionTypesMatch(gold?: string, parsed?: string): boolean {
  if (!gold || !parsed) return false;
  if (gold === parsed) return true;
  if (gold === "if" && parsed === "general") return true;
  if (gold === "only_if" && parsed === "general") return true;
  if (gold === "as_long_as" && parsed === "general") return true;
  if (gold === "delayed" && parsed === "general") return true;
  if (gold === "replacement" && parsed === "general") return true;
  if (gold === "intervening_if" && (parsed === "when_you_do" || parsed === "intervening_if")) return true;
  return false;
}

function evaluateSeparatedOptionalityMetrics(cases: OracleActionEvalCaseV2[]) {
  const mayInOracle = emptyCounters();
  const mayClauseSegmentation = emptyCounters();
  const primitiveInMayScope = emptyCounters();
  const mayToExistingAction = emptyCounters();
  const optionalityScope = emptyCounters();
  const optionalityController = emptyCounters();
  const optionalEffect = emptyCounters();
  const optionalCost = emptyCounters();
  const ifYouDoDep = emptyCounters();
  const whenYouDoDep = emptyCounters();
  const upToDetection = emptyCounters();
  const upToMinMax = emptyCounters();
  const quantityZero = emptyCounters();
  const conditionDetection = emptyCounters();
  const conditionAttachment = emptyCounters();

  /** Prior v7 bug: mayDetection and mayAttachment both used matched?.optionalEffect only — identical when unmatched. */
  const priorAliasedMayDetection = emptyCounters();

  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const extraction = toLegacyExtractionResult(raw);
    const oracleHasMay = /\b(?:You|An opponent|That player|Each player|Its controller) may\b/i.test(
      testCase.oracleText,
    );
    const parserFoundOptional =
      extraction.actions.some((a) => a.optionalEffect || a.optionalCost) ||
      raw.structureAnnotations.some((a) => a.optionalEffect || a.optionalCost);
    const segmentedMayScopes = raw.abilities.flatMap((a) =>
      findMayScopesInParagraph(a.paragraphText, a.paragraphStart),
    );
    const mayScopesFound = segmentedMayScopes.length > 0;

    if (oracleHasMay) {
      mayInOracle.positiveGoldSupport += 1;
      if (parserFoundOptional) mayInOracle.tp += 1;
      else mayInOracle.fn += 1;

      mayClauseSegmentation.positiveGoldSupport += 1;
      if (mayScopesFound) mayClauseSegmentation.tp += 1;
      else mayClauseSegmentation.fn += 1;
    }

    for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
      const matched = extraction.actions.find(
        (a) =>
          normalizeToPrimitive(a.effects[0]?.actionType ?? "", a.evidenceText) === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains),
      );

      const expectsOptionalEffect = exp.optionalEffect === true;
      const expectsOptionalCost = exp.optionalCost === true;
      const expectsUpTo = exp.targetMaximum !== undefined || /\bup to\b/i.test(exp.evidenceContains);

      if (expectsOptionalEffect || expectsOptionalCost) {
        primitiveInMayScope.positiveGoldSupport += 1;
        if (matched) primitiveInMayScope.tp += 1;
        else primitiveInMayScope.fn += 1;

        if (matched) {
          mayToExistingAction.positiveGoldSupport += 1;
          const attached = expectsOptionalCost
            ? matched.optionalCost === true
            : matched.optionalEffect === true;
          if (attached) mayToExistingAction.tp += 1;
          else mayToExistingAction.fn += 1;
        }

        const aliasedDetected = Boolean(matched?.optionalEffect || matched?.optionalCost);
        priorAliasedMayDetection.positiveGoldSupport += 1;
        if (aliasedDetected) priorAliasedMayDetection.tp += 1;
        else priorAliasedMayDetection.fn += 1;
      }

      if (expectsOptionalEffect) {
        scoreBinary(optionalEffect, true, matched?.optionalEffect === true);
        if (matched && matched.optionalEffect === false) optionalEffect.fp += 1;
      }
      if (expectsOptionalCost) {
        scoreBinary(optionalCost, true, matched?.optionalCost === true);
        if (matched && matched.optionalCost === false) optionalCost.fp += 1;
      }
      if (exp.optionalityController) {
        scoreBinary(optionalityController, true, matched?.optionalityController === exp.optionalityController);
      }
      if (exp.optionalityScopeId && expectsOptionalEffect) {
        optionalityScope.positiveGoldSupport += 1;
        if (matched?.optionalityScopeId) optionalityScope.tp += 1;
        else optionalityScope.fn += 1;
      }

      if (expectsUpTo) {
        scoreBinary(
          upToDetection,
          true,
          matched?.targetMaximum !== undefined ||
            matched?.quantityMayBeZero === true ||
            /\bup to\b/i.test(matched?.evidenceText ?? ""),
        );
        if (exp.targetMaximum !== undefined) {
          scoreBinary(upToMinMax, true, matched?.targetMaximum === exp.targetMaximum);
        }
        if (exp.quantityMayBeZero !== undefined) {
          scoreBinary(quantityZero, true, matched?.quantityMayBeZero === exp.quantityMayBeZero);
        }
      }
    }

    for (const cond of testCase.expectedConditions ?? []) {
      conditionDetection.positiveGoldSupport += 1;
      const anyCond =
        extraction.actions.some(
          (a) =>
            a.conditionText?.toLowerCase().includes(cond.textContains.toLowerCase().slice(0, 16)) ||
            a.effects.some((e) =>
              (e.conditions ?? []).some((c) =>
                c.toLowerCase().includes(cond.textContains.toLowerCase().slice(0, 16)),
              ),
            ),
        ) ||
        raw.structureAnnotations.some((a) =>
          a.conditionText?.toLowerCase().includes(cond.textContains.toLowerCase().slice(0, 16)),
        );
      if (anyCond) conditionDetection.tp += 1;
      else conditionDetection.fn += 1;

      if (cond.attachesToEvidence) {
        conditionAttachment.positiveGoldSupport += 1;
        const attached = extraction.actions.find((a) =>
          evidenceMatchesExtracted(a.evidenceText, cond.attachesToEvidence!),
        );
        const ok =
          Boolean(attached) &&
          (conditionTypesMatch(cond.type, attached!.conditionType) ||
            attached!.conditionText?.toLowerCase().includes(cond.textContains.toLowerCase().slice(0, 16)) ||
            (attached!.dependsOnActionIds?.length ?? 0) > 0);
        if (ok) conditionAttachment.tp += 1;
        else conditionAttachment.fn += 1;

        if (cond.type === "if_you_do") {
          scoreBinary(
            ifYouDoDep,
            true,
            Boolean(
              attached &&
                (attached.conditionType === "if_you_do" || (attached.dependsOnActionIds?.length ?? 0) > 0),
            ),
          );
        }
        if (cond.type === "when_you_do" || cond.type === "intervening_if") {
          scoreBinary(
            whenYouDoDep,
            true,
            Boolean(
              attached &&
                (conditionTypesMatch(cond.type, attached.conditionType) ||
                  (attached.dependsOnActionIds?.length ?? 0) > 0),
            ),
          );
        }
      }
    }
  }

  return {
    mayDetectionInOracleText: finalizeMetric(mayInOracle, "Case-level: oracle contains may → parser emits any optionalEffect/optionalCost"),
    mayClauseSegmentation: finalizeMetric(mayClauseSegmentation, "Case-level: oracle contains may → findMayScopes finds ≥1 scope"),
    primitiveExtractionWithinMayScope: finalizeMetric(
      primitiveInMayScope,
      "Label-level: gold optionalEffect/Cost → underlying primitive extracted (independent of attachment)",
    ),
    mayToExistingActionAttachment: finalizeMetric(
      mayToExistingAction,
      "Label-level: only when primitive extracted — optionalEffect/Cost correctly attached",
    ),
    optionalityScopeAccuracy: finalizeMetric(optionalityScope, "Label-level: gold optionalityScopeId present on optional actions"),
    optionalityControllerAccuracy: finalizeMetric(optionalityController, "Label-level: gold optionalityController labels"),
    optionalEffect: finalizeMetric(optionalEffect),
    optionalCost: finalizeMetric(optionalCost),
    ifYouDoDependency: finalizeMetric(ifYouDoDep),
    whenYouDoDependency: finalizeMetric(whenYouDoDep),
    upToDetection: finalizeMetric(upToDetection),
    upToMinMaxValues: finalizeMetric(upToMinMax),
    quantityMayBeZero: finalizeMetric(quantityZero),
    generalConditionDetection: finalizeMetric(conditionDetection),
    conditionToActionAttachment: finalizeMetric(conditionAttachment),
    priorV7AliasedMayMetric: finalizeMetric(
      priorAliasedMayDetection,
      "DEPRECATED: prior v7 computed mayDetection and mayAttachment from the same matched?.optionalEffect check — explains identical P/R",
    ),
    metricIndependenceNote:
      "mayDetectionInOracleText is case-level (any optional emission per card). mayToExistingActionAttachment is label-level and conditioned on successful primitive extraction. They are independently calculated; prior identical 27.1% arose from an aliased implementation, not intentional design.",
  };
}

function evaluateAcceptanceCalibration(cases: OracleActionEvalCaseV2[]) {
  const accepted = emptyCounters();
  const needsReview = emptyCounters();
  const transitions: Array<{ caseId: string; evidence: string; from: string; to: string; reason: string }> = [];

  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);

    for (const action of raw.actions) {
      const exp = expected.find(
        (e) =>
          e.actionType === action.actionType &&
          evidenceMatchesExtracted(action.evidenceText, e.evidenceContains),
      );
      const isTp = Boolean(exp);
      if (action.reviewStatus === "accepted") {
        if (isTp) accepted.tp += 1;
        else accepted.fp += 1;
      } else if (action.reviewStatus === "needs_review") {
        if (isTp) needsReview.tp += 1;
        else needsReview.fp += 1;
      }
      if (isTp && action.reviewStatus === "needs_review") {
        needsReview.fn += 1;
        let reason = "confidence_or_structure";
        if (/\bmay\b/i.test(testCase.oracleText) && !action.optionalEffect && !action.optionalCost) {
          reason = "uncertain_optionality_scope";
        }
        if (action.conditionType && !action.dependsOnActionIds?.length) {
          reason = "unresolved_dependency";
        }
        if (transitions.length < 30) {
          transitions.push({
            caseId: testCase.id,
            evidence: action.evidenceText.slice(0, 60),
            from: "would_accept",
            to: "needs_review",
            reason,
          });
        }
      }
    }
    for (const exp of expected) {
      const matched = raw.actions.find(
        (a) =>
          a.actionType === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains) &&
          a.reviewStatus === "accepted",
      );
      if (!matched) accepted.fn += 1;
    }
  }

  return {
    accepted: finalizeMetric(accepted),
    needsReview: finalizeMetric(needsReview),
    actionsMovedToNeedsReview: transitions.length,
    transitionReasons: transitions,
  };
}

function collectRemainingFailures(cases: OracleActionEvalCaseV2[]) {
  const mayOracleMiss: string[] = [];
  const attachMiss: string[] = [];
  const primMiss: string[] = [];
  const condMiss: string[] = [];

  for (const tc of cases) {
    const raw = extractOracleActionsV1({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
    const ext = toLegacyExtractionResult(raw);
    const hasMay = /\b(?:You|An opponent|That player|Each player|Its controller) may\b/i.test(tc.oracleText);
    const foundOpt =
      ext.actions.some((a) => a.optionalEffect || a.optionalCost) ||
      raw.structureAnnotations.some((a) => a.optionalEffect || a.optionalCost);
    if (hasMay && !foundOpt && mayOracleMiss.length < 8) {
      mayOracleMiss.push(`${tc.id}: ${tc.oracleText.slice(0, 70)}`);
    }

    for (const exp of tc.expectedPrimitiveActions.filter((e) => !e.negative)) {
      if (!exp.optionalEffect && !exp.optionalCost) continue;
      const matched = ext.actions.find(
        (a) =>
          normalizeToPrimitive(a.effects[0]?.actionType ?? "", a.evidenceText) === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains),
      );
      if (!matched && primMiss.length < 8) {
        primMiss.push(`${tc.id} ${exp.actionType} "${exp.evidenceContains.slice(0, 40)}"`);
      } else if (matched && attachMiss.length < 8) {
        const ok = exp.optionalCost ? matched.optionalCost : matched.optionalEffect;
        if (!ok) attachMiss.push(`${tc.id} "${matched.evidenceText.slice(0, 40)}"`);
      }
    }

    for (const cond of tc.expectedConditions ?? []) {
      if (!cond.attachesToEvidence || condMiss.length >= 8) continue;
      const attached = ext.actions.find((a) => evidenceMatchesExtracted(a.evidenceText, cond.attachesToEvidence!));
      const ok =
        attached &&
        (conditionTypesMatch(cond.type, attached.conditionType) ||
          attached.conditionText?.toLowerCase().includes(cond.textContains.toLowerCase().slice(0, 16)) ||
          (attached.dependsOnActionIds?.length ?? 0) > 0);
      if (!ok) condMiss.push(`${tc.id} ${cond.type} -> ${cond.attachesToEvidence.slice(0, 30)}`);
    }
  }

  return { mayOracleMiss, primitiveInMayScopeMiss: primMiss, mayAttachmentMiss: attachMiss, conditionAttachmentMiss: condMiss };
}

function main() {
  const allowValidation = process.argv.includes("--allow-validation");
  const validationMilestone = process.argv.includes("--validation-milestone");

  let devPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v4.json");
  try {
    readFileSync(devPath, "utf8");
  } catch {
    devPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v3.json");
  }

  const dev = JSON.parse(readFileSync(devPath, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    setClassification?: string;
    caseCount?: number;
  };

  const developmentResults = evaluateCaseSet(dev.cases, dev.setClassification ?? "development_set_v4");
  const separatedMetrics = evaluateSeparatedOptionalityMetrics(dev.cases);
  const acceptanceCalibration = evaluateAcceptanceCalibration(dev.cases);

  let validationResults = null;
  const validationAccessLogPath = resolve(process.cwd(), "data", "oracle-action-validation-access-log.json");
  if (allowValidation) {
    const validationPath = resolve(process.cwd(), "data", "oracle-action-eval-validation-v2.json");
    const validation = JSON.parse(readFileSync(validationPath, "utf8")) as {
      cases: OracleActionEvalCaseV2[];
      contentHash: string;
      setClassification?: string;
    };
    const validationCaseResults = evaluateCaseSet(validation.cases, validation.setClassification ?? "validation_set_v2");
    const validationSeparated = evaluateSeparatedOptionalityMetrics(validation.cases);
    validationResults = {
      classification: validation.setClassification ?? "validation_set_v2",
      contentHash: validation.contentHash,
      caseCount: validation.cases.length,
      ...validationCaseResults,
      separatedOptionalityMetrics: validationSeparated,
      purpose: "Optionality/condition generalization check — not production authorization",
    };

    const logEntry = {
      parserVersion: ORACLE_ACTION_PARSER_VERSION,
      parserCommit: process.env.GIT_COMMIT,
      developmentSet: dev.setClassification,
      developmentSetContentHash: dev.contentHash,
      validationSet: validation.setClassification ?? "validation_set_v2",
      validationSetContentHash: validation.contentHash,
      reason: validationMilestone
        ? "optionality_condition_validation_milestone_v1.6"
        : "explicit --allow-validation",
      timestamp: new Date().toISOString(),
      metrics: {
        allEmission: validationCaseResults.metricsByEmissionTier.allEmission,
        acceptedOnly: validationCaseResults.metricsByEmissionTier.acceptedOnly,
        separatedOptionalityMetrics: validationSeparated,
        genuinelyUnsupported:
          validationCaseResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
        emissionCounts: validationCaseResults.emissionCounts,
      },
    };
    let log: unknown[] = [];
    try {
      log = JSON.parse(readFileSync(validationAccessLogPath, "utf8")) as unknown[];
    } catch {
      log = [];
    }
    log.push(logEntry);
    writeFileSync(validationAccessLogPath, JSON.stringify(log, null, 2), "utf8");
  }

  let mayClassification = null;
  try {
    mayClassification = JSON.parse(
      readFileSync(resolve(process.cwd(), "reports", "oracle-action-may-false-negative-classification.json"), "utf8"),
    );
  } catch {
    mayClassification = { note: "Run classify-may-false-negatives.ts" };
  }

  const upToGoldCount = dev.cases.filter((c) =>
    c.expectedPrimitiveActions.some((e) => e.targetMaximum !== undefined || /\bup to\b/i.test(e.evidenceContains)),
  ).length;

  const remainingFailureExamples = collectRemainingFailures(dev.cases);

  const report = {
    generatedAt: new Date().toISOString(),
    evaluationVersion: "eval-v7-may-scope",
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    gitCommit: process.env.GIT_COMMIT ?? undefined,
    developmentOnly: !allowValidation,
    validationRun: allowValidation,
    developmentSet: {
      classification: dev.setClassification ?? "development_set_v4",
      caseCount: dev.cases.length,
      contentHash: dev.contentHash,
      ...developmentResults,
      separatedOptionalityMetrics: separatedMetrics,
      acceptanceCalibration,
      remainingFailureExamples,
    },
    mayFalseNegativeClassification: mayClassification,
    expandedUpToGoldCaseCount: upToGoldCount,
    validationSet: allowValidation
      ? validationResults
      : { status: "NOT_RUN", reason: "Use --allow-validation --validation-milestone at milestones" },
    finalBlindTest: { status: "SEALED" },
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-action-parser-dev-report-v7.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-v7-dev-report-manifest.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        generatedAt: report.generatedAt,
        evaluationVersion: report.evaluationVersion,
        parserVersion: report.parserVersion,
        developmentSetClassification: dev.setClassification,
        developmentSetContentHash: dev.contentHash,
        developmentSetCaseCount: dev.cases.length,
        reportPath: "reports/oracle-action-parser-dev-report-v7.json",
        validationRun: allowValidation,
        summaryMetrics: {
          allEmission: developmentResults.metricsByEmissionTier.allEmission,
          acceptedOnly: developmentResults.metricsByEmissionTier.acceptedOnly,
          mayToExistingActionAttachment: separatedMetrics.mayToExistingActionAttachment,
          conditionToActionAttachment: separatedMetrics.conditionToActionAttachment,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const d = developmentResults.metricsByEmissionTier;
  const s = separatedMetrics;
  const fmt = (m: MetricReport) =>
    m.status === "N/A — zero gold support" ? "N/A — zero gold support" : `${((m.precision ?? 0) * 100).toFixed(1)}% / ${((m.recall ?? 0) * 100).toFixed(1)}%`;

  console.log(`Parser dev report v7 (${ORACLE_ACTION_PARSER_VERSION})`);
  console.log(`Development set: ${dev.setClassification} (${dev.cases.length} cases)`);
  console.log(`  all-emission P/R: ${(d.allEmission.precision * 100).toFixed(1)}% / ${(d.allEmission.recall * 100).toFixed(1)}%`);
  console.log(`  accepted-only P/R: ${(d.acceptedOnly.precision * 100).toFixed(1)}% / ${(d.acceptedOnly.recall * 100).toFixed(1)}%`);
  console.log(`  may in oracle text P/R: ${fmt(s.mayDetectionInOracleText)}`);
  console.log(`  may clause segmentation P/R: ${fmt(s.mayClauseSegmentation)}`);
  console.log(`  primitive in may scope P/R: ${fmt(s.primitiveExtractionWithinMayScope)}`);
  console.log(`  may-to-existing-action P/R: ${fmt(s.mayToExistingActionAttachment)}`);
  console.log(`  optionality scope P/R: ${fmt(s.optionalityScopeAccuracy)}`);
  console.log(`  optionality controller P/R: ${fmt(s.optionalityControllerAccuracy)}`);
  console.log(`  if-you-do dependency P/R: ${fmt(s.ifYouDoDependency)}`);
  console.log(`  when-you-do dependency P/R: ${fmt(s.whenYouDoDependency)}`);
  console.log(`  general condition detection P/R: ${fmt(s.generalConditionDetection)}`);
  console.log(`  structure annotations (Layer 1, excluded from primitive counts): ${developmentResults.emissionCounts.structureAnnotationCount ?? 0}`);
  console.log(`  abstained clauses: ${developmentResults.emissionCounts.abstainedClauseCount}`);
  console.log(`  genuinely unsupported: ${developmentResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle}`);
  if (allowValidation && validationResults) {
    const v = validationResults.metricsByEmissionTier;
    const vs = validationResults.separatedOptionalityMetrics;
    console.log(`Validation set (${validationResults.classification}):`);
    console.log(`  all-emission P/R: ${(v.allEmission.precision * 100).toFixed(1)}% / ${(v.allEmission.recall * 100).toFixed(1)}%`);
    console.log(`  may in oracle text P/R: ${fmt(vs.mayDetectionInOracleText)}`);
    console.log(`  condition-to-action P/R: ${fmt(vs.conditionToActionAttachment)}`);
  }
  console.log(`Report: ${outPath}`);
}

if (process.argv[1]?.includes("eval-oracle-action-extraction-v7")) {
  main();
}
