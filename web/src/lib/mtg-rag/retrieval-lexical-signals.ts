import type { MtgKnowledgeChunk } from "./types";

export type LexicalRetrievalSignals = {
  ruleReferences: string[];
  hasExplicitRuleReference: boolean;
  keywordTerms: string[];
  namedGlossaryTerms: string[];
  commanderNames: string[];
  strategyTerms: string[];
};

const NAMED_GLOSSARY_TERMS = [
  "voltron",
  "stax",
  "aristocrats",
  "mill",
  "tutor",
  "ramp",
  "combo",
  "control",
  "aggro",
  "midrange",
  "tokens",
  "reanimator",
  "superfriends",
  "landfall",
  "blink",
  "flicker",
  "infect",
  "group hug",
  "group-hug",
  "turbo",
  "cedh",
  "prowess",
  "volley",
  "spellslinger",
  "enchantress",
  "artifacts",
  "tribal",
  "elves",
  "zombies",
  "dragons",
  "slivers",
];

const KEYWORD_TERMS = [
  "vigilance",
  "unearth",
  "flashback",
  "persist",
  "undying",
  "convoke",
  "prowess",
  "lifelink",
  "deathtouch",
  "hexproof",
  "ward",
  "haste",
  "flying",
  "trample",
  "double strike",
  "first strike",
  "menace",
  "reach",
  "defender",
  "indestructible",
  "sacrifice",
  "reanimation",
  "reanimate",
  "mill",
  "exile",
  "counter",
  "draw",
  "token",
  "graveyard",
  "aristocrats",
  "combo",
  "synergy",
  "engine",
  "tutor",
  "ramp",
  "blink",
  "flicker",
  "etb",
  "trigger",
  "activated",
  "static",
  "replacement",
  "priority",
  "stack",
  "combat",
  "attack",
  "untap",
  "tap",
  "counterspell",
  "enchantment",
  "artifact",
  "creature",
  "land",
  "planeswalker",
  "experience counter",
  "experience counters",
  "background",
  "partner",
  "commander",
  "command zone",
  "command zone",
  "commander damage",
  "commander tax",
  "commander tax",
  "commander tax",
];

const STRATEGY_TERMS = [
  "sacrifice",
  "reanimation",
  "reanimate",
  "graveyard",
  "recursion",
  "aristocrats",
  "death trigger",
  "death triggers",
  "outlet",
  "outlets",
  "resilience",
  "engine",
  "package",
  "synergy",
  "combo",
  "value",
  "tokens",
  "counters",
  "ramp",
  "tutor",
  "mill",
  "exile",
  "blink",
  "flicker",
  "hidden commander",
  "experience",
  "enchantment",
  "artifact",
  "activated",
  "trigger",
  "untap",
  "tap",
  "elf",
  "elves",
  "unearth",
  "life",
  "mana",
];

function normalizeRuleRef(value: string): string {
  return value.trim().toLowerCase();
}

export function extractRuleReferences(query: string): string[] {
  const refs = new Set<string>();
  for (const match of query.matchAll(/\b(?:CR\s*)?(\d{1,3}(?:\.\d+[a-z]?)?)\b/gi)) {
    if (match[1]) refs.add(normalizeRuleRef(match[1]));
  }
  for (const match of query.matchAll(/\brule\s+(\d{1,3}(?:\.\d+[a-z]?)?)\b/gi)) {
    if (match[1]) refs.add(normalizeRuleRef(match[1]));
  }
  return [...refs].sort((a, b) => b.length - a.length);
}

function extractNamedTerms(query: string, vocabulary: string[]): string[] {
  const lower = query.toLowerCase();
  return vocabulary.filter((term) => lower.includes(term));
}

function extractCommanderNames(query: string, commanderName?: string): string[] {
  const names = new Set<string>();
  if (commanderName?.trim()) names.add(commanderName.trim());

  for (const match of query.matchAll(
    /\b([A-Z][A-Za-z'’-]+(?:,\s*[A-Z][A-Za-z'’-]+)?(?:\s+(?:the|of)\s+[A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+)*)?)\b/g,
  )) {
    const candidate = match[1]?.trim();
    if (!candidate) continue;
    if (/^(Commander|Comprehensive|Rules|Magic|Transcript|Glossary|Semantic|Strategy|Deckbuilding)$/i.test(candidate)) {
      continue;
    }
    if (candidate.split(/\s+/).length >= 2 || candidate.includes(",")) {
      names.add(candidate);
    }
  }

  return [...names];
}

function extractNamedGlossaryTerms(query: string): string[] {
  const lower = query.toLowerCase();
  return NAMED_GLOSSARY_TERMS.filter((term) =>
    new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower),
  );
}

export function extractLexicalRetrievalSignals(input: {
  query: string;
  commanderName?: string;
}): LexicalRetrievalSignals {
  const ruleReferences = extractRuleReferences(input.query);
  return {
    ruleReferences,
    hasExplicitRuleReference: ruleReferences.length > 0,
    keywordTerms: extractNamedTerms(input.query, KEYWORD_TERMS),
    namedGlossaryTerms: extractNamedGlossaryTerms(input.query),
    commanderNames: extractCommanderNames(input.query, input.commanderName),
    strategyTerms: extractNamedTerms(input.query, STRATEGY_TERMS),
  };
}

function parseRuleParts(ruleRef: string): number[] {
  return ruleRef.split(".").map((part) => {
    const num = parseInt(part.replace(/[a-z]+$/i, ""), 10);
    return Number.isFinite(num) ? num : 0;
  });
}

function ruleRefMatchesStart(ruleRef: string, start?: string, end?: string): boolean {
  if (!start) return false;
  const ref = normalizeRuleRef(ruleRef);
  const s = normalizeRuleRef(start);
  const e = normalizeRuleRef(end ?? start);
  if (ref === s || ref.startsWith(`${s}.`) || s.startsWith(`${ref}.`)) return true;
  if (ref.startsWith(s.slice(0, s.indexOf(".") > 0 ? s.indexOf(".") : s.length))) return true;

  const refParts = parseRuleParts(ref);
  const startParts = parseRuleParts(s);
  const endParts = parseRuleParts(e);
  if (refParts[0] !== startParts[0]) return false;
  if (refParts.length === 1) return true;
  if (startParts.length > 1 && refParts[1] !== undefined && startParts[1] !== undefined) {
    if (refParts[1] < startParts[1]) return false;
    if (endParts[1] !== undefined && refParts[1] > endParts[1]) return false;
  }
  return ref.includes(".") && (ref.startsWith(s) || s.startsWith(ref.split(".").slice(0, 2).join(".")));
}

export function chunkMatchesRuleReference(chunk: MtgKnowledgeChunk, ruleRef: string): boolean {
  if (ruleRefMatchesStart(ruleRef, chunk.ruleNumberStart, chunk.ruleNumberEnd)) return true;
  const text = chunk.retrievalText.toLowerCase();
  const normalized = normalizeRuleRef(ruleRef);
  return (
    text.includes(`${normalized}.`) ||
    text.includes(`${normalized} `) ||
    text.includes(`rule: ${normalized}`) ||
    text.includes(`rule ${normalized}`)
  );
}

export function chunkMatchesCommanderName(chunk: MtgKnowledgeChunk, commanderName: string): boolean {
  const target = commanderName.toLowerCase();
  if (chunk.commander?.toLowerCase().includes(target)) return true;
  return chunk.retrievalText.toLowerCase().includes(target);
}

function termMatchesField(value: string, term: string): boolean {
  const lower = value.toLowerCase();
  const kw = term.toLowerCase();
  return lower === kw || lower.includes(kw);
}

/** Exact/named keyword match for glossary terms and CR keyword-ability sections. */
export function chunkMatchesNamedKeyword(chunk: MtgKnowledgeChunk, keyword: string): boolean {
  const kw = keyword.toLowerCase().trim();
  if (!kw) return false;

  if (chunk.keywords?.some((k) => termMatchesField(k, kw))) return true;
  if (chunk.normalizedTerms?.some((t) => termMatchesField(t, kw))) return true;
  if (chunk.aliases?.some((a) => termMatchesField(a, kw))) return true;

  const label = chunk.citationLabel.toLowerCase();
  if (label.includes(`glossary: ${kw}`) || label.endsWith(`: ${kw}`)) return true;

  const text = chunk.retrievalText.toLowerCase();
  if (chunk.corpus === "comprehensive_rules") {
    const keywordAbility = new RegExp(`\\b702\\.\\d+[a-z]?\\.\\s*${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (keywordAbility.test(chunk.retrievalText)) return true;
    if (chunk.sectionTitle?.toLowerCase().includes("keyword") && new RegExp(`\\b${kw}\\b`, "i").test(chunk.retrievalText)) {
      return true;
    }
  }

  if (chunk.corpus === "glossary") {
    return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
  }

  return false;
}
