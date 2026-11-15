#!/usr/bin/env npx tsx
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotRoot, writeJson } from "./lib";

type DeckRec = {
  id: number;
  decklist_url?: string | null;
  games_won?: number;
  games_lost?: number;
  commander?: { name?: string };
};

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function summarizePublicDecks(): Record<string, unknown> {
  const snap = snapshotRoot();
  const jsonl = join(snap, "playgroup", "public-decks", "all-public-decks-v1.jsonl");
  const progressPath = join(snap, "playgroup", "public-decks", "progress.json");
  const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, "utf8")) : null;
  const hosts: Record<string, number> = {};
  let n = 0;
  let withList = 0;
  let ge10 = 0;
  let ge10List = 0;
  let ge10Archidekt = 0;
  let ge10Moxfield = 0;
  const commanders = new Set<string>();
  if (existsSync(jsonl)) {
    for (const line of readFileSync(jsonl, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const d = JSON.parse(line) as DeckRec;
      n += 1;
      const won = Number(d.games_won ?? 0);
      const lost = Number(d.games_lost ?? 0);
      const games = won + lost;
      if (d.commander?.name) commanders.add(d.commander.name);
      if (d.decklist_url) {
        withList += 1;
        const h = hostOf(String(d.decklist_url));
        hosts[h] = (hosts[h] ?? 0) + 1;
        if (games >= 10) {
          ge10List += 1;
          if (h === "archidekt.com") ge10Archidekt += 1;
          if (h === "moxfield.com") ge10Moxfield += 1;
        }
      }
      if (games >= 10) ge10 += 1;
    }
  }
  const report = {
    version: "deck-rating-playgroup-public-decks-summary-v1",
    progress,
    n,
    commanders: commanders.size,
    withList,
    hosts,
    ge10,
    ge10List,
    ge10Archidekt,
    ge10Moxfield,
    podSize: "Deck payload has no pod-size field.",
  };
  writeJson(join(snap, "playgroup", "public-decks", "running-summary.json"), report);
  return report;
}

if (require.main === module) {
  console.log(JSON.stringify(summarizePublicDecks(), null, 2));
}
