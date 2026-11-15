import { diagnoseGoldRegion } from "./lib/granted-pipeline-instrumentation";
import { readFileSync } from "fs";
import { resolve } from "path";

const env = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8"));
for (const id of ["granted-exp-v136-024", "granted-exp-v136-011"]) {
  const c = env.cases.find((x: { id: string }) => x.id === id);
  const t = c.benchmarkTargets[0];
  const d = diagnoseGoldRegion(c.oracleText, c.oracleId, t.fullRegionSpan);
  console.log(id, c.cardName, d.failingStage, d.overlappingRouted.map((r) => ({ ctx: r.contextKind, text: r.text.slice(0, 60) })));
}
