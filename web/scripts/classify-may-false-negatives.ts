/**
 * Classify may false negatives on development_set_v2 BEFORE v1.5 grammar changes.
 * Uses v1.4 prefix-heuristic optionality detection for baseline FN identification.
 * Run: npx tsx scripts/classify-may-false-negatives.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { evidenceMatchesExtracted, evidenceMatchesOracle } from "./oracle-action-eval-shared";

export type MayFalseNegativeCategory =
  | "may_governing_one_primitive_action"
  | "may_governing_several_compound_actions"
  | "may_inside_triggered_ability"
  | "may_inside_activated_ability"
  | "may_applying_to_additional_cost"
  | "opponent_may"
  | "nested_may"
  | "may_followed_by_if_you_do"
  | "may_cast_or_play_permission"
  | "may_choose_mode_or_target"
  | "segmentation_failure"
  | "scope_attachment_failure"
  | "primitive_action_missing_entirely";

interface ClassifiedFn {
  caseId: string;
  oracleText: string;
  evidenceContains: string;
  actionType: string;
  category: MayFalseNegativeCategory;
  note: string;
}

/** v1.4 optionality detection — prefix heuristic only. */
function v14OptionalEffect(paragraph: string, evidenceText: string): boolean {
  const idx = paragraph.indexOf(evidenceText);
  const prefix = idx >= 0 ? paragraph.slice(0, idx + evidenceText.length) : paragraph;
  return /\b(?:You|An opponent|That player|Each player|Its controller|they|its controller) may\b/i.test(
    prefix,
  );
}

function v14OptionalCost(paragraph: string): boolean {
  return (
    /\bAs an additional cost[^.]+\byou may\b/i.test(paragraph) ||
    /\byou may pay[^.]+\brather than pay/i.test(paragraph)
  );
}

function findAbilityParagraph(testCase: OracleActionEvalCaseV2, evidenceContains: string): string {
  const sentences = testCase.oracleText.split(/\.\s+/);
  for (const s of sentences) {
    if (evidenceMatchesOracle(s, evidenceContains) || s.toLowerCase().includes(evidenceContains.toLowerCase().slice(0, 20))) {
      return s.endsWith(".") ? s : `${s}.`;
    }
  }
  return testCase.oracleText;
}

function classifyMayFn(input: {
  testCase: OracleActionEvalCaseV2;
  evidenceContains: string;
  actionType: string;
  actionExtracted: boolean;
  optionalDetected: boolean;
  optionalCostDetected: boolean;
  paragraph: string;
  abstained: boolean;
}): MayFalseNegativeCategory {
  const { testCase, evidenceContains, actionExtracted, optionalDetected, optionalCostDetected, paragraph, abstained } =
    input;
  const oracle = testCase.oracleText;

  if (!actionExtracted) {
    if (abstained) return "segmentation_failure";
    if (/\bYou may cast\b/i.test(oracle) || /\byou may play\b/i.test(oracle)) {
      return "may_cast_or_play_permission";
    }
    if (/\bchoose new targets\b/i.test(oracle) && /\bmay\b/i.test(oracle)) {
      return "may_choose_mode_or_target";
    }
    if (/\bAs an additional cost[^.]+\byou may\b/i.test(oracle)) {
      return "may_applying_to_additional_cost";
    }
    return "primitive_action_missing_entirely";
  }

  if (actionExtracted && !optionalDetected && !optionalCostDetected) {
    if (/\bAs an additional cost[^.]+\byou may\b/i.test(oracle)) {
      return "may_applying_to_additional_cost";
    }
    if (/\bAn opponent may\b/i.test(oracle) || /\bThat player may\b/i.test(paragraph)) {
      return "opponent_may";
    }
    const mayCount = (paragraph.match(/\bmay\b/gi) ?? []).length;
    if (mayCount >= 2) return "nested_may";
    if (/\bIf you do\b/i.test(oracle) && /\byou may\b/i.test(paragraph)) {
      return "may_followed_by_if_you_do";
    }
    if (/\bYou may cast\b/i.test(evidenceContains) || /\byou may play\b/i.test(evidenceContains)) {
      return "may_cast_or_play_permission";
    }
    if (/\bchoose\b/i.test(paragraph) && /\bmay\b/i.test(paragraph)) {
      return "may_choose_mode_or_target";
    }
    if (/^(When|Whenever|At the beginning)/i.test(paragraph.trim())) {
      return "may_inside_triggered_ability";
    }
    if (/^(\{[^}]+\}|[+\−-]\d+:)/.test(paragraph.trim())) {
      return "may_inside_activated_ability";
    }
    const optionalActionsInCase = testCase.expectedPrimitiveActions.filter(
      (e) => !e.negative && (e.optionalEffect || e.optional),
    );
    if (optionalActionsInCase.length >= 2) {
      return "may_governing_several_compound_actions";
    }
    if (/\bmay\b/i.test(paragraph)) {
      return "scope_attachment_failure";
    }
    return "may_governing_one_primitive_action";
  }

  return "may_governing_one_primitive_action";
}

function main() {
  const devPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v3.json");
  let devFile = devPath;
  try {
    readFileSync(devPath, "utf8");
  } catch {
    devFile = resolve(process.cwd(), "data", "oracle-action-eval-development-v2.json");
  }

  const dev = JSON.parse(readFileSync(devFile, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const outPath = resolve(process.cwd(), "reports", "oracle-action-may-false-negative-classification.json");
  const counts: Record<MayFalseNegativeCategory, number> = {
    may_governing_one_primitive_action: 0,
    may_governing_several_compound_actions: 0,
    may_inside_triggered_ability: 0,
    may_inside_activated_ability: 0,
    may_applying_to_additional_cost: 0,
    opponent_may: 0,
    nested_may: 0,
    may_followed_by_if_you_do: 0,
    may_cast_or_play_permission: 0,
    may_choose_mode_or_target: 0,
    segmentation_failure: 0,
    scope_attachment_failure: 0,
    primitive_action_missing_entirely: 0,
  };
  const examples: Record<MayFalseNegativeCategory, ClassifiedFn[]> = Object.fromEntries(
    Object.keys(counts).map((k) => [k, []]),
  ) as Record<MayFalseNegativeCategory, ClassifiedFn[]>;

  let totalMayGold = 0;
  let falseNegatives = 0;
  let truePositives = 0;

  for (const testCase of dev.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const abstainedTexts = raw.abstainedClauses.map((c) => c.text);

    for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
      const expectsMay = exp.optionalEffect === true || exp.optional === true;
      const expectsCost = exp.optionalCost === true;
      if (!expectsMay && !expectsCost) continue;
      // Legacy gold uses optional:true for up-to — exclude non-may labels from may FN taxonomy
      if (expectsMay && !/\bmay\b/i.test(testCase.oracleText) && !/\bmay\b/i.test(exp.evidenceContains)) {
        continue;
      }

      totalMayGold += 1;
      const paragraph = findAbilityParagraph(testCase, exp.evidenceContains);
      const matched = raw.actions.find(
        (a) =>
          a.actionType === exp.actionType &&
          evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains),
      );

      const v14Opt = matched ? v14OptionalEffect(paragraph, matched.evidenceText) : false;
      const v14Cost = v14OptionalCost(paragraph);
      const detected =
        expectsCost ? v14Cost && matched !== undefined : v14Opt;

      if (detected) {
        truePositives += 1;
        continue;
      }

      falseNegatives += 1;
      const abstained = abstainedTexts.some((t) => evidenceMatchesOracle(t, exp.evidenceContains));
      const category = classifyMayFn({
        testCase,
        evidenceContains: exp.evidenceContains,
        actionType: exp.actionType,
        actionExtracted: Boolean(matched),
        optionalDetected: v14Opt,
        optionalCostDetected: v14Cost,
        paragraph,
        abstained,
      });
      counts[category] += 1;
      if (examples[category].length < 3) {
        examples[category].push({
          caseId: testCase.id,
          oracleText: testCase.oracleText.slice(0, 120),
          evidenceContains: exp.evidenceContains,
          actionType: exp.actionType,
          category,
          note: matched
            ? `Extracted "${matched.evidenceText.slice(0, 50)}" but v1.4 may not detected`
            : "No matching extraction",
        });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baselineParser: "oracle-action-v1.4-optionality-conditions (prefix-heuristic may detection)",
    note: "Classification performed before v1.5 scope attachment; FN measured against v1.4 optionalEffect heuristic",
    developmentSet: devFile.includes("v3") ? "development_set_v3" : "development_set_v2",
    totalMayGoldLabels: totalMayGold,
    truePositives: truePositives,
    falseNegatives,
    recall: totalMayGold > 0 ? truePositives / totalMayGold : 1,
    categories: Object.entries(counts).map(([category, count]) => ({
      category,
      count,
      examples: examples[category as MayFalseNegativeCategory],
    })),
  };

  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("May false-negative classification (v1.4 baseline):");
  console.log(`  may gold labels: ${totalMayGold}`);
  console.log(`  TP: ${truePositives}, FN: ${falseNegatives}, recall: ${(report.recall * 100).toFixed(1)}%`);
  for (const [cat, count] of Object.entries(counts)) {
    if (count > 0) console.log(`  ${cat}: ${count}`);
  }
  console.log(`  → ${outPath}`);
}

main();
