import { readFileSync } from "node:fs";
import { detectGrantedRulesSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector";
import { findGrantedQuoteContexts } from "../src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction";

const bench = JSON.parse(readFileSync("data/oracle-action-eval-validation-v17.json", "utf8")) as {
  cases: Array<{ id: string; oracleText: string; oracleId: string }>;
};
const tc = bench.cases.find((c) => c.id === "vh17-0007")!;
const para = tc.oracleText.split("\n").pop()!;
console.log("paragraph:", para);
console.log("spans:", JSON.stringify(detectGrantedRulesSpans(para), null, 2));
console.log("contexts:", findGrantedQuoteContexts(para, `${tc.oracleId}:front:2`).map((c) => c.innerText));
