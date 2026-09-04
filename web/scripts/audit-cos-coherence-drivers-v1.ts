/**
 * Coherence is -clusterEntropy over every *copy* in the mainboard. Basic lands
 * are many copies of one card, so they all land in one cluster. This reports
 * how much of a deck's measured coherence comes from its basics rather than
 * from its spells.
 *
 * Usage: tsx scripts/audit-cos-coherence-drivers-v1.ts <decklist.txt>
 */
import { readFileSync } from "node:fs";
import { loadCosV1Runtime } from "@/lib/commander-optimization-score/v1/load-artifacts";

function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s*\/\/.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function entropy(counts: number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  if (!n) return 0;
  let e = 0;
  for (const v of counts) {
    if (!v) continue;
    const p = v / n;
    e -= p * Math.log2(p);
  }
  return e;
}

function parseDeck(path: string): Array<{ name: string; qty: number }> {
  const out: Array<{ name: string; qty: number }> = [];
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(.+?)\s*(?:\((?:commander|cmdr)\))?$/i);
    if (!m) continue;
    out.push({ name: m[2]!.trim(), qty: Number(m[1]) });
  }
  return out;
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) throw new Error("pass a decklist path");
  const runtime = await loadCosV1Runtime();

  const byName = new Map<string, { clusterId?: number | null; typeLine?: string }>();
  for (const point of runtime.points.values()) {
    if (point.name) byName.set(normalize(point.name), point);
  }

  const deck = parseDeck(path);
  const all = new Map<number, number>();
  const spellsOnly = new Map<number, number>();
  const dedupedAll = new Map<number, number>();
  let missing = 0;
  let basicCopies = 0;

  for (const entry of deck) {
    const point = byName.get(normalize(entry.name));
    if (!point || point.clusterId == null) {
      missing += entry.qty;
      continue;
    }
    const id = Number(point.clusterId);
    const isBasic = /\bbasic\b/i.test(point.typeLine ?? "");
    all.set(id, (all.get(id) ?? 0) + entry.qty);
    dedupedAll.set(id, (dedupedAll.get(id) ?? 0) + 1);
    if (isBasic) basicCopies += entry.qty;
    else spellsOnly.set(id, (spellsOnly.get(id) ?? 0) + entry.qty);
  }

  const eAll = entropy([...all.values()]);
  const eSpells = entropy([...spellsOnly.values()]);
  const eDedup = entropy([...dedupedAll.values()]);

  console.log(`deck entries:                 ${deck.length}`);
  console.log(`copies with no cluster:       ${missing}`);
  console.log(`basic-land copies:            ${basicCopies}`);
  console.log("");
  console.log(`clusterEntropy as scored:     ${eAll.toFixed(4)}   -> coherence ${(-eAll).toFixed(4)}`);
  console.log(`clusterEntropy, basics out:   ${eSpells.toFixed(4)}   -> coherence ${(-eSpells).toFixed(4)}`);
  console.log(`clusterEntropy, 1 per card:   ${eDedup.toFixed(4)}   -> coherence ${(-eDedup).toFixed(4)}`);
  console.log("");
  console.log(`basics move coherence by:     ${(eSpells - eAll).toFixed(4)}`);
  console.log(`counting copies moves it by:  ${(eDedup - eAll).toFixed(4)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
