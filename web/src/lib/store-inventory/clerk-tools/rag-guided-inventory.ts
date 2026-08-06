import { callOpenAiJson } from "../../card-flow-v2/openai-json";
import {
  formatKnowledgeHitsForLlm,
  type MtgHybridRetrievalResult,
  type MtgKnowledgeHit,
} from "../../mtg-rag/hybrid-retrieval";
import { isMtgRagEnabled } from "../../mtg-rag/constants";
import { deckBuilderStore } from "../../deck-builder/deck-builder-store";
import type { StoreInventoryCard } from "../../deck-builder/store-inventory-browse";
import type {
  ClerkGame,
  ClerkRouterResult,
  InventorySearchResult,
} from "../clerk-types";
import type { ParsedClerkInventoryQuery } from "./clerk-query-parser";
import {
  cardMatchesSemanticFilter,
  isSemanticFilterActive,
} from "../../deck-builder/store-inventory-semantic";
import {
  buildInventoryNameIndex,
  findInventoryMatch,
  loadMagicInventoryMatchPool,
} from "./magic-commander-inventory";
import { inventorySearchTool, buildSearchFromRouter } from "./inventory-search";
import type { KnowledgeRetrievalResult } from "./knowledge-retrieval";
import type { ClerkOrchestratorContext } from "../clerk-types";
import { cardCatalogLookupByName } from "./card-catalog";

const EXTRACT_CARD_NAMES_PERSONA = `
You extract Magic: The Gathering card names from retrieved deckbuilding knowledge.
Output JSON only:
{
  "cardNames": ["Sol Ring", "Cultivate"],
  "categoryNote": "optional one-sentence note about the category"
}

Rules:
- Only include real card names explicitly mentioned in the knowledge chunks.
- Prefer staples that fit the customer's category request (ramp, draw, removal, etc.).
- Do not invent cards. Max 20 names.
- Use exact English card names as printed.
`.trim();

export function shouldUseRagGuidedInventory(input: {
  route: ClerkRouterResult;
  semanticActive: boolean;
  cardNames: string[];
}): boolean {
  if (!isMtgRagEnabled()) return false;
  if (!input.semanticActive) return false;
  if (input.cardNames.length > 0) return false;
  if (input.route.intent !== "inventory_lookup") return false;
  if (input.route.required_agents.includes("mtg_commander")) return false;
  return input.route.game === "magic" || input.route.game === "unknown";
}

export async function extractCardNamesFromKnowledge(input: {
  question: string;
  hits: MtgKnowledgeHit[];
}): Promise<{ cardNames: string[]; categoryNote?: string }> {
  if (input.hits.length === 0) {
    return { cardNames: [] };
  }

  const raw = await callOpenAiJson<{
    cardNames?: string[];
    categoryNote?: string;
  }>(EXTRACT_CARD_NAMES_PERSONA, [
    {
      type: "text",
      text: [
        `Customer question: ${input.question}`,
        "",
        "Knowledge chunks:",
        formatKnowledgeHitsForLlm(input.hits),
      ].join("\n"),
    },
  ]);

  const cardNames = [...new Set((raw.cardNames ?? []).map((n) => n.trim()).filter(Boolean))].slice(
    0,
    20,
  );

  return {
    cardNames,
    categoryNote: raw.categoryNote?.trim() || undefined,
  };
}

/** Resolve LLM-extracted names to canonical oracle-backed card names before inventory matching. */
export async function resolveRagCardNameCandidates(
  cardNames: string[],
): Promise<string[]> {
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const name of cardNames) {
    const catalog = await cardCatalogLookupByName(name);
    if (!catalog?.oracleId?.trim()) continue;
    const key = catalog.oracleId;
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(catalog.name);
  }
  return resolved;
}

function applyInventoryFilters(
  items: StoreInventoryCard[],
  parsed: ParsedClerkInventoryQuery,
): StoreInventoryCard[] {
  let filtered = items;

  if (parsed.maxPrice != null && parsed.maxPrice > 0) {
    filtered = filtered.filter((c) => {
      const price = c.listPrice ?? c.tcgLowPrice;
      return price != null && price <= parsed.maxPrice!;
    });
  }

  if (isSemanticFilterActive(parsed.semantic)) {
    filtered = filtered.filter((c) =>
      cardMatchesSemanticFilter({ colorIdentity: c.colorIdentity }, parsed.semantic),
    );
  } else if (parsed.color && parsed.color !== "all") {
    filtered = filtered.filter((c) => {
      const colors = c.colorIdentity ?? [];
      if (parsed.color === "C") return colors.length === 0;
      if (parsed.color === "multicolor") return colors.length >= 2;
      if (parsed.color === "two") return colors.length === 2;
      if (parsed.color === "three") return colors.length === 3;
      if (parsed.color === "four") return colors.length === 4;
      if (parsed.color === "five") return colors.length >= 5;
      return true;
    });
  }

  return filtered;
}

export function matchSuggestedCardsInInventory(input: {
  suggestedNames: string[];
  pool: StoreInventoryCard[];
}): StoreInventoryCard[] {
  const index = buildInventoryNameIndex(input.pool);
  const seen = new Set<string>();
  const matched: StoreInventoryCard[] = [];

  for (const name of input.suggestedNames) {
    const hit = findInventoryMatch(index, name);
    if (!hit || seen.has(hit.inventoryItemId)) continue;
    seen.add(hit.inventoryItemId);
    matched.push(hit);
  }

  return matched;
}

async function enrichCardImageUrls(
  cards: StoreInventoryCard[],
): Promise<StoreInventoryCard[]> {
  const scryfallIds = [
    ...new Set(cards.map((c) => c.scryfallId).filter(Boolean)),
  ] as string[];
  if (scryfallIds.length === 0) return cards;

  const catalogs = await deckBuilderStore.getCatalogCards(scryfallIds);
  const imageByScryfall = new Map(
    catalogs
      .filter((c) => c.imageNormal)
      .map((c) => [c.id, c.imageNormal!]),
  );

  return cards.map((card) => {
    if (card.imageUrl) return card;
    const imageUrl = card.scryfallId
      ? imageByScryfall.get(card.scryfallId)
      : undefined;
    return imageUrl ? { ...card, imageUrl } : card;
  });
}

export interface RagGuidedInventoryResult {
  inventory: InventorySearchResult;
  items: StoreInventoryCard[];
  ragSuggestedCardNames: string[];
  categoryNote?: string;
}

export async function searchInventoryViaRag(input: {
  ctx: ClerkOrchestratorContext;
  route: ClerkRouterResult;
  knowledge: KnowledgeRetrievalResult;
  parsedQuestion: ParsedClerkInventoryQuery;
  searchGame: ClerkGame;
}): Promise<RagGuidedInventoryResult | null> {
  const hits = input.knowledge.knowledge.hits;
  if (hits.length === 0) return null;

  const extracted = await extractCardNamesFromKnowledge({
    question: input.ctx.user_question,
    hits,
  });

  if (extracted.cardNames.length === 0) return null;

  const validatedNames = await resolveRagCardNameCandidates(
    extracted.cardNames,
  );
  if (validatedNames.length === 0) return null;

  const pool = await loadMagicInventoryMatchPool({
    storeId: input.ctx.storeId,
    storeSlug: input.ctx.storeSlug,
  });

  let items = applyInventoryFilters(
    matchSuggestedCardsInInventory({
      suggestedNames: validatedNames,
      pool,
    }),
    input.parsedQuestion,
  );

  if (items.length < 8) {
    const params = buildSearchFromRouter({
      userQuestion: input.ctx.user_question,
      game: input.searchGame,
      cardNames: [],
      commander: input.route.entities.commander,
      maxPrice:
        input.route.constraints.max_price ?? input.route.constraints.budget,
      formatCommander: input.route.format === "commander",
    });
    const semantic = await inventorySearchTool({
      storeId: input.ctx.storeId,
      storeSlug: input.ctx.storeSlug,
      params,
    });
    const seen = new Set(items.map((c) => c.inventoryItemId));
    for (const item of semantic.items) {
      if (seen.has(item.inventoryItemId)) continue;
      seen.add(item.inventoryItemId);
      items.push(item);
    }
  }

  const limit = 48;
  items = (await enrichCardImageUrls(items)).slice(0, limit);

  return {
    items,
    ragSuggestedCardNames: validatedNames,
    categoryNote: extracted.categoryNote,
    inventory: {
      items,
      total: items.length,
      query: {
        game: "magic",
        cardType: input.route.format === "commander" ? "commander" : "all",
        semantic: input.parsedQuestion.semantic,
        semanticOnly: input.parsedQuestion.semanticOnly,
        limit,
      },
    },
  };
}

export function summarizeRagKnowledgeForFormatter(
  knowledge: MtgHybridRetrievalResult,
): string {
  return formatKnowledgeHitsForLlm(knowledge.hits.slice(0, 4));
}
