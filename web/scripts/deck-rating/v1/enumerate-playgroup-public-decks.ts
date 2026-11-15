#!/usr/bin/env npx tsx
/**
 * Enumerate ALL public Playgroup decks, not just commander top_decks.
 *
 * Public API has no commander-scoped deck index. The complete public-profile
 * census is GET /users/{id}/decks. Commander /commanders/{id} only returns
 * five result-selected top_decks. Those are harvested too so public decks
 * on private profiles still enter the set when Playgroup surfaces them.
 *
 * Lists: Archidekt API only. Moxfield has no public API; terms/FAQ are
 * JS-gated and api2 is Cloudflare-locked — skipped for v1.
 *
 *   cd web && npx --yes tsx scripts/deck-rating/v1/enumerate-playgroup-public-decks.ts
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { ensureDir, fetchJson, fetchText, sha256Bytes, sleep, snapshotRoot, writeJson } from "./lib";

const BASE = "https://playgroup.gg/api/public/v1";
const DELAY_MS = 180;
const MIN_GAMES = 10;

type CommanderRef = { id?: number; name?: string };
type DeckRec = {
  id: number;
  name?: string;
  user_id?: number;
  decklist_url?: string | null;
  bracket?: number | null;
  games_won?: number;
  games_lost?: number;
  win_rate_percentage?: number;
  commander?: CommanderRef;
  partner?: CommanderRef | null;
  archived?: boolean;
  source?: string;
};

type Usable = {
  playgroupId: number;
  name: string;
  commander: string;
  commanderId: number | null;
  userId: number | null;
  gamesWon: number;
  gamesLost: number;
  games: number;
  label: number;
  bracket: number | null;
  decklistUrl: string;
  host: string;
  source: string;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function loadCommanders(snap: string): Array<{ id: number; name: string; decks_count?: number }> {
  const path = join(snap, "playgroup", "api", "commanders-public-v1.json");
  const rows = JSON.parse(readFileSync(path, "utf8")) as Array<{ id: number; name: string }>;
  return rows;
}

function appendJsonl(path: string, row: unknown) {
  appendFileSync(path, `${JSON.stringify(row)}\n`);
}

export async function enumeratePlaygroupPublicDecks(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const outDir = ensureDir(join(snap, "playgroup", "public-decks"));
  const jsonl = join(outDir, "all-public-decks-v1.jsonl");
  const progressPath = join(outDir, "progress.json");
  const seen = new Set<number>();
  if (existsSync(jsonl)) {
    for (const line of readFileSync(jsonl, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as DeckRec;
        if (rec.id) seen.add(rec.id);
      } catch {
        /* skip */
      }
    }
  }
  const profileIdsPath = join(snap, "playgroup", "api", "sitemap-profile-ids.json");
  const profileIds: number[] = existsSync(profileIdsPath) ? JSON.parse(readFileSync(profileIdsPath, "utf8")) : [];
  let progress = existsSync(progressPath)
    ? (JSON.parse(readFileSync(progressPath, "utf8")) as { lastUserIndex: number; commandersDone: boolean; profilesTotal: number })
    : { lastUserIndex: -1, commandersDone: false, profilesTotal: profileIds.length };

  const commanders = loadCommanders(snap);
  console.log(`Playgroup enum ${profileIds.length} sitemap public profiles`);
  for (let i = progress.lastUserIndex + 1; i < profileIds.length; i += 1) {
    const id = profileIds[i]!;
    const hit = await fetchJson<DeckRec[]>(`${BASE}/users/${id}/decks`);
    if (hit.status === 200 && Array.isArray(hit.json)) {
      for (const deck of hit.json) {
        if (!deck.id || seen.has(deck.id)) continue;
        seen.add(deck.id);
        appendJsonl(jsonl, { ...deck, source: "user-decks" });
      }
    }
    progress.lastUserIndex = i;
    if (i % 25 === 0) {
      writeJson(progressPath, progress);
      console.log(`Playgroup enum users ${i + 1}/${profileIds.length} decks ${seen.size}`);
    }
    await sleep(DELAY_MS);
  }
  writeJson(progressPath, progress);

  if (!progress.commandersDone) {
    console.log(`Playgroup enum: ${commanders.length} commanders for top_decks harvest`);
    for (const cmd of commanders) {
      const hit = await fetchJson<{ top_decks?: Array<{ id: number; url?: string }>; stats?: { decks_count?: number } }>(
        `${BASE}/commanders/${cmd.id}.json`,
      );
      const top = hit.json?.top_decks ?? [];
      for (const row of top) {
        if (!row.id || seen.has(row.id)) continue;
        const deck = await fetchJson<DeckRec>(`${BASE}/decks/${row.id}`);
        if (deck.status === 200 && deck.json?.id) {
          seen.add(deck.json.id);
          appendJsonl(jsonl, { ...deck.json, source: "commander-top-decks" });
        }
        await sleep(DELAY_MS);
      }
      await sleep(DELAY_MS);
      if (cmd.id % 50 === 0) console.log(`Playgroup enum commanders ${cmd.id} decks ${seen.size}`);
    }
    progress.commandersDone = true;
    writeJson(progressPath, progress);
  }

  const all: DeckRec[] = [];
  if (existsSync(jsonl)) {
    for (const line of readFileSync(jsonl, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        all.push(JSON.parse(line) as DeckRec);
      } catch {
        /* skip */
      }
    }
  }

  const withList = all.filter((d) => Boolean(d.decklist_url));
  const hosts: Record<string, number> = {};
  for (const d of withList) {
    const h = hostOf(String(d.decklist_url));
    hosts[h] = (hosts[h] ?? 0) + 1;
  }

  const usableMeta: Usable[] = [];
  for (const d of all) {
    const won = Number(d.games_won ?? 0);
    const lost = Number(d.games_lost ?? 0);
    const games = won + lost;
    const url = String(d.decklist_url ?? "");
    if (games < MIN_GAMES || !url) continue;
    usableMeta.push({
      playgroupId: d.id,
      name: String(d.name ?? ""),
      commander: d.commander?.name ?? "",
      commanderId: d.commander?.id ?? null,
      userId: d.user_id ?? null,
      gamesWon: won,
      gamesLost: lost,
      games,
      label: won / games,
      bracket: d.bracket ?? null,
      decklistUrl: url,
      host: hostOf(url),
      source: d.source ?? "",
    });
  }

  const archidekt = usableMeta.filter((d) => d.host === "archidekt.com");
  const moxfield = usableMeta.filter((d) => d.host === "moxfield.com");
  const lists: Array<Usable & { nNames: number; sha256: string | null; archidektId: number | null }> = [];
  for (const row of archidekt) {
    const id = Number(row.decklistUrl.match(/\/decks\/(\d+)/)?.[1] ?? 0);
    if (!id) {
      lists.push({ ...row, nNames: 0, sha256: null, archidektId: null });
      await sleep(DELAY_MS);
      continue;
    }
    const hit = await fetchJson<{ cards?: Array<{ card?: { oracleCard?: { name?: string } }; quantity?: number; categories?: string[] }> }>(
      `https://archidekt.com/api/decks/${id}/`,
    );
    const names: string[] = [];
    for (const entry of hit.json?.cards ?? []) {
      const cats = (entry.categories ?? []).map((c) => c.toLowerCase());
      if (cats.some((c) => /maybe|sideboard|consider|wishlist|token/.test(c))) continue;
      const name = entry.card?.oracleCard?.name;
      if (name) names.push(`${entry.quantity ?? 1} ${name}`);
    }
    const sha = names.length ? createHash("sha256").update(names.sort().join("\n")).digest("hex") : null;
    lists.push({ ...row, nNames: names.length, sha256: sha, archidektId: id });
    await sleep(DELAY_MS);
  }

  const usable = lists.filter((d) => d.nNames >= 90 && d.sha256);
  const report = {
    version: "deck-rating-playgroup-public-decks-v1",
    attribution: "Playgroup.gg · CC-BY 4.0 · snapshot 2026-09-25. Public API User-Agent CardsDeckRatingSnapshot/1.0; 180ms between calls (under 400/min).",
    enumerator: {
      method:
        "Sitemap lists every public profile/deck URL (91,453 deck ids, 25,759 profiles). Census = GET /users/{id}/decks for each sitemap profile, plus GET /decks/{id} for commander top_decks so public decks on private profiles still enter.",
      topDecksBias: "Commander top_decks are five result-selected lists and are not the fit set.",
      moxfield:
        "Moxfield has no official public API. Terms/FAQ are JS-gated (403 without a browser). Community api2.moxfield.com is Cloudflare-locked; support says email for non-commercial access. Archidekt-only for v1.",
      podSize: "Deck payload has no pod-size / player-count field. games_won and games_lost are unscoped. Mix not reportable from this endpoint.",
      noise: [
        "One public deck is basically one pilot.",
        "Today's linked list may differ from the list the recorded games were played with.",
      ],
    },
    n: {
      commanders: commanders.length,
      sitemapProfiles: profileIds.length,
      uniqueDecksSeen: seen.size,
      withDecklistUrl: withList.length,
      hosts,
      ge10WithList: usableMeta.length,
      ge10Archidekt: archidekt.length,
      ge10MoxfieldSkipped: moxfield.length,
      usableArchidektLists: usable.length,
    },
    usable,
  };
  const dest = join(outDir, "usable-archidekt-v1.json");
  writeJson(dest, report);
  writeJson(join(outDir, "summary.json"), {
    ...report,
    usable: undefined,
    dest,
    sha256: sha256Bytes(JSON.stringify(report.n)),
  });
  return { dest, n: report.n };
}

if (require.main === module) {
  enumeratePlaygroupPublicDecks()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
