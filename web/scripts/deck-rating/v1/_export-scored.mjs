import { readFileSync, writeFileSync } from "node:fs";
const field = JSON.parse(readFileSync("data/milestones/deck-rating/v1/plan-factory/field.json", "utf8"));
const rows = [];
for (const e of field.entries ?? []) {
  const w = e.score?.w;
  if (w == null || !e.score?.display || String(e.score.display).length < 4) continue;
  rows.push({
    id: e.buildId || e.oracleId || e.name,
    name: e.name,
    bracket: e.score.bracket,
    measuredAt: e.measuredAt,
    speed: e.scris?.speed ?? null,
    planRate: e.score.planRate ?? e.scris?.consistency ?? null,
    resilience: e.scris?.resilience ?? null,
    synergy: e.scris?.synergy ?? null,
    score: e.score.display,
  });
}
rows.sort((a, b) => Number(b.score) - Number(a.score) || a.name.localeCompare(b.name));
writeFileSync("src/lib/deck-rating/v1/scored-decks-snapshot.json", JSON.stringify(rows, null, 2));
console.log(rows.map((r) => `${r.score} ${r.name}`).join("\n"));
console.log("count", rows.length);
