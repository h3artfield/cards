import { readFileSync } from "node:fs";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";
import { countAcceptedActionOutsideOwnerSpan } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";

const bench = JSON.parse(readFileSync("data/oracle-action-eval-validation-v17.json", "utf8")) as {
  cases: Array<{ id: string; oracleId: string; oracleText: string }>;
};
for (const id of ["vh17-0002", "vh17-0049", "vh17-0042", "vh17-0020"]) {
  const tc = bench.cases.find((c) => c.id === id)!;
  const p = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText });
  const ev = evaluateCaseSemantic(tc, p);
  console.log(
    id,
    JSON.stringify({
      tp: ev.tp,
      fp: ev.fp,
      fn: ev.fn,
      outsideOwner: countAcceptedActionOutsideOwnerSpan(p),
      actions: p.actions
        .filter((a) => a.reviewStatus === "accepted")
        .map((a) => ({ t: a.actionType, e: a.provenance.actionSpan.text.slice(0, 50), ctx: a.executionContext })),
    }),
  );
}
