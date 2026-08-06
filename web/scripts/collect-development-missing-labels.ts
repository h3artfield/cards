/**
 * Collect oracle-supported extractions absent from development gold labels.
 * Run: npx tsx scripts/collect-development-missing-labels.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  extractOracleActionsV1,
  toLegacyExtractionResult,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive, type PrimitiveActionType } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  evidenceMatchesExtracted,
  evidenceMatchesOracle,
  inferSupportedPrimitiveFromEvidence,
  spanValid,
} from "./oracle-action-eval-shared";

function isOptionalEvidence(text: string): boolean {
  return /\b(?:You|they|that player|its controller) may\b/i.test(text);
}

function primitiveMatchesExpected(
  action: { primitive: PrimitiveActionType | null; evidenceText: string; cardFaceId: string; optional: boolean },
  exp: OracleActionEvalCaseV2["expectedPrimitiveActions"][number],
): boolean {
  if (!action.primitive || action.primitive !== exp.actionType) return false;
  if (!evidenceMatchesExtracted(action.evidenceText, exp.evidenceContains)) return false;
  if (exp.cardFace && action.cardFaceId !== exp.cardFace) return false;
  if (exp.optional !== undefined && isOptionalEvidence(action.evidenceText) !== exp.optional) return false;
  return true;
}

function classifyMissing(testCase: OracleActionEvalCaseV2, action: {
  primitive: PrimitiveActionType;
  evidenceText: string;
  evidenceStart: number;
  evidenceEnd: number;
}): boolean {
  const oracleText = testCase.oracleText;
  if (!spanValid(oracleText, action.evidenceText, action.evidenceStart, action.evidenceEnd)) return false;
  const supported = inferSupportedPrimitiveFromEvidence(oracleText, action.evidenceText);
  if (!supported || supported !== action.primitive) return false;
  if (!evidenceMatchesOracle(oracleText, action.evidenceText)) return false;

  const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
  if (expected.some((e) => primitiveMatchesExpected({ ...action, optional: isOptionalEvidence(action.evidenceText) }, e))) {
    return false;
  }
  if (expected.some((e) => e.actionType === action.primitive && evidenceMatchesOracle(oracleText, action.evidenceText))) {
    return false;
  }
  return true;
}

function main() {
  const devPath = resolve(process.cwd(), "data", "oracle-action-eval-development-frozen.json");
  const dev = JSON.parse(readFileSync(devPath, "utf8")) as { cases: OracleActionEvalCaseV2[] };
  const proposals: Array<{
    caseId: string;
    oracleId: string;
    cardFace?: string;
    proposedMissingPrimitive: string;
    evidenceSpan: string;
  }> = [];

  for (const testCase of dev.cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const extraction = toLegacyExtractionResult(raw);
    const expected = testCase.expectedPrimitiveActions.filter((e) => !e.negative);
    const matchedActions = new Set<number>();

    for (const exp of expected) {
      const idx = extraction.actions.findIndex(
        (a, i) =>
          !matchedActions.has(i) &&
          primitiveMatchesExpected(
            {
              primitive: normalizeToPrimitive(a.effects[0]?.actionType ?? "", a.evidenceText),
              evidenceText: a.evidenceText,
              cardFaceId: a.cardFaceId,
              optional: isOptionalEvidence(a.evidenceText),
            },
            exp,
          ),
      );
      if (idx >= 0) matchedActions.add(idx);
    }

    for (let i = 0; i < extraction.actions.length; i++) {
      if (matchedActions.has(i)) continue;
      const a = extraction.actions[i];
      const primitive = normalizeToPrimitive(a.effects[0]?.actionType ?? "", a.evidenceText);
      if (!primitive) continue;
      if (
        classifyMissing(testCase, {
          primitive,
          evidenceText: a.evidenceText,
          evidenceStart: a.evidenceStart,
          evidenceEnd: a.evidenceEnd,
        })
      ) {
        proposals.push({
          caseId: testCase.id,
          oracleId: testCase.oracleId,
          cardFace: testCase.cardFace,
          proposedMissingPrimitive: primitive,
          evidenceSpan: a.evidenceText.slice(0, 120),
        });
      }
    }
  }

  const outPath = resolve(process.cwd(), "reports", "oracle-action-development-missing-label-proposals.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), proposalCount: proposals.length, proposals }, null, 2),
    "utf8",
  );
  console.log(`Collected ${proposals.length} missing-label proposals → ${outPath}`);
}

main();
