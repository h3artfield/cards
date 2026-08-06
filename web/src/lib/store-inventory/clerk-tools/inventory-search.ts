import {
  browseStoreInventory,
  type StoreInventoryCard,
  type StoreInventoryGameFilter,
  type StoreInventoryTypeFilter,
} from "../../deck-builder/store-inventory-browse";
import type {
  ClerkGame,
  InventorySearchParams,
  InventorySearchResult,
} from "../clerk-types";
import {
  isSemanticFilterActive,
  isSetProductInventoryRequest,
  isColorIdentityInventoryRequest,
  parseClerkInventoryQuery,
} from "./clerk-query-parser";

export {
  parseClerkInventoryQuery,
  parseColorFromQuery,
  parseMaxPriceFromQuery,
  parsePriceSortFromQuery,
} from "./clerk-query-parser";

function clerkGameToFilter(game: ClerkGame): StoreInventoryGameFilter {
  const map: Partial<Record<ClerkGame, StoreInventoryGameFilter>> = {
    magic: "magic",
    pokemon: "pokemon",
    yugioh: "yugioh",
    sports: "sports",
  };
  return map[game] ?? "all";
}

export function buildSearchFromRouter(input: {
  userQuestion: string;
  conversationSummary?: string;
  game: ClerkGame;
  cardNames: string[];
  commander?: string;
  maxPrice?: number;
  formatCommander?: boolean;
}): InventorySearchParams {
  const parsed = parseClerkInventoryQuery({
    userQuestion: input.userQuestion,
    conversationSummary: input.conversationSummary,
    cardNames: input.cardNames,
    commander: input.commander,
    maxPrice: input.maxPrice,
  });

  const params: InventorySearchParams = {
    q: parsed.q,
    game: parsed.browseGame ?? clerkGameToFilter(input.game),
    color:
      parsed.semantic.colorIdentityExact != null ||
      Boolean(parsed.semantic.colorIdentityContainsAny?.length) ||
      Boolean(parsed.semantic.colorIdentitySubsetOf?.length) ||
      Boolean(parsed.semantic.colorIdentitySupersetOf?.length)
        ? "all"
        : (parsed.color ?? "all"),
    cardType: input.formatCommander ? "commander" : "all",
    maxPrice: parsed.maxPrice,
    semantic: parsed.semantic,
    semanticOnly: parsed.semanticOnly,
    priceSort: parsed.priceSort,
    limit:
      parsed.priceSort
        ? 12
        : parsed.searchLimit ??
          (isSemanticFilterActive(parsed.semantic) ? 48 : 24),
  };

  if (/^commanders?$/i.test(params.q ?? "")) {
    params.q = undefined;
    params.cardType = "commander";
    params.semanticOnly = false;
  }

  return params;
}

export async function inventorySearchTool(input: {
  storeId: string;
  storeSlug: string;
  params: InventorySearchParams;
}): Promise<InventorySearchResult> {
  const limit = input.params.limit ?? 24;
  const browseLimit = input.params.priceSort
    ? 96
    : Math.min(96, limit * 2);
  const browse = await browseStoreInventory({
    storeId: input.storeId,
    storeSlug: input.storeSlug,
    q: input.params.q,
    game: input.params.game ?? "all",
    color: input.params.color ?? "all",
    cardType: input.params.cardType ?? "all",
    semantic: input.params.semantic,
    semanticOnly: input.params.semanticOnly,
    page: 1,
    limit: browseLimit,
    sortBy: input.params.priceSort === "desc"
      ? "price_desc"
      : input.params.priceSort === "asc"
        ? "price_asc"
        : undefined,
    requireClerkEligible: true,
  });

  let items = browse.items;
  if (input.params.maxPrice != null && input.params.maxPrice > 0) {
    items = items.filter((c) => {
      const price = c.listPrice ?? c.tcgLowPrice;
      return price != null && price <= input.params.maxPrice!;
    });
  }

  return {
    items: items.slice(0, limit),
    total: browse.total,
    query: input.params,
    identityTrace: browse.identityTrace,
  };
}

/** Search multiple card names and merge unique hits. */
export async function inventorySearchMultiple(input: {
  storeId: string;
  storeSlug: string;
  cardNames: string[];
  game: ClerkGame;
  maxPrice?: number;
  cardType?: StoreInventoryTypeFilter;
  limitPerQuery?: number;
  userQuestion?: string;
  conversationSummary?: string;
}): Promise<{ items: StoreInventoryCard[]; queries: InventorySearchParams[] }> {
  const names = [...new Set(input.cardNames.map((n) => n.trim()).filter(Boolean))];
  if (input.userQuestion) {
    const parsed = parseClerkInventoryQuery({
      userQuestion: input.userQuestion,
      conversationSummary: input.conversationSummary,
      cardNames: names,
      maxPrice: input.maxPrice,
    });
    if (
      isSemanticFilterActive(parsed.semantic) ||
      isSetProductInventoryRequest({
        userQuestion: input.userQuestion,
        conversationSummary: input.conversationSummary,
      }) ||
      isColorIdentityInventoryRequest({
        userQuestion: input.userQuestion,
        conversationSummary: input.conversationSummary,
      })
    ) {
      const params = buildSearchFromRouter({
        userQuestion: input.userQuestion,
        conversationSummary: input.conversationSummary,
        game: input.game,
        cardNames: [],
        maxPrice: input.maxPrice,
      });
      const result = await inventorySearchTool({
        storeId: input.storeId,
        storeSlug: input.storeSlug,
        params,
      });
      return { items: result.items, queries: [params] };
    }
  }

  if (names.length === 0) {
    const params = buildSearchFromRouter({
      userQuestion: input.userQuestion ?? "",
      conversationSummary: input.conversationSummary,
      game: input.game,
      cardNames: [],
      maxPrice: input.maxPrice,
    });
    const result = await inventorySearchTool({
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      params,
    });
    return { items: result.items, queries: [params] };
  }

  const byId = new Map<string, StoreInventoryCard>();
  const queries: InventorySearchParams[] = [];

  for (const name of names.slice(0, 5)) {
    const params: InventorySearchParams = {
      q: name,
      game: clerkGameToFilter(input.game),
      color: "all",
      cardType: input.cardType ?? "all",
      maxPrice: input.maxPrice,
      limit: input.limitPerQuery ?? 8,
    };
    queries.push(params);
    const result = await inventorySearchTool({
      storeId: input.storeId,
      storeSlug: input.storeSlug,
      params,
    });
    for (const item of result.items) {
      byId.set(item.inventoryItemId, item);
    }
  }

  return { items: [...byId.values()], queries };
}
