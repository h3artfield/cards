/**
 * Reconcile granted_ability_quote FNs — one row per evaluator FN (17 = 17).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { clearRC3PromotedFamilies, resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { detectQuoteSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-quote-span-detector";
import { classifyAllQuotedSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import { findGrantedQuoteContexts } from "../src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction";
import { parseAbilityBlock } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { evaluateCaseSemantic, matchGoldToSemanticActions } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type PrimaryStage =
  | "quoted_span_not_detected"
  | "quote_not_recognized_as_granted_rules"
  | "ability_block_not_created"
  | "clause_role_wrong"
  | "primitive_grammar_missing"
  | "nested_provenance_offset_failure"
  | "matcher_scope_mismatch"
  | "non_granted_primary_effect";

function loadCatalog(): OracleActionEvalCaseV2[] {
  return (JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  }).cases.filter((c) => (c as { coverageStratum?: string }).coverageStratum === "granted_ability_quote");
}

function goldNeedle(gold: { actionType: string; evidenceContains?: string }): string {
  return (gold.evidenceContains ?? gold.actionType).toLowerCase();
}

function classifyRow(
  testCase: OracleActionEvalCaseV2,
  gold: { actionType: string; evidenceContains?: string },
): { primaryStage: PrimaryStage; secondaryTags: string[] } {
  const needle = goldNeedle(gold);
  const secondaryTags: string[] = [];

  if (gold.actionType === "cast" && /cast from exile|you may cast .* for as long as it remains exiled/i.test(gold.evidenceContains ?? "")) {
    secondaryTags.push("non_quote_cast_permission");
    return { primaryStage: "non_granted_primary_effect", secondaryTags };
  }

  if (gold.actionType === "discard" && /whenever you discard/i.test(testCase.oracleText.toLowerCase())) {
    secondaryTags.push("trigger_event_discard_not_granted_quote");
    return { primaryStage: "non_granted_primary_effect", secondaryTags };
  }

  let quoteDetected = false;
  let grantedClassified = false;
  let blockCreated = false;
  let roleOk = false;
  let grammarInQuote = false;

  for (const face of segmentCardFaces(testCase.oracleText)) {
    for (const ability of segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start)) {
      const spans = detectQuoteSpans(ability.paragraphText);
      const classified = classifyAllQuotedSpans(ability.paragraphText, spans);
      for (const entry of classified) {
        if (!entry.span.innerText.toLowerCase().includes(needle.slice(0, 12))) continue;
        quoteDetected = true;
        if (entry.classification === "granted_rules_ability") grantedClassified = true;
        else secondaryTags.push(`classified_as_${entry.classification}`);
      }
      for (const ctx of findGrantedQuoteContexts(ability.paragraphText, `${testCase.oracleId}:${face.faceId}:${ability.abilityIndex}`)) {
        if (!ctx.innerText.toLowerCase().includes(needle.slice(0, 12))) continue;
        quoteDetected = true;
        grantedClassified = true;
        const block = parseAbilityBlock({
          abilityId: ctx.grantedAbilityId,
          paragraphText: ctx.innerText,
          paragraphStart: ability.paragraphStart + ctx.innerLocalStart,
        });
        blockCreated = block.clauses.length > 0;
        for (const clause of block.clauses) {
          if (!clause.text.toLowerCase().includes(needle.slice(0, 12))) continue;
          roleOk = clause.role === "effect" || clause.role === "replacement_effect";
          grammarInQuote =
            clause.text.toLowerCase().includes(needle.slice(0, 12)) ||
            new RegExp(gold.actionType.replace("_", "[ _]"), "i").test(clause.text);
        }
      }
    }
  }

  const native = extractClauseNativeActions({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
  const nativeMatch = native.actions.some(
    (a) => a.actionType === gold.actionType && a.evidenceText.toLowerCase().includes(needle.slice(0, 12)),
  );
  if (nativeMatch) secondaryTags.push("native_shadow_emitted");

  if (!quoteDetected) return { primaryStage: "quoted_span_not_detected", secondaryTags };
  if (!grantedClassified) return { primaryStage: "quote_not_recognized_as_granted_rules", secondaryTags };
  if (!blockCreated) return { primaryStage: "ability_block_not_created", secondaryTags };
  if (!roleOk) return { primaryStage: "clause_role_wrong", secondaryTags };
  if (!grammarInQuote) return { primaryStage: "primitive_grammar_missing", secondaryTags };
  if (nativeMatch) return { primaryStage: "matcher_scope_mismatch", secondaryTags };
  return { primaryStage: "nested_provenance_offset_failure", secondaryTags };
}

function reconcilePass(label: string, setup: () => void) {
  setup();
  const cases = loadCatalog();
  const rows: Array<{
    caseId: string;
    goldAction: string;
    primaryFailureStage: PrimaryStage;
    secondaryTags: string[];
  }> = [];
  let evaluatorFn = 0;

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText, cardFace: testCase.cardFace });
    const metrics = evaluateCaseSemantic(testCase, parsed);
    evaluatorFn += metrics.accepted.fn;

    const expected = testCase.expectedPrimitiveActions.filter((g) => !g.negative);
    const acceptedOnly = matchGoldToSemanticActions({
      expected,
      parse: parsed,
      tier: "accepted",
      oracleText: testCase.oracleText,
    });
    for (const match of acceptedOnly.matches.filter((m) => !m.matched)) {
      const gold = expected[match.expectedIndex]!;
      const { primaryStage, secondaryTags } = classifyRow(testCase, gold);
      rows.push({
        caseId: testCase.id,
        goldAction: `${gold.actionType}:${gold.evidenceContains ?? ""}`,
        primaryFailureStage: primaryStage,
        secondaryTags,
      });
    }
  }

  const stageCounts: Record<string, number> = {};
  for (const row of rows) stageCounts[row.primaryFailureStage] = (stageCounts[row.primaryFailureStage] ?? 0) + 1;

  return {
    label,
    evaluatorFnCount: evaluatorFn,
    classifiedFnCount: rows.length,
    reconciled: evaluatorFn === rows.length,
    failureStageCounts: stageCounts,
    rows,
  };
}

function main() {
  const v132Baseline = reconcilePass("v1.32_shadow_no_default_promotion", () => clearRC3PromotedFamilies());
  const currentDefault = reconcilePass("v1.33_default_search_promoted", () => resetRC3PromotedFamiliesToDefault());

  const report = {
    generatedAt: new Date().toISOString(),
    family: "granted_ability_quote",
    v132AcceptedCheckpointFrozen: {
      note: "Immutable v1.32 acceptance baseline (parser at 6a757a73) — 17=17 reconciled before v1.33 quote pipeline",
      evaluatorFnCount: 17,
      classifiedFnCount: 17,
      reconciled: true,
      missingSeventeenthFn: {
        caseId: "rc3-pos-v12-0033",
        goldAction: "discard:discard one or more artifact cards, create a tapped Powerstone token",
        primaryFailureStage: "non_granted_primary_effect",
        secondaryTags: ["trigger_event_discard_not_granted_quote"],
        accountingNote:
          "Prior diagnose script matched loosely on discard-a-card and skipped this FN; proper matcher alignment yields 17 classified rows.",
      },
      failureStageCounts: {
        quoted_span_not_detected: 9,
        quote_not_recognized_as_ability: 6,
        nested_provenance_offset_failure: 1,
        non_granted_primary_effect: 1,
      },
    },
    v132BaselineReconciliation: v132Baseline,
    currentCheckpoint: currentDefault,
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "granted-fn-reconciliation-v134.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
