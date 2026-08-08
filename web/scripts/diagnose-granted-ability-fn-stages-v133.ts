/**
 * Classify granted_ability_quote FNs by structural failure stage.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { findGrantedQuoteContexts } from "../src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction";
import { findQuotedAbilitySpans } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import { parseAbilityBlock } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-ability-block";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

type Stage =
  | "quoted_span_not_detected"
  | "quote_not_recognized_as_ability"
  | "ability_block_not_created"
  | "clause_role_wrong"
  | "primitive_grammar_missing"
  | "nested_provenance_offset_failure"
  | "matcher_scope_mismatch";

function loadCatalog(): OracleActionEvalCaseV2[] {
  const path = "data/oracle-action-eval-rc3-positive-training-catalog-v133.json";
  return (JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases.filter(
    (c) => (c as { coverageStratum?: string }).coverageStratum === "granted_ability_quote",
  );
}

function classifyFnStage(testCase: OracleActionEvalCaseV2, gold: { actionType: string; evidenceContains?: string }): Stage {
  const evidenceNeedle = gold.evidenceContains ?? gold.actionType;
  const faces = segmentCardFaces(testCase.oracleText);
  let quoteFound = false;
  let quoteIsAbility = false;
  let blockCreated = false;
  let roleOk = false;
  let grammarInQuote = false;

  for (const face of faces) {
    for (const ability of segmentAbilities(testCase.oracleId, face.faceId, face.text, face.start)) {
      for (const span of findQuotedAbilitySpans(ability.paragraphText)) {
        if (!span.text.toLowerCase().includes(evidenceNeedle.toLowerCase().slice(0, 8))) continue;
        quoteFound = true;
        quoteIsAbility = span.role === "effect";
      }
      for (const ctx of findGrantedQuoteContexts(ability.paragraphText, `${testCase.oracleId}:${face.faceId}:${ability.abilityIndex}`)) {
        if (!ctx.innerText.toLowerCase().includes(evidenceNeedle.toLowerCase().slice(0, 8))) continue;
        quoteFound = true;
        quoteIsAbility = true;
        const block = parseAbilityBlock({
          abilityId: ctx.grantedAbilityId,
          paragraphText: ctx.innerText,
          paragraphStart: ability.paragraphStart + ctx.innerLocalStart,
        });
        blockCreated = block.clauses.length > 0;
        for (const clause of block.clauses) {
          if (clause.text.toLowerCase().includes(evidenceNeedle.toLowerCase().slice(0, 8))) {
            roleOk = clause.role === "effect" || clause.role === "replacement_effect";
            grammarInQuote = new RegExp(gold.actionType.replace("_", "[ _]"), "i").test(clause.text) ||
              clause.text.toLowerCase().includes(evidenceNeedle.toLowerCase());
          }
        }
      }
    }
  }

  const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
  const emitted = parsed.actions.filter((a) => a.actionType === gold.actionType);
  const native = extractClauseNativeActions({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
  const nativeMatch = native.actions.some(
    (a) => a.actionType === gold.actionType && a.evidenceText.toLowerCase().includes(evidenceNeedle.toLowerCase().slice(0, 8)),
  );

  if (!quoteFound) return "quoted_span_not_detected";
  if (!quoteIsAbility) return "quote_not_recognized_as_ability";
  if (!blockCreated) return "ability_block_not_created";
  if (!roleOk) return "clause_role_wrong";
  if (!grammarInQuote) return "primitive_grammar_missing";
  if (nativeMatch && emitted.length === 0) return "matcher_scope_mismatch";
  if (nativeMatch && emitted.length > 0) return "matcher_scope_mismatch";
  return "nested_provenance_offset_failure";
}

function main() {
  const cases = loadCatalog();
  const stageCounts: Record<Stage, number> = {
    quoted_span_not_detected: 0,
    quote_not_recognized_as_ability: 0,
    ability_block_not_created: 0,
    clause_role_wrong: 0,
    primitive_grammar_missing: 0,
    nested_provenance_offset_failure: 0,
    matcher_scope_mismatch: 0,
  };
  const examples: Array<{ caseId: string; gold: string; stage: Stage }> = [];

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
    const metrics = evaluateCaseSemantic(testCase, parsed);
    if (metrics.accepted.fn === 0) continue;
    for (const gold of testCase.expectedPrimitiveActions.filter((g) => !g.negative)) {
      const matched = parsed.actions.some(
        (a) =>
          a.actionType === gold.actionType &&
          a.provenance.actionSpan.text.toLowerCase().includes((gold.evidenceContains ?? "").toLowerCase().slice(0, 8)),
      );
      if (matched) continue;
      const stage = classifyFnStage(testCase, gold);
      stageCounts[stage]++;
      if (examples.length < 20) {
        examples.push({ caseId: testCase.id, gold: `${gold.actionType}:${gold.evidenceContains}`, stage });
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    family: "granted_ability_quote",
    catalogCaseCount: cases.length,
    failureStageCounts: stageCounts,
    totalFnsClassified: Object.values(stageCounts).reduce((a, b) => a + b, 0),
    examples,
  };

  const outDir = resolve("data/milestones/rc3-development");
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "granted-ability-fn-stage-breakdown-v133.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();
