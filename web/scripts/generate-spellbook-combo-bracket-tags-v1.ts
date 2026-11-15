#!/usr/bin/env npx tsx
/**
 * Join the Spellbook full-mirror variants (bracketTag) onto the frozen combo
 * dictionary (cardSetSignature + variantIds). Output is small enough to ship
 * in the web image so the rubric does not need the 105k-line mirror at runtime.
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

const WEB = resolve(__dirname, "..");
const MIRROR = resolve(WEB, "data/milestones/mechanical-space/commanderspellbook-full-mirror-v1/variants.jsonl");
const DICT = resolve(
  WEB,
  "data/milestones/mechanical-space/spellbook-win-architecture-space-v1/normalized-combo-dictionary.jsonl",
);
const OUT = resolve(
  WEB,
  "data/milestones/mechanical-space/spellbook-win-architecture-space-v1/combo-bracket-tags-v1.json",
);

const RANK: Record<string, number> = { R: 5, S: 4, P: 4, O: 3, C: 3, E: 2, B: 1 };

function better(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return (RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a;
}

async function readJsonl(path: string): Promise<string[]> {
  const lines: string[] = [];
  const rl = createInterface({ input: createReadStream(path, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }
  return lines;
}

async function main() {
  const tagByVariantId = new Map<string, string>();
  for (const line of await readJsonl(MIRROR)) {
    const rec = JSON.parse(line) as { id?: string; bracketTag?: string };
    if (rec.id && rec.bracketTag) tagByVariantId.set(rec.id, rec.bracketTag);
  }

  const bySignature: Record<string, { tag: string | null; nTemplates: number }> = {};
  let tagged = 0;
  for (const line of await readJsonl(DICT)) {
    const rec = JSON.parse(line) as {
      cardSetSignature?: string;
      variantIds?: string[];
      nTemplates?: number;
    };
    if (!rec.cardSetSignature) continue;
    let tag: string | undefined;
    for (const id of rec.variantIds ?? []) tag = better(tag, tagByVariantId.get(id));
    bySignature[rec.cardSetSignature] = { tag: tag ?? null, nTemplates: rec.nTemplates ?? 0 };
    if (tag) tagged += 1;
  }

  const payload = {
    version: "combo-bracket-tags-v1",
    generatedAt: new Date().toISOString(),
    signatures: Object.keys(bySignature).length,
    tagged,
    bySignature,
  };
  writeFileSync(OUT, JSON.stringify(payload));
  console.log(`wrote ${OUT} signatures=${payload.signatures} tagged=${tagged}`);
}

void main();
