import { createHash } from "node:crypto";
import { getAdminFirestore } from "../firebase/admin";
import { JustTcgErrorV1, justTcgConfiguredV1, justTcgSearchV1, type JustTcgCardV1 } from "../pricing/justtcg-client";
import {
  cardNameVariantsV1,
  coreCardNumberV1,
  foldCardNameV1,
  setWordsV1,
  storeRowKeyV1,
  type ResolvedProductV1,
  type StoreListRowV1,
} from "./combined-list";

const GAMES: Array<[RegExp, string]> = [
  [/magic/i, "magic-the-gathering"],
  [/pok[eé]mon.*jap|jap.*pok[eé]mon/i, "pokemon-japan"],
  [/pok[eé]mon/i, "pokemon"],
  [/yu-?gi-?oh/i, "yugioh"],
  [/lorcana/i, "disney-lorcana"],
  [/one piece/i, "one-piece-card-game"],
  [/digimon/i, "digimon-card-game"],
  [/flesh and blood/i, "flesh-and-blood-tcg"],
  [/star wars/i, "star-wars-unlimited"],
  [/dragon ball.*fusion/i, "dragon-ball-super-fusion-world"],
  [/dragon ball/i, "dragon-ball-super-masters"],
  [/grand archive/i, "grand-archive-tcg"],
  [/sorcery/i, "sorcery-contested-realm"],
  [/gundam/i, "gundam-card-game"],
  [/union arena/i, "union-arena"],
  [/universus/i, "universus"],
  [/riftbound/i, "riftbound-league-of-legends-trading-card-game"],
];

/** Starter plan allows 50 requests a minute. */
const MIN_GAP_MS = 1_300;
/** Saved lookups, so combining a sheet again searches only what's new. */
const LOOKUPS_COLLECTION = "justtcgNameLookups";
/** A miss is retried after this long, in case the card was added since. */
const MISS_TTL_MS = 7 * 24 * 3600_000;

type SavedLookupV1 = { result: ResolvedProductV1 | null; at: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const docId = (key: string) => createHash("sha1").update(key).digest("hex");

async function loadSaved(keys: string[]): Promise<Map<string, ResolvedProductV1 | null>> {
  const out = new Map<string, ResolvedProductV1 | null>();
  const db = getAdminFirestore();
  if (!keys.length || !db) return out;
  const refs = keys.map((k) => db.collection(LOOKUPS_COLLECTION).doc(docId(k)));
  for (let i = 0; i < refs.length; i += 300) {
    const snaps = await db.getAll(...refs.slice(i, i + 300));
    snaps.forEach((snap, j) => {
      if (!snap.exists) return;
      const saved = snap.data() as SavedLookupV1;
      if (!saved.result && Date.now() - Date.parse(saved.at) > MISS_TTL_MS) return;
      out.set(keys[i + j]!, saved.result ?? null);
    });
  }
  return out;
}

type SearchRowV1 = { productName: string; setName: string; number: string };

function pickHit(row: StoreListRowV1, hits: JustTcgCardV1[]): ResolvedProductV1 | null {
  const card = pickHitCardV1(row, hits);
  return "reason" in card ? null : { tcgplayerId: String(card.tcgplayerId), setName: card.set_name || row.setName };
}

/** The one search hit that is this card, or why none is. */
function pickHitCardV1(row: SearchRowV1, hits: JustTcgCardV1[]): JustTcgCardV1 | { reason: string } {
  const wanted = new Set(cardNameVariantsV1(row.productName));
  const named = hits.filter(
    (h) => h.tcgplayerId && cardNameVariantsV1(h.name).some((v) => wanted.has(v)),
  );
  if (!named.length) return { reason: "JustTCG has no card by this name" };
  const exactName = named.filter((h) => foldCardNameV1(h.name) === foldCardNameV1(row.productName));
  const pool = exactName.length ? exactName : named;

  const words = setWordsV1(row.setName);
  const core = coreCardNumberV1(row.number);
  const scored = pool.map((h) => {
    const hWords = setWordsV1(h.set_name ?? "");
    const overlap = words.size ? [...words].filter((w) => hWords.has(w)).length / words.size : 0;
    const sameSet = row.setName !== "" && norm(h.set_name ?? "") === norm(row.setName);
    const sameNumber = core !== "" && (h.number ?? "").split("//").some((n) => coreCardNumberV1(n) === core);
    const supported = sameNumber || sameSet || overlap === 1 || (!row.number && !row.setName && pool.length === 1);
    return { h, supported, score: (sameSet ? 4 : 0) + overlap * 2 + (sameNumber ? 3 : 0) };
  }).filter((x) => x.supported);
  if (!scored.length) {
    const sets = [...new Set(pool.map((h) => `${h.set_name ?? "?"} #${h.number ?? "?"}`))].slice(0, 3);
    return { reason: `JustTCG lists this name only in ${sets.join(", ")}; check the set and number` };
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]!;
  const tied = scored.filter((x) => x.score === best.score && x.h.tcgplayerId !== best.h.tcgplayerId);
  if (tied.length) {
    const sets = [best, ...tied].map((x) => `${x.h.set_name ?? "?"} #${x.h.number ?? "?"}`).slice(0, 3);
    return { reason: `More than one printing fits: ${sets.join(", ")}` };
  }
  return best.h;
}

export type UnpricedSearchRowV1 = SearchRowV1 & { key: string; productLine: string; condition: string };
export type PricedBySearchV1 = { tcgplayerId: string; card: JustTcgCardV1 };

/**
 * Cards JustTCG returned nothing for by id: searches by name the way staff
 * would, so a wrong or unknown id gets corrected and the card priced. Each
 * row left over says why.
 */
export async function searchUnpricedRowsV1(
  rows: UnpricedSearchRowV1[],
  opts: { maxRequests: number; deadline: number },
): Promise<{ found: Map<string, PricedBySearchV1>; reasons: Map<string, string>; searched: number }> {
  const found = new Map<string, PricedBySearchV1>();
  const reasons = new Map<string, string>();
  if (!justTcgConfiguredV1()) return { found, reasons, searched: 0 };
  const gameOf = (row: UnpricedSearchRowV1) => GAMES.find(([re]) => re.test(row.productLine))?.[1];
  let requests = 0;
  let lastAt = 0;
  const search = async (q: string, game: string | undefined) => {
    const wait = lastAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    requests += 1;
    return justTcgSearchV1({ q, game, limit: 20 });
  };
  for (const row of rows) {
    if (requests >= opts.maxRequests || Date.now() > opts.deadline) {
      reasons.set(row.key, "Not searched yet (lookup limit); combine again");
      continue;
    }
    try {
      const game = gameOf(row);
      const q = row.productName.replace(/\s*\([^)]*\)/g, "").trim();
      let hits = await search(q, game);
      let pick = pickHitCardV1(row, hits);
      // TCGplayer lists alternate-name printings as "Alt Name - Real Name"; JustTCG may use either half.
      if ("reason" in pick && / - /.test(q)) {
        for (const part of q.split(/\s+-\s+/)) {
          if (requests >= opts.maxRequests) break;
          hits = [...hits, ...(await search(part, game))];
          pick = pickHitCardV1(row, hits);
          if (!("reason" in pick)) break;
        }
      }
      if ("reason" in pick) reasons.set(row.key, pick.reason);
      else found.set(row.key, { tcgplayerId: String(pick.tcgplayerId), card: pick });
    } catch (err) {
      if (err instanceof JustTcgErrorV1 && err.status === 400) {
        reasons.set(row.key, "JustTCG could not search this name");
        continue;
      }
      reasons.set(row.key, `JustTCG search failed: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
  }
  return { found, reasons, searched: requests };
}

/**
 * Looks shelf rows up by name in JustTCG, which uses TCGplayer's own product
 * names and covers tokens, emblems and non-Magic games that the Scryfall
 * catalog can't place.
 */
export async function searchUnmatchedStoreRowsV1(
  rows: StoreListRowV1[],
  opts: { maxRequests: number; deadlineMs: number },
): Promise<{ resolved: Map<string, ResolvedProductV1>; searched: number; skipped: number }> {
  const resolved = new Map<string, ResolvedProductV1>();
  if (!justTcgConfiguredV1() || !rows.length) return { resolved, searched: 0, skipped: rows.length };

  const deadline = Date.now() + opts.deadlineMs;
  const gameOf = (row: StoreListRowV1) => GAMES.find(([re]) => re.test(row.productLine))?.[1];
  const keyOf = (row: StoreListRowV1) =>
    [gameOf(row) ?? "", foldCardNameV1(row.productName), norm(row.setName), coreCardNumberV1(row.number)].join("|");
  const cache = await loadSaved([...new Set(rows.map(keyOf))]).catch((err: unknown) => {
    console.warn("[combined-import] saved lookups unavailable:", err);
    return new Map<string, ResolvedProductV1 | null>();
  });
  const db = getAdminFirestore();
  const writer = db?.bulkWriter() ?? null;
  let requests = 0;
  let skipped = 0;
  let lastAt = 0;
  for (const row of rows) {
    const game = gameOf(row);
    const cacheKey = keyOf(row);
    if (cache.has(cacheKey)) {
      const hit = cache.get(cacheKey);
      if (hit) resolved.set(storeRowKeyV1(row), hit);
      continue;
    }
    if (requests >= opts.maxRequests || Date.now() > deadline) {
      skipped += 1;
      continue;
    }
    const wait = lastAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastAt = Date.now();
    requests += 1;
    try {
      const q = row.productName.replace(/\s*\([^)]*\)/g, "").trim();
      let hits = await justTcgSearchV1({ q, game, limit: 20 });
      // "Alt Name - Real Name" can be listed under either half.
      if (!pickHit(row, hits) && / - /.test(q)) {
        for (const part of q.split(/\s+-\s+/)) {
          if (requests >= opts.maxRequests) break;
          await sleep(MIN_GAP_MS);
          requests += 1;
          hits = [...hits, ...(await justTcgSearchV1({ q: part, game, limit: 20 }))];
          if (pickHit(row, hits)) break;
        }
      }
      const found = pickHit(row, hits);
      cache.set(cacheKey, found);
      const saved: SavedLookupV1 = { result: found, at: new Date().toISOString() };
      if (db && writer) void writer.set(db.collection(LOOKUPS_COLLECTION).doc(docId(cacheKey)), { ...saved, key: cacheKey });
      if (found) resolved.set(storeRowKeyV1(row), found);
    } catch (err) {
      if (err instanceof JustTcgErrorV1 && err.status === 400) continue;
      console.warn("[combined-import] JustTCG search stopped:", err);
      skipped += rows.length - rows.indexOf(row);
      break;
    }
  }
  await writer?.close().catch((err: unknown) => console.warn("[combined-import] saving lookups failed:", err));
  return { resolved, searched: requests, skipped };
}
