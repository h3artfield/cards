import type { MtgKnowledgeChunk } from "./types";
import type { LexicalRetrievalSignals } from "./retrieval-lexical-signals";
import type { MtgKnowledgeHit } from "./hybrid-retrieval";

export type MatchTier =
  | "rule_citation_exact"
  | "glossary_title_exact"
  | "commander_field_exact"
  | "alias_exact"
  | "rule_body_incidental"
  | "glossary_body_incidental"
  | "commander_text_incidental"
  | "vector_semantic"
  | "none";

export const MATCH_TIER_PRIORITY: Record<MatchTier, number> = {
  rule_citation_exact: 1_000_000,
  glossary_title_exact: 500_000,
  commander_field_exact: 500_000,
  alias_exact: 400_000,
  rule_body_incidental: 2_000,
  glossary_body_incidental: 1_000,
  commander_text_incidental: 1_000,
  vector_semantic: 0,
  none: -1_000_000,
};

function normalizeRuleRef(value: string): string {
  return value.trim().toLowerCase();
}

function parseRuleParts(ruleRef: string): Array<{ num: number; suffix: string }> {
  return ruleRef.split(".").map((part) => {
    const match = part.match(/^(\d+)([a-z]*)$/i);
    return {
      num: match ? parseInt(match[1], 10) : 0,
      suffix: match?.[2]?.toLowerCase() ?? "",
    };
  });
}

function compareRuleRef(a: string, b: string): number {
  const ap = parseRuleParts(a);
  const bp = parseRuleParts(b);
  const len = Math.max(ap.length, bp.length);
  for (let i = 0; i < len; i++) {
    const av = ap[i] ?? { num: 0, suffix: "" };
    const bv = bp[i] ?? { num: 0, suffix: "" };
    if (av.num !== bv.num) return av.num - bv.num;
    if (av.suffix !== bv.suffix) return av.suffix.localeCompare(bv.suffix);
  }
  return 0;
}

/** True when the chunk's citation rule range directly covers the requested rule ref. */
export function chunkHasExactRuleCitation(chunk: MtgKnowledgeChunk, ruleRef: string): boolean {
  const ref = normalizeRuleRef(ruleRef);
  if (chunk.ruleNumberStart) {
    const start = normalizeRuleRef(chunk.ruleNumberStart);
    const end = normalizeRuleRef(chunk.ruleNumberEnd ?? chunk.ruleNumberStart);
    if (compareRuleRef(ref, start) >= 0 && compareRuleRef(ref, end) <= 0) {
      return true;
    }
  }

  const label = chunk.citationLabel.toLowerCase();
  if (label.includes(`cr ${ref}`) || label.includes(`comprehensive rules ${ref}`)) {
    return true;
  }

  return false;
}

export function normalizeCommanderName(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function chunkHasExactCommanderField(chunk: MtgKnowledgeChunk, commanderName: string): boolean {
  if (chunk.corpus !== "commander_primer" || !chunk.commander?.trim()) return false;
  const target = normalizeCommanderName(commanderName);
  const candidate = normalizeCommanderName(chunk.commander);
  return candidate === target || candidate.startsWith(`${target} `) || target.startsWith(`${candidate} `);
}

export function chunkHasExactGlossaryTitle(chunk: MtgKnowledgeChunk, term: string): boolean {
  if (chunk.corpus !== "glossary") return false;
  const kw = term.toLowerCase().trim();
  const label = chunk.citationLabel.toLowerCase();
  return label === `glossary: ${kw}` || label.startsWith(`glossary: ${kw} `);
}

function chunkMatchesRuleBody(chunk: MtgKnowledgeChunk, ruleRef: string): boolean {
  const normalized = normalizeRuleRef(ruleRef);
  const text = chunk.retrievalText.toLowerCase();
  return (
    text.includes(`${normalized}.`) ||
    text.includes(`${normalized} `) ||
    text.includes(`rule: ${normalized}`) ||
    text.includes(`rule ${normalized}`)
  );
}

function chunkMatchesCommanderText(chunk: MtgKnowledgeChunk, commanderName: string): boolean {
  const target = commanderName.toLowerCase();
  return chunk.retrievalText.toLowerCase().includes(target);
}

function chunkMatchesGlossaryBody(chunk: MtgKnowledgeChunk, term: string): boolean {
  const kw = term.toLowerCase().trim();
  const text = chunk.retrievalText.toLowerCase();
  return new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

function higherTier(a: MatchTier, b: MatchTier): MatchTier {
  return MATCH_TIER_PRIORITY[a] >= MATCH_TIER_PRIORITY[b] ? a : b;
}

export function classifyHitMatchTier(
  hit: MtgKnowledgeHit,
  signals: LexicalRetrievalSignals,
): MatchTier {
  if (hit.method === "alias_exact") return "alias_exact";

  const chunk = hit.chunk;

  for (const ref of signals.ruleReferences) {
    if (chunkHasExactRuleCitation(chunk, ref)) return "rule_citation_exact";
  }
  for (const ref of signals.ruleReferences) {
    if (chunkMatchesRuleBody(chunk, ref)) return "rule_body_incidental";
  }

  for (const term of signals.namedGlossaryTerms) {
    if (chunkHasExactGlossaryTitle(chunk, term)) return "glossary_title_exact";
  }
  for (const term of signals.namedGlossaryTerms) {
    if (chunkMatchesGlossaryBody(chunk, term)) return "glossary_body_incidental";
  }

  for (const name of signals.commanderNames) {
    if (chunkHasExactCommanderField(chunk, name)) return "commander_field_exact";
  }
  for (const name of signals.commanderNames) {
    if (chunkMatchesCommanderText(chunk, name)) return "commander_text_incidental";
  }

  if (hit.method === "vector" && hit.vectorSimilarity != null) return "vector_semantic";
  if (hit.method === "lexical_exact") return "glossary_body_incidental";

  return "none";
}

export { higherTier };
