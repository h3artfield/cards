import { callOpenAiJson } from "../card-flow-v2/openai-json";
import type { MtgQueryEntities, MtgQueryIntent } from "./types";
import { isEducationThenInventoryRequest } from "./education-topics";
import { isRulesQuestion } from "../store-inventory/clerk-tools/rules-question";

export interface MtgQueryRouterResult {
  intent: MtgQueryIntent;
  confidence: number;
  entities: MtgQueryEntities;
  requiresInventory: boolean;
  requiresKnowledge: boolean;
}

const MTG_QUERY_ROUTER_PERSONA = `
You classify Magic: The Gathering customer questions for a knowledge retrieval system.
Output JSON only:
{
  "intent": "inventory_lookup|price_lookup|card_identity_oracle|rules_question|terminology_question|color_identity_question|commander_strategy|deckbuilding_education|recommendation|mixed",
  "confidence": 0.0,
  "entities": {
    "commanderNames": [],
    "cardNames": [],
    "colorIdentities": [],
    "formats": [],
    "requestedRuleNumbers": []
  },
  "requiresInventory": false,
  "requiresKnowledge": true
}

Intent guide:
- inventory_lookup / price_lookup: stock or price at the store
- card_identity_oracle: specific card oracle text or Scryfall facts (not glossary)
- rules_question: Comprehensive Rules, stack, priority, layers, timestamps
- terminology_question: slang, archetype terms, "what is a mana dork"
- color_identity_question: color pairs, shards, wedges, guild names
- commander_strategy: how to play a commander, packages, engines (not building a full deck list from stock)
- deckbuilding_education: general deckbuilding theory from transcripts
- recommendation: suggest commanders/cards (usually needs inventory)
- mixed: needs both knowledge and inventory

Never classify simple "do you have X" as knowledge.
`.trim();

function parseRuleNumbers(q: string): string[] {
  const out = new Set<string>();
  for (const match of q.matchAll(/\b(\d{3}(?:\.\d+[a-z]?)?)\b/g)) {
    if (match[1]) out.add(match[1]);
  }
  return [...out];
}

function parseColorIdentities(q: string): string[] {
  const out = new Set<string>();
  const patterns = [
    /\b(jeskai|esper|grixis|jund|naya|bant|abzan|mardu|temur|azorius|dimir|rakdos|gruul|selesnya|orzhov|izzet|golgari|boros|simic)\b/gi,
    /\b(bug|wubrg|five.?color)\b/gi,
    /\bmono-?\s*(white|blue|black|red|green|w|u|b|r|g)\b/gi,
    /\b(wu|ub|br|rg|gw|wb|ur|bg|rw|gu)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of q.matchAll(pattern)) {
      if (match[0]) out.add(match[0].toLowerCase());
    }
  }
  return [...out];
}

function heuristicMtgQueryIntent(question: string): Partial<MtgQueryRouterResult> | null {
  const q = question.toLowerCase();

  if (
    /\b(color pairing|color pair|guild|wedge|shard)\b/i.test(q) ||
    /\bwhat (\d+|one|two|three|four|4|3|2|1) colors?\b/i.test(q) ||
    /\b(\d+|four|4|three|3|two|2) colors?\b/i.test(q)
  ) {
    return {
      intent: "color_identity_question",
      confidence: 0.92,
      requiresInventory: false,
      requiresKnowledge: true,
    };
  }

  if (/\b(do you have|in stock|how much|price|got any|looking for|you have|we have|cards you have)\b/i.test(q)) {
    if (isEducationThenInventoryRequest(question)) {
      return {
        intent: "mixed",
        confidence: 0.92,
        requiresInventory: true,
        requiresKnowledge: true,
      };
    }
    return {
      intent: /\b(price|how much|worth)\b/i.test(q) ? "price_lookup" : "inventory_lookup",
      confidence: 0.9,
      requiresInventory: true,
      requiresKnowledge: false,
    };
  }

  if (/\bwhat are some\b.*\bcards?\b/i.test(q)) {
    if (isEducationThenInventoryRequest(question)) {
      return {
        intent: "mixed",
        confidence: 0.9,
        requiresInventory: true,
        requiresKnowledge: true,
      };
    }
    return {
      intent: "inventory_lookup",
      confidence: 0.88,
      requiresInventory: true,
      requiresKnowledge: false,
    };
  }

  if (
    /\b(sleeper|hidden gem|underrated|spicy|off-meta|who do you think|crazy synergy|badass commander|fun commander|unique commander)\b/i.test(
      q,
    )
  ) {
    return {
      intent: "commander_strategy",
      confidence: 0.9,
      requiresInventory: false,
      requiresKnowledge: true,
    };
  }

  if (/\bbuild\b.*\bdeck\b/i.test(q) || /\bdeck list\b/i.test(q)) {
    return {
      intent: "recommendation",
      confidence: 0.85,
      requiresInventory: true,
      requiresKnowledge: false,
    };
  }

  if (isRulesQuestion(question)) {
    return {
      intent: "rules_question",
      confidence: 0.92,
      requiresInventory: false,
      requiresKnowledge: true,
    };
  }

  if (/\b(rule \d|comprehensive rules|state-based|stack|priority|layer|timestamp|sb?a)\b/i.test(q)) {
    return {
      intent: "rules_question",
      confidence: 0.88,
      requiresInventory: false,
      requiresKnowledge: true,
    };
  }

  if (
    /\b(what is|what are|what does|define|explain|mean|term for)\b/i.test(q) &&
    !/\bcards?\b/i.test(q)
  ) {
    if (
      parseColorIdentities(q).length > 0 ||
      /\b(wedge|shard|guild|color identity)\b/i.test(q)
    ) {
      return {
        intent: "color_identity_question",
        confidence: 0.86,
        requiresInventory: false,
        requiresKnowledge: true,
      };
    }
    if (/\bexplain .+ in mtg\b/i.test(q) && !/\brule\b/i.test(q)) {
      return {
        intent: "terminology_question",
        confidence: 0.86,
        requiresInventory: false,
        requiresKnowledge: true,
      };
    }
    return {
      intent: "terminology_question",
      confidence: 0.8,
      requiresInventory: false,
      requiresKnowledge: true,
    };
  }

  if (/\b(jeskai|esper|grixis|bant|naya|abzan|mardu|temur|bug|color identity|shard|wedge)\b/i.test(q)) {
    return {
      intent: "color_identity_question",
      confidence: 0.85,
      requiresInventory: false,
      requiresKnowledge: true,
    };
  }

  if (/\b(bracket \d|hidden commander|counterweight|commander archetypes?)\b/i.test(q)) {
    return {
      intent: "deckbuilding_education",
      confidence: 0.86,
      requiresInventory: false,
      requiresKnowledge: true,
    };
  }

  if (/\b(quadrant theory|mana curve|ramp package|deckbuilding 101|how to build|edhrec|scryfall tutorial)\b/i.test(q)) {
    return {
      intent: "deckbuilding_education",
      confidence: 0.84,
      requiresInventory: false,
      requiresKnowledge: true,
    };
  }

  if (/\b(archetype|primer|how does .+ commander|strategy for|win condition)\b/i.test(q)) {
    return {
      intent: "commander_strategy",
      confidence: 0.8,
      requiresInventory: false,
      requiresKnowledge: true,
    };
  }

  return null;
}

function normalizeIntent(raw?: string): MtgQueryIntent {
  const valid: MtgQueryIntent[] = [
    "inventory_lookup",
    "price_lookup",
    "card_identity_oracle",
    "rules_question",
    "terminology_question",
    "color_identity_question",
    "commander_strategy",
    "deckbuilding_education",
    "recommendation",
    "mixed",
  ];
  const intent = (raw ?? "mixed") as MtgQueryIntent;
  return valid.includes(intent) ? intent : "mixed";
}

export async function routeMtgKnowledgeQuery(input: {
  question: string;
  conversationSummary?: string;
}): Promise<MtgQueryRouterResult> {
  const heuristic = heuristicMtgQueryIntent(input.question);
  if (heuristic?.confidence && heuristic.confidence >= 0.85 && heuristic.intent) {
    return {
      intent: heuristic.intent,
      confidence: heuristic.confidence,
      entities: {
        commanderNames: [],
        cardNames: [],
        colorIdentities: parseColorIdentities(input.question),
        formats: [],
        requestedRuleNumbers: parseRuleNumbers(input.question),
      },
      requiresInventory: heuristic.requiresInventory ?? false,
      requiresKnowledge: heuristic.requiresKnowledge ?? true,
    };
  }

  const raw = await callOpenAiJson<{
    intent?: string;
    confidence?: number;
    entities?: Partial<MtgQueryEntities>;
    requiresInventory?: boolean;
    requiresKnowledge?: boolean;
  }>(MTG_QUERY_ROUTER_PERSONA, [
    {
      type: "text",
      text: `Conversation:\n${input.conversationSummary ?? "(none)"}\n\nQuestion: ${input.question}`,
    },
  ]);

  const intent = normalizeIntent(raw.intent ?? heuristic?.intent);
  return {
    intent,
    confidence: raw.confidence ?? heuristic?.confidence ?? 0.7,
    entities: {
      commanderNames: raw.entities?.commanderNames ?? [],
      cardNames: raw.entities?.cardNames ?? [],
      colorIdentities: raw.entities?.colorIdentities ?? parseColorIdentities(input.question),
      formats: raw.entities?.formats ?? [],
      requestedRuleNumbers:
        raw.entities?.requestedRuleNumbers ?? parseRuleNumbers(input.question),
    },
    requiresInventory: raw.requiresInventory ?? heuristic?.requiresInventory ?? false,
    requiresKnowledge: raw.requiresKnowledge ?? heuristic?.requiresKnowledge ?? true,
  };
}

export function shouldUseKnowledgeRetrieval(route: MtgQueryRouterResult): boolean {
  return (
    route.requiresKnowledge &&
    route.intent !== "inventory_lookup" &&
    route.intent !== "price_lookup" &&
    route.intent !== "card_identity_oracle"
  );
}
