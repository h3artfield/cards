/**
 * Cached paper-eligible commander browse list for Professor setup.
 */
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import type { EdhrecCommanderMeta } from "@/lib/deck-builder/types";
import { commanderNameToSlug } from "@/lib/deck-builder/edhrec-client";
import {
  getCommanderSearchCatalogRuntime,
  isPaperEligibleCommanderNameFast,
  type CommanderSearchCatalogV1,
} from "./professor-commander-search-catalog-v1";

export type ProfessorCommanderSearchResultV1 = {
  slug: string;
  name: string;
  rank?: number;
  scryfallId?: string;
  colorIdentity?: string[];
  themes?: string[];
  imageUrl?: string;
  fromCatalog?: boolean;
};

const COMMANDER_BROWSE_LIMIT = 2500;
const COMMANDER_SEARCH_LIMIT = 50;

let browseCache: ProfessorCommanderSearchResultV1[] | null = null;
let browseCachePromise: Promise<ProfessorCommanderSearchResultV1[]> | null = null;

function mapEdhrecCommander(c: EdhrecCommanderMeta): ProfessorCommanderSearchResultV1 {
  return {
    slug: c.commanderSlug,
    name: c.commanderName,
    rank: c.rank,
    scryfallId: c.scryfallId,
    colorIdentity: c.colorIdentity,
    themes: c.themes?.map((theme) => theme.name) ?? [],
  };
}

function sortCommandersAlpha(results: ProfessorCommanderSearchResultV1[]): ProfessorCommanderSearchResultV1[] {
  return [...results].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

function filterPaperEligible(
  catalog: CommanderSearchCatalogV1,
  results: ProfessorCommanderSearchResultV1[],
): ProfessorCommanderSearchResultV1[] {
  return results.filter((result) => isPaperEligibleCommanderNameFast(catalog, result.name));
}

export async function warmProfessorCommanderBrowseCacheV1(): Promise<ProfessorCommanderSearchResultV1[]> {
  if (browseCache) return browseCache;
  if (browseCachePromise) return browseCachePromise;

  browseCachePromise = (async () => {
    const [commanders, catalog] = await Promise.all([
      deckBuilderStore.listEdhrecCommanders(COMMANDER_BROWSE_LIMIT),
      getCommanderSearchCatalogRuntime(),
    ]);
    browseCache = sortCommandersAlpha(
      filterPaperEligible(catalog, commanders.map(mapEdhrecCommander)),
    );
    return browseCache;
  })();

  try {
    return await browseCachePromise;
  } finally {
    browseCachePromise = null;
  }
}

export async function searchProfessorCommandersV1(query: string): Promise<{
  results: ProfessorCommanderSearchResultV1[];
  total: number;
}> {
  const catalog = await getCommanderSearchCatalogRuntime();

  if (!query.trim()) {
    const results = await warmProfessorCommanderBrowseCacheV1();
    return { results, total: results.length };
  }

  const lower = query.trim().toLowerCase();
  const browse = await warmProfessorCommanderBrowseCacheV1();
  const edhrecMatches = browse.filter((c) => c.name.toLowerCase().includes(lower));

  const catalogMatches = await deckBuilderStore.searchCatalogCards(query, 15);
  const catalogCommanders: ProfessorCommanderSearchResultV1[] = catalogMatches.map((c) => ({
    slug: commanderNameToSlug(c.name),
    name: c.name,
    scryfallId: c.id,
    colorIdentity: c.colorIdentity,
    imageUrl: c.imageNormal,
    fromCatalog: true,
  }));

  const merged = sortCommandersAlpha([
    ...edhrecMatches,
    ...catalogCommanders.filter(
      (c) =>
        !edhrecMatches.some((m) => m.name.toLowerCase() === c.name.toLowerCase()) &&
        isPaperEligibleCommanderNameFast(catalog, c.name),
    ),
  ]).slice(0, COMMANDER_SEARCH_LIMIT);

  return { results: merged, total: merged.length };
}

export function clearProfessorCommanderBrowseCacheForTest(): void {
  browseCache = null;
  browseCachePromise = null;
}
