/**
 * Cost-region FP metrics — reports affected case count and emitted-action count.
 * Run: npx tsx scripts/measure-cost-fp-v22.ts [--dataset=...]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const COST_PRIMITIVES = new Set(["sacrifice", "discard", "exile", "tap"]);
const DEV_PATH =
  process.argv.find((a) => a.startsWith("--dataset="))?.slice("--dataset=".length) ??
  "data/oracle-action-eval-development-v22.json";

const dev = JSON.parse(readFileSync(resolve(process.cwd(), DEV_PATH), "utf8")) as {
  cases: OracleActionEvalCaseV2[];
};

const costRegionEntries: Array<{ caseId: string; primitive: string; evidence: string; textRole: string }> = [];
const confusionEntries: Array<{ caseId: string; primitive: string }> = [];

for (const c of dev.cases) {
  const raw = extractOracleActionsV1({
    oracleId: c.oracleId,
    oracleText: c.oracleText,
    cardFace: c.cardFace,
  });
  const expected = c.expectedPrimitiveActions.filter((e) => !e.negative);
  const actions = raw.actions.map((a, index) => ({
    index,
    primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
    actionType: a.actionType,
    evidenceText: a.evidenceText,
    cardFaceId: a.faceId,
    abilityIndex: a.abilityIndex,
    reviewStatus: a.reviewStatus as "accepted" | "needs_review",
    textRole: a.textRole,
  }));
  const accepted = matchGoldToActions({ expected, actions, tier: "accepted" });
  const goldHasPrimitive = new Set(expected.map((e) => e.actionType));

  for (const idx of accepted.unmatchedActionIndices) {
    const a = actions[idx];
    if (a.reviewStatus !== "accepted" || !a.primitive) continue;

    const isCostRole = a.textRole === "cost";
    const isCostPrimitive = COST_PRIMITIVES.has(a.primitive);
    const goldMissing = !goldHasPrimitive.has(a.actionType as never);

    if (isCostRole && isCostPrimitive) {
      costRegionEntries.push({
        caseId: c.id,
        primitive: a.actionType,
        evidence: a.evidenceText.slice(0, 70),
        textRole: a.textRole ?? "unknown",
      });
    }
    if (goldMissing && isCostPrimitive) {
      confusionEntries.push({ caseId: c.id, primitive: a.actionType });
    }
  }
}

const costCases = new Set(costRegionEntries.map((e) => e.caseId));
const sacrificeEmissions = costRegionEntries.filter((e) => e.primitive === "sacrifice").length;
const discardEmissions = costRegionEntries.filter((e) => e.primitive === "discard").length;
const sacrificeCases = new Set(costRegionEntries.filter((e) => e.primitive === "sacrifice").map((e) => e.caseId)).size;
const discardCases = new Set(costRegionEntries.filter((e) => e.primitive === "discard").map((e) => e.caseId)).size;

const confusionSacrifice = confusionEntries.filter((e) => e.primitive === "sacrifice").length;
const confusionDiscard = confusionEntries.filter((e) => e.primitive === "discard").length;
const confusionSacrificeCases = new Set(
  confusionEntries.filter((e) => e.primitive === "sacrifice").map((e) => e.caseId),
).size;
const confusionDiscardCases = new Set(
  confusionEntries.filter((e) => e.primitive === "discard").map((e) => e.caseId),
).size;

console.log(
  JSON.stringify(
    {
      dataset: DEV_PATH,
      costRegionFp: {
        affectedCaseCount: costCases.size,
        emittedActionCount: costRegionEntries.length,
        byPrimitive: {
          sacrifice: { caseCount: sacrificeCases, emissionCount: sacrificeEmissions },
          discard: { caseCount: discardCases, emissionCount: discardEmissions },
        },
      },
      noneLayer1Confusion: {
        sacrifice: { caseCount: confusionSacrificeCases, emissionCount: confusionSacrifice },
        discard: { caseCount: confusionDiscardCases, emissionCount: confusionDiscard },
      },
      sample: costRegionEntries.slice(0, 8),
    },
    null,
    2,
  ),
);
