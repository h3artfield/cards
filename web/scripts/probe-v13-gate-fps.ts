import { readFileSync } from "node:fs";
import { matchGoldToSemanticActions, semanticActionsForMatch } from "./oracle-action-semantic-matcher";
import { countParserFalsePositives } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const agg = JSON.parse(
  readFileSync("data/milestones/validation-v13-rc3-certification/validation-v13-rc3-execution-1-aggregate.json", "utf8"),
);
const raw = JSON.parse(
  readFileSync("data/milestones/validation-v13-rc3-certification/validation-v13-rc3-execution-1-raw.json", "utf8"),
);
const v13 = JSON.parse(readFileSync("data/oracle-action-eval-validation-v13.json", "utf8")) as {
  cases: OracleActionEvalCaseV2[];
};
const rawById = Object.fromEntries(raw.cases.map((c: { caseId: string }) => [c.caseId, c]));

const gateFps: Array<{
  caseId: string;
  cardName: string;
  observedAction: string;
  observedEvidence: string;
  actionIndex: number;
}> = [];
let totalFp = 0;

for (const tc of v13.cases) {
  const parse = rawById[tc.id].semanticParse;
  const expected = tc.expectedPrimitiveActions.filter((e) => !e.negative);
  const match = matchGoldToSemanticActions({
    expected,
    parse,
    tier: "accepted",
    oracleText: tc.oracleText,
    caseId: tc.id,
  });
  const actions = semanticActionsForMatch(parse);
  const extracted = actions.map((a) => ({
    index: a.index,
    primitive: a.actionType,
    evidenceText: a.evidenceText,
    evidenceStart: a.evidenceStart,
    evidenceEnd: a.evidenceEnd,
    cardFaceId: a.faceId,
    abilityIndex: a.segmentAbilityIndex,
    loyaltyCost: a.loyaltyCost,
    modalOptionId: a.modalOptionKey,
    reviewStatus: a.reviewStatus as "accepted" | "needs_review",
    optionalEffect: a.optionalEffect,
    optional: a.optionalEffect,
    optionalCost: a.optionalCost,
    cardNativeLayer2Eligible: a.cardNativeLayer2Eligible,
    cardStart: a.evidenceStart,
    cardEnd: a.evidenceEnd,
  }));

  for (const idx of match.unmatchedActionIndices) {
    const a = actions[idx];
    if (a.reviewStatus !== "accepted") continue;
    const fp = countParserFalsePositives(tc, [idx], extracted);
    if (fp > 0) {
      gateFps.push({
        caseId: tc.id,
        cardName: (tc as { cardName?: string }).cardName ?? tc.oracleId,
        observedAction: a.actionType,
        observedEvidence: a.evidenceText,
        actionIndex: idx,
      });
      totalFp += fp;
    }
  }
}

const fnRows = agg.missLedger.filter((r: { mismatchKind: string }) => r.mismatchKind === "FN");

const byAction: Record<string, number> = {};
for (const r of fnRows) {
  const key = (r as { expectedAction?: string }).expectedAction ?? "null";
  byAction[key] = (byAction[key] ?? 0) + 1;
}

console.log(
  JSON.stringify(
    {
      gateFpTotal: totalFp,
      gateFps,
      missLedgerFnCount: fnRows.length,
      fnByExpectedAction: byAction,
      nonSacDiscCast: fnRows
        .filter((r: { expectedAction?: string }) => !["sacrifice", "discard", "cast"].includes(r.expectedAction ?? ""))
        .map((r: { caseId: string; expectedAction?: string; expectedEvidence?: string }) => ({
          caseId: r.caseId,
          expectedAction: r.expectedAction,
          evidence: r.expectedEvidence?.slice(0, 60),
        })),
      missLedgerFpParserFalsePositive: agg.missLedger.filter(
        (r: { mismatchKind: string; errorClass?: string }) =>
          r.mismatchKind === "FP" && r.errorClass === "parser_false_positive",
      ).length,
    },
    null,
    2,
  ),
);
