#!/usr/bin/env npx tsx
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import { familiesFromCardV1_1, DR_TAG_FAMILIES } from "../../../src/lib/deck-rating/v1/tag-families-v1.1";
import { newestMatching, snapshotRoot, writeJson } from "./lib";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function main(): Promise<void> {
  const snap = snapshotRoot();
  const oraclePath = newestMatching(join(snap, "scryfall"), /^oracle-cards-.*\.jsonl\.gz$/);
  if (!oraclePath) throw new Error("oracle dump missing");
  const buckets: Record<string, Array<{ name: string; typeLine: string; text: string; gold: boolean; why: string }>> = {};
  for (const f of DR_TAG_FAMILIES) buckets[f] = [];
  const rl = createInterface({ input: createReadStream(oraclePath).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as {
      name?: string;
      type_line?: string;
      oracle_text?: string;
      legalities?: { commander?: string };
    };
    if (rec.legalities?.commander !== "legal") continue;
    const fam = familiesFromCardV1_1({ typeLine: rec.type_line, oracleText: rec.oracle_text });
    const gold = goldLabel(rec.type_line ?? "", rec.oracle_text ?? "");
    for (const f of DR_TAG_FAMILIES) {
      if (!fam.has(f)) continue;
      buckets[f]!.push({
        name: rec.name ?? "",
        typeLine: rec.type_line ?? "",
        text: (rec.oracle_text ?? "").slice(0, 280),
        gold: gold[f],
        why: gold.why[f] ?? "",
      });
    }
  }
  const rand = mulberry32(202609251);
  const sample: Record<string, unknown> = {};
  for (const f of DR_TAG_FAMILIES) {
    const arr = buckets[f]!;
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    const take = arr.slice(0, 30);
    const tp = take.filter((x) => x.gold).length;
    sample[f] = { n: take.length, taggedUniverse: arr.length, precision: take.length ? tp / take.length : 0, cards: take };
  }
  writeJson(join(snap, "tags", "family-precision-sample-v1.1.json"), sample);
  console.log(JSON.stringify(Object.fromEntries(DR_TAG_FAMILIES.map((f) => [f, (sample[f] as { precision: number }).precision])), null, 2));
}

function goldLabel(typeLine: string, text: string): Record<string, boolean> & { why: Record<string, string> } {
  const why: Record<string, string> = {};
  const land = /\bland\b/i.test(typeLine) && !/\bcreature\b/i.test(typeLine);
  const ramp =
    (!land && (/\badd \{/i.test(text) || /add (?:one|two|three|x) mana/i.test(text) || /treasure token/i.test(text))) ||
    (/\bland cards?\b/i.test(text) && /onto the battlefield/i.test(text) && (!land || /up to two|two basic/i.test(text)));
  why.ramp = ramp ? "mana or extra lands" : "not ramp";
  const draw = /\bdraw (?:a card|cards|two cards|three cards)/i.test(text) || /\bcycling\b/i.test(text);
  why.draw = draw ? "draws" : "no draw";
  const protect =
    /(?:creatures|permanents) you control .*?\b(?:hexproof|indestructible|protection|ward)\b/i.test(text) ||
    /(?:gains?|has) (?:hexproof|indestructible|protection|ward)\b/i.test(text) &&
      !/^(?:[^\n]*\b(?:hexproof|indestructible|protection from|ward)\b[^\n]*\n?)+$/i.test(text.trim());
  why.protect = protect ? "grants" : "self or none";
  const interact =
    /\bcounter target spell\b/i.test(text) ||
    /\bdestroy target\b/i.test(text) ||
    /\bexile target (?:creature|artifact|enchantment|planeswalker|permanent)\b/i.test(text) ||
    /\bdeals? \d+ damage to (?:any target|target creature)/i.test(text);
  why.interact = interact ? "answer" : "not an answer";
  const recur = /from (?:your )?graveyard to (?:your hand|the battlefield)/i.test(text) || /\bflashback\b|\bunearth\b|\bescape\b/i.test(text);
  why.recur = recur ? "recur" : "not recur";
  const tutor = /search .*library/i.test(text) && /into your hand|onto the battlefield|on top/i.test(text);
  why.tutor = tutor ? "finds cards" : "no find";
  return { ramp, draw, protect, interact, recur, tutor, why };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
