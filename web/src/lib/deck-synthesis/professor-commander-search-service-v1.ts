/**
 * Commander picker browse + search for Professor setup.
 *
 * The universe of commanders is the commander-eligible card catalog, never the
 * EDHREC popularity list. EDHREC covers only the few hundred most-played
 * commanders, so using it to decide existence hid roughly 2,800 legal
 * commanders — Raffine, Radagast the Brown and Atraxa, Grand Unifier among
 * them. EDHREC rank now only orders results, so popular commanders still lead
 * the browse list and win ties within a search.
 */
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import type { EdhrecCommanderMeta } from "@/lib/deck-builder/types";
import { commanderNameToSlug } from "@/lib/deck-builder/edhrec-client";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import {
  getCommanderSearchCatalogRuntime,
  isPaperEligibleCommanderNameFast,
  type CommanderSearchCatalogV1,
} from "./professor-commander-search-catalog-v1";

export type ProfessorCommanderSearchResultV1 = {
  slug: string;
  name: string;
  rank?: number;
  oracleId?: string;
  scryfallId?: string;
  colorIdentity?: string[];
  themes?: string[];
  /** True when the catalog is the only source — no EDHREC row, so no rank. */
  fromCatalog?: boolean;
};

/** EDHREC rows are fetched only for their rank; the collection holds ~470. */
const EDHREC_RANK_FETCH_LIMIT = 2500;
/**
 * The empty-query browse list is a shop window, not the whole pool. Shipping
 * all 3,200+ commanders would be a multi-hundred-kilobyte response on every
 * page load, and both callers render at most 48 of them. Anything past the
 * window is reached by searching.
 */
const COMMANDER_BROWSE_LIMIT = 250;
const COMMANDER_SEARCH_LIMIT = 50;

const UNRANKED = Number.MAX_SAFE_INTEGER;

type CommanderIndexEntryV1 = {
  /** Punctuation- and space-free name, so "lord xander" matches "Lord Xander," */
  key: string;
  /** Lowercased word tokens, so "seer" finds "Raffine, Scheming Seer". */
  words: string[];
  rank: number;
  result: ProfessorCommanderSearchResultV1;
};

type CommanderIndexV1 = {
  entries: CommanderIndexEntryV1[];
  browse: ProfessorCommanderSearchResultV1[];
  poolSize: number;
};

let indexCache: CommanderIndexV1 | null = null;
let indexPromise: Promise<CommanderIndexV1> | null = null;

/**
 * EDHREC slugs use the front face alone ("alrund-god-of-the-cosmos"), so a
 * generated slug for a modal card must drop everything after the "//".
 */
function frontFaceName(name: string): string {
  const [front] = name.split("//");
  return (front ?? name).trim() || name;
}

function wordTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function edhrecRankByName(commanders: EdhrecCommanderMeta[]): Map<string, EdhrecCommanderMeta> {
  const byName = new Map<string, EdhrecCommanderMeta>();
  for (const meta of commanders) {
    const key = normalizeOracleName(meta.commanderName);
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || (meta.rank ?? UNRANKED) < (existing.rank ?? UNRANKED)) {
      byName.set(key, meta);
    }
  }
  return byName;
}

/** Popular first, then alphabetical, so the browse window is recognisable. */
function compareForBrowse(a: CommanderIndexEntryV1, b: CommanderIndexEntryV1): number {
  return a.rank - b.rank || a.result.name.localeCompare(b.result.name, undefined, { sensitivity: "base" });
}

function buildIndex(
  catalog: CommanderSearchCatalogV1,
  edhrecCommanders: EdhrecCommanderMeta[],
): CommanderIndexV1 {
  const edhrecByName = edhrecRankByName(edhrecCommanders);
  const entries: CommanderIndexEntryV1[] = [];
  const seen = new Set<string>();

  for (const card of catalog.byOracleId.values()) {
    const name = card.canonicalName;
    if (!name) continue;
    const key = normalizeOracleName(name);
    if (!key || seen.has(key)) continue;
    // The paper gate is the catalog's, unchanged: it keeps digital-only cards
    // and partner/background-only cards out of the sole-commander pool.
    if (!isPaperEligibleCommanderNameFast(catalog, name)) continue;
    seen.add(key);

    const meta = edhrecByName.get(key);
    entries.push({
      key,
      words: wordTokens(name),
      rank: meta?.rank ?? UNRANKED,
      result: {
        slug: meta?.commanderSlug ?? commanderNameToSlug(frontFaceName(name)),
        name,
        rank: meta?.rank,
        oracleId: card.oracleId,
        scryfallId: meta?.scryfallId,
        colorIdentity: [...(card.colorIdentity ?? [])],
        themes: meta?.themes?.map((theme) => theme.label) ?? [],
        fromCatalog: !meta,
      },
    });
  }

  entries.sort(compareForBrowse);
  return {
    entries,
    browse: entries.slice(0, COMMANDER_BROWSE_LIMIT).map((entry) => entry.result),
    poolSize: entries.length,
  };
}

async function getCommanderIndexV1(): Promise<CommanderIndexV1> {
  if (indexCache) return indexCache;
  if (indexPromise) return indexPromise;

  indexPromise = (async () => {
    const [edhrecCommanders, catalog] = await Promise.all([
      deckBuilderStore.listEdhrecCommanders(EDHREC_RANK_FETCH_LIMIT),
      getCommanderSearchCatalogRuntime(),
    ]);
    indexCache = buildIndex(catalog, edhrecCommanders);
    return indexCache;
  })();

  try {
    return await indexPromise;
  } finally {
    indexPromise = null;
  }
}

export async function warmProfessorCommanderBrowseCacheV1(): Promise<ProfessorCommanderSearchResultV1[]> {
  return (await getCommanderIndexV1()).browse;
}

/**
 * Lower is better. Ordered by how the match was made rather than by string
 * distance, so someone typing "atraxa" gets both Atraxas and someone typing
 * "seer" gets Raffine, Scheming Seer rather than an arbitrary substring hit.
 */
function matchTier(entry: CommanderIndexEntryV1, query: string): number | null {
  if (entry.key === query) return 0;
  if (entry.key.startsWith(query)) return 1;
  if (entry.words.some((word) => word.startsWith(query))) return 2;
  if (entry.key.includes(query)) return 3;
  return null;
}

export type ProfessorCommanderSearchPageV1 = {
  results: ProfessorCommanderSearchResultV1[];
  /** Matches in the whole pool, which may exceed the number returned. */
  total: number;
};

function searchIndex(index: CommanderIndexV1, query: string): ProfessorCommanderSearchPageV1 {
  const key = normalizeOracleName(query);
  if (!key) return { results: index.browse, total: index.poolSize };

  const matches: Array<{ tier: number; entry: CommanderIndexEntryV1 }> = [];
  for (const entry of index.entries) {
    const tier = matchTier(entry, key);
    if (tier !== null) matches.push({ tier, entry });
  }

  matches.sort(
    (a, b) =>
      a.tier - b.tier ||
      // EDHREC rank breaks ties, so "Atraxa" leads with Praetors' Voice.
      a.entry.rank - b.entry.rank ||
      // Then the shorter name, the more likely intent for an unranked pair.
      a.entry.key.length - b.entry.key.length ||
      a.entry.result.name.localeCompare(b.entry.result.name, undefined, { sensitivity: "base" }),
  );

  return {
    results: matches.slice(0, COMMANDER_SEARCH_LIMIT).map(({ entry }) => entry.result),
    total: matches.length,
  };
}

export async function searchProfessorCommandersV1(query: string): Promise<ProfessorCommanderSearchPageV1> {
  return searchIndex(await getCommanderIndexV1(), query);
}

/** Exposed for auditing how complete the picker's universe actually is. */
export async function getProfessorCommanderPoolSizeV1(): Promise<number> {
  return (await getCommanderIndexV1()).poolSize;
}

/** Test seam — build an index from an injected catalog, then search it. */
export function buildProfessorCommanderIndexForTest(
  catalog: CommanderSearchCatalogV1,
  edhrecCommanders: EdhrecCommanderMeta[],
): CommanderIndexV1 {
  return buildIndex(catalog, edhrecCommanders);
}

export function searchProfessorCommanderIndexForTest(
  index: CommanderIndexV1,
  query: string,
): ProfessorCommanderSearchPageV1 {
  return searchIndex(index, query);
}

export function clearProfessorCommanderBrowseCacheForTest(): void {
  indexCache = null;
  indexPromise = null;
}
