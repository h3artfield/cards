import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const parent = JSON.parse(readFileSync(resolve("data/milestones/rc3-development/action-match-ledger-parent-c446b6b.json"), "utf8"));
const current = JSON.parse(readFileSync(resolve("data/milestones/rc3-development/action-match-ledger-current-v137.json"), "utf8"));
const key = (r: { caseId: string; actionType: string; evidenceContains: string }) =>
  `${r.caseId}|${r.actionType}|${r.evidenceContains}`;
const pmap = new Map(parent.rows.map((r: { caseId: string; actionType: string; evidenceContains: string; matched: boolean }) => [key(r), r]));
const tpToFn: unknown[] = [];
const fnToTp: unknown[] = [];
for (const cur of current.rows) {
  const prev = pmap.get(key(cur));
  if (prev?.matched && !cur.matched) tpToFn.push(cur);
  if (!prev?.matched && cur.matched) fnToTp.push(cur);
}
const report = { parentMetrics: parent.metrics, currentMetrics: current.metrics, tpToFn, fnToTp };
writeFileSync(resolve("data/milestones/rc3-development/action-ledger-delta-v137.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
