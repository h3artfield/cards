#!/usr/bin/env npx tsx
/**
 * Snapshot Playgroup public decks that have a record. The API returns W/L
 * but not the 99; the list is on decklist_url (often Moxfield).
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fetchJson, fetchText, snapshotRoot, writeJson } from "./lib";

export async function snapshotPublicDecks(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const guff = await fetchJson<Record<string, unknown>>("https://playgroup.gg/api/public/v1/commanders/2468.json");
  const top = ((guff.json?.top_decks as Array<Record<string, unknown>>) ?? []).slice(0, 5);
  const decks = [];
  for (const row of top) {
    const id = row.id;
    const rec = await fetchJson<Record<string, unknown>>(`https://playgroup.gg/api/public/v1/decks/${id}`);
    const json = rec.json ?? {};
    const decklistUrl = String(json.decklist_url ?? "");
    let list: { host: string; nNames: number; sha256: string | null } = { host: "", nNames: 0, sha256: null };
    if (/moxfield\.com\/decks\//i.test(decklistUrl)) {
      const slug = decklistUrl.split("/decks/")[1]?.split(/[?#]/)[0] ?? "";
      const mx = await fetchJson<Record<string, unknown>>(`https://api2.moxfield.com/v3/decks/all/${slug}`);
      const boards = (mx.json?.boards as Record<string, { cards?: Record<string, { quantity?: number; card?: { name?: string } }> }>) ?? {};
      const names: string[] = [];
      for (const board of Object.values(boards)) {
        for (const entry of Object.values(board.cards ?? {})) {
          if (entry.card?.name) names.push(`${entry.quantity ?? 1} ${entry.card.name}`);
        }
      }
      list = {
        host: "moxfield.com",
        nNames: names.length,
        sha256: names.length ? createHash("sha256").update(names.sort().join("\n")).digest("hex") : null,
      };
    } else if (decklistUrl) {
      const page = await fetchText(decklistUrl);
      list = { host: new URL(decklistUrl).host, nNames: 0, sha256: page.status === 200 ? createHash("sha256").update(page.text).digest("hex") : null };
    }
    decks.push({
      playgroupId: id,
      name: json.name,
      gamesWon: json.games_won,
      gamesLost: json.games_lost,
      winRatePct: json.win_rate_percentage,
      commander: (json.commander as { name?: string } | undefined)?.name,
      decklistUrl,
      listInPlaygroupPayload: false,
      list,
    });
    await new Promise((r) => setTimeout(r, 200));
  }
  const report = {
    version: "deck-rating-playgroup-public-decks-v1",
    finding:
      "Unauthenticated GET /api/public/v1/decks/{id} returns the win/loss record and a decklist_url. It does not return the 99. /api/v2/decks/{id} is 401. Profile HTML does not embed the list. Lists are recoverable when decklist_url points at a public host (Moxfield).",
    n: decks.length,
    decks,
  };
  writeJson(join(snap, "playgroup", "api", "public-decks-sample.json"), report);
  return report;
}

if (require.main === module) {
  snapshotPublicDecks()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
