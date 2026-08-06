/**
 * Detect MTG mechanics/archetype questions where the clerk should educate first,
 * then optionally search in-stock inventory.
 */

const EDUCATION_TOPIC_PATTERNS: RegExp[] = [
  /\b(blink|flicker|flickerwisp|ephemerate|cloudshift)\b/i,
  /\b(harmonicon|attack harmonicon|panharmonicon)\b/i,
  /\b(tribal|typal)\b/i,
  /\b(prepared spell|prepare spell|prepared from|casting from exile)\b/i,
  /\b(strixhaven)\b.*\b(prepared|spell|exile)\b/i,
  /\b(elf|elves|goblin|zombie|dragon|merfolk|vampire|sliver|dinosaur|knight|soldier|wizard|warrior)\b/i,
  /\b(archetype|synerg(y|ies)|combo piece|win condition|game plan|engine)\b/i,
  /\b(exile.*return|return.*battlefield|enters the battlefield|etb trigger)\b/i,
  /\b(whenever .+ attacks|attack trigger|triggered ability.*attack)\b/i,
  /\b(mana dork|ramp package|ramp|board wipe|board wipes|counterspell|removal spell)\b/i,
  /\b(voltron|equipment)\b/i,
  /\b(commander that cares|commander for|built around|strategy for)\b/i,
];

const STOCK_PHRASE =
  /\b(do you have|got any|in stock|looking for|need|show me|find me|any|you have|we have|carry)\b/i;

const PURE_STOCK_CARD =
  /^(?:do you have|got any|in stock|looking for|need|show me|find me|you have|we have|carry)\s+[\w\s,'\-]+$/i;

/** Question mentions MTG education topics (mechanics, archetypes, slang). */
export function questionMentionsEducationTopic(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  return EDUCATION_TOPIC_PATTERNS.some((pattern) => pattern.test(q));
}

/**
 * Customer wants to learn about a mechanic/archetype AND may want matching stock.
 * e.g. "Do you have blink cards?", "good commander for elf tribal", "cards for Attack Harmonicon"
 */
export function isEducationThenInventoryRequest(
  question: string,
  conversationSummary?: string,
): boolean {
  const q = question.trim();
  if (!q || !questionMentionsEducationTopic(q)) return false;

  if (STOCK_PHRASE.test(q) || /\bcards?\b/i.test(q) || /\bcommanders?\b/i.test(q)) {
    return true;
  }

  if (
    /\b(what is|what are|what does|define|explain|how does|how do)\b/i.test(q)
  ) {
    return true;
  }

  if (
    /\b(good|best|which|recommend|suggest)\b.*\b(commander|commanders)\b/i.test(
      q,
    )
  ) {
    return true;
  }

  if (conversationSummary && STOCK_PHRASE.test(conversationSummary)) {
    return questionMentionsEducationTopic(q);
  }

  return false;
}

/** Bare stock lookup for a single product — not an education question. */
export function isPureNamedStockLookup(question: string): boolean {
  const q = question.trim();
  if (questionMentionsEducationTopic(q)) return false;
  if (/\?/.test(q) && q.split(/\s+/).length > 8) return false;
  return PURE_STOCK_CARD.test(q.replace(/\?+$/, "").trim());
}
