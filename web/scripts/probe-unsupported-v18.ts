import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { toLegacyExtractionResult } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v18.json", "utf8"));
const r = evaluateCaseSet(dev.cases, "development_set_v18");
console.log("unsupported count:", r.authoritativeClassification.counts.genuinely_unsupported_by_oracle);

for (const c of dev.cases as OracleActionEvalCaseV2[]) {
  const raw = extractOracleActionsV1({
    oracleId: c.oracleId,
    oracleText: c.oracleText,
    cardFace: c.cardFace,
  });
  for (const a of raw.actions.filter((x) => x.reviewStatus === "accepted")) {
    if (c.forbiddenPrimitiveActions?.includes(a.actionType)) {
      console.log("forbidden accepted:", c.id, c.cardName, a.actionType, a.evidenceText.slice(0, 80));
    }
  }
}

for (const row of r.perCaseAcceptedFalsePositives ?? []) {
  if (row.category === "genuinely_unsupported_extraction" || row.authoritative === "genuinely_unsupported_by_oracle") {
    console.log("unsupported fp:", row.caseId, row.primitive, row.evidence?.slice(0, 80));
  }
}
