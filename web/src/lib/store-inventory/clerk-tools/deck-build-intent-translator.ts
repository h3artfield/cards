import { callOpenAiJson } from "../../card-flow-v2/openai-json";
import {
  formatKnowledgeHitsForLlm,
  hybridRetrieveMtgKnowledge,
} from "../../mtg-rag/hybrid-retrieval";
import { isMtgRagEnabled } from "../../mtg-rag/constants";
import { isDeckThemePhrase } from "./deck-theme-phrases";

export interface DeckBuildIntentTranslation {
  /** What the customer is actually asking for, in plain English. */
  userGoal: string;
  /** Exact commander name if they named one (e.g. "Atraxa, Praetors' Voice"). */
  namedCommander?: string;
  /** Theme / archetype keywords: birds, politics, planeswalkers, tokens, etc. */
  themeKeywords: string[];
  /** Featured card they want built around (e.g. Smaug) — may or may not be the commander. */
  featuredCard?: string;
  /** Set or product line mentioned (e.g. "The Hobbit"). */
  setOrProduct?: string;
  /** WUBRG color hints from the request. */
  colorHints: string[];
  /** Commander names suggested by research (EDHREC/community knowledge). */
  suggestedCommanders: string[];
  /** 2-3 sentence strategy the deck should pursue. */
  strategySummary: string;
  /** Short queries useful for EDHREC / knowledge lookup. */
  researchQueries: string[];
}

const DECK_BUILD_TRANSLATOR_PERSONA = `
You translate a customer's deck-building request into structured intent for a Magic: The Gathering store clerk.
Output JSON only:
{
  "userGoal": "plain English summary of what they want",
  "namedCommander": "exact English card name or null",
  "themeKeywords": ["birds", "politics"],
  "featuredCard": "exact card name or null",
  "setOrProduct": "set name or null",
  "colorHints": ["W", "U"],
  "suggestedCommanders": ["Commander Name 1", "Commander Name 2"],
  "strategySummary": "2-3 sentences on how this deck should play",
  "researchQueries": ["birds commander edhrec", "group hug politics commanders"]
}

Rules:
- Read the FULL conversation — follow-ups may only answer an earlier question.
- namedCommander ONLY when they explicitly name a legendary commander/card to lead the deck.
- themeKeywords for tribes, archetypes, vibes: birds, goblins, politics, group hug, artifacts, planeswalkers, counters, etc.
- featuredCard when they reference a specific card to build around (e.g. Smaug) even if not yet the commander.
- suggestedCommanders: 3-6 REAL Magic commander names that fit the theme — use EDHREC/community knowledge.
  For birds: Kangee, Aerie Mystics, Kari Zev? Actually good bird commanders: Kangee, Aerie Mystics - let LLM know.
  For politics/group hug: Queen Marchesa, Kwain, Zedruu, Thrasios? 
  For Atraxa + planeswalkers: Atraxa, Praetors' Voice
  For Smaug: look up Smaug card if exists
- Do NOT suggest Animar unless the request is about +1/+1 counters or morph.
- researchQueries: 1-3 short search phrases for EDHREC/forum research.
- colorHints: W/U/B/R/G letters only when explicitly requested or obvious from named commander.
`.trim();

export async function translateDeckBuildIntent(input: {
  question: string;
  conversationSummary?: string;
}): Promise<DeckBuildIntentTranslation> {
  const combined = [
    input.conversationSummary?.trim(),
    `Latest message: ${input.question.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let knowledgeBlock = "";
  if (isMtgRagEnabled()) {
    try {
      const rag = await hybridRetrieveMtgKnowledge({
        question: input.question,
        intent: "commander_strategy",
        limit: 5,
      });
      if (rag.hits.length > 0) {
        knowledgeBlock = formatKnowledgeHitsForLlm(rag.hits);
      }
    } catch {
      /* optional */
    }
  }

  const raw = await callOpenAiJson<{
    userGoal?: string;
    namedCommander?: string | null;
    themeKeywords?: string[];
    featuredCard?: string | null;
    setOrProduct?: string | null;
    colorHints?: string[];
    suggestedCommanders?: string[];
    strategySummary?: string;
    researchQueries?: string[];
  }>(DECK_BUILD_TRANSLATOR_PERSONA, [
    {
      type: "text",
      text: [
        "Conversation:",
        combined,
        knowledgeBlock ? "\nRetrieved MTG knowledge:\n" + knowledgeBlock : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]);

  const themeKeywords = [...new Set((raw.themeKeywords ?? []).map((k) => k.trim()).filter(Boolean))];
  const suggestedCommanders = [
    ...new Set((raw.suggestedCommanders ?? []).map((n) => n.trim()).filter(Boolean)),
  ].slice(0, 8);

  const namedCommander = raw.namedCommander?.trim() || undefined;
  if (namedCommander && isDeckThemePhrase(namedCommander)) {
    themeKeywords.push(namedCommander);
  }

  return {
    userGoal: raw.userGoal?.trim() || input.question.trim(),
    namedCommander:
      namedCommander && !isDeckThemePhrase(namedCommander)
        ? namedCommander
        : undefined,
    themeKeywords,
    featuredCard: raw.featuredCard?.trim() || undefined,
    setOrProduct: raw.setOrProduct?.trim() || undefined,
    colorHints: (raw.colorHints ?? []).filter((c) =>
      ["W", "U", "B", "R", "G"].includes(c),
    ),
    suggestedCommanders,
    strategySummary:
      raw.strategySummary?.trim() ||
      `Building a deck around ${themeKeywords.join(", ") || "your request"}.`,
    researchQueries: (raw.researchQueries ?? []).map((q) => q.trim()).filter(Boolean).slice(0, 3),
  };
}
