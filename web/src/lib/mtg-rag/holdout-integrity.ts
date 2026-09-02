import {
  chunkHasExactRuleCitation,
  normalizeCommanderName,
} from "./retrieval-match-tiers";
import { extractRuleReferences } from "./retrieval-lexical-signals";
import type { MtgKnowledgeChunk } from "./types";

export type HoldoutIntegrityExpectation = {
  ruleRef?: string;
  conceptTerms: string[];
  minConceptMatches?: number;
};

export type HoldoutIntegrityResult = {
  ok: boolean;
  status: "VALID" | "MALFORMED_RULE_ANCHOR" | "MISSING_RULE_CHUNK" | "CONCEPT_MISMATCH";
  ruleRef?: string;
  matchedChunkId?: string;
  citationLabel?: string;
  conceptMatches?: number;
  note: string;
};

function countConceptMatches(text: string, conceptTerms: string[]): number {
  const lower = text.toLowerCase();
  let matches = 0;
  for (const term of conceptTerms) {
    if (lower.includes(term.toLowerCase())) matches++;
  }
  return matches;
}

export function validateHoldoutQueryIntegrity(input: {
  query: string;
  expectation?: HoldoutIntegrityExpectation;
  authoritativeRuleChunks?: MtgKnowledgeChunk[];
}): HoldoutIntegrityResult {
  const ruleRefs = extractRuleReferences(input.query);
  const ruleRef = input.expectation?.ruleRef ?? ruleRefs[0];
  const conceptTerms = input.expectation?.conceptTerms ?? [];
  const minMatches = input.expectation?.minConceptMatches ?? Math.min(2, conceptTerms.length);

  if (!ruleRef) {
    if (conceptTerms.length === 0) {
      return { ok: true, status: "VALID", note: "No explicit rule anchor to validate." };
    }
    return { ok: true, status: "VALID", note: "Concept-only query accepted without CR anchor check." };
  }

  const chunks = input.authoritativeRuleChunks ?? [];
  const authoritative = chunks.filter((chunk) => chunkHasExactRuleCitation(chunk, ruleRef));
  if (authoritative.length === 0) {
    return {
      ok: false,
      status: "MISSING_RULE_CHUNK",
      ruleRef,
      note: `No comprehensive_rules chunk cites ${ruleRef}.`,
    };
  }

  const ranked = [...authoritative].sort((a, b) => {
    const aMatches = countConceptMatches(a.retrievalText, conceptTerms);
    const bMatches = countConceptMatches(b.retrievalText, conceptTerms);
    return bMatches - aMatches;
  });
  const best = ranked[0];
  const conceptMatches = countConceptMatches(best.retrievalText, conceptTerms);

  if (conceptTerms.length > 0 && conceptMatches < minMatches) {
    return {
      ok: false,
      status: "CONCEPT_MISMATCH",
      ruleRef,
      matchedChunkId: best.chunkId,
      citationLabel: best.citationLabel,
      conceptMatches,
      note: `CR ${ruleRef} chunk "${best.citationLabel}" matches ${conceptMatches}/${conceptTerms.length} concept terms; need ${minMatches}.`,
    };
  }

  return {
    ok: true,
    status: "VALID",
    ruleRef,
    matchedChunkId: best.chunkId,
    citationLabel: best.citationLabel,
    conceptMatches,
    note: `CR ${ruleRef} anchor validated against "${best.citationLabel}".`,
  };
}

export function normalizeHoldoutCommanderName(name: string): string {
  return normalizeCommanderName(name);
}
