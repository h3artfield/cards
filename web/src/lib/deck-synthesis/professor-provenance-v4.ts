/**
 * Provenance v4 — trace where deck-theory content originated and how confident we are.
 */
export const PROFESSOR_PROVENANCE_V4_VERSION = "professor-provenance-v4";

export const PROVENANCE_SOURCE_V4 = [
  "CREATIVE_PROFESSOR",
  "RESEARCH_PROFESSOR",
  "ORACLE",
  "MECHANISM_FACT",
  "SEMANTIC_ORACLE",
  "RAG",
  "RULES",
  "USER",
] as const;

export type ProvenanceSourceV4 = (typeof PROVENANCE_SOURCE_V4)[number];

export const CONFIDENCE_TIER_V4 = ["HIGH", "MEDIUM", "LOW", "SPECULATIVE"] as const;
export type ConfidenceTierV4 = (typeof CONFIDENCE_TIER_V4)[number];

export type ProvenanceRefV4 = {
  source: ProvenanceSourceV4;
  confidence: ConfidenceTierV4;
  note?: string;
  refId?: string;
};
