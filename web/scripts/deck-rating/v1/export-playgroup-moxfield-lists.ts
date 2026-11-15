#!/usr/bin/env npx tsx
/**
 * Export Moxfield-linked Playgroup decks (≥10 games) from Playgroup /cards
 * pages. Does not contact Moxfield.
 *
 *   cd web && npx --yes tsx scripts/deck-rating/v1/export-playgroup-moxfield-lists.ts
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { classifyCommanderBracketV1 } from "../../../src/lib/commander-bracket-rubric/v1";
import { loadComboBracketTagsV1 } from "../../../src/lib/commander-bracket-rubric/v1/combo-bracket-tags";
import { comboSummaryFromArchitecture } from "../../../src/lib/commander-bracket-rubric/v1/detectors";
import type {
  BracketRubricCard,
  BracketRubricComboSet,
  BracketRubricComboSummary,
} from "../../../src/lib/commander-bracket-rubric/v1";
import { architectureFromHits } from "../../../src/lib/commander-optimization-score/v1/architecture-from-hits";
import type { CosV1CompiledVariant } from "../../../src/lib/commander-optimization-score/v1/detect";
import { loadSpellbookComboArtifacts } from "../../../src/lib/commander-optimization-score/v1/load-artifacts";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../../../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { resolveOracleName } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { decodeHtml, ensureDir, fetchText, sha256Bytes, sleep, snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

const DELAY_MS = 220;
const MIN_GAMES = 10;
const MIN_RESOLVED = 95;
const UA_NOTE = "CardsDeckRatingSnapshot/1.0 (personal research; local dated hashes)";

type DeckRec = {
  id: number;
  name?: string;
  user_id?: number;
  decklist_url?: string | null;
  bracket?: number | null;
  games_won?: number;
  games_lost?: number;
  commander?: { id?: number; name?: string };
  source?: string;
};

type Candidate = {
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
  source: string;
};

type CachedList = {
  playgroupId: number;
  playgroupCardsUrl: string | null;
  nNames: number;
  sha256: string | null;
  cards: Array<{ name: string; quantity: number }>;
  emptyReason: string | null;
};

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function blocked(status: number, text: string): string | null {
  if (status === 403) return "403";
  if (status === 429) return "429";
  if (/just a moment|attention required|cf-challenge|cf-browser-verification|checking your browser/i.test(text)) {
    return "challenge-page";
  }
  return null;
}

function parseCards(html: string): Array<{ name: string; quantity: number }> {
  const cards: Array<{ name: string; quantity: number }> = [];
  const re = /data-card-name='([^']+)'[^>]*data-quantity='(\d+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const name = decodeHtml(m[1] ?? "").trim();
    const quantity = Number(m[2] ?? 1) || 1;
    if (name) cards.push({ name, quantity });
  }
  return cards;
}

function listSha(cards: Array<{ name: string; quantity: number }>): string | null {
  if (!cards.length) return null;
  const lines = cards.map((c) => `${c.quantity} ${c.name}`).sort();
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

async function loadCandidates(jsonl: string): Promise<Candidate[]> {
  const rl = createInterface({ input: createReadStream(jsonl, { encoding: "utf8" }) });
  const out: Candidate[] = [];
  const seen = new Set<number>();
  for await (const line of rl) {
    if (!line.trim()) continue;
    const d = JSON.parse(line) as DeckRec;
    const url = String(d.decklist_url ?? "");
    if (!d.id || seen.has(d.id) || hostOf(url) !== "moxfield.com") continue;
    const gamesWon = Number(d.games_won ?? 0);
    const gamesLost = Number(d.games_lost ?? 0);
    const games = gamesWon + gamesLost;
    if (games < MIN_GAMES) continue;
    seen.add(d.id);
    out.push({
      playgroupId: d.id,
      name: String(d.name ?? ""),
      commander: d.commander?.name ?? "",
      commanderId: d.commander?.id ?? null,
      userId: d.user_id ?? null,
      gamesWon,
      gamesLost,
      games,
      label: games ? gamesWon / games : 0,
      bracket: d.bracket ?? null,
      decklistUrl: url,
      source: d.source ?? "",
    });
  }
  return out;
}

async function exportOne(row: Candidate, cachePath: string): Promise<CachedList> {
  if (existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, "utf8")) as CachedList;
  const landing = await fetchText(`https://playgroup.gg/decks/${row.playgroupId}`);
  const stop = blocked(landing.status, landing.text);
  if (stop) throw Object.assign(new Error(`blocked:${stop}`), { blocked: stop, url: landing.finalUrl });
  const landingUrl = landing.finalUrl.replace(/\/+$/, "");
  const publicDeck = /\/profiles\/\d+[^/]*\/decks\/\d+/i.test(landingUrl);
  if (!publicDeck) {
    const empty: CachedList = {
      playgroupId: row.playgroupId,
      playgroupCardsUrl: null,
      nNames: 0,
      sha256: null,
      cards: [],
      emptyReason: landing.status === 404 ? "playgroup-404" : "no-public-deck-page",
    };
    writeJson(cachePath, empty);
    return empty;
  }
  const cardsUrl = landingUrl.endsWith("/cards") ? landingUrl : `${landingUrl}/cards`;
  await sleep(DELAY_MS);
  const page = landingUrl.endsWith("/cards") ? landing : await fetchText(cardsUrl);
  const stopPage = blocked(page.status, page.text);
  if (stopPage) throw Object.assign(new Error(`blocked:${stopPage}`), { blocked: stopPage, url: page.finalUrl });
  const cards = parseCards(page.text);
  const cached: CachedList = {
    playgroupId: row.playgroupId,
    playgroupCardsUrl: page.finalUrl,
    nNames: cards.length,
    sha256: listSha(cards),
    cards,
    emptyReason: cards.length ? null : "playgroup-page-has-no-imported-list",
  };
  writeJson(cachePath, cached);
  return cached;
}


function classifyList(
  cards: BracketRubricCard[],
  gcSet: Set<string>,
  byFirst: Map<string, CosV1CompiledVariant[]>,
  comboIndex: Awaited<ReturnType<typeof loadSpellbookComboArtifacts>>["comboIndex"],
  tags: ReturnType<typeof loadComboBracketTagsV1>,
): 2 | 3 | 4 {
  const present = new Set(cards.map((c) => c.oracleId));
  const commanderOracleIds = new Set(cards.filter((c) => c.isCommander).map((c) => c.oracleId));
  const hits: Array<{ cardSetSignature: string; commanderInvolved: boolean }> = [];
  const seen = new Set<string>();
  for (const oracleId of present) {
    for (const variant of byFirst.get(oracleId) ?? []) {
      if (seen.has(variant.cardSetSignature)) continue;
      if (variant.requiredOracleIds.some((id) => !present.has(id))) continue;
      seen.add(variant.cardSetSignature);
      hits.push({
        cardSetSignature: variant.cardSetSignature,
        commanderInvolved:
          variant.requiredOracleIds.some((id) => commanderOracleIds.has(id)) ||
          (variant.mustBeCommanderOracleIds ?? []).some((id) => present.has(id)),
      });
    }
  }
  const architecture = architectureFromHits(hits, comboIndex, hits.length);
  const summary = comboSummaryFromArchitecture(architecture);
  const nameByOracleId = new Map(cards.map((c) => [c.oracleId, c.name] as const));
  const comboSets: BracketRubricComboSet[] = [];
  for (const hit of hits) {
    const row = comboIndex.get(hit.cardSetSignature);
    if (!row) continue;
    const tagRow = tags.get(hit.cardSetSignature);
    comboSets.push({
      cardCount: row.comboCardCount,
      cards: hit.cardSetSignature
        .split("|")
        .filter(Boolean)
        .map((oracleId) => ({ oracleId, name: nameByOracleId.get(oracleId) ?? oracleId })),
      winsOnResolution: row.isTerminalRoute,
      bracketTag: tagRow?.tag ?? null,
      requiresUnsatisfiedTemplate: (tagRow?.nTemplates ?? row.nTemplates ?? 0) > 0,
    });
  }
  const live = comboSets.filter((set) => !set.requiresUnsatisfiedTemplate);
  const combos: BracketRubricComboSummary = {
    ...summary,
    twoCardCombos: live.filter((s) => s.cardCount === 2).length,
    totalCombos: live.length,
    comboSets,
  };
  const assigned = classifyCommanderBracketV1({ cards, gameChangerOracleIds: gcSet, combos }).assignedBracket;
  if (assigned === 1 || assigned === 2) return 2;
  if (assigned === 3) return 3;
  return 4;
}

function invertCompiled(compiled: CosV1CompiledVariant[]): Map<string, CosV1CompiledVariant[]> {
  const index = new Map<string, CosV1CompiledVariant[]>();
  for (const variant of compiled) {
    const key = variant.requiredOracleIds[0];
    if (!key) continue;
    const list = index.get(key);
    if (list) list.push(variant);
    else index.set(key, [variant]);
  }
  return index;
}


function norm(s: string): string {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

export async function exportPlaygroupMoxfieldLists(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const outDir = ensureDir(join(snap, "playgroup", "public-decks", "moxfield-from-playgroup"));
  const listDir = ensureDir(join(outDir, "lists"));
  const jsonl = join(snap, "playgroup", "public-decks", "all-public-decks-v1.jsonl");
  const candidates = await loadCandidates(jsonl);
  writeJson(join(outDir, "candidates-v1.json"), {
    version: "deck-rating-playgroup-moxfield-candidates-v1",
    n: candidates.length,
    uniqueDecklistUrls: new Set(candidates.map((c) => c.decklistUrl.split("?")[0]!.replace(/\/+$/, ""))).size,
    attribution:
      "Playgroup.gg · CC-BY 4.0 · snapshot 2026-09-25. Candidate set is the public Playgroup census. list source: Moxfield (public decks). Lists are read from Playgroup public /cards pages; Moxfield is not contacted.",
    candidates: candidates.map((c) => ({
      playgroupId: c.playgroupId,
      games: c.games,
      commander: c.commander,
      decklistUrl: c.decklistUrl,
    })),
  });
  console.log(`Playgroup Moxfield-linked ≥10 games: ${candidates.length}`);

  const progressPath = join(outDir, "progress.json");
  let fetched = 0;
  let withList = 0;
  for (let i = 0; i < candidates.length; i += 1) {
    const row = candidates[i]!;
    const cachePath = join(listDir, `${row.playgroupId}.json`);
    const cachedAlready = existsSync(cachePath);
    const cached = await exportOne(row, cachePath);
    fetched += 1;
    if (cached.nNames) withList += 1;
    if (i % 25 === 0 || i === candidates.length - 1) {
      writeJson(progressPath, { i, fetched, withList, total: candidates.length });
      console.log(`Playgroup /cards ${i + 1}/${candidates.length} withList ${withList}`);
    }
    if (!cachedAlready && i < candidates.length - 1) await sleep(DELAY_MS);
  }

  const oracle = await loadSnapshotOracleNameMap(snap);
  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const { comboIndex, compiled } = await loadSpellbookComboArtifacts();
  const tags = loadComboBracketTagsV1();
  const byFirst = invertCompiled(compiled);

  const funnel = {
    candidates: candidates.length,
    playgroupPagesWithList: 0,
    below95: 0,
    illegal: 0,
    noMeasuredFloor: 0,
    usable: 0,
  };
  const usable: Array<Record<string, unknown>> = [];
  for (const row of candidates) {
    const cached = JSON.parse(readFileSync(join(listDir, `${row.playgroupId}.json`), "utf8")) as CachedList;
    if (!cached.cards.length) continue;
    funnel.playgroupPagesWithList += 1;
    const rubric: BracketRubricCard[] = [];
    const ids = new Set<string>();
    let illegal: "banned" | "not_legal" | null = null;
    const cmd = norm(row.commander);
    for (const entry of cached.cards) {
      const resolvedId = resolveOracleName(oracle, entry.name)?.oracleId ?? null;
      if (!resolvedId) continue;
      const info = oracle.byId.get(resolvedId);
      if (!info) continue;
      if (/\b(token|emblem|sticker)\b/i.test(info.typeLine) && info.commanderLegal !== "legal") continue;
      if (info.commanderLegal === "banned") illegal = illegal ?? "banned";
      else if (info.commanderLegal !== "legal") illegal = illegal ?? "not_legal";
      ids.add(resolvedId);
      rubric.push({
        oracleId: resolvedId,
        name: info.name,
        typeLine: info.typeLine,
        oracleText: info.text,
        quantity: entry.quantity,
        isCommander: cmd !== "" && (norm(info.name) === cmd || norm(info.name.split(" // ")[0]!) === cmd),
      });
    }
    if (illegal) {
      funnel.illegal += 1;
      continue;
    }
    if (ids.size < MIN_RESOLVED) {
      funnel.below95 += 1;
      continue;
    }
    const measured = classifyList(rubric, gcSet, byFirst, comboIndex, tags);
    if (measured !== 2 && measured !== 3 && measured !== 4) {
      funnel.noMeasuredFloor += 1;
      continue;
    }
    funnel.usable += 1;
    usable.push({
      playgroupId: row.playgroupId,
      name: row.name,
      commander: row.commander,
      commanderId: row.commanderId,
      userId: row.userId,
      gamesWon: row.gamesWon,
      gamesLost: row.gamesLost,
      games: row.games,
      label: row.label,
      bracket: row.bracket,
      decklistUrl: row.decklistUrl,
      host: "moxfield.com",
      playgroupCardsUrl: cached.playgroupCardsUrl,
      nNames: cached.nNames,
      resolvedUnique: ids.size,
      measured,
      sha256: cached.sha256,
      source: row.source,
    });
  }

  const archidektPath = join(snap, "playgroup", "public-decks", "usable-archidekt-v1.json");
  const archidektN = existsSync(archidektPath)
    ? Number(
        (JSON.parse(readFileSync(archidektPath, "utf8")) as { n?: { usableArchidektLists?: number } }).n
          ?.usableArchidektLists ?? 0,
      )
    : 0;
  const combined = archidektN + funnel.usable;
  const report = {
    version: "deck-rating-playgroup-moxfield-from-playgroup-v1",
    attribution:
      "Playgroup.gg · CC-BY 4.0 · snapshot 2026-09-25. Public pages User-Agent CardsDeckRatingSnapshot/1.0. list source: Moxfield (public decks). Card names were read from Playgroup public deck /cards pages for census rows whose decklist_url is a public Moxfield deck. Moxfield.com was not contacted.",
    enumerator: {
      method:
        "Census rows with host moxfield.com and games_won+games_lost ≥ 10. GET playgroup.gg/decks/{id} then the public /cards page. Cache per playgroup id; never re-fetch a cached list.",
      boards: "Playgroup /cards pages show the imported playable list (no maybeboard/sideboard sections on the page).",
      noise: [
        "One public deck is basically one pilot.",
        "Today's linked list may differ from the list the recorded games were played with.",
        "Many Moxfield-linked Playgroup decks have no imported 99 on the /cards page.",
      ],
    },
    filters: {
      minGames: MIN_GAMES,
      minResolvedUnique: MIN_RESOLVED,
      legalNow: "banned or not_legal on remaining cards fails; tokens without commander-legal status dropped",
      measuredFloor: "classifyCommanderBracketV1 floor in {2,3,4}",
    },
    n: {
      ge10MoxfieldLinked: candidates.length,
      ...funnel,
      usableArchidektLists: archidektN,
      usableCombined: combined,
      thousandsGate: combined >= 1000,
    },
    usable,
  };
  const dest = join(outDir, "usable-moxfield-v1.json");
  writeJson(dest, report);
  const slim = {
    ...report,
    usable: undefined,
    dest,
    sha256: sha256Bytes(JSON.stringify({ n: report.n, ids: usable.map((u) => u.playgroupId) })),
    userAgent: UA_NOTE,
  };
  writeJson(join(outDir, "summary.json"), slim);
  writeJson(join(snap, "playgroup", "api", "moxfield-from-playgroup-count-v1.json"), {
    version: slim.version,
    attribution: report.attribution,
    n: report.n,
    sha256: slim.sha256,
  });
  return slim;
}

if (require.main === module) {
  exportPlaygroupMoxfieldLists()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      const blockedAt = (err as { blocked?: string; url?: string }).blocked;
      if (blockedAt) {
        console.error(JSON.stringify({ stopped: true, blocked: blockedAt, url: (err as { url?: string }).url }));
        process.exit(2);
      }
      console.error(err);
      process.exit(1);
    });
}
