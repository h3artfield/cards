import { readFileSync } from "node:fs";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";

const tc = (JSON.parse(readFileSync("data/oracle-action-eval-validation-v17.json", "utf8")) as {
  cases: Array<{ id: string; oracleId: string; oracleText: string }>;
}).cases.find((c) => c.id === "vh17-0020")!;

const native = extractClauseNativeActions({ oracleId: tc.oracleId, oracleText: tc.oracleText });
console.log(JSON.stringify(native.grantedAbilities[0], null, 2));
