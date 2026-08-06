import { readFileSync } from "node:fs";
import { extractOracleActionsV1, toLegacyExtractionResult } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { evidenceMatchesExtracted } from "./oracle-action-eval-shared";

const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v3.json", "utf8")) as {
  cases: Array<{ id: string; oracleText: string; oracleId: string; cardFace?: string; expectedPrimitiveActions: Array<{ actionType: string; evidenceContains: string; optionalEffect?: boolean; optionalCost?: boolean; negative?: boolean }>; expectedConditions?: Array<{ type?: string; attachesToEvidence?: string; textContains: string }> }>;
};

const mayMiss: string[] = [];
const attachMiss: string[] = [];
const primMiss: string[] = [];
const condMiss: string[] = [];

for (const tc of dev.cases) {
  const raw = extractOracleActionsV1({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
  const ext = toLegacyExtractionResult(raw);
  const hasMay = /\bmay\b/i.test(tc.oracleText);
  const foundOpt = ext.actions.some((a) => a.optionalEffect || a.optionalCost);
  if (hasMay && !foundOpt) mayMiss.push(`${tc.id}: ${tc.oracleText.slice(0, 70)}`);

  for (const exp of tc.expectedPrimitiveActions.filter((e) => !e.negative)) {
    if (!exp.optionalEffect && !exp.optionalCost) continue;
    const matched = ext.actions.find(
      (a) =>
        normalizeToPrimitive(a.effects[0]?.actionType ?? "", a.evidenceText) === exp.actionType &&
        evidenceMatchesExtracted(a.evidenceText, exp.evidenceContains),
    );
    if (!matched) primMiss.push(`${tc.id} ${exp.actionType} "${exp.evidenceContains.slice(0, 40)}"`);
    else {
      const ok = exp.optionalCost ? matched.optionalCost : matched.optionalEffect;
      if (!ok) attachMiss.push(`${tc.id} "${matched.evidenceText.slice(0, 40)}" opt=${matched.optionalEffect}`);
    }
  }
  for (const cond of tc.expectedConditions ?? []) {
    if (!cond.attachesToEvidence) continue;
    const attached = ext.actions.find((a) => evidenceMatchesExtracted(a.evidenceText, cond.attachesToEvidence!));
    const ok =
      attached &&
      (attached.conditionType === cond.type ||
        attached.conditionText?.toLowerCase().includes(cond.textContains.toLowerCase().slice(0, 16)) ||
        (attached.dependsOnActionIds?.length ?? 0) > 0);
    if (!ok) condMiss.push(`${tc.id} ${cond.type} -> ${cond.attachesToEvidence.slice(0, 30)} got=${attached?.conditionType ?? "none"}`);
  }
}

console.log("MAY ORACLE MISS", mayMiss.length);
mayMiss.forEach((x) => console.log(" ", x));
console.log("PRIM MISS", primMiss.length);
primMiss.forEach((x) => console.log(" ", x));
console.log("ATTACH MISS", attachMiss.length);
attachMiss.forEach((x) => console.log(" ", x));
console.log("COND MISS", condMiss.length);
condMiss.forEach((x) => console.log(" ", x));
