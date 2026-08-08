/**
 * Identify policy guardrail forbidden accepted emissions.
 */
import { readFileSync } from "node:fs";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { classifyTextRoleAt } from "../src/lib/deck-builder/golden-catalog/oracle-span-role-classifier";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const path = "data/oracle-action-eval-rc3-policy-guardrail-v130.json";
const envelope = JSON.parse(readFileSync(path, "utf8")) as {
  cases: Array<OracleActionEvalCaseV2 & { forbiddenPrimitiveActions?: string[]; coverageStratum?: string }>;
};

for (const testCase of envelope.cases) {
  const forbidden = new Set(testCase.forbiddenPrimitiveActions ?? []);
  if (!forbidden.size) continue;
  const parsed = parseOracleSemanticsRC3({ oracleId: testCase.oracleId, oracleText: testCase.oracleText });
  for (const action of parsed.actions.filter((a) => a.reviewStatus === "accepted")) {
    if (!forbidden.has(action.actionType as never)) continue;
    const faces = segmentCardFaces(testCase.oracleText);
    const abilities = faces.flatMap((f) =>
      segmentAbilities(testCase.oracleId, f.faceId, f.text, f.start),
    );
    const ability = abilities.find((a) => {
      const start = action.provenance.actionSpan.cardStart;
      return start >= a.paragraphStart && start < a.paragraphEnd;
    });
    const localStart = ability ? action.provenance.actionSpan.cardStart - ability.paragraphStart : 0;
    const localEnd = ability ? action.provenance.actionSpan.cardEnd - ability.paragraphStart : 0;
    const role = ability
      ? classifyTextRoleAt({
          paragraph: ability.paragraphText,
          localStart,
          localEnd,
          abilityType: ability.abilityType,
        })
      : "unknown";

    console.log(
      JSON.stringify(
        {
          caseId: testCase.id,
          cardName: testCase.cardName,
          stratum: testCase.coverageStratum,
          forbidden: [...forbidden],
          emittedPrimitive: action.actionType,
          evidence: action.provenance.actionSpan.text,
          clauseRole: role,
          abilityType: ability?.abilityType,
          abilitySnippet: ability?.paragraphText.slice(0, 200),
          oracleSnippet: testCase.oracleText.slice(0, 300),
        },
        null,
        2,
      ),
    );
  }
}
