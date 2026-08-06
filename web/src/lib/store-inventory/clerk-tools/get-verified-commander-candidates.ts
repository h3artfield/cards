import { deckBuilderStore } from "../../deck-builder/deck-builder-store";
import { fetchEdhrecTopCommanders } from "../../deck-builder/edhrec-client";
import type {
  StoreInventoryCard,
  StoreInventoryColorFilter,
} from "../../deck-builder/store-inventory-browse";
import { listInventoryCommanders } from "../../deck-builder/store-inventory-browse";
import { cardCatalogLookupByName } from "./card-catalog";
import {
  isLegalCommanderForHit,
  isLegalCommanderForInventoryCard,
  passesCommanderColor,
  passesCommanderPrice,
} from "./commander-eligibility";
import {
  buildInventoryNameIndex,
  findInventoryExactMatch,
  findInventoryMatch,
  normalizeCardNameForMatch,
} from "./magic-commander-inventory";
import {
  extractCommanderThemeKeywords,
  hasExplicitCommanderTheme,
  scoreCommanderThemeRelevance,
} from "./commander-theme-keywords";
import { parseClerkInventoryQuery } from "./clerk-query-parser";
import type { CommanderPick } from "./commander-recommendations";

export type CommanderCandidateSort = "popularity" | "price_asc" | "price_desc";

export interface VerifiedCommanderCandidate extends CommanderPick {
  oracleId: string;
  structurallyEligible: true;
  themeScore: number;
}

export interface VerifiedCommanderCandidateAudit {
  accepted: VerifiedCommanderCandidate[];
  rejected: Array<{ name: string; oracleId?: string; reason: string }>;
  candidateCountBeforeFiltering: number;
  themeKeywords: string[];
  sort: CommanderCandidateSort;
}

function unitPrice(c: StoreInventoryCard): number | undefined {
  const p = c.listPrice ?? c.tcgLowPrice;
  return p != null && p > 0 ? p : undefined;
}

function buildReason(input: {
  commanderRank?: number;
  edhrecNumDecks?: number;
  typeLine?: string;
  price?: number;
  themeScore?: number;
}): string {
  const parts: string[] = [];
  if (input.themeScore != null && input.themeScore >= 12) {
    parts.push("Matches your theme");
  }
  if (input.commanderRank != null) {
    parts.push(`EDHREC commander rank #${input.commanderRank}`);
  }
  if (input.edhrecNumDecks != null) {
    parts.push(`${input.edhrecNumDecks.toLocaleString()} EDHREC decks`);
  }
  if (input.typeLine) {
    const short = input.typeLine.split("—")[0]?.trim();
    if (short) parts.push(short);
  }
  if (input.price != null) parts.push(`$${input.price.toFixed(2)} in stock`);
  return parts.join(" · ") || "In stock at your store";
}

function toVerifiedPick(
  card: StoreInventoryCard,
  input: {
    scryfallId?: string;
    colorIdentity: string[];
    typeLine?: string;
    commanderRank?: number;
    edhrecNumDecks?: number;
    themeScore: number;
  },
): VerifiedCommanderCandidate {
  const oracleId = card.oracleId?.trim() ?? "";
  const enriched: StoreInventoryCard = {
    ...card,
    scryfallId: input.scryfallId ?? card.scryfallId,
    colorIdentity: input.colorIdentity,
    isCommander: true,
    typeLine: input.typeLine ?? card.typeLine,
    oracleId,
  };
  return {
    card: enriched,
    commanderRank: input.commanderRank,
    edhrecNumDecks: input.edhrecNumDecks,
    colorIdentity: input.colorIdentity,
    typeLine: input.typeLine,
    oracleId,
    structurallyEligible: true,
    themeScore: input.themeScore,
    reason: buildReason({
      commanderRank: input.commanderRank,
      edhrecNumDecks: input.edhrecNumDecks,
      typeLine: input.typeLine,
      price: unitPrice(enriched),
      themeScore: input.themeScore,
    }),
  };
}

function sortCandidates(
  picks: VerifiedCommanderCandidate[],
  sort: CommanderCandidateSort,
): VerifiedCommanderCandidate[] {
  return [...picks].sort((a, b) => {
    if (sort === "price_asc") {
      const priceDiff = (unitPrice(a.card) ?? 999_999) - (unitPrice(b.card) ?? 999_999);
      if (priceDiff !== 0) return priceDiff;
    } else if (sort === "price_desc") {
      const priceDiff = (unitPrice(b.card) ?? 0) - (unitPrice(a.card) ?? 0);
      if (priceDiff !== 0) return priceDiff;
    } else {
      if (b.themeScore !== a.themeScore) return b.themeScore - a.themeScore;
      const rankA = a.commanderRank ?? 999_999;
      const rankB = b.commanderRank ?? 999_999;
      if (rankA !== rankB) return rankA - rankB;
    }
    return (unitPrice(a.card) ?? 999) - (unitPrice(b.card) ?? 999);
  });
}

/**
 * Canonical commander candidate pipeline — the only permissible source for commander lists.
 *
 * Order: inventory/catalog → oracle → structural eligibility → legality → color → qty → price → theme → sort → limit
 */
export async function getVerifiedCommanderCandidates(input: {
  storeId: string;
  storeSlug?: string;
  inventory?: StoreInventoryCard[];
  colorFilter: StoreInventoryColorFilter;
  colorContainsAny?: string[];
  inventoryOnly?: boolean;
  maxPrice?: number;
  sort?: CommanderCandidateSort;
  limit?: number;
  themeQuestion?: string;
  allowLiveEdhrec?: boolean;
}): Promise<VerifiedCommanderCandidateAudit> {
  const rejected: VerifiedCommanderCandidateAudit["rejected"] = [];
  const limit = input.limit ?? 10;
  const sort = input.sort ?? "popularity";
  const inventoryOnly = input.inventoryOnly !== false;
  const themeKeywords = input.themeQuestion
    ? extractCommanderThemeKeywords(input.themeQuestion)
    : [];
  const requireTheme = hasExplicitCommanderTheme(input.themeQuestion ?? "");
  const picks = new Map<string, VerifiedCommanderCandidate>();

  let candidates = input.inventory ?? [];
  if (candidates.length === 0 && input.storeSlug) {
    candidates = await listInventoryCommanders({
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      color: input.colorFilter === "all" ? "all" : input.colorFilter,
      limit: 250,
    });
  }

  const candidateCountBeforeFiltering = candidates.length;
  if (candidates.length === 0) {
    return {
      accepted: [],
      rejected,
      candidateCountBeforeFiltering: 0,
      themeKeywords,
      sort,
    };
  }

  const index = buildInventoryNameIndex(candidates);
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

  async function evaluateInventoryItem(item: StoreInventoryCard): Promise<void> {
    if (item.qty <= 0) {
      rejected.push({ name: item.name, oracleId: item.oracleId, reason: "zero_available_qty" });
      return;
    }
    if (!(await isLegalCommanderForInventoryCard(item))) {
      rejected.push({ name: item.name, oracleId: item.oracleId, reason: "not_commander_eligible" });
      return;
    }
    const colors = item.colorIdentity ?? [];
    if (input.colorContainsAny?.length) {
      if (!input.colorContainsAny.some((c) => colors.includes(c))) {
        rejected.push({ name: item.name, oracleId: item.oracleId, reason: "color_mismatch" });
        return;
      }
    } else if (!passesCommanderColor(colors, input.colorFilter)) {
      rejected.push({ name: item.name, oracleId: item.oracleId, reason: "color_mismatch" });
      return;
    }
    if (!passesCommanderPrice(item, input.maxPrice)) {
      rejected.push({ name: item.name, oracleId: item.oracleId, reason: "over_budget" });
      return;
    }

    const oracleId = item.oracleId?.trim();
    if (!oracleId) {
      rejected.push({ name: item.name, reason: "missing_oracle_id" });
      return;
    }

    const edhrec =
      (item.scryfallId ? edhrecByScryfall.get(item.scryfallId) : undefined) ??
      edhrecByName.get(normalizeCardNameForMatch(item.name));
    const themeScore = scoreCommanderThemeRelevance({
      keywords: themeKeywords,
      name: item.name,
      typeLine: item.typeLine,
      oracleText: item.oracleText,
      edhrecMeta: edhrec ?? null,
    });
    if (requireTheme && themeScore <= 0) {
      rejected.push({ name: item.name, oracleId, reason: "theme_irrelevant" });
      return;
    }

    const pick = toVerifiedPick(item, {
      scryfallId: item.scryfallId,
      colorIdentity: colors,
      typeLine: item.typeLine,
      commanderRank: edhrec?.rank,
      edhrecNumDecks: edhrec?.numDecks,
      themeScore,
    });

    const existing = picks.get(pick.card.inventoryItemId);
    if (!existing || (pick.commanderRank ?? 999_999) < (existing.commanderRank ?? 999_999)) {
      picks.set(pick.card.inventoryItemId, pick);
    }
  }

  for (const item of candidates) {
    await evaluateInventoryItem(item);
  }

  if (!inventoryOnly && picks.size < limit) {
    for (const meta of cachedEdhrec) {
      if (picks.size >= limit * 2) break;
      if (meta.themeSlug || !meta.rank) continue;

      const inStock =
        findInventoryExactMatch(index, meta.commanderName) ??
        findInventoryMatch(index, meta.commanderName);
      if (!inStock || inStock.qty <= 0) continue;
      await evaluateInventoryItem(inStock);
    }
  }

  if (picks.size < limit && input.allowLiveEdhrec) {
    const liveEdhrec = await fetchEdhrecTopCommanders(400);
    const catalogCache = new Map<
      string,
      Awaited<ReturnType<typeof cardCatalogLookupByName>>
    >();

    for (const entry of liveEdhrec) {
      if (picks.size >= limit * 2) break;
      const inStock =
        findInventoryExactMatch(index, entry.name) ??
        findInventoryMatch(index, entry.name);
      if (!inStock || inStock.qty <= 0) continue;

      let cat = catalogCache.get(entry.name);
      if (cat === undefined) {
        cat = await cardCatalogLookupByName(entry.name);
        catalogCache.set(entry.name, cat);
      }
      if (!cat || !(await isLegalCommanderForHit(cat))) {
        rejected.push({
          name: inStock.name,
          oracleId: inStock.oracleId,
          reason: "catalog_not_commander_eligible",
        });
        continue;
      }
      if (!passesCommanderColor(cat.colorIdentity, input.colorFilter)) continue;
      await evaluateInventoryItem({
        ...inStock,
        colorIdentity: cat.colorIdentity,
        typeLine: cat.typeLine,
        oracleId: cat.oracleId,
      });
    }
  }

  const accepted = sortCandidates([...picks.values()], sort).slice(0, limit);
  return {
    accepted,
    rejected,
    candidateCountBeforeFiltering,
    themeKeywords,
    sort,
  };
}

export function resolveCommanderColorConstraints(question: string): {
  colorFilter: StoreInventoryColorFilter;
  colorContainsAny?: string[];
} {
  const parsed = parseClerkInventoryQuery({ userQuestion: question });
  if (parsed.semantic.colorIdentityExact?.length === 1) {
    const letter = parsed.semantic.colorIdentityExact[0]!;
    if (["W", "U", "B", "R", "G"].includes(letter)) {
      return { colorFilter: letter as StoreInventoryColorFilter };
    }
  }
  if (parsed.semantic.colorIdentityContainsAny?.length) {
    return {
      colorFilter: "all",
      colorContainsAny: parsed.semantic.colorIdentityContainsAny,
    };
  }
  const lower = question.toLowerCase();
  if (/\bblue commanders?\b/.test(lower) && !/\bmono-?blue\b/.test(lower)) {
    return { colorFilter: "all", colorContainsAny: ["U"] };
  }
  if (/\bred commanders?\b/.test(lower) && !/\bmono-?red\b/.test(lower)) {
    return { colorFilter: "all", colorContainsAny: ["R"] };
  }
  if (/\bgreen commanders?\b/.test(lower) && !/\bmono-?green\b/.test(lower)) {
    return { colorFilter: "all", colorContainsAny: ["G"] };
  }
  if (/\bwhite commanders?\b/.test(lower) && !/\bmono-?white\b/.test(lower)) {
    return { colorFilter: "all", colorContainsAny: ["W"] };
  }
  if (/\bblack commanders?\b/.test(lower) && !/\bmono-?black\b/.test(lower)) {
    return { colorFilter: "all", colorContainsAny: ["B"] };
  }
  if (/\bmono-?white\b/.test(lower)) return { colorFilter: "W" };
  if (/\bmono-?blue\b/.test(lower)) return { colorFilter: "U" };
  if (/\bmono-?black\b/.test(lower)) return { colorFilter: "B" };
  if (/\bmono-?red\b/.test(lower)) return { colorFilter: "R" };
  if (/\bmono-?green\b/.test(lower)) return { colorFilter: "G" };
  return { colorFilter: "all" };
}

export function parseCommanderSortFromQuestion(question: string): CommanderCandidateSort {
  const q = question.toLowerCase();
  if (/\b(cheapest|lowest|least expensive|min(?:imum)?\s+price)\b/i.test(q)) {
    return "price_asc";
  }
  if (/\b(most expensive|highest|priciest|max(?:imum)?\s+price)\b/i.test(q)) {
    return "price_desc";
  }
  return "popularity";
}

export function formatVerifiedCommanderAnswer(input: {
  picks: VerifiedCommanderCandidate[];
  color: StoreInventoryColorFilter;
  maxPrice?: number;
  sort: CommanderCandidateSort;
  themeKeywords?: string[];
}): string {
  const colorLabel =
    input.color === "U"
      ? "mono-blue"
      : input.color === "W"
        ? "mono-white"
        : input.color === "B"
          ? "mono-black"
          : input.color === "R"
            ? "mono-red"
            : input.color === "G"
              ? "mono-green"
              : "commander";
  const budget = input.maxPrice != null ? ` under $${input.maxPrice}` : "";
  const themePart =
    input.themeKeywords?.length ? ` ${input.themeKeywords.join("/")}` : "";

  if (input.picks.length === 0) {
    return `I checked our Magic inventory for${themePart} ${colorLabel} commanders${budget} and didn't find eligible matches in stock. Try a higher budget, another color, or name a specific commander.`;
  }

  if (input.sort === "price_asc" && input.picks.length >= 1) {
    const pick = input.picks[0]!;
    const price = unitPrice(pick.card);
    const priceText = price != null ? `$${price.toFixed(2)}` : "price TBD";
    return `Our cheapest ${colorLabel} commander in stock is **${pick.card.name}** at ${priceText} (${pick.card.qty} in stock).`;
  }

  if (input.sort === "price_desc" && input.picks.length >= 1) {
    const pick = input.picks[0]!;
    const price = unitPrice(pick.card);
    const priceText = price != null ? `$${price.toFixed(2)}` : "price TBD";
    return `Our most expensive ${colorLabel} commander in stock is **${pick.card.name}** at ${priceText}.`;
  }

  const sortLabel =
    input.sort === "price_asc"
      ? "lowest-priced"
      : input.sort === "price_desc"
        ? "highest-priced"
        : "best";

  const lines = input.picks.map((pick, idx) => {
    const price = unitPrice(pick.card);
    const priceText = price != null ? `$${price.toFixed(2)}` : "price TBD";
    return `${idx + 1}. ${pick.card.name} — ${priceText}\n   ${pick.reason}`;
  });

  return `Here are the ${sortLabel}${themePart} ${colorLabel} commanders we have in stock${budget}:\n\n${lines.join("\n\n")}`;
}
