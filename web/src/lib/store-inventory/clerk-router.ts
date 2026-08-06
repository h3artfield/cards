import { callOpenAiJson } from "../card-flow-v2/openai-json";
import { CLERK_ROUTER_PERSONA } from "./knowledge/router";
import {
  isConcreteCommanderName,
  parseCommanderFromMessage,
  parseCommanderMaxPrice,
} from "./clerk-tools/commander-context";
import { extractCardNamesFromConversation } from "./clerk-tools/clerk-conversation-cards";
import {
  isCardOrTypeInventoryRequest,
  isCommanderRecommendationRequest,
  isEducationThenInventoryRequest,
  isExplicitDeckBuildRequest,
  isMagicStrategyAdviceRequest,
  isRulesQuestion,
} from "./clerk-tools/clerk-intent";
import {
  isDeckBuildConversation,
  isDeckBuildCommanderPickFollowUp,
  parseCommanderMaxPriceFromConversation,
} from "./clerk-tools/deck-build-context";
import {
  isSemanticFilterActive,
  isSetProductInventoryRequest,
  isColorIdentityInventoryRequest,
  parseClerkInventoryQuery,
} from "./clerk-tools/clerk-query-parser";
import type {
  ClerkAgentId,
  ClerkFormat,
  ClerkGame,
  ClerkIntent,
  ClerkOrchestratorContext,
  ClerkRouterResult,
  ClerkToolId,
} from "./clerk-types";

function normalizeGame(raw?: string): ClerkGame {
  const g = (raw ?? "unknown").toLowerCase();
  const map: Record<string, ClerkGame> = {
    magic: "magic",
    mtg: "magic",
    pokemon: "pokemon",
    pokémon: "pokemon",
    yugioh: "yugioh",
    "yu-gi-oh": "yugioh",
    lorcana: "lorcana",
    flesh_and_blood: "flesh_and_blood",
    "flesh & blood": "flesh_and_blood",
    riftbound: "riftbound",
    one_piece: "one_piece",
    warhammer: "warhammer",
    sports: "sports",
  };
  return map[g] ?? "unknown";
}

function normalizeIntent(raw?: string): ClerkIntent {
  const valid: ClerkIntent[] = [
    "inventory_lookup",
    "price_check",
    "build_deck",
    "deck_analysis",
    "recommendation",
    "substitution",
    "rules_legality",
    "general_chat",
  ];
  const i = (raw ?? "general_chat") as ClerkIntent;
  return valid.includes(i) ? i : "general_chat";
}

function normalizeAgents(raw?: string[]): ClerkAgentId[] {
  const valid = new Set<ClerkAgentId>([
    "mtg_commander",
    "mtg_competitive",
    "pokemon_competitive",
    "lorcana",
    "general",
  ]);
  return (raw ?? []).filter((a): a is ClerkAgentId =>
    valid.has(a as ClerkAgentId),
  );
}

function normalizeTools(raw?: string[]): ClerkToolId[] {
  const valid = new Set<ClerkToolId>([
    "inventory_search",
    "card_catalog",
    "format_legality",
    "deck_validator",
    "price_lookup",
  ]);
  const tools = (raw ?? []).filter((t): t is ClerkToolId =>
    valid.has(t as ClerkToolId),
  );
  if (tools.length === 0) tools.push("inventory_search");
  return tools;
}

function parseBudgetFromQuestion(q: string): number | undefined {
  const patterns = [
    /\bunder\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
    /\bunder\s+(\d+(?:\.\d{2})?)\s*\$/i,
    /\bbelow\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
    /\b(?:budget|max)\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
  ];
  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match?.[1]) return Number.parseFloat(match[1]);
  }
  return undefined;
}

function parseFeaturedPokemon(q: string): string | undefined {
  const deckMatch = q.match(
    /\b(?:build|make|need|want)\s+(?:me\s+)?(?:a\s+)?(.+?)\s+deck\b/i,
  );
  if (deckMatch?.[1]) {
    const name = deckMatch[1].replace(/\bunder\b.*/i, "").trim();
    if (name && !/^(a|an|the)$/i.test(name)) return name;
  }
  return undefined;
}

function heuristicRoute(
  question: string,
  conversationSummary?: string,
): Partial<ClerkRouterResult> {
  const q = question.toLowerCase();
  const cardNames: string[] = [];
  const budget = parseBudgetFromQuestion(question);

  const semanticParsed = parseClerkInventoryQuery({
    userQuestion: question,
    cardNames: [],
  });
  const semanticLookup = isSemanticFilterActive(semanticParsed.semantic);

  const stockMatch = q.match(
    /(?:do you have|got any|in stock|looking for|need a?)\s+(.+?)(?:\?|$)/i,
  );
  const stockPhrase = stockMatch?.[1]?.trim();

  if (stockPhrase && !semanticLookup) {
    cardNames.push(stockPhrase);
  }

  if (isEducationThenInventoryRequest(question, conversationSummary)) {
    return {
      game: "magic",
      format: "commander",
      intent: "general_chat",
      required_agents: [],
      required_tools: ["inventory_search", "card_catalog"],
      constraints: {
        budget,
        inventory_only: false,
        max_price: budget,
      },
    };
  }

  if (isCardOrTypeInventoryRequest(question) || semanticLookup) {
    return {
      game: "magic",
      intent: /\b(price|worth|how much)\b/i.test(q)
        ? "price_check"
        : "inventory_lookup",
      required_agents: [],
      required_tools: ["inventory_search", "price_lookup"],
      entities: semanticLookup
        ? { card_names: [], archetype: stockPhrase }
        : { card_names: cardNames },
    };
  }

  if (/\b(pokemon|pokémon|charizard|pikachu|regulation mark)\b/i.test(q)) {
    const featured = parseFeaturedPokemon(question);
    return {
      game: "pokemon",
      format: /\bexpanded\b/i.test(q) ? "expanded" : "standard",
      intent: /\bbuild\b/i.test(q) ? "build_deck" : "recommendation",
      required_agents: ["pokemon_competitive"],
      required_tools: ["inventory_search"],
      entities: {
        card_names: featured ? [featured] : cardNames,
        featured_card: featured,
      },
      constraints: {
        budget,
        inventory_only: true,
        tournament_date: null,
      },
      clarification_needed: false,
    };
  }

  if (isCommanderRecommendationRequest(question)) {
    return {
      game: "magic",
      format: "commander",
      intent: "recommendation",
      required_agents: ["mtg_commander"],
      required_tools: ["inventory_search", "card_catalog"],
      constraints: {
        budget,
        inventory_only: true,
        max_price: budget,
      },
    };
  }

  if (isRulesQuestion(question)) {
    return {
      game: "magic",
      format: "unknown",
      intent: "rules_legality",
      required_agents: [],
      required_tools: [],
      constraints: {
        budget,
        inventory_only: false,
        max_price: budget,
      },
    };
  }

  if (isMagicStrategyAdviceRequest(question)) {
    return {
      game: "magic",
      format: "commander",
      intent: "general_chat",
      required_agents: [],
      required_tools: ["inventory_search"],
      constraints: {
        budget,
        inventory_only: false,
        max_price: budget,
      },
    };
  }

  if (isExplicitDeckBuildRequest(question)) {
    return {
      game: "magic",
      format: "commander",
      intent: "build_deck",
      required_agents: ["mtg_commander"],
      required_tools: ["inventory_search", "card_catalog", "deck_validator"],
      constraints: {
        budget,
        inventory_only: true,
      },
    };
  }

  return {};
}

export async function routeClerkIntent(
  ctx: ClerkOrchestratorContext,
): Promise<ClerkRouterResult> {
  const history = ctx.conversation_summary || "(none)";
  const userText = `Store: ${ctx.storeName}
Current browse filters: ${JSON.stringify(ctx.currentFilters ?? {})}
Conversation summary:
${history}

Latest customer message: ${ctx.user_question}`;

  const raw = await callOpenAiJson<{
    game?: string;
    format?: string;
    intent?: string;
    entities?: {
      card_names?: string[];
      commander?: string;
      featured_card?: string;
      archetype?: string;
    };
    constraints?: {
      budget?: number | null;
      inventory_only?: boolean;
      max_price?: number | null;
      tournament_date?: string | null;
    };
    required_agents?: string[];
    required_tools?: string[];
    clarification_needed?: boolean;
    clarification_question?: string;
    confidence?: number;
  }>(CLERK_ROUTER_PERSONA, [{ type: "text", text: userText }]);

  const heuristic = heuristicRoute(ctx.user_question, history);

  let game = normalizeGame(raw.game ?? heuristic.game);
  let format = (
    raw.format ??
    heuristic.format ??
    (game === "pokemon" && normalizeIntent(raw.intent) === "build_deck"
      ? "standard"
      : "unknown")
  ) as ClerkFormat;
  let intent = normalizeIntent(raw.intent ?? heuristic.intent);

  const parsedBudget =
    raw.constraints?.budget ??
    heuristic.constraints?.budget ??
    parseBudgetFromQuestion(ctx.user_question);
  const parsedFeatured =
    raw.entities?.featured_card ??
    heuristic.entities?.featured_card ??
    parseFeaturedPokemon(ctx.user_question);

  const parsedCommanderRaw =
    raw.entities?.commander ??
    heuristic.entities?.commander ??
    parseCommanderFromMessage({
      question: ctx.user_question,
      conversationSummary: history,
    });
  const parsedCommander =
    parsedCommanderRaw && isConcreteCommanderName(parsedCommanderRaw)
      ? parsedCommanderRaw
      : undefined;

  const entities = {
    card_names: [
      ...(raw.entities?.card_names ?? []),
      ...(heuristic.entities?.card_names ?? []),
      ...(parsedFeatured ? [parsedFeatured] : []),
      ...(parsedCommander ? [parsedCommander] : []),
    ]
      .filter(Boolean)
      .filter((name) => isConcreteCommanderName(name)),
    commander: parsedCommander,
    featured_card: parsedFeatured,
    archetype: raw.entities?.archetype ?? heuristic.entities?.archetype,
  };

  if (entities.card_names.length === 0 && intent === "inventory_lookup") {
    const quoted = ctx.user_question.match(/"([^"]+)"/);
    if (quoted?.[1]) entities.card_names.push(quoted[1]);
  }

  const conversationCards = extractCardNamesFromConversation({
    question: ctx.user_question,
    conversationSummary: history,
  });
  if (conversationCards.length > 0) {
    entities.card_names = [
      ...new Set([...entities.card_names, ...conversationCards]),
    ];
  }

  const semanticParsed = parseClerkInventoryQuery({
    userQuestion: ctx.user_question,
    conversationSummary: history,
    cardNames: entities.card_names,
  });
  const semanticLookup = isSemanticFilterActive(semanticParsed.semantic);
  const setProductLookup = isSetProductInventoryRequest({
    userQuestion: ctx.user_question,
    conversationSummary: history,
  });
  const colorIdentityLookup = isColorIdentityInventoryRequest({
    userQuestion: ctx.user_question,
    conversationSummary: history,
  });

  if (semanticParsed.browseGame && semanticParsed.browseGame !== "all") {
    game = semanticParsed.browseGame as ClerkGame;
  }

  let required_agents = normalizeAgents(
    raw.required_agents?.length
      ? raw.required_agents
      : heuristic.required_agents,
  );
  let required_tools = normalizeTools(
    raw.required_tools?.length ? raw.required_tools : heuristic.required_tools,
  );

  if (heuristic.required_agents?.includes("mtg_commander")) {
    required_agents = normalizeAgents([
      ...required_agents,
      ...(heuristic.required_agents ?? []),
    ]);
    if (heuristic.game) game = normalizeGame(heuristic.game);
    if (heuristic.format) format = heuristic.format as ClerkFormat;
    if (heuristic.required_tools?.length) {
      required_tools = normalizeTools([
        ...required_tools,
        ...heuristic.required_tools,
      ]);
    }
  }

  if (
    intent === "inventory_lookup" ||
    intent === "price_check"
  ) {
    required_agents = [];
    if (!required_tools.includes("inventory_search")) {
      required_tools = ["inventory_search", ...required_tools];
    }
  } else if (
    semanticLookup &&
    !isCommanderRecommendationRequest(ctx.user_question) &&
    !isExplicitDeckBuildRequest(ctx.user_question, history)
  ) {
    required_agents = [];
    game = "magic";
  }

  if (
    intent === "build_deck" &&
    !isExplicitDeckBuildRequest(ctx.user_question, history) &&
    game !== "pokemon"
  ) {
    intent = isCardOrTypeInventoryRequest(ctx.user_question, history)
      ? "inventory_lookup"
      : "recommendation";
    if (intent === "inventory_lookup") {
      required_agents = [];
    }
  }

  if (
    isCardOrTypeInventoryRequest(ctx.user_question, history) &&
    !isEducationThenInventoryRequest(ctx.user_question, history) &&
    intent !== "price_check" &&
    !isDeckBuildConversation({ question: ctx.user_question, conversationSummary: history })
  ) {
    intent = "inventory_lookup";
    required_agents = [];
  }

  const deckBuildThread = isDeckBuildConversation({
    question: ctx.user_question,
    conversationSummary: history,
  });
  const explicitDeckBuild = isExplicitDeckBuildRequest(ctx.user_question, history);

  if (deckBuildThread && explicitDeckBuild) {
    game = "magic";
    format = "commander";
    intent = "build_deck";
    required_agents = ["mtg_commander"];
    if (!required_tools.includes("inventory_search")) {
      required_tools = ["inventory_search", ...required_tools];
    }
    if (!required_tools.includes("card_catalog")) {
      required_tools.push("card_catalog");
    }
    if (!required_tools.includes("deck_validator")) {
      required_tools.push("deck_validator");
    }
  }

  if (setProductLookup || colorIdentityLookup) {
    intent = "inventory_lookup";
    required_agents = [];
    game = "magic";
    if (!required_tools.includes("inventory_search")) {
      required_tools = ["inventory_search", ...required_tools];
    }
  }

  if (conversationCards.length > 0) {
    intent = "inventory_lookup";
    required_agents = [];
    game = "magic";
  }

  if (isMagicStrategyAdviceRequest(ctx.user_question)) {
    game = "magic";
    format = "commander";
    intent = "general_chat";
    required_agents = [];
    if (!required_tools.includes("inventory_search")) {
      required_tools = ["inventory_search", ...required_tools];
    }
  }

  if (isEducationThenInventoryRequest(ctx.user_question, history)) {
    game = "magic";
    format = "commander";
    intent = "general_chat";
    required_agents = [];
    if (!required_tools.includes("inventory_search")) {
      required_tools = ["inventory_search", ...required_tools];
    }
  }

  const canBuildPokemonDeck =
    intent === "build_deck" &&
    game === "pokemon" &&
    Boolean(entities.featured_card ?? entities.archetype ?? entities.card_names[0]);

  const canBuildMtgCommanderDeck =
    intent === "build_deck" &&
    explicitDeckBuild &&
    (game === "magic" || format === "commander") &&
    (Boolean(parsedCommander ?? entities.featured_card) ||
      parseCommanderMaxPriceFromConversation({
        question: ctx.user_question,
        conversationSummary: history,
      }) != null ||
      /\bcommander\b/i.test(ctx.user_question) ||
      deckBuildThread);

  let clarification_needed = Boolean(raw.clarification_needed);
  let clarification_question = raw.clarification_question?.trim() || undefined;
  if (canBuildPokemonDeck || canBuildMtgCommanderDeck) {
    clarification_needed = false;
    clarification_question = undefined;
  }
  if (
    setProductLookup ||
    colorIdentityLookup ||
    (isCardOrTypeInventoryRequest(ctx.user_question, history) &&
      intent === "inventory_lookup")
  ) {
    clarification_needed = false;
    clarification_question = undefined;
  }

  return {
    game,
    format,
    intent,
    entities,
    constraints: {
      budget: parsedBudget ?? undefined,
      inventory_only: raw.constraints?.inventory_only ?? true,
      max_price: raw.constraints?.max_price ?? parsedBudget ?? undefined,
      tournament_date: raw.constraints?.tournament_date ?? null,
    },
    required_agents,
    required_tools,
    clarification_needed,
    clarification_question,
    confidence: raw.confidence ?? 0.75,
  };
}
