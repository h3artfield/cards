import { readFileSync } from "node:fs";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { extractOracleActionsV1, toLegacyExtractionResult } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { inferSupportedPrimitiveFromEvidence, spanValid, evidenceMatchesExtracted } from "./oracle-action-eval-shared";

const path = process.argv[2] ?? "data/oracle-action-eval-development-v20.json";
const dev = JSON.parse(readFileSync(path, "utf8"));
const r = evaluateCaseSet(dev.cases, "development_set_v20");
console.log("unsupported:", r.authoritativeClassification.counts.genuinely_unsupported_by_oracle);

for (const c of dev.cases) {
  const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
  const extraction = toLegacyExtractionResult(raw);
  const expected = c.expectedPrimitiveActions.filter((e: { negative?: boolean }) => !e.negative);
  const matched = new Set<number>();
  for (let ei = 0; ei < expected.length; ei++) {
    const idx = extraction.actions.findIndex(
      (a, ai) =>
        !matched.has(ai) &&
        a.effects[0]?.actionType === expected[ei].actionType &&
        evidenceMatchesExtracted(a.evidenceText, expected[ei].evidenceContains),
    );
    if (idx >= 0) matched.add(idx);
  }
  for (let ai = 0; ai < extraction.actions.length; ai++) {
    if (matched.has(ai)) continue;
    const legacy = extraction.actions[ai];
    const actionType = legacy.effects[0]?.actionType;
    if (!actionType) continue;
    if (c.forbiddenPrimitiveActions?.includes(actionType)) {
      console.log(c.id, actionType, legacy.reviewStatus, legacy.evidenceText.slice(0, 60));
    }
  }
}
