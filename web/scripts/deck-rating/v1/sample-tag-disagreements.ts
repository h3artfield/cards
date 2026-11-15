#!/usr/bin/env npx tsx
/**
 * Draw 30-only-ours + 30-only-Scryfall samples per family, with oracle text.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import { newestMatching, snapshotRoot, writeJson } from "./lib";
import { familiesFromText } from "../../../src/lib/commander-optimization-score/v1/access-features";

const FAMILIES = ["tutor", "draw", "ramp", "interact", "protect", "recur"] as const;
const OTAG_ALIASES: Record<(typeof FAMILIES)[number], string[]> = {
  tutor: ["tutor"],
  draw: ["draw"],
  ramp: ["ramp"],
  interact: ["removal", "targeted-removal", "creature-removal", "destroy", "board-wipe", "counterspell"],
  protect: ["protection", "hexproof", "indestructible", "ward"],
  recur: ["reanimate", "recursion"],
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], n: number, rand: () => number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

async function main(): Promise<void> {
  const snap = snapshotRoot();
  const oraclePath = newestMatching(join(snap, "scryfall"), /^oracle-cards-.*\.jsonl\.gz$/);
  const otagPath = newestMatching(join(snap, "scryfall"), /^oracle-tags-.*\.jsonl\.gz$/);
  if (!oraclePath || !otagPath) throw new Error("dumps missing");

  const cards = new Map<string, { name: string; typeLine: string; text: string; legal: string }>();
  const ours = new Map<string, Set<string>>();
  for (const f of FAMILIES) ours.set(f, new Set());

  const rl = createInterface({ input: createReadStream(oraclePath).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as {
      oracle_id?: string;
      name?: string;
      type_line?: string;
      oracle_text?: string;
      legalities?: { commander?: string };
    };
    if (!rec.oracle_id || !rec.name) continue;
    cards.set(rec.oracle_id, {
      name: rec.name,
      typeLine: rec.type_line ?? "",
      text: rec.oracle_text ?? "",
      legal: rec.legalities?.commander ?? "",
    });
    const fam = familiesFromText(rec.oracle_text ?? "");
    for (const f of FAMILIES) if (fam.has(f)) ours.get(f)!.add(rec.oracle_id);
  }

  const scry = new Map<string, Set<string>>();
  for (const f of FAMILIES) scry.set(f, new Set());
  const otagRl = createInterface({ input: createReadStream(otagPath).pipe(createGunzip()) });
  for await (const line of otagRl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as {
      type?: string;
      slug?: string;
      taggings?: Array<{ oracle_id?: string; weight?: string }>;
    };
    if (rec.type !== "oracle" || !rec.slug) continue;
    const slug = rec.slug.toLowerCase();
    for (const f of FAMILIES) {
      if (!OTAG_ALIASES[f].some((a) => slug === a || slug.startsWith(`${a}-`))) continue;
      for (const t of rec.taggings ?? []) {
        if (!t.oracle_id || t.weight === "weak") continue;
        scry.get(f)!.add(t.oracle_id);
      }
    }
  }

  const rand = mulberry32(20260925);
  const out: Record<string, unknown> = { seed: 20260925, n: 30 };
  for (const f of FAMILIES) {
    const o = ours.get(f)!;
    const s = scry.get(f)!;
    const onlyOurs = [...o].filter((id) => !s.has(id));
    const onlyScry = [...s].filter((id) => !o.has(id));
    out[f] = {
      onlyOurs: pick(onlyOurs, 30, rand).map((id) => row(cards, id)),
      onlyScryfall: pick(onlyScry, 30, rand).map((id) => row(cards, id)),
    };
  }
  writeJson(join(snap, "tags", "family-samples-v1.json"), out);
  console.log(join(snap, "tags", "family-samples-v1.json"));
}

function row(cards: Map<string, { name: string; typeLine: string; text: string; legal: string }>, id: string) {
  const c = cards.get(id);
  return {
    oracleId: id,
    name: c?.name ?? id,
    typeLine: c?.typeLine ?? "",
    text: (c?.text ?? "").slice(0, 400),
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
