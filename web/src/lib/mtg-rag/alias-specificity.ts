import type { MtgKnowledgeChunk } from "./types";

export type AliasSpecificityContext = {
  query: string;
  mode:
    | "RULES"
    | "TERMINOLOGY"
    | "STRATEGY"
    | "COMMANDER_PRIMER"
    | "PACKAGE"
    | "INTERACTION";
  chunk: MtgKnowledgeChunk;
};

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "when",
  "what",
  "does",
  "rule",
  "rules",
  "comprehensive",
  "magic",
  "mtg",
]);

/** Terms that usually indicate format/context, not the primary retrieval topic. */
const GENERIC_CONTEXT_ALIASES = new Set([
  "commander",
  "deck",
  "strategy",
  "format",
  "player",
  "players",
  "game",
  "table",
  "card",
  "cards",
]);

const STRATEGY_MODE_HINTS = new Set([
  "strategy",
  "package",
  "archetype",
  "engine",
  "combo",
  "turbo",
  "mass",
  "draw",
  "wheel",
  "narset",
  "stax",
  "voltron",
  "aristocrats",
  "tokens",
  "mill",
  "ramp",
  "blink",
  "landfall",
  "infect",
  "superfriends",
  "planeswalker",
]);

export function parseGlossaryTitle(citationLabel: string): { base: string; sense?: string } | null {
  const match = citationLabel.match(/^Glossary:\s*(.+)$/i);
  if (!match?.[1]) return null;
  const full = match[1].trim();
  const senseMatch = full.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (senseMatch) {
    return { base: senseMatch[1].trim(), sense: senseMatch[2].trim().toLowerCase() };
  }
  return { base: full };
}

export function extractDiscriminativeTerms(query: string, mode: AliasSpecificityContext["mode"]): string[] {
  const lower = query.toLowerCase();
  const tokens = lower.match(/[a-z0-9][a-z0-9+/-]*/g) ?? [];
  const out = new Set<string>();

  for (const token of tokens) {
    if (token.length < 3) continue;
    if (STOPWORDS.has(token)) continue;
    if (mode !== "COMMANDER_PRIMER" && GENERIC_CONTEXT_ALIASES.has(token) && tokens.length > 3) {
      continue;
    }
    out.add(token);
  }

  return [...out];
}

function glossarySensePenalty(input: AliasSpecificityContext, parsed: { base: string; sense?: string }): number {
  if (!parsed.sense) return 0;
  const q = input.query.toLowerCase();

  if (parsed.sense === "draft" && !/\bdraft\b/.test(q)) return 1.2;
  if (!q.includes(parsed.sense)) return 0.6;

  return 0;
}

function genericAliasPenalty(
  parsed: { base: string; sense?: string },
  discriminative: string[],
  mode: AliasSpecificityContext["mode"],
): number {
  const base = parsed.base.toLowerCase();
  if (discriminative.length < 2) return 0;
  if (!GENERIC_CONTEXT_ALIASES.has(base)) return 0;

  const hasMoreSpecific = discriminative.some((term) => term !== base && !GENERIC_CONTEXT_ALIASES.has(term));
  if (!hasMoreSpecific) return 0;

  if (mode === "STRATEGY" || mode === "PACKAGE" || mode === "INTERACTION") return 1.0;
  return 0.7;
}

function aliasTermCoverage(
  parsed: { base: string; sense?: string },
  discriminative: string[],
  chunk: MtgKnowledgeChunk,
): number {
  const base = parsed.base.toLowerCase();
  const text = chunk.retrievalText.toLowerCase();
  let score = 0;

  for (const term of discriminative) {
    if (term === base || base.includes(term) || term.includes(base)) score += 2;
    else if (text.includes(term)) score += 0.35;
  }

  if (discriminative.includes(base) || discriminative.some((t) => base.includes(t))) score += 1.5;
  return score;
}

/** Raw specificity score — higher means the alias is a better primary topic match. */
export function scoreAliasSpecificity(input: AliasSpecificityContext): number {
  const parsed = parseGlossaryTitle(input.chunk.citationLabel);
  if (!parsed) return 0.5;

  const discriminative = extractDiscriminativeTerms(input.query, input.mode);
  let score = 0.25;
  score += aliasTermCoverage(parsed, discriminative, input.chunk);
  score -= glossarySensePenalty(input, parsed);
  score -= genericAliasPenalty(parsed, discriminative, input.mode);

  if (
    (input.mode === "STRATEGY" || input.mode === "PACKAGE") &&
    STRATEGY_MODE_HINTS.has(parsed.base.toLowerCase())
  ) {
    score += 0.5;
  }

  return score;
}

/** Multiplier applied to alias_exact tier priority (0.05–1.0). */
export function aliasSpecificityMultiplier(input: AliasSpecificityContext): number {
  const raw = scoreAliasSpecificity(input);
  if (raw >= 3) return 1;
  if (raw >= 2) return 0.85;
  if (raw >= 1) return 0.55;
  if (raw >= 0.5) return 0.25;
  return 0.08;
}

export function shouldDemoteAliasExact(input: AliasSpecificityContext): boolean {
  return aliasSpecificityMultiplier(input) < 0.2;
}
