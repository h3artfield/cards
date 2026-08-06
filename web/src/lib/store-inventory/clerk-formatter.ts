import { callOpenAiJson } from "../card-flow-v2/openai-json";
import type {
  StoreInventoryColorFilter,
  StoreInventoryGameFilter,
  StoreInventoryTypeFilter,
} from "../deck-builder/store-inventory-browse";
import { CLERK_FORMATTER_PERSONA } from "./knowledge/router";
import { MTG_COMMANDER_AGENT_PERSONA } from "./knowledge/mtg-commander-agent";
import type {
  ClerkOrchestratorContext,
  ClerkRouterResult,
  SpecialistResponse,
} from "./clerk-types";
import type { ClerkToolResults } from "./clerk-tools";
import {
  isSemanticFilterActive,
  isSetProductInventoryRequest,
  isColorIdentityInventoryRequest,
  parseClerkInventoryQuery,
  setProductSearchLabel,
  colorIdentitySearchLabel,
} from "./clerk-tools/clerk-query-parser";
import { looksLikeScryfallSyntax } from "./clerk-tools/scryfall-syntax-parser";
import { summarizeRagKnowledgeForFormatter } from "./clerk-tools/rag-guided-inventory";
import { isEducationThenInventoryRequest, isRulesQuestion } from "./clerk-tools/clerk-intent";
import { formatKnowledgeHitsForLlm } from "../mtg-rag/hybrid-retrieval";

function compactInventoryItem(c: {
  inventoryItemId: string;
  name: string;
  qty: number;
  listPrice?: number;
  tcgLowPrice?: number;
  setName?: string;
}) {
  return {
    id: c.inventoryItemId,
    name: c.name,
    qty: c.qty,
    price: c.listPrice,
    set: c.setName,
  };
}

function gameToBrowseFilter(game: ClerkRouterResult["game"]): StoreInventoryGameFilter {
  const map: Partial<Record<ClerkRouterResult["game"], StoreInventoryGameFilter>> = {
    magic: "magic",
    pokemon: "pokemon",
    yugioh: "yugioh",
    sports: "sports",
  };
  return map[game] ?? "all";
}

function inventorySearchLabel(input: {
  parsed: ReturnType<typeof parseClerkInventoryQuery>;
  userQuestion: string;
  conversationSummary?: string;
}): string {
  if (
    input.parsed.q &&
    isSetProductInventoryRequest({
      userQuestion: input.userQuestion,
      conversationSummary: input.conversationSummary,
    })
  ) {
    return setProductSearchLabel(input.parsed);
  }
  if (
    isColorIdentityInventoryRequest({
      userQuestion: input.userQuestion,
      conversationSummary: input.conversationSummary,
    })
  ) {
    return colorIdentitySearchLabel(input.parsed);
  }
  return input.parsed.q ? `"${input.parsed.q}"` : "that search";
}

function priceExtremumReply(input: {
  parsed: ReturnType<typeof parseClerkInventoryQuery>;
  label: string;
  inventoryItems: Array<{
    name: string;
    qty: number;
    listPrice?: number;
    tcgLowPrice?: number;
  }>;
  inventoryTotal: number;
}): string | undefined {
  const { parsed, label, inventoryItems, inventoryTotal } = input;
  if (!parsed.priceSort || inventoryItems.length === 0) return undefined;

  const top = inventoryItems[0]!;
  const price = top.listPrice ?? top.tcgLowPrice;
  const scope =
    label.startsWith('"') && label.endsWith('"') ? label.slice(1, -1) : label;
  const more =
    inventoryTotal > inventoryItems.length
      ? ` — showing top ${inventoryItems.length} of ${inventoryTotal} in stock.`
      : inventoryItems.length > 1
        ? ` — ${inventoryItems.length - 1} more below.`
        : ".";

  if (parsed.priceSort === "desc") {
    return price != null && price > 0
      ? `Our highest-priced ${scope} card in stock is ${top.name} at $${price.toFixed(2)}${more}`
      : `Here are the highest-priced ${scope} cards we have in stock.`;
  }

  return price != null && price > 0
    ? `Our cheapest ${scope} card in stock is ${top.name} at $${price.toFixed(2)}${more}`
    : `Here are the lowest-priced ${scope} cards we have in stock.`;
}

function semanticInventorySearchActive(input: {
  ctx: ClerkOrchestratorContext;
  tools: ClerkToolResults;
}): boolean {
  if (isSemanticFilterActive(input.tools.inventory?.query?.semantic)) {
    return true;
  }
  const parsed = parseClerkInventoryQuery({
    userQuestion: input.ctx.user_question,
  });
  return isSemanticFilterActive(parsed.semantic);
}

function appendStockNote(input: {
  educationAnswer: string;
  inventoryCount: number;
}): string {
  const base = input.educationAnswer.trim();
  if (input.inventoryCount > 0) {
    return `${base}\n\nWe have ${input.inventoryCount} matching card${input.inventoryCount === 1 ? "" : "s"} in stock — check the picks below.`;
  }
  return `${base}\n\nI didn't find exact matches in our current stock for that request, but I can search for a specific card name if you have one in mind.`;
}

export async function formatClerkResponse(input: {
  ctx: ClerkOrchestratorContext;
  route: ClerkRouterResult;
  tools: ClerkToolResults;
  specialist: SpecialistResponse | null;
}): Promise<{
  reply: string;
  searchQuery?: string;
  game?: StoreInventoryGameFilter;
  color?: StoreInventoryColorFilter;
  cardType?: StoreInventoryTypeFilter;
  highlightItemIds: string[];
  skipBrowseSearch?: boolean;
}> {
  const inventoryItems = input.tools.inventoryByName.length
    ? input.tools.inventoryByName
    : (input.tools.inventory?.items ?? []);

  const allowedIds = new Set(inventoryItems.map((c) => c.inventoryItemId));

  if (input.specialist?.deckList) {
    const deck = input.specialist.deckList;
    const highlightItemIds = deck.lines
      .map((l) => l.inventoryItemId)
      .filter((id): id is string => Boolean(id));

    return {
      reply: input.specialist.direct_answer,
      game: deck.game === "magic" ? "magic" : "pokemon",
      highlightItemIds: [...new Set(highlightItemIds)],
      skipBrowseSearch: true,
    };
  }

  const educationThenInventory = isEducationThenInventoryRequest(
    input.ctx.user_question,
    input.ctx.conversation_summary,
  );

  const rulesQuestion = isRulesQuestion(input.ctx.user_question);

  if (rulesQuestion && input.specialist?.direct_answer) {
    return {
      reply: input.specialist.direct_answer,
      game: "magic",
      color: "all",
      cardType: "all",
      highlightItemIds: [],
      skipBrowseSearch: true,
    };
  }

  if (educationThenInventory && input.specialist?.direct_answer) {
    const highlightItemIds = inventoryItems.map((c) => c.inventoryItemId);
    return {
      reply: appendStockNote({
        educationAnswer: input.specialist.direct_answer,
        inventoryCount: inventoryItems.length,
      }),
      game: "magic",
      color: "all",
      cardType: "all",
      highlightItemIds: [...new Set(highlightItemIds)],
      skipBrowseSearch: inventoryItems.length > 0,
    };
  }

  if (
    input.specialist?.direct_answer &&
    (input.route.required_agents.includes("mtg_commander") ||
      input.tools.knowledge)
  ) {
    const highlightItemIds = inventoryItems.map((c) => c.inventoryItemId);

    return {
      reply: input.specialist.direct_answer,
      game: "magic",
      color: "all",
      cardType: "all",
      highlightItemIds: [...new Set(highlightItemIds)],
      skipBrowseSearch: true,
    };
  }

  if (semanticInventorySearchActive(input) && inventoryItems.length > 0) {
    const ragNote = input.tools.ragCategoryNote?.trim();
    const reply =
      input.specialist?.direct_answer?.trim() ??
      (ragNote
        ? `${ragNote} I found ${inventoryItems.length} matching cards in stock — scroll the row below or drag cards to your pile.`
        : `I found ${inventoryItems.length} matching cards in stock — scroll the row below or drag cards to your pile.`);

    return {
      reply,
      game: "magic",
      color: "all",
      cardType: "all",
      highlightItemIds: inventoryItems.map((c) => c.inventoryItemId),
      skipBrowseSearch: true,
    };
  }

  if (
    (input.route.intent === "inventory_lookup" ||
      input.route.intent === "price_check") &&
    inventoryItems.length > 0
  ) {
    const parsed = parseClerkInventoryQuery({
      userQuestion: input.ctx.user_question,
      conversationSummary: input.ctx.conversation_summary,
    });
    const inventoryTotal = input.tools.inventory?.total ?? inventoryItems.length;
    const label = inventorySearchLabel({
      parsed,
      userQuestion: input.ctx.user_question,
      conversationSummary: input.ctx.conversation_summary,
    });
    const reply =
      input.specialist?.direct_answer?.trim() ??
      priceExtremumReply({
        parsed,
        label,
        inventoryItems,
        inventoryTotal,
      }) ??
      (inventoryItems.length === 1
        ? `Yes — we have ${inventoryItems[0]!.name} (${inventoryItems[0]!.qty} in stock${inventoryItems[0]!.listPrice != null ? ` @ $${inventoryItems[0]!.listPrice!.toFixed(2)}` : ""}).`
        : inventoryTotal > inventoryItems.length
          ? `Found ${inventoryTotal} matches for ${label} — showing ${inventoryItems.length} below.`
          : `Found ${inventoryItems.length} matches in stock — check the picks below.`);

    return {
      reply,
      game: parsed.browseGame ?? gameToBrowseFilter(input.route.game),
      color: "all",
      cardType: "all",
      searchQuery: parsed.q,
      highlightItemIds: inventoryItems.map((c) => c.inventoryItemId),
      skipBrowseSearch: true,
    };
  }

  const setProductLookup = isSetProductInventoryRequest({
    userQuestion: input.ctx.user_question,
    conversationSummary: input.ctx.conversation_summary,
  });
  if (
    setProductLookup &&
    (input.route.intent === "inventory_lookup" || input.route.intent === "price_check") &&
    inventoryItems.length === 0
  ) {
    const parsed = parseClerkInventoryQuery({
      userQuestion: input.ctx.user_question,
      conversationSummary: input.ctx.conversation_summary,
    });
    const label = setProductSearchLabel(parsed);
    return {
      reply: `I checked our Magic inventory for ${label} cards but don't have any in stock right now.`,
      game: parsed.browseGame ?? "magic",
      color: "all",
      cardType: "all",
      searchQuery: parsed.q,
      highlightItemIds: [],
      skipBrowseSearch: false,
    };
  }

  const colorIdentityLookup = isColorIdentityInventoryRequest({
    userQuestion: input.ctx.user_question,
    conversationSummary: input.ctx.conversation_summary,
  });
  if (
    colorIdentityLookup &&
    !looksLikeScryfallSyntax(input.ctx.user_question) &&
    (input.route.intent === "inventory_lookup" || input.route.intent === "price_check") &&
    inventoryItems.length === 0
  ) {
    const parsed = parseClerkInventoryQuery({
      userQuestion: input.ctx.user_question,
      conversationSummary: input.ctx.conversation_summary,
    });
    const label = colorIdentitySearchLabel(parsed);
    return {
      reply: `I checked our Magic inventory for ${label} cards but don't have any exact matches in stock right now.`,
      game: "magic",
      color: "all",
      cardType: "all",
      highlightItemIds: [],
      skipBrowseSearch: false,
    };
  }

  const knowledgeContext =
    input.tools.knowledge?.knowledge &&
    (input.tools.ragSuggestedCardNames?.length ||
      educationThenInventory ||
      input.tools.knowledge.knowledge.hits.length > 0)
      ? educationThenInventory && input.tools.knowledge.knowledge.hits.length > 0
        ? formatKnowledgeHitsForLlm(input.tools.knowledge.knowledge.hits)
        : summarizeRagKnowledgeForFormatter(input.tools.knowledge.knowledge)
      : undefined;

  const inventoryForLlm = inventoryItems.slice(0, 32);

  const payload = {
    customer_question: input.ctx.user_question,
    route: {
      game: input.route.game,
      format: input.route.format,
      intent: input.route.intent,
    },
    tool_results: {
      inventory: inventoryForLlm.map(compactInventoryItem),
      inventory_total: inventoryItems.length,
      catalog: input.tools.catalog,
      knowledge_context: knowledgeContext,
      rag_suggested_card_names: input.tools.ragSuggestedCardNames ?? [],
    },
    specialist: input.specialist,
  };

  const formatterPersona =
    input.route.game === "magic"
      ? `${MTG_COMMANDER_AGENT_PERSONA}

You are formatting the final customer message. Output JSON only:
{
  "reply": "your message to the customer",
  "searchQuery": "optional short text to filter the browse grid, or empty string",
  "game": "all|magic|pokemon|yugioh|sports|other",
  "color": "all|W|U|B|R|G|C|multicolor",
  "cardType": "all|commander",
  "highlightItemIds": ["inventory item ids from tool results only"]
}

NEVER invent inventory, quantities, or prices. Only cite cards from tool_results.inventory or specialist recommendations with inventoryItemId.

When tool_results.knowledge_context and tool_results.rag_suggested_card_names are present:
- You used deckbuilding guides to pick staple examples, then checked stock.
- Mention the category briefly, then highlight which suggested staples are in tool_results.inventory.
- Do NOT name cards that are not in tool_results.inventory or specialist recommendations.
- Prefer listing in-stock matches first with prices when available.`
      : CLERK_FORMATTER_PERSONA;

  const raw = await callOpenAiJson<{
    reply?: string;
    searchQuery?: string;
    game?: StoreInventoryGameFilter;
    color?: StoreInventoryColorFilter;
    cardType?: StoreInventoryTypeFilter;
    highlightItemIds?: string[];
  }>(formatterPersona, [
    { type: "text", text: JSON.stringify(payload, null, 2) },
  ]);

  const specialistIds = (input.specialist?.recommendations ?? [])
    .map((r) => r.inventoryItemId)
    .filter(Boolean) as string[];

  const highlightItemIds = [
    ...(raw.highlightItemIds ?? []),
    ...specialistIds,
  ]
    .filter((id) => allowedIds.has(id))
    .slice(0, 12);

  let reply = raw.reply?.trim();
  if (!reply && input.specialist?.direct_answer) {
    reply = input.specialist.direct_answer;
  }
  if (!reply && inventoryItems.length === 1) {
    const c = inventoryItems[0]!;
    reply = `Yes — we have ${c.name} (${c.qty} in stock${c.listPrice != null ? ` @ $${c.listPrice.toFixed(2)}` : ""}).`;
  }
  if (!reply && inventoryItems.length > 1) {
    reply = `I found ${inventoryItems.length} matches in stock — check the grid below.`;
  }
  if (
    !reply &&
    input.specialist?.direct_answer &&
    educationThenInventory
  ) {
    reply = appendStockNote({
      educationAnswer: input.specialist.direct_answer,
      inventoryCount: inventoryItems.length,
    });
  }
  if (!reply && input.tools.knowledge && educationThenInventory) {
    reply =
      "I can explain that mechanic — let me know if you want examples from our in-stock inventory.";
  }
  if (!reply && !input.tools.knowledge && !input.specialist?.direct_answer) {
    reply = "I couldn't find that in stock right now. Want to try a similar name or another game?";
  } else if (!reply) {
    reply = input.specialist?.direct_answer ?? "I couldn't find that in stock right now. Want to try a similar name or another game?";
  }

  return {
    reply,
    searchQuery: raw.searchQuery?.trim() || undefined,
    game: raw.game ?? gameToBrowseFilter(input.route.game),
    color: raw.color,
    cardType: raw.cardType,
    highlightItemIds: [...new Set(highlightItemIds)],
    skipBrowseSearch: false,
  };
}
