import { readFileSync } from "node:fs";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import { verifyProvenanceContainment } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";

const paths = [
  "data/oracle-action-eval-development-v26.json",
  "data/oracle-action-eval-development-generalization-expansion-v2.json",
  "data/oracle-action-eval-development-generalization-expansion-v3.json",
  "data/oracle-action-eval-development-generalization-expansion-v5.json",
];

for (const path of paths) {
  const env = JSON.parse(readFileSync(path, "utf8")) as { cases: Array<{ id: string; oracleId: string; oracleText: string; cardFace?: string }> };
  let total = 0;
  const hits: string[] = [];
  for (const c of env.cases) {
    const p = parseOracleSemantics({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
    const pv = verifyProvenanceContainment(p, c.oracleText);
    if (pv.length) {
      total += pv.length;
      hits.push(`${c.id}:${pv.map((x) => x.code).join(",")}`);
    }
  }
  console.log(path, total, hits.slice(0, 8));
}
