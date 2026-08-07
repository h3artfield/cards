/**
 * v1.13 error audit — accepted FN/FP classification + span-role confusion matrix.
 * Run: npx tsx scripts/audit-v13-errors.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import {
  classifyTextRoleAt,
  primitiveAllowedAtRole,
  type TextRole,
} from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { matchGoldToActions, primitiveMatchesExpected } from "./oracle-action-unified-matcher";
import { evidenceMatchesExtracted, evidenceMatchesOracle } from "./oracle-action-eval-shared";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { isAdjudicatedReject } from "./adjudicate-gold-omission-v18";
import { isAdjudicatedRejectV14 } from "./adjudicate-gold-omission-v14";

function datasetLabel(path: string): string {
  if (path.includes("v20")) return "development_set_v20";
  if (path.includes("v19")) return "development_set_v19";
  if (path.includes("v18")) return "development_set_v18";
  return "development_set_v17";
}

function reportName(path: string): string {
  if (path.includes("v20")) return "v13-error-audit-v20.json";
  if (path.includes("v19")) return "v13-error-audit-v19.json";
  if (path.includes("v18")) return "v13-error-audit-v18.json";
  return "v13-error-audit-v17.json";
}

const DEV_PATH =
  process.argv.find((a) => a.startsWith("--dataset="))?.slice("--dataset=".length) ??
  "data/oracle-action-eval-development-v20.json";
const DATASET_LABEL = datasetLabel(DEV_PATH);
const REPORT_NAME = reportName(DEV_PATH);

type FnCategory =
  | "effect_wrongly_classified_as_trigger_event"
  | "effect_wrongly_classified_as_cost"
  | "effect_wrongly_classified_as_condition"
  | "effect_wrongly_classified_as_reminder_text"
  | "effect_wrongly_classified_as_static_permission"
  | "modal_bullet_boundary_failure"
  | "quoted_granted_ability_boundary_failure"
  | "compound_clause_boundary_failure"
  | "multiface_component_boundary_failure"
  | "primitive_extractor_missing_grammar"
  | "action_correctly_extracted_needs_review"
  | "evaluator_gold_defect"
  | "genuinely_unsupported_primitive";

type FpCategory =
  | "parser_defect"
  | "gold_omission"
  | "wrong_primitive"
  | "wrong_span_role"
  | "wrong_ability"
  | "wrong_condition"
  | "evaluator_defect";

function corpusForFace(oracleText: string, cardFace?: string): string {
  if (!cardFace || !oracleText.includes("\n//\n")) return oracleText;
  return oracleText.split("\n//\n")[cardFace === "back" ? 1 : 0];
}

function locateEvidenceSpan(
  oracleText: string,
  evidenceContains: string,
  cardFace?: string,
): { localStart: number; localEnd: number; paragraph: string } | null {
  const corpus = corpusForFace(oracleText, cardFace);
  const idx = corpus.toLowerCase().indexOf(evidenceContains.toLowerCase().slice(0, Math.min(24, evidenceContains.length)));
  if (idx < 0) {
    const fuzzy = corpus.toLowerCase().indexOf(evidenceContains.toLowerCase().replace(/\s+/g, " ").slice(0, 20));
    if (fuzzy < 0) return null;
    return { localStart: fuzzy, localEnd: fuzzy + evidenceContains.length, paragraph: corpus };
  }
  return { localStart: idx, localEnd: idx + evidenceContains.length, paragraph: corpus };
}

function classifyFn(input: {
  testCase: OracleActionEvalCaseV2;
  exp: OracleActionEvalCaseV2["expectedPrimitiveActions"][number];
  spanRole: TextRole;
  allTierActions: Array<{ actionType: string; evidenceText: string; reviewStatus: string; textRole?: TextRole }>;
}): { category: FnCategory; reason: string; proposedFix: string } {
  const { testCase, exp, spanRole, allTierActions } = input;
  const ot = testCase.oracleText;
  const needsReviewMatch = allTierActions.find(
    (a) => a.actionType === exp.actionType && evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains),
  );

  if (needsReviewMatch && needsReviewMatch.reviewStatus === "needs_review") {
    return {
      category: "action_correctly_extracted_needs_review",
      reason: "Parser extracted gold primitive but reviewStatus=needs_review",
      proposedFix: "Promotion rule or confidence — not span-role boundary",
    };
  }

  if (spanRole === "trigger_event") {
    return {
      category: "effect_wrongly_classified_as_trigger_event",
      reason: "Gold effect span classified as trigger_event — overblocked",
      proposedFix: "Refine trigger-event boundary (comma split / intervening-if)",
    };
  }
  if (spanRole === "cost") {
    return {
      category: "effect_wrongly_classified_as_cost",
      reason: "Gold effect span classified as cost — overblocked",
      proposedFix: "Refine cost boundary (colon split / if-you-do antecedent vs consequent)",
    };
  }
  if (spanRole === "condition") {
    return {
      category: "effect_wrongly_classified_as_condition",
      reason: "Gold effect span classified as condition",
      proposedFix: "Separate condition-only spans from dependent effects",
    };
  }
  if (spanRole === "reminder_text" || spanRole === "mechanic_reminder") {
    if (!/\([^)]*(?:Flash|Flashback|Treasure token|Blood token|Clue token|Adventure|You may cast)\b/i.test(ot)) {
      return {
        category: "effect_wrongly_classified_as_reminder_text",
        reason: "Card-specific parenthetical wrongly tagged as reminder",
        proposedFix: "Tighten reminder detection — exclude card-specific rules text",
      };
    }
    return {
      category: "effect_wrongly_classified_as_reminder_text",
      reason: "Effect inside reminder parenthetical",
      proposedFix: "Reminder span boundary refinement",
    };
  }
  if (spanRole === "static_permission") {
    return {
      category: "effect_wrongly_classified_as_static_permission",
      reason: "Effect span classified as static permission",
      proposedFix: "Restrict static permission patterns to persistent grants",
    };
  }
  if (/^Choose one|^•|^[-—]/m.test(ot) && !evidenceMatchesOracle(ot, exp.evidenceContains)) {
    return {
      category: "modal_bullet_boundary_failure",
      reason: "Modal bullet not segmented for extraction",
      proposedFix: "Modal bullet clause segmentation",
    };
  }
  if (/"/.test(ot) && ot.includes('"') && /(?:has|have) "/i.test(ot)) {
    return {
      category: "quoted_granted_ability_boundary_failure",
      reason: "Granted ability in quotes not parsed as separate scope",
      proposedFix: "Quoted-grant ability sub-parse with independent roles",
    };
  }
  if (/\bthen\b/i.test(ot) || /\.\s+Then\b/.test(ot)) {
    return {
      category: "compound_clause_boundary_failure",
      reason: "Compound/then clause boundary missed",
      proposedFix: "Compound clause span refinement",
    };
  }
  if (ot.includes("\n//\n") && exp.cardFace) {
    return {
      category: "multiface_component_boundary_failure",
      reason: "Multiface/component attachment issue",
      proposedFix: "Face-scoped evidence matching",
    };
  }
  if (spanRole === "effect" || spanRole === "replacement_effect") {
    if (!primitiveAllowedAtRole(spanRole, exp.actionType as never)) {
      return {
        category: "primitive_extractor_missing_grammar",
        reason: `Role=${spanRole} allows primitive but grammar did not extract ${exp.actionType}`,
        proposedFix: `Add/refine ${exp.actionType} extraction pattern`,
      };
    }
    return {
      category: "primitive_extractor_missing_grammar",
      reason: "Effect span reachable but primitive grammar missing or abstained",
      proposedFix: `Extend ACTION_PATTERNS for ${exp.actionType}`,
    };
  }
  return {
    category: "genuinely_unsupported_primitive",
    reason: "No extraction path for this primitive at assigned role",
    proposedFix: "Assess taxonomy support vs gold defect",
  };
}

function classifyFp(input: {
  testCase: OracleActionEvalCaseV2;
  action: { actionType: string; evidenceText: string; textRole?: TextRole; abilityIndex: number };
  expected: OracleActionEvalCaseV2["expectedPrimitiveActions"];
}): { category: FpCategory; reason: string } {
  const { testCase, action, expected } = input;
  const role = action.textRole ?? "unknown";

  const partialGold = expected.find((e) => !e.negative && e.actionType === action.actionType);
  if (partialGold && !evidenceMatchesExtracted(action.evidenceText, partialGold.evidenceContains)) {
    return { category: "wrong_primitive", reason: "Same primitive family but wrong evidence span" };
  }

  const anyGold = expected.find((e) => !e.negative && evidenceMatchesExtracted(action.evidenceText, e.evidenceContains));
  if (anyGold && anyGold.actionType !== action.actionType) {
    return { category: "wrong_primitive", reason: `Gold expects ${anyGold.actionType}, got ${action.actionType}` };
  }

  if (role !== "effect" && role !== "replacement_effect" && role !== "unknown") {
    return { category: "wrong_span_role", reason: `Emitted from ${role} span — should be structure only` };
  }

  const adjudicatedReject =
    isAdjudicatedRejectV14({
      caseId: testCase.id,
      parserPrimitive: action.actionType,
      parserEvidence: action.evidenceText,
    }) ??
    isAdjudicatedReject({
      caseId: testCase.id,
      parserPrimitive: action.actionType,
      parserEvidence: action.evidenceText,
    });
  if (adjudicatedReject) {
    return {
      category: "parser_defect",
      reason: `Adjudicated reject: ${adjudicatedReject.reason}`,
    };
  }

  if (testCase.forbiddenPrimitiveActions?.includes(action.actionType as never)) {
    return {
      category: "parser_defect",
      reason: `Gold forbids ${action.actionType} — parser emission is defect pending boundary fix`,
    };
  }

  if (expected.length === 0 && testCase.expectedStructure && Object.keys(testCase.expectedStructure).length > 0) {
    return { category: "gold_omission", reason: "Layer-1-only gold — parser may be correct, gold incomplete" };
  }

  const goldHasPrimitive = expected.some((e) => !e.negative && e.actionType === action.actionType);
  if (!goldHasPrimitive && (role === "effect" || role === "replacement_effect")) {
    if (/^Choose one|^•/m.test(testCase.oracleText)) {
      return { category: "gold_omission", reason: "Modal option — verify gold lists this primitive" };
    }
    if (testCase.expectedStructure && !goldHasPrimitive) {
      return { category: "gold_omission", reason: "Possible missing gold for legitimate effect" };
    }
    return { category: "parser_defect", reason: "Unsupported emission on effect span" };
  }

  return { category: "parser_defect", reason: "Unmatched accepted emission" };
}

async function main() {
  const dev = JSON.parse(readFileSync(resolve(process.cwd(), DEV_PATH), "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  };

  const metrics = evaluateCaseSet(dev.cases, DATASET_LABEL);
  const accepted = metrics.metricsByEmissionTier.acceptedOnly;
  const allEmission = metrics.metricsByEmissionTier.allEmission;

  const fnEntries: Array<Record<string, unknown>> = [];
  const fpEntries: Array<Record<string, unknown>> = [];
  const roleConfusion = new Map<string, number>();
  const roleTp = new Map<string, number>();
  const roleFp = new Map<string, number>();
  const roleFn = new Map<string, number>();

  for (const testCase of dev.cases) {
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
      optionalCost: a.optionalCost,
      optional: a.optional,
    }));

    const acceptedMatch = matchGoldToActions({ expected, actions, tier: "accepted" });
    const allMatch = matchGoldToActions({ expected, actions, tier: "all" });

    for (const expIdx of acceptedMatch.unmatchedExpectedIndices) {
      const exp = expected[expIdx];
      const span = locateEvidenceSpan(testCase.oracleText, exp.evidenceContains, exp.cardFace);
      const spanRole: TextRole = span
        ? classifyTextRoleAt({
            paragraph: span.paragraph,
            localStart: span.localStart,
            localEnd: span.localEnd,
          })
        : "unknown";

      const key = `effect → ${spanRole}`;
      roleConfusion.set(key, (roleConfusion.get(key) ?? 0) + 1);
      roleFn.set(spanRole, (roleFn.get(spanRole) ?? 0) + 1);

      const audit = classifyFn({
        testCase,
        exp,
        spanRole,
        allTierActions: actions.map((a) => ({
          actionType: a.actionType,
          evidenceText: a.evidenceText,
          reviewStatus: a.reviewStatus,
          textRole: a.textRole,
        })),
      });

      fnEntries.push({
        caseId: testCase.id,
        card: testCase.cardName ?? testCase.id,
        face: exp.cardFace ?? testCase.cardFace ?? "front",
        exactOracleText: testCase.oracleText.length > 350 ? testCase.oracleText.slice(0, 350) + "…" : testCase.oracleText,
        expectedPrimitive: exp.actionType,
        expectedEvidence: exp.evidenceContains,
        spanRoleAssigned: spanRole,
        parserOutput: actions
          .filter((a) => a.actionType === exp.actionType || evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains))
          .map((a) => ({ type: a.actionType, evidence: a.evidenceText, status: a.reviewStatus, role: a.textRole })),
        failureCategory: audit.category,
        reason: audit.reason,
        proposedFix: audit.proposedFix,
      });
    }

    for (const actionIdx of acceptedMatch.unmatchedActionIndices) {
      const a = actions[actionIdx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      const audit = classifyFp({ testCase, action: a, expected });
      fpEntries.push({
        caseId: testCase.id,
        card: testCase.cardName ?? testCase.id,
        face: a.cardFaceId,
        exactOracleText: testCase.oracleText.length > 350 ? testCase.oracleText.slice(0, 350) + "…" : testCase.oracleText,
        parserPrimitive: a.actionType,
        parserEvidence: a.evidenceText,
        textRole: a.textRole ?? "unknown",
        currentGold: expected.map((e) => ({ type: e.actionType, evidence: e.evidenceContains })),
        failureCategory: audit.category,
        reason: audit.reason,
      });
    }

    for (const m of allMatch.matches) {
      if (!m.matched || m.tier !== "accepted") continue;
      const a = actions.find((x) => x.index === m.actionIndex);
      if (!a?.textRole) continue;
      roleTp.set(a.textRole, (roleTp.get(a.textRole) ?? 0) + 1);
    }
  }

  const fnByCategory = Object.fromEntries(
    [...fnEntries.reduce((m, e) => {
      const k = e.failureCategory as string;
      m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    }, new Map<string, number>())].sort((a, b) => b[1] - a[1]),
  );

  const fpByCategory = Object.fromEntries(
    [...fpEntries.reduce((m, e) => {
      const k = e.failureCategory as string;
      m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    }, new Map<string, number>())].sort((a, b) => b[1] - a[1]),
  );

  const fpByPrimitive = Object.fromEntries(
    [...fpEntries.reduce((m, e) => {
      const k = e.parserPrimitive as string;
      m.set(k, (m.get(k) ?? 0) + 1);
      return m;
    }, new Map<string, number>())].sort((a, b) => b[1] - a[1]),
  );

  const proposedFixRanked = [...fnEntries, ...fpEntries]
    .reduce((m, e) => {
      const fix = (e.proposedFix ?? e.reason) as string;
      m.set(fix, (m.get(fix) ?? 0) + 1);
      return m;
    }, new Map<string, number>());

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    dataset: DATASET_LABEL,
    contentHash: dev.contentHash,
    accepted: {
      tp: accepted.truePositives,
      fp: accepted.falsePositives,
      fn: accepted.falseNegatives,
      precision: accepted.precision,
      recall: accepted.recall,
      unsupported: metrics.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    },
    allEmission: {
      tp: allEmission.truePositives,
      fp: allEmission.falsePositives,
      fn: allEmission.falseNegatives,
      precision: allEmission.precision,
      recall: allEmission.recall,
    },
    fnAudit: { total: fnEntries.length, byCategory: fnByCategory, entries: fnEntries },
    fpAudit: { total: fpEntries.length, byCategory: fpByCategory, byPrimitive: fpByPrimitive, entries: fpEntries },
    spanRoleConfusionMatrix: [...roleConfusion.entries()]
      .map(([pair, count]) => {
        const [expected, classified] = pair.split(" → ");
        return { expected, classified, count };
      })
      .sort((a, b) => b.count - a.count),
    metricsByTextRole: {
      truePositive: Object.fromEntries([...roleTp.entries()].sort((a, b) => b[1] - a[1])),
      falseNegative: Object.fromEntries([...roleFn.entries()].sort((a, b) => b[1] - a[1])),
    },
    goldDefectsFound: fnByCategory.evaluator_gold_defect ?? 0,
    evaluatorDefectsFound: fpByCategory.evaluator_defect ?? 0,
    proposedFixesRanked: [...proposedFixRanked.entries()]
      .map(([fix, count]) => ({ fix, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
  };

  const outPath = resolve(process.cwd(), `reports/${REPORT_NAME}`);
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        outPath,
        fnTotal: fnEntries.length,
        fpTotal: fpEntries.length,
        fnByCategory,
        fpByCategory,
        fpByPrimitive,
        spanRoleConfusionTop10: report.spanRoleConfusionMatrix.slice(0, 10),
        accepted: report.accepted,
        proposedFixesTop5: report.proposedFixesRanked.slice(0, 5),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
