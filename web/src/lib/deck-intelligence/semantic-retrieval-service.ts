/**
 * Semantic Retrieval Service — card requirement satisfaction. Implementation WAIT for Gate B.
 */
export const SEMANTIC_RETRIEVAL_SERVICE_VERSION = "semantic-retrieval-service-v1";
export const SEMANTIC_RETRIEVAL_SERVICE_STATUS = "DESIGN_ONLY — Gate B WAIT" as const;

export type SemanticRequirementQuery = {
  requirement: string;
  colorIdentity: string[];
  bracket: number;
  limit?: number;
};

export type SemanticCandidateHit = {
  oracleId: string;
  name: string;
  matchReason: string;
  provenanceTier: "CANONICAL_FACT";
};

export type SemanticRetrievalResult = {
  status: typeof SEMANTIC_RETRIEVAL_SERVICE_STATUS;
  requirement: string;
  candidates: SemanticCandidateHit[];
};

/** Placeholder — delegates to semantic-map retrieval when Gate B authorized. */
export async function findSemanticCandidates(
  input: SemanticRequirementQuery,
): Promise<SemanticRetrievalResult> {
  return {
    status: SEMANTIC_RETRIEVAL_SERVICE_STATUS,
    requirement: input.requirement,
    candidates: [],
  };
}
