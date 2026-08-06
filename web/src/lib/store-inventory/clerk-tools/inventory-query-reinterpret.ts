import { callOpenAiJson } from "../../card-flow-v2/openai-json";
import { isMtgRagEnabled } from "../../mtg-rag/constants";
import {
  formatKnowledgeHitsForLlm,
  hybridRetrieveMtgKnowledge,
} from "../../mtg-rag/hybrid-retrieval";
import type { ParsedClerkInventoryQuery } from "./clerk-query-parser";
import { parseClerkInventoryQuery } from "./clerk-query-parser";

const REINTERPRET_PERSONA = `
You reinterpret failed Magic: The Gathering inventory searches into structured browse filters.
You know Scryfall search syntax (id:, c:, t:, o:, kw:, mv:, e:, r:, function:, is:commander), wedge/shard/guild names, and card categories.

Output JSON only:
{
  "q": "optional free-text for set or card name substring search",
  "colorIdentityExact": ["G","U","R"],
  "colorsExact": ["U","R"],
  "typeIncludes": ["instant","creature"],
  "oracleTagsAny": ["ramp","removal"],
  "keywordsAny": ["Flying"],
  "oracleTextAny": ["draw a card"],
  "cmcMin": null,
  "cmcMax": null,
  "rarityAny": ["mythic"],
  "colorIdentityLabel": "Temur",
  "semanticOnly": true,
  "notes": "one short sentence explaining the reinterpretation"
}

Rules:
- Wedge names (Temur, Abzan, Jeskai, etc.) → colorIdentityExact with WUBRG letters, NOT a card name in q.
- Category requests (ramp, draw, removal, board wipe) → oracleTagsAny when possible.
- Scryfall-style tokens in the question should map to the closest structured fields.
- Set codes like FIN or e:fin → q "final fantasy" or the set code.
- Use semanticOnly true when filters alone should drive the search (no name substring q).
- Do not invent card names — only structured filters.
`.trim();

export async function reinterpretInventoryQueryViaRag(input: {
  question: string;
  conversationSummary?: string;
  priorStrategy: string;
}): Promise<{
  parsed: ParsedClerkInventoryQuery;
  notes?: string;
} | null> {
  if (!isMtgRagEnabled()) return null;

  const knowledge = await hybridRetrieveMtgKnowledge({
    question: `${input.question}\n\nScryfall syntax and color identity reference`,
    intent: "mixed",
  });

  if (knowledge.hits.length === 0) return null;

  const raw = await callOpenAiJson<{
    q?: string;
    colorIdentityExact?: string[];
    colorsExact?: string[];
    typeIncludes?: string[];
    oracleTagsAny?: string[];
    keywordsAny?: string[];
    oracleTextAny?: string[];
    cmcMin?: number | null;
    cmcMax?: number | null;
    rarityAny?: string[];
    colorIdentityLabel?: string;
    semanticOnly?: boolean;
    notes?: string;
  }>(REINTERPRET_PERSONA, [
    {
      type: "text",
      text: [
        `Customer question: ${input.question}`,
        input.conversationSummary
          ? `Conversation:\n${input.conversationSummary}`
          : "",
        `Prior search strategy that returned no results: ${input.priorStrategy}`,
        "",
        "Retrieved knowledge:",
        formatKnowledgeHitsForLlm(knowledge.hits.slice(0, 8)),
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]);

  const semantic = {
    cmcMin: raw.cmcMin ?? undefined,
    cmcMax: raw.cmcMax ?? undefined,
    typeIncludes: raw.typeIncludes?.filter(Boolean),
    oracleTagsAny: raw.oracleTagsAny?.filter(Boolean),
    keywordsAny: raw.keywordsAny?.filter(Boolean),
    oracleTextAny: raw.oracleTextAny?.filter(Boolean),
    colorIdentityExact: raw.colorIdentityExact?.filter(Boolean),
    colorsExact: raw.colorsExact?.filter(Boolean),
    rarityAny: raw.rarityAny?.filter(Boolean),
  };

  const hasSemantic = Object.values(semantic).some((value) =>
    Array.isArray(value) ? value.length > 0 : value != null,
  );

  if (!hasSemantic && !raw.q?.trim()) return null;

  const parsed: ParsedClerkInventoryQuery = {
    q: raw.q?.trim() || undefined,
    semantic,
    semanticOnly: raw.semanticOnly ?? (!raw.q?.trim() && hasSemantic),
    browseGame: "magic",
    colorIdentityLabel: raw.colorIdentityLabel?.trim() || undefined,
    searchLimit: 96,
  };

  const baseline = parseClerkInventoryQuery({
    userQuestion: input.question,
    conversationSummary: input.conversationSummary,
  });

  if (
    parsed.q === baseline.q &&
    JSON.stringify(parsed.semantic) === JSON.stringify(baseline.semantic)
  ) {
    return null;
  }

  return {
    parsed,
    notes: raw.notes?.trim() || undefined,
  };
}
