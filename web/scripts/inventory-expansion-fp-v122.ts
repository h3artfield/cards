/**
 * Inventory expansion-training accepted FPs with primary category clustering.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import { inferSupportedPrimitiveFromEvidence } from "./oracle-action-eval-shared";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type FpCategory =
  | "gold_defect"
  | "wrong_primitive"
  | "wrong_object_referent"
  | "wrong_face"
  | "wrong_clause"
  | "optionality_error"
  | "reminder_mechanic_leakage"
  | "static_restriction_permission_leakage"
  | "duplicate_emission"
  | "modal_chosen_option_error"
  | "zone_routing_error"
  | "other_parser_defect";

function classifyFp(input: {
  testCase: OracleActionEvalCaseV2;
  primitive: string;
  evidence: string;
  role?: string;
  supported: string | null;
}): FpCategory {
  const { testCase, primitive, evidence, role, supported } = input;
  const oracle = testCase.oracleText;
  const family = (testCase as { expansionMetadata?: { family?: string } }).expansionMetadata?.family ?? "";

  if (role === "reminder_text" || role === "mechanic_reminder") return "reminder_mechanic_leakage";
  if (role === "static_permission" || role === "static_restriction") return "static_restriction_permission_leakage";
  if (testCase.cardFace && role === "effect") return "wrong_face";
  if (family.includes("modal") || /\bChoose (?:one|two|up to|any number)\b/i.test(oracle)) {
    return "modal_chosen_option_error";
  }
  if (primitive === "copy" && /\btoken that'?s a copy\b/i.test(oracle)) return "wrong_primitive";
  if (primitive === "create_token" && /\btoken that'?s a copy\b/i.test(oracle)) return "wrong_primitive";
  if (/\bthen shuffle\b/i.test(evidence) && testCase.expectedPrimitiveActions.some((e) => e.actionType === "search_library")) {
    return "zone_routing_error";
  }
  if (/\bput (?:it|that|them) onto the battlefield\b/i.test(evidence)) return "wrong_object_referent";
  if (/\bIf you do\b/i.test(oracle) && /\bunless\b/i.test(oracle)) return "optionality_error";
  if (supported && supported !== primitive) return "wrong_primitive";
  if (!supported) return "other_parser_defect";
  if (/\bthen\b/i.test(evidence)) return "wrong_clause";
  return "other_parser_defect";
}

function main() {
  const exp = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v1.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const training = exp.cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );

  const inventory: Array<Record<string, unknown>> = [];

  for (const testCase of training) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, index) => ({
      index,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus as "accepted" | "needs_review",
      textRole: a.textRole,
      faceId: a.faceId,
    }));
    const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: testCase.oracleText });
    for (const idx of m.unmatchedActionIndices) {
      const a = actions[idx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      if (testCase.forbiddenPrimitiveActions?.includes(a.primitive)) continue;
      const supported = inferSupportedPrimitiveFromEvidence(testCase.oracleText, a.evidenceText);
      inventory.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        family: (testCase as { expansionMetadata?: { family?: string } }).expansionMetadata?.family,
        emittedPrimitive: a.primitive,
        evidence: a.evidenceText,
        role: a.textRole,
        assignedFace: a.faceId,
        category: classifyFp({
          testCase,
          primitive: a.primitive,
          evidence: a.evidenceText,
          role: a.textRole,
          supported,
        }),
        gold: expected.map((e) => `${e.actionType}:${e.evidenceContains.slice(0, 45)}`),
      });
    }
  }

  const byCategory = inventory.reduce(
    (acc, row) => {
      const k = row.category as string;
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const ranked = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({ category, count }));

  const evalResult = evaluateCaseSet(training, "expansion_training");
  const accepted = evalResult.metricsByEmissionTier.acceptedOnly;

  const report = {
    caseCount: training.length,
    acceptedFpCount: inventory.length,
    acceptedMetrics: {
      tp: accepted.truePositives,
      fp: accepted.falsePositives,
      fn: accepted.falseNegatives,
      precision: accepted.precision,
      recall: accepted.recall,
      unsupported: evalResult.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    },
    byCategory,
    rankedFixPriority: ranked,
    inventory,
  };

  const outDir = resolve(process.cwd(), "data/milestones/rc2-development-planning");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "expansion-training-fp-inventory-v122.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ acceptedFpCount: inventory.length, byCategory, rankedFixPriority: ranked }, null, 2));
}

main();
