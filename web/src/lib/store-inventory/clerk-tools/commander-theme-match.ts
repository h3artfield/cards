import { deckBuilderStore } from "../../deck-builder/deck-builder-store";
import type { EdhrecCommanderMeta } from "../../deck-builder/types";
import type { StoreInventoryColorFilter } from "../../deck-builder/store-inventory-browse";
import type { CommanderPick } from "./commander-recommendations";
import { getVerifiedCommanderCandidates } from "./get-verified-commander-candidates";
import {
  findInventoryExactMatch,
  findInventoryMatch,
  buildInventoryNameIndex,
  normalizeCardNameForMatch,
} from "./magic-commander-inventory";
import { cardCatalogLookupByName } from "./card-catalog";
import { isLegalCommanderForHit } from "./commander-eligibility";
import type { DeckBuildIntentTranslation } from "./deck-build-intent-translator";

function normalizeKeyword(keyword: string): string {
  return keyword.toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim();
}

function keywordMatchesText(keyword: string, text: string): boolean {
  const k = normalizeKeyword(keyword);
  const t = text.toLowerCase();
  if (!k) return false;
  if (t.includes(k)) return true;
  if (k.endsWith("s") && t.includes(k.slice(0, -1))) return true;
  if (!k.endsWith("s") && t.includes(`${k}s`)) return true;
  return false;
}

function scoreEdhrecThemeFit(
  meta: EdhrecCommanderMeta | null,
  keywords: string[],
): number {
  if (!meta || keywords.length === 0) return 0;
  let score = 0;
  for (const keyword of keywords) {
    for (const theme of meta.themes ?? []) {
      const label = theme.label ?? "";
      const slug = theme.slug ?? "";
      if (keywordMatchesText(keyword, label) || keywordMatchesText(keyword, slug)) {
        score += 10 + Math.min(theme.count ?? 0, 5000) / 500;
      }
    }
    for (const [tag, count] of Object.entries(meta.tagCounts ?? {})) {
      if (keywordMatchesText(keyword, tag)) {
        score += 8 + Math.min(count ?? 0, 2000) / 200;
      }
    }
  }
  return score;
}

function scoreNameFit(name: string, keywords: string[]): number {
  let score = 0;
  for (const keyword of keywords) {
    if (keywordMatchesText(keyword, name)) score += 6;
  }
  return score;
}

/** Rank in-stock commanders by theme fit instead of raw EDHREC popularity. */
export async function rankThematicCommandersInStock(input: {
  intent: DeckBuildIntentTranslation;
  storeId: string;
  storeSlug: string;
  color: StoreInventoryColorFilter;
  maxPrice?: number;
  limit?: number;
}): Promise<Array<CommanderPick & { themeScore: number }>> {
  const keywords = [
    ...input.intent.themeKeywords,
    input.intent.setOrProduct,
    ...input.intent.researchQueries.flatMap((q) => q.split(/\s+/).slice(0, 3)),
  ].filter((k): k is string => Boolean(k));

  const nameCandidates = [
    ...input.intent.suggestedCommanders,
    input.intent.namedCommander,
    input.intent.featuredCard,
  ].filter(Boolean) as string[];

  const audit = await getVerifiedCommanderCandidates({
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    colorFilter: input.color,
    inventoryOnly: true,
    maxPrice: input.maxPrice,
    sort: "popularity",
    limit: 40,
    themeQuestion: keywords.join(" "),
    allowLiveEdhrec: false,
  });
  const inStock = audit.accepted;

  if (inStock.length === 0) return [];

  const index = buildInventoryNameIndex(inStock.map((p) => p.card));
  const cachedEdhrec = await deckBuilderStore.listEdhrecCommanders(2500);
  const edhrecByScryfall = new Map(
    cachedEdhrec
      .filter((m) => m.scryfallId && !m.themeSlug)
      .map((m) => [m.scryfallId!, m]),
  );
  const edhrecByName = new Map(
    cachedEdhrec
      .filter((m) => !m.themeSlug && m.commanderName)
      .map((m) => [normalizeCardNameForMatch(m.commanderName), m]),
  );

  const scored: Array<CommanderPick & { themeScore: number }> = [];

  for (const pick of inStock) {
    let themeScore = 0;

    const meta =
      (pick.card.scryfallId
        ? edhrecByScryfall.get(pick.card.scryfallId)
        : undefined) ??
      edhrecByName.get(normalizeCardNameForMatch(pick.card.name));

    themeScore += scoreEdhrecThemeFit(meta ?? null, keywords);
    themeScore += scoreNameFit(pick.card.name, keywords);

    for (const candidate of nameCandidates) {
      const matched =
        findInventoryExactMatch(index, candidate) ??
        findInventoryMatch(index, candidate);
      if (matched?.inventoryItemId === pick.card.inventoryItemId) {
        themeScore += 100;
      }
    }

    if (themeScore > 0) {
      scored.push({ ...pick, themeScore });
    }
  }

  return scored
    .sort((a, b) => {
      if (b.themeScore !== a.themeScore) return b.themeScore - a.themeScore;
      const rankA = a.commanderRank ?? 999_999;
      const rankB = b.commanderRank ?? 999_999;
      return rankA - rankB;
    })
    .slice(0, input.limit ?? 10);
}

/** Resolve a named commander or featured card to an in-stock pick. */
export async function resolveNamedCommanderInStock(input: {
  name: string;
  storeId: string;
  storeSlug: string;
  maxPrice?: number;
}): Promise<CommanderPick | null> {
  const catalog = await cardCatalogLookupByName(input.name);
  if (!catalog || !(await isLegalCommanderForHit(catalog))) return null;

  const audit = await getVerifiedCommanderCandidates({
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    colorFilter: "all",
    inventoryOnly: true,
    maxPrice: input.maxPrice,
    sort: "popularity",
    limit: 250,
    allowLiveEdhrec: false,
  });
  const inStock = audit.accepted;

  const index = buildInventoryNameIndex(inStock.map((p) => p.card));
  const matched =
    findInventoryExactMatch(index, catalog.name) ??
    findInventoryMatch(index, catalog.name) ??
    findInventoryMatch(index, input.name);

  if (!matched) return null;

  const pick = inStock.find((p) => p.card.inventoryItemId === matched.inventoryItemId);
  return pick ?? null;
}

export async function validateCommanderCandidate(name: string): Promise<boolean> {
  const catalog = await cardCatalogLookupByName(name);
  return Boolean(catalog && (await isLegalCommanderForHit(catalog)));
}
