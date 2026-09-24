import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { classifyEmissionOutcome } from "./eval-oracle-action-extraction-v6";

const env = JSON.parse(readFileSync("data/oracle-action-eval-development-v23.json", "utf8"));
for (const testCase of env.cases) {
  const raw = extractOracleActionsV1({
    oracleId: testCase.oracleId,
    oracleText: testCase.oracleText,
    cardFace: testCase.cardFace,
  });
  for (const action of raw.actions.filter((a) => a.reviewStatus === "accepted")) {
    const outcome = classifyEmissionOutcome(testCase, action);
    if (outcome === "genuinely_unsupported_extraction") {
      console.log(testCase.id, testCase.cardName, action.actionType, action.evidenceText.slice(0, 60));
    }
  }
}
