import { callOpenAiJson } from "../card-flow-v2/openai-json";
import { COMMANDER_DECK_BUILDER_GUIDE } from "./knowledge/commander";
import type {
  DeckBuilderInventoryCard,
  EdhrecCardRecommendation,
  StoreDeckCard,
} from "./types";

export interface DeckBuilderAgentInput {
  message: string;
  commanderName: string;
  themeSlug?: string;
  targetBracket?: number;
  deckCards: StoreDeckCard[];
  inventory: DeckBuilderInventoryCard[];
  recommendations: EdhrecCardRecommendation[];
  deckSummary?: {
    mainCount: number;
    gameChangerCount: number;
    valid: boolean;
  };
}

export interface DeckBuilderAgentResponse {
  reply: string;
  suggestedAdds: Array<{ scryfallId: string; name: string; reason: string }>;
  suggestedRemoves: Array<{ scryfallId: string; name: string; reason: string }>;
}

function buildAllowedIdSet(input: DeckBuilderAgentInput): Set<string> {
  const ids = new Set<string>();
  for (const i of input.inventory) ids.add(i.scryfallId);
  for (const r of input.recommendations) ids.add(r.scryfallId);
  for (const c of input.deckCards) ids.add(c.scryfallId);
  return ids;
}

export async function runDeckBuilderAgent(
  input: DeckBuilderAgentInput,
): Promise<DeckBuilderAgentResponse> {
  const allowed = buildAllowedIdSet(input);

  const inventoryLines = input.inventory
    .slice(0, 80)
    .map(
      (i) =>
        `- ${i.name} (${i.scryfallId}): ${i.qty} in stock @ $${(i.listPrice ?? i.tcgLowPrice ?? 0).toFixed(2)}${i.synergy != null ? `, ${Math.round(i.synergy * 100)}% synergy` : ""}`,
    )
    .join("\n");

  const recLines = input.recommendations
    .slice(0, 60)
    .map(
      (r) =>
        `- ${r.name} (${r.scryfallId}): ${Math.round(r.synergy * 100)}% synergy, ${Math.round(r.inclusion * 100)}% inclusion [${r.category}]`,
    )
    .join("\n");

  const deckLines = input.deckCards
    .map((c) => `- ${c.scryfallId} x${c.qty} (${c.board})`)
    .join("\n");

  const system = `${COMMANDER_DECK_BUILDER_GUIDE}

Respond with JSON:
{
  "reply": "helpful markdown-free text for the customer",
  "suggestedAdds": [{ "scryfallId": "uuid", "name": "Card Name", "reason": "why" }],
  "suggestedRemoves": [{ "scryfallId": "uuid", "name": "Card Name", "reason": "why" }]
}

Only use scryfallId values from the inventory or recommendations lists below.
Prioritize in-stock cards when synergy is within 5% of the best option.`;

  const userText = `Commander: ${input.commanderName}
Theme: ${input.themeSlug ?? "general"}
Target bracket: ${input.targetBracket ?? "not set"}
Deck (${input.deckSummary?.mainCount ?? "?"} main / GC: ${input.deckSummary?.gameChangerCount ?? "?"}):
${deckLines || "(empty)"}

In-stock inventory (prefer these):
${inventoryLines || "(none linked yet)"}

EDHREC recommendations:
${recLines || "(sync commander data first)"}

Customer question: ${input.message}`;

  const raw = await callOpenAiJson<DeckBuilderAgentResponse>(system, [
    { type: "text", text: userText },
  ]);

  const filterSuggestions = (
    rows: DeckBuilderAgentResponse["suggestedAdds"],
  ) =>
    (rows ?? []).filter(
      (r) => allowed.has(r.scryfallId) && r.name && r.reason,
    );

  return {
    reply: raw.reply ?? "I couldn't generate a response.",
    suggestedAdds: filterSuggestions(raw.suggestedAdds),
    suggestedRemoves: filterSuggestions(raw.suggestedRemoves),
  };
}
