/**
 * Current Research Service — DESIGN ONLY. Runtime WAIT.
 * External deck knowledge is STRATEGY_EVIDENCE / META_PRIOR, never canonical truth.
 */
import type { ProvenanceTier } from "./types";

export const RESEARCH_SERVICE_VERSION = "research-service-v1";
export const RESEARCH_SERVICE_STATUS = "DESIGN_ONLY — runtime WAIT" as const;

export type ResearchSearchRequest = {
  query: string;
  commanderName?: string;
  focus?: "primer" | "meta" | "package_usage" | "community_deck";
};

export type ResearchEvidence = {
  sourceUrl?: string;
  sourceTitle: string;
  summary: string;
  retrievedAt: string;
  provenanceTier: Extract<ProvenanceTier, "CURRENT_EXTERNAL_RESEARCH">;
};

export type ResearchSearchResult = {
  status: typeof RESEARCH_SERVICE_STATUS;
  query: string;
  evidence: ResearchEvidence[];
};

/** Placeholder — Professor may call when authorized; no web ingestion yet. */
export async function searchCurrentStrategy(
  _input: ResearchSearchRequest,
): Promise<ResearchSearchResult> {
  return {
    status: RESEARCH_SERVICE_STATUS,
    query: _input.query,
    evidence: [],
  };
}
