/**
 * Mechanical spent-v15 genuine FN census after RC6-0/1/2.
 */
import { readFileSync } from "node:fs";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const GENUINE_FN = ["vh15-0009", "vh15-0038", "vh15-0064", "vh15-0085", "vh15-0089", "vh15-0105", "vh15-0108", "vh15-0142"];

const cases = (
  JSON.parse(
    readFileSync("data/milestones/validation-v15-certification/validation-v15-certified-300929da9a640b93.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] }
).cases;

const baseline = 8;
let remaining = 0;
const recovered: string[] = [];
const stillFn: Array<{ id: string; fn: number; targets: string[] }> = [];

for (const id of GENUINE_FN) {
  const tc = cases.find((c) => c.id === id);
  if (!tc) continue;
  const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
  const row = evaluateCaseSemantic(tc, parse);
  if (row.accepted.fn > 0) {
    remaining++;
    stillFn.push({
      id,
      fn: row.accepted.fn,
      targets: tc.expectedPrimitiveActions
        .filter((g) => !g.negative)
        .map((g) => `${g.actionType}:${g.evidenceContains?.slice(0, 30)}`),
    });
  } else {
    recovered.push(id);
  }
}

console.log(
  JSON.stringify(
    {
      baselineGenuineFn: baseline,
      recoveredFn: recovered,
      recoveredCount: recovered.length,
      remainingGenuineFn: remaining,
      remainingCases: stillFn,
      incidentalNote: "Mechanical against certified v15 gold — not a gate",
    },
    null,
    2,
  ),
);
