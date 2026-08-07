/**
 * Formal v1.19 accepted-FP inventory with confusion matrix.
 * Run: npx tsx scripts/generate-v19-fp-inventory.ts [--dataset=...]
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import {
  classifyTextRoleAt,
  type TextRole,
} from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  matchGoldToActions,
  primitiveMatchesExpected,
} from "./oracle-action-unified-matcher";
import { evidenceMatchesExtracted } from "./oracle-action-eval-shared";

const DEV_PATH =
  process.argv.find((a) => a.startsWith("--dataset="))?.slice("--dataset=".length) ??
  "data/oracle-action-eval-development-v25.json";

function inferExpectedPrimitive(
  testCase: OracleActionEvalCaseV2,
  evidenceText: string,
  emitted: string,
): string {
  for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
    if (exp.actionType === emitted && evidenceMatchesExtracted(evidenceText, exp.evidenceContains)) {
      return exp.actionType;
    }
  }
  for (const exp of testCase.expectedPrimitiveActions.filter((e) => !e.negative)) {
    if (exp.actionType !== emitted && evidenceMatchesExtracted(evidenceText, exp.evidenceContains)) {
      return exp.actionType;
    }
  }
  return "none";
}

function failureCategory(
  testCase: OracleActionEvalCaseV2,
  expected: string,
  emitted: string,
): string {
  if (expected !== "none" && expected !== emitted) return "wrong_primitive_mapping";
  if (/^Choose one|^•/m.test(testCase.oracleText)) return "modal_gold_mismatch";
  if (/\bCycling \{|\bAftermath \(/i.test(testCase.oracleText)) return "reminder_mechanic_leakage";
  if (/\bdoesn't untap\b/i.test(testCase.oracleText)) return "static_restriction_leakage";
  return "parser_defect";
}

function proposedFix(category: string): string {
  const fixes: Record<string, string> = {
    wrong_primitive_mapping: "Route by verb + source/destination zone (return_to_battlefield vs put_onto_battlefield)",
    modal_gold_mismatch: "Modal stem gold or complete per-bullet labels",
    reminder_mechanic_leakage: "Block Layer-2 inside Cycling/Aftermath definition paragraphs",
    static_restriction_leakage: "Reject untap matches inside can't/doesn't untap clauses",
    parser_defect: "Parser boundary or gold alignment",
  };
  return fixes[category] ?? "Review case";
}

async function main() {
  const dev = JSON.parse(readFileSync(resolve(process.cwd(), DEV_PATH), "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  };

  const entries: Array<Record<string, unknown>> = [];
  const confusion = new Map<string, number>();

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
      confidence: a.confidence,
      clauseId: a.clauseId,
      textRole: a.textRole,
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
      const expLabel = inferExpectedPrimitive(testCase, a.evidenceText, a.actionType);
      const category = failureCategory(testCase, expLabel, a.actionType);
      if (expLabel !== "none" && expLabel !== a.actionType) {
        const key = `${expLabel} → ${a.actionType}`;
        confusion.set(key, (confusion.get(key) ?? 0) + 1);
      }
      const ability = raw.abilities?.find((ab) => ab.abilityIndex === a.abilityIndex);
      entries.push({
        caseId: testCase.id,
        card: testCase.cardName,
        oracleId: testCase.oracleId,
        face: a.cardFaceId,
        exactOracleText: testCase.oracleText,
        ability: ability?.paragraphText?.slice(0, 120),
        abilityIndex: a.abilityIndex,
        clauseId: a.clauseId,
        textRole: a.textRole ?? classifyTextRoleAt({
          paragraph: ability?.paragraphText ?? testCase.oracleText,
          localStart: 0,
          localEnd: Math.min(20, (ability?.paragraphText ?? testCase.oracleText).length),
        }),
        expectedGoldPrimitive: expLabel,
        emittedPrimitive: a.actionType,
        evidenceSpan: a.evidenceText,
        confidence: a.confidence,
        extractionRule: `ACTION_PATTERNS/${a.actionType}`,
        failureCategory: category,
        proposedGeneralFix: proposedFix(category),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    dataset: DEV_PATH,
    contentHash: dev.contentHash,
    acceptedFpCount: entries.length,
    wrongPrimitiveConfusionMatrix: [...confusion.entries()]
      .map(([pair, count]) => {
        const [expected, emitted] = pair.split(" → ");
        return { expected, emitted, count };
      })
      .sort((a, b) => b.count - a.count),
    entries,
  };

  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  const outName = DEV_PATH.includes("v24")
    ? "v19-fp-inventory-v24-baseline.json"
    : DEV_PATH.includes("v25")
      ? "v19-fp-inventory-v25.json"
      : "v19-fp-inventory.json";
  const outPath = resolve(process.cwd(), `reports/${outName}`);
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Wrote ${outPath} — ${entries.length} accepted FPs`);
  console.log("Confusion matrix:", report.wrongPrimitiveConfusionMatrix);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
