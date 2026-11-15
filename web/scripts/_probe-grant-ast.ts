import { readFileSync } from "node:fs";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";

const ids = ["vh17-0002", "vh17-0015", "vh17-0020"];
const bench = JSON.parse(readFileSync("data/oracle-action-eval-validation-v17.json", "utf8")) as {
  cases: Array<{ id: string; oracleId: string; oracleText: string }>;
};

for (const id of ids) {
  const tc = bench.cases.find((c) => c.id === id)!;
  const native = extractClauseNativeActions({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  console.log(
    JSON.stringify({
      id,
      nativeGrantedNodes: native.grantedAbilities.length,
      nativeGrantedNodeIds: native.grantedAbilities.map((n) => n.grantingClauseId),
      astGranted: parse.abilities.filter((a) => (a as { abilityOrigin?: string }).abilityOrigin === "granted").length,
      allAbilities: parse.abilities.map((a) => ({ id: a.abilityId.slice(-20), type: a.abilityType, span: [a.abilitySpan.cardStart, a.abilitySpan.cardEnd] })),
      replacementEffects: native.replacementEffects.length,
    }),
  );
}
