#!/usr/bin/env npx tsx
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotRoot, writeJson } from "./lib";

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function joinPreconLabels(): Record<string, unknown> {
  const snap = snapshotRoot();
  const ranked = JSON.parse(readFileSync(join(snap, "playgroup", "precon-table.json"), "utf8")) as {
    ranked: Array<{ name: string; url: string; winRatePct: number | null; games: number | null; extra?: Record<string, unknown> }>;
  };
  const index = JSON.parse(readFileSync(join(snap, "mtgjson", "commander-deck-index.json"), "utf8")) as {
    commanderDecks: Array<{ name: string; code: string | null; fileName: string; type: string | null; releaseDate: string | null; extractedPath: string | null }>;
  };
  const ALIAS: Record<string, string> = {
    "mind flayarrgh": "mind flayarrrs",
  };
  const byNorm = new Map<string, (typeof index.commanderDecks)[number]>();
  function remember(key: string, d: (typeof index.commanderDecks)[number]) {
    const cur = byNorm.get(key);
    if (!cur || /collector/i.test(cur.name) && !/collector/i.test(d.name)) byNorm.set(key, d);
  }
  for (const d of index.commanderDecks) {
    if (/collector/i.test(d.name)) continue;
    const n = norm(d.name);
    remember(n, d);
    remember(norm(d.fileName.replace(/_/g, " ")), d);
    remember(n.replace(/\([^)]+\)/g, "").trim(), d);
    const words = n.replace(/\([^)]+\)/g, "").trim().split(" ");
    if (words.length >= 2) remember(words.slice(0, 2).join(" "), d);
  }
  const joined = [];
  const unmatched = [];
  for (const row of ranked.ranked) {
    const slug = decodeURIComponent(row.url.split("/precons/")[1] ?? "").replace(/-/g, " ");
    const keys = [norm(row.name), norm(slug), ALIAS[norm(row.name)] ?? ""].filter(Boolean);
    const hit = keys.map((k) => byNorm.get(k)).find(Boolean);
    if (!hit?.extractedPath || !existsSync(hit.extractedPath)) {
      unmatched.push({ name: row.name, url: row.url });
      continue;
    }
    const deck = JSON.parse(readFileSync(hit.extractedPath, "utf8")) as {
      data?: {
        commander?: Array<{ name?: string; identifiers?: { scryfallOracleId?: string } }>;
        mainBoard?: Array<{ name?: string; identifiers?: { scryfallOracleId?: string }; count?: number }>;
      };
    };
    const data = deck.data ?? { commander: [], mainBoard: [] };
    joined.push({
      playgroupName: row.name,
      winRatePct: row.winRatePct,
      games: row.games,
      url: row.url,
      mtgjsonName: hit.name,
      mtgjsonCode: hit.code,
      releaseDate: hit.releaseDate,
      last3Years: Boolean(hit.releaseDate && hit.releaseDate >= "2023-09-25"),
      extractedPath: hit.extractedPath,
      commanders: (data.commander ?? []).map((c) => ({ name: c.name, oracleId: c.identifiers?.scryfallOracleId ?? null })),
      mainboard: (data.mainBoard ?? []).map((c) => ({
        name: c.name,
        oracleId: c.identifiers?.scryfallOracleId ?? null,
        quantity: c.count ?? 1,
      })),
    });
  }
  const out = {
    ranked: ranked.ranked.length,
    joined: joined.length,
    unmatched,
    usedAsLabels: joined.length,
    note: "Every joinable ranked precon is a casual label, not only the last-3-years B2 comparison pool.",
  };
  writeJson(join(snap, "labels", "precon-labels.json"), { ...out, decks: joined });
  return { ...out, dest: join(snap, "labels", "precon-labels.json") };
}

if (require.main === module) {
  console.log(JSON.stringify(joinPreconLabels(), null, 2));
}
