import { callOpenAiJson } from "../../card-flow-v2/openai-json";
import {
  formatKnowledgeHitsForLlm,
  type MtgHybridRetrievalResult,
} from "../../mtg-rag/hybrid-retrieval";
import {
  appendSourcesIfMissing,
  citationsFromKnowledgeHits,
  officialRulesHits,
  ragDisabledRulesMessage,
  rulesChunksInsufficientMessage,
} from "../../mtg-rag/rules-citations";
import type { MtgQueryRouterResult } from "../../mtg-rag/mtg-query-router";
import type {
  ClerkOrchestratorContext,
  SpecialistResponse,
} from "../clerk-types";

const MTG_KNOWLEDGE_AGENT_PERSONA = `
You are the Magic: The Gathering knowledge specialist for a local game store clerk.
Answer like an enthusiastic, expert LGS employee — not a generic chatbot.
Use the retrieved knowledge chunks as your primary source. Do not invent rules.

Authority order (highest first):
1. official_rules (Comprehensive Rules) — cite rule numbers like "CR 117.3"
2. curated_internal (glossary, color identity, commander primers)
3. community_education (YouTube transcripts) — frame as community tips, not official rules

Output JSON only:
{
  "direct_answer": "3-8 sentences for the customer — be specific and helpful",
  "citations": ["CR 117.3", "Glossary: mana dork"],
  "warnings": ["optional caveats"],
  "confidence": 0.0
}

Rules:
- For rules_question intents, include at least one CR citation when chunks provide rule numbers.
- For terminology, give a plain-language definition.
- For color identity, name the colors and typical strategy.
- For commander_strategy / sleeper / synergy / opinion questions:
  * Name specific commanders, cards, packages, or synergies from the chunks when available.
  * Bold every card or commander name you mention, e.g. **Kess, Dissident Mage**.
  * Explain WHY they are cool — engines, combos, play patterns.
  * Never refuse to answer with "I'm unable to provide recommendations" — give your best grounded take from the chunks.
  * If chunks mention underrated or off-meta options, lead with those for sleeper questions.
  * Clearly label community/transcript tips vs official rules when relevant.
- For deckbuilding education, explain concepts with examples from the chunks.
- If chunks are thin, say what you can from them and note limits — still be helpful, do not deflect.
- When the customer asks "do you have" or mentions our inventory, lead with a thorough educational answer (mechanic, archetype, or slang), name specific example cards/commanders in **bold**, then stock will be checked separately — never reply with only "we don't have that in stock."
`.trim();

const MTG_RULES_AGENT_PERSONA = `
You are the Magic: The Gathering rules specialist for a local game store clerk.
You answer ONLY from the retrieved Comprehensive Rules chunks below.

Output JSON only:
{
  "direct_answer": "Clear rules explanation in plain language (3-8 sentences)",
  "citations": ["CR 117.3", "Comprehensive Rules 704.5"],
  "warnings": ["optional caveats if chunks are partial"],
  "confidence": 0.0
}

STRICT RULES:
- Every factual rules statement must come from the retrieved chunks — do NOT use outside knowledge.
- You MUST include at least one citation from the chunks (rule number or citation label provided).
- Cite using the exact rule numbers from the chunks, e.g. "CR 117.3" or "Comprehensive Rules 704.5".
- If the chunks do not fully answer the question, say what the loaded rules DO cover and note the gap — do not guess.
- Do not recommend cards, deck ideas, or strategy — rules only.
- Do not invent rule numbers.
`.trim();

const MTG_DIRECT_KNOWLEDGE_PERSONA = `
You are a Magic: The Gathering expert at a local game store.
Answer the customer's question directly and accurately from your training knowledge.
When they ask "do you have" or mention stock, still give a full educational answer first — explain the mechanic, archetype, or slang term, name example cards and commanders, then note that specific in-stock availability will be checked separately.
Do not invent Comprehensive Rules numbers unless you are confident.
For color pairings, name the colors (W/U/B/R/G) and the common nickname if there is one.
Output JSON only:
{
  "direct_answer": "3-10 sentences — educate like a knowledgeable LGS clerk",
  "citations": [],
  "warnings": ["optional caveats if unsure"],
  "confidence": 0.0
}
`.trim();

const POKEMON_DIRECT_KNOWLEDGE_PERSONA = `
You are a Pokémon TCG expert at a local game store.
Answer the customer's question directly and accurately.
Output JSON only:
{
  "direct_answer": "2-6 sentences",
  "citations": [],
  "warnings": ["optional caveats if unsure"],
  "confidence": 0.0
}
`.trim();

function gamePrefixForQuestion(question: string): "magic" | "pokemon" {
  if (/\b(pokemon|pokémon|charizard|pikachu|tcg)\b/i.test(question)) {
    return "pokemon";
  }
  return "magic";
}

async function runDirectKnowledgeFallback(input: {
  question: string;
  rulesQuestion?: boolean;
}): Promise<SpecialistResponse> {
  if (input.rulesQuestion) {
    return {
      direct_answer: rulesChunksInsufficientMessage(),
      recommendations: [],
      inventory_queries: [],
      missing_information: [
        "Rules question blocked — no Comprehensive Rules chunks retrieved.",
      ],
      warnings: ["Did not use model knowledge for rules (anti-hallucination)."],
      confidence: 0.15,
    };
  }

  const game = gamePrefixForQuestion(input.question);
  const prefixed =
    game === "pokemon"
      ? `In Pokémon TCG, ${input.question}`
      : `In Magic: The Gathering, ${input.question}`;

  const persona =
    game === "pokemon"
      ? POKEMON_DIRECT_KNOWLEDGE_PERSONA
      : MTG_DIRECT_KNOWLEDGE_PERSONA;

  const raw = await callOpenAiJson<{
    direct_answer?: string;
    citations?: string[];
    warnings?: string[];
    confidence?: number;
  }>(persona, [{ type: "text", text: prefixed }]);

  const answer =
    raw.direct_answer?.trim() ??
    "I don't have a confident answer for that — ask about a specific card in our inventory and I'll check stock.";

  return {
    direct_answer: answer,
    recommendations: [],
    inventory_queries: [],
    missing_information: ["Answered via direct model knowledge (no RAG chunks)."],
    warnings: raw.warnings ?? [],
    confidence: Math.min(raw.confidence ?? 0.55, 0.75),
  };
}

function mergeCitations(
  llmCitations: string[],
  hitCitations: string[],
): string[] {
  return [...new Set([...llmCitations, ...hitCitations].map((c) => c.trim()).filter(Boolean))];
}

export async function runMtgKnowledgeSpecialist(input: {
  ctx: ClerkOrchestratorContext;
  mtgRoute: MtgQueryRouterResult;
  knowledge: MtgHybridRetrievalResult;
  rulesOnly?: boolean;
  ragEnabled?: boolean;
}): Promise<SpecialistResponse> {
  const rulesOnly =
    input.rulesOnly ?? input.mtgRoute.intent === "rules_question";

  if (rulesOnly && input.ragEnabled === false) {
    return {
      direct_answer: ragDisabledRulesMessage(),
      recommendations: [],
      inventory_queries: [],
      missing_information: ["MTG RAG disabled — rules lookup unavailable."],
      warnings: [],
      confidence: 0.1,
    };
  }

  const hitsForContext = rulesOnly
    ? officialRulesHits(input.knowledge.hits)
    : input.knowledge.hits;

  if (hitsForContext.length === 0) {
    return runDirectKnowledgeFallback({
      question: input.ctx.user_question,
      rulesQuestion: rulesOnly,
    });
  }

  const context = formatKnowledgeHitsForLlm(hitsForContext);
  const chunkCitations = citationsFromKnowledgeHits(hitsForContext);
  const persona = rulesOnly ? MTG_RULES_AGENT_PERSONA : MTG_KNOWLEDGE_AGENT_PERSONA;

  const raw = await callOpenAiJson<{
    direct_answer?: string;
    citations?: string[];
    warnings?: string[];
    confidence?: number;
  }>(persona, [
    {
      type: "text",
      text: [
        `Customer question: ${input.ctx.user_question}`,
        `Intent: ${input.mtgRoute.intent}`,
        rulesOnly
          ? "RULES-ONLY MODE: use Comprehensive Rules chunks only; cite every rule you rely on."
          : "",
        `Entities: ${JSON.stringify(input.mtgRoute.entities)}`,
        "",
        "Retrieved knowledge:",
        context,
        chunkCitations.length
          ? `\nRequired citations to include: ${chunkCitations.join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]);

  const citations = mergeCitations(raw.citations ?? [], chunkCitations);
  const answer =
    raw.direct_answer?.trim() ??
    (rulesOnly
      ? rulesChunksInsufficientMessage()
      : "I couldn't find a confident answer in our knowledge base.");

  const withSources = appendSourcesIfMissing(answer, citations);

  return {
    direct_answer: withSources,
    recommendations: [],
    inventory_queries: [],
    missing_information: [],
    warnings: raw.warnings ?? [],
    confidence: rulesOnly
      ? Math.min(raw.confidence ?? 0.75, 0.9)
      : (raw.confidence ?? 0.7),
  };
}
