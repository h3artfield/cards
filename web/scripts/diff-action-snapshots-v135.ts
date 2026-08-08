import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Row = {
  caseId: string;
  goldIndex: number;
  actionType: string;
  evidenceContains?: string;
  matched: boolean;
  extractionSource?: string;
};

const before = JSON.parse(
  readFileSync(resolve("data/milestones/rc3-development/action-snapshot-v132-parser.json"), "utf8"),
) as { goldRows: Row[]; fps: Array<{ caseId: string; actionType: string; evidenceText: string }> };
const after = JSON.parse(
  readFileSync(resolve("data/milestones/rc3-development/action-snapshot-v134-default.json"), "utf8"),
) as { goldRows: Row[]; fps: Array<{ caseId: string; actionType: string; evidenceText: string }> };

const key = (r: Row) => `${r.caseId}|${r.goldIndex}|${r.actionType}|${r.evidenceContains ?? ""}`;
const bMap = new Map(before.goldRows.map((r) => [key(r), r]));

const lostTp: Array<Row & { beforeSource?: string }> = [];
const gainedTp: Array<Row & { afterSource?: string }> = [];

for (const a of after.goldRows) {
  const b = bMap.get(key(a));
  if (!b) continue;
  if (b.matched && !a.matched) lostTp.push({ ...a, beforeSource: b.extractionSource });
  if (!b.matched && a.matched) gainedTp.push({ ...a, afterSource: a.extractionSource });
}

const fpKey = (f: { caseId: string; actionType: string; evidenceText: string }) =>
  `${f.caseId}|${f.actionType}|${f.evidenceText}`;
const fpBefore = new Set(before.fps.map(fpKey));
const fpAfter = new Set(after.fps.map(fpKey));

const out = {
  lostTpCount: lostTp.length,
  gainedTpCount: gainedTp.length,
  netTpDelta: gainedTp.length - lostTp.length,
  lostTp,
  gainedTp,
  newFp: after.fps.filter((f) => !fpBefore.has(fpKey(f))),
  removedFp: before.fps.filter((f) => !fpAfter.has(fpKey(f))),
};

writeFileSync(resolve("data/milestones/rc3-development/v132-to-v134-action-diff.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ lost: out.lostTpCount, gained: out.gainedTpCount, newFp: out.newFp.length, removedFp: out.removedFp.length }, null, 2));
