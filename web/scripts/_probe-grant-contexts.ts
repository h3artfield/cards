import { readFileSync } from "node:fs";
import { findGrantedQuoteContexts } from "../src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction";
import { segmentCardFaces, segmentAbilities } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";

const ids = ["vh17-0002", "vh17-0005", "vh17-0006", "vh17-0007", "vh17-0009", "vh17-0015", "vh17-0020"];
const bench = JSON.parse(readFileSync("data/oracle-action-eval-validation-v17.json", "utf8")) as {
  cases: Array<{ id: string; oracleId: string; oracleText: string }>;
};

for (const id of ids) {
  const tc = bench.cases.find((c) => c.id === id)!;
  const native = extractClauseNativeActions({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  const faces = segmentCardFaces(tc.oracleText);
  const contexts = faces.flatMap((f) =>
    segmentAbilities(tc.oracleId, f.faceId, f.text, f.start).flatMap((s) =>
      findGrantedQuoteContexts(s.paragraphText, `${tc.oracleId}:${s.faceId}:${s.abilityIndex}`).map((c) => ({
        seg: s.abilityIndex,
        type: c.grantedAbilityType,
        inner: c.innerText.slice(0, 70),
      })),
    ),
  );
  console.log(
    JSON.stringify({
      id,
      quoteContexts: contexts.length,
      grantedNodes: native.grantedAbilities.length,
      grantedActions: native.actions.filter((a) => (a as { executionContext?: string }).executionContext === "granted_ability").length,
      contexts,
    }),
  );
}
