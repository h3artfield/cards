import { readFileSync } from "node:fs";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { clearRC3PromotedFamilies, resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";

const tc = JSON.parse(readFileSync("data/oracle-action-eval-development-generalization-expansion-v5-v14.json", "utf8")).cases.find(
  (c: { id: string }) => c.id === "dev-exp-v5-007",
);

for (const [label, setup] of [
  ["v132_shadow", () => clearRC3PromotedFamilies()],
  ["v134_default", () => resetRC3PromotedFamiliesToDefault()],
] as const) {
  setup();
  const p = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  console.log(label, "invalidCount", p.semanticValidation.invalidCount);
  console.log(
    p.semanticValidation.issues
      .filter((i) => i.severity === "invalid")
      .map((i) => `${i.code}: ${i.actionId}`),
  );
}
