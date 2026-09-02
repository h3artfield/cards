import type { StoreInventoryCard } from "../../deck-builder/store-inventory-browse";
import type {
  CardCatalogHit,
  ClerkOrchestratorContext,
  ClerkRouterResult,
  InventorySearchResult,
} from "../clerk-types";
import { cardCatalogTool } from "./card-catalog";
import {
  buildSearchFromRouter,
  inventorySearchMultiple,
  inventorySearchTool,
} from "./inventory-search";
import {
  loadMagicInventoryMatchPool,
} from "./magic-commander-inventory";
import { listInventoryCommanders } from "../../deck-builder/store-inventory-browse";
import {
  isColorIdentityInventoryRequest,
  isSetProductInventoryRequest,
  parseClerkInventoryQuery,
  isSemanticFilterActive,
} from "./clerk-query-parser";
import { resolveClerkCardTypeFilter } from "./clerk-browse-sync";
import {
  isKnowledgeOnlyClerkPath,
  knowledgeRetrievalTool,
  retrieveCategoryInventoryKnowledge,
} from "./knowledge-retrieval";
import { isEducationThenInventoryRequest } from "./clerk-intent";
import {
  searchInventoryViaRag,
  shouldUseRagGuidedInventory,
} from "./rag-guided-inventory";
import { isMtgRagEnabled } from "../../mtg-rag/constants";
import { reinterpretInventoryQueryViaRag } from "./inventory-query-reinterpret";
import {
  looksLikeScryfallSyntax,
  parseScryfallInventoryQuery,
} from "./scryfall-syntax-parser";

export interface ClerkToolResults {
  inventory: InventorySearchResult | null;
  /** Small result set for formatter / UI — never the full store catalog. */
  inventoryByName: StoreInventoryCard[];
  /** Full magic pool for EDHREC name matching only (can be thousands of rows). */
  inventoryMatchPool?: StoreInventoryCard[];
  catalog: CardCatalogHit[];
  knowledge?: import("./knowledge-retrieval").KnowledgeRetrievalResult | null;
  /** Card names suggested by RAG before inventory matching. */
  ragSuggestedCardNames?: string[];
  ragCategoryNote?: string;
  inventorySearchStrategy?: string;
}

export async function runClerkTools(input: {
  ctx: ClerkOrchestratorContext;
  route: ClerkRouterResult;
  /** Run knowledge retrieval alongside the first inventory search (mixed intent). */
  parallelKnowledgeInventory?: boolean;
}): Promise<ClerkToolResults> {
  const { ctx, route } = input;

  const cardNames = [
    ...route.entities.card_names,
    ...(route.entities.commander ? [route.entities.commander] : []),
    ...(route.entities.featured_card ? [route.entities.featured_card] : []),
  ].filter(Boolean);

  const parsedQuestion = parseClerkInventoryQuery({
    userQuestion: ctx.user_question,
    conversationSummary: ctx.conversation_summary,
    cardNames,
    commander: route.entities.commander,
    maxPrice: route.constraints.max_price ?? route.constraints.budget,
  });
  const semanticActive = isSemanticFilterActive(parsedQuestion.semantic);
  const ragGuided = shouldUseRagGuidedInventory({
    route,
    semanticActive,
    cardNames,
  });

  const needsInventory = route.required_tools.includes("inventory_search");
  let inventoryPrefetched = false;
  let prefetchedInventory: InventorySearchResult | null = null;
  let prefetchedInventoryByName: StoreInventoryCard[] = [];
  let prefetchedInventorySearchStrategy: string | undefined;

  let knowledge =
    input.parallelKnowledgeInventory && needsInventory
      ? null
      : ragGuided
        ? await retrieveCategoryInventoryKnowledge({ ctx })
        : await knowledgeRetrievalTool({ ctx, clerkIntent: route.intent });

  if (input.parallelKnowledgeInventory && needsInventory) {
    const searchGame =
      semanticActive && route.game !== "magic" ? "magic" : route.game;
    const maxPrice = route.constraints.max_price ?? route.constraints.budget;
    const params = buildSearchFromRouter({
      userQuestion: ctx.user_question,
      conversationSummary: ctx.conversation_summary,
      game: searchGame,
      cardNames,
      commander: route.entities.commander,
      maxPrice,
      formatCommander: route.format === "commander",
    });
    const [knowledgeParallel, inventoryParallel] = await Promise.all([
      ragGuided
        ? retrieveCategoryInventoryKnowledge({ ctx })
        : knowledgeRetrievalTool({ ctx, clerkIntent: route.intent }),
      inventorySearchTool({
        storeId: ctx.storeId,
        storeSlug: ctx.storeSlug,
        params,
      }),
    ]);
    knowledge = knowledgeParallel;
    inventoryPrefetched = true;
    prefetchedInventory = inventoryParallel;
    prefetchedInventoryByName = inventoryParallel.items;
    prefetchedInventorySearchStrategy = "parallel_mixed";
  }

  const knowledgeOnly =
    knowledge &&
    isKnowledgeOnlyClerkPath({
      mtgRoute: knowledge.mtgRoute,
      clerkIntent: route.intent,
    }) &&
    !isEducationThenInventoryRequest(
      ctx.user_question,
      ctx.conversation_summary,
    );

  if (knowledgeOnly) {
    const inventoryMatchPool = await loadMagicInventoryMatchPool({
      storeId: ctx.storeId,
      storeSlug: ctx.storeSlug,
    });
    return {
      inventory: null,
      inventoryByName: [],
      inventoryMatchPool,
      catalog: [],
      knowledge,
    };
  }

  let inventory: InventorySearchResult | null = prefetchedInventory;
  let inventoryByName: StoreInventoryCard[] = prefetchedInventoryByName;
  let ragSuggestedCardNames: string[] | undefined;
  let ragCategoryNote: string | undefined;
  let inventorySearchStrategy: string | undefined = prefetchedInventorySearchStrategy;

  const wantsFullDeckBuild = route.intent === "build_deck";
  const wantsCommanderRec =
    route.intent === "recommendation" &&
    route.required_agents.includes("mtg_commander");

  let inventoryMatchPool: StoreInventoryCard[] | undefined;

  if (needsInventory && wantsFullDeckBuild) {
    inventoryMatchPool = await loadMagicInventoryMatchPool({
      storeId: ctx.storeId,
      storeSlug: ctx.storeSlug,
    });
    inventoryByName = [];
    inventory = {
      items: [],
      total: inventoryMatchPool.length,
      query: {
        game: "magic",
        cardType: "all",
        limit: inventoryMatchPool.length,
      },
    };
  } else if (needsInventory && wantsCommanderRec) {
    const commanders = await listInventoryCommanders({
      storeId: ctx.storeId,
      storeSlug: ctx.storeSlug,
      color: parsedQuestion.color ?? "all",
      limit: 250,
    });
    inventoryMatchPool = commanders;
    inventoryByName = commanders.slice(0, 24);
    inventory = {
      items: inventoryByName,
      total: commanders.length,
      query: {
        game: "magic",
        cardType: "commander",
        limit: 24,
      },
    };
  } else if (needsInventory && !inventoryPrefetched) {
    const searchGame =
      semanticActive && route.game !== "magic" ? "magic" : route.game;
    const maxPrice = route.constraints.max_price ?? route.constraints.budget;
    const cardType = resolveClerkCardTypeFilter({
      userQuestion: ctx.user_question,
      parsed: parsedQuestion,
    });
    const setProductLookup = isSetProductInventoryRequest({
      userQuestion: ctx.user_question,
      conversationSummary: ctx.conversation_summary,
    });
    const colorIdentityLookup = isColorIdentityInventoryRequest({
      userQuestion: ctx.user_question,
      conversationSummary: ctx.conversation_summary,
    });

    const scryfallParsed = looksLikeScryfallSyntax(ctx.user_question)
      ? parseScryfallInventoryQuery(ctx.user_question)
      : null;

    if (scryfallParsed) {
      inventory = await inventorySearchTool({
        storeId: ctx.storeId,
        storeSlug: ctx.storeSlug,
        params: {
          q: scryfallParsed.q,
          game: "magic",
          color: scryfallParsed.color ?? "all",
          cardType:
            scryfallParsed.cardTypeCommander ? "commander" : cardType,
          maxPrice,
          semantic: scryfallParsed.semantic,
          semanticOnly: scryfallParsed.semanticOnly,
          limit: scryfallParsed.searchLimit ?? 96,
        },
      });
      inventoryByName = inventory.items;
      inventorySearchStrategy = "scryfall_syntax";
    }

    if (!inventory?.items.length) {
      if (ragGuided && knowledge) {
        const ragResult = await searchInventoryViaRag({
          ctx,
          route,
          knowledge,
          parsedQuestion,
          searchGame,
        });
        if (ragResult) {
          inventory = ragResult.inventory;
          inventoryByName = ragResult.items;
          ragSuggestedCardNames = ragResult.ragSuggestedCardNames;
          ragCategoryNote = ragResult.categoryNote;
          inventorySearchStrategy = "rag_card_names";
        }
      }

      if (
        !inventory?.items.length &&
        (semanticActive || setProductLookup || colorIdentityLookup || cardNames.length === 0)
      ) {
        const params = buildSearchFromRouter({
          userQuestion: ctx.user_question,
          conversationSummary: ctx.conversation_summary,
          game: searchGame,
          cardNames:
            semanticActive || setProductLookup || colorIdentityLookup
              ? []
              : cardNames,
          commander: route.entities.commander,
          maxPrice,
          formatCommander: cardType === "commander",
        });
        inventory = await inventorySearchTool({
          storeId: ctx.storeId,
          storeSlug: ctx.storeSlug,
          params,
        });
        inventoryByName = inventory.items;
        inventorySearchStrategy = inventorySearchStrategy ?? "direct";
      } else if (!inventory?.items.length) {
        const multi = await inventorySearchMultiple({
          storeId: ctx.storeId,
          storeSlug: ctx.storeSlug,
          cardNames,
          game: searchGame,
          maxPrice,
          cardType,
          userQuestion: ctx.user_question,
          conversationSummary: ctx.conversation_summary,
        });
        inventoryByName = multi.items;
        inventory = {
          items: multi.items,
          total: multi.items.length,
          query: multi.queries[0] ?? {},
        };
        inventorySearchStrategy = "name_multi";
      }
    }

    if (!inventory?.items.length && isMtgRagEnabled()) {
      const reinterpreted = await reinterpretInventoryQueryViaRag({
        question: ctx.user_question,
        conversationSummary: ctx.conversation_summary,
        priorStrategy: inventorySearchStrategy ?? "direct",
      });
      if (reinterpreted) {
        inventory = await inventorySearchTool({
          storeId: ctx.storeId,
          storeSlug: ctx.storeSlug,
          params: {
            q: reinterpreted.parsed.q,
            game: "magic",
            color: reinterpreted.parsed.color ?? "all",
            cardType,
            maxPrice,
            semantic: reinterpreted.parsed.semantic,
            semanticOnly: reinterpreted.parsed.semanticOnly,
            priceSort:
              reinterpreted.parsed.priceSort ?? parsedQuestion.priceSort,
            limit:
              reinterpreted.parsed.priceSort ?? parsedQuestion.priceSort
                ? 12
                : reinterpreted.parsed.searchLimit ?? 96,
          },
        });
        inventoryByName = inventory.items;
        if (inventory.items.length > 0) {
          inventorySearchStrategy = "rag_reinterpret";
          ragCategoryNote = reinterpreted.notes;
        }
      }
    }

    if (route.intent === "build_deck" && route.game === "pokemon") {
      const allPokemon = await inventorySearchTool({
        storeId: ctx.storeId,
        storeSlug: ctx.storeSlug,
        params: {
          game: "pokemon",
          color: "all",
          cardType: "all",
          limit: 120,
        },
      });
      const byId = new Map(inventoryByName.map((c) => [c.inventoryItemId, c]));
      for (const c of allPokemon.items) {
        byId.set(c.inventoryItemId, c);
      }
      inventoryByName = [...byId.values()];
      inventory = {
        items: inventoryByName,
        total: inventoryByName.length,
        query: allPokemon.query,
      };
    }
  }

  let catalog: CardCatalogHit[] = [];
  if (route.required_tools.includes("card_catalog")) {
    catalog = await cardCatalogTool({
      cardNames,
      scryfallIds: inventoryByName
        .map((c) => c.scryfallId)
        .filter(Boolean) as string[],
    });
  }

  return {
    inventory,
    inventoryByName,
    inventoryMatchPool,
    catalog,
    knowledge,
    ragSuggestedCardNames,
    ragCategoryNote,
    inventorySearchStrategy,
  };
}
