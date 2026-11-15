/**
 * Loader for frozen SemanticOpportunity model v3.2.2 (pinned SHA256).
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { SemanticOpportunity } from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import type { CrossFactEdge, NoActionableOpportunityRecord } from "./phase6a1-semantic-opportunity-inference-v3";

export const FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-semantic-opportunity-model-v3.2.2.json",
);

export const FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_SHA256 =
  "a15092e40b713917c4e4950948c964fb356eaf2577a14593679e9e862ed048ce";

export type FrozenOpportunityCase = {
  caseId: string;
  commanders: string[];
  commandZoneConfiguration: string;
  mechanismFactCount: number;
  opportunities: SemanticOpportunity[];
  noActionableOpportunities: NoActionableOpportunityRecord[];
  crossFactEdges: CrossFactEdge[];
};

export type FrozenSemanticOpportunityModelV322 = {
  version: string;
  inferenceVersion: string;
  crossFactVersion: string;
  generatedAt: string;
  population: {
    cases: number;
    totalOpportunities: number;
    noActionableRecords: number;
    crossFactEdges: number;
  };
  cases: FrozenOpportunityCase[];
};

export function loadFrozenSemanticOpportunityModelV322(
  path: string = FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_PATH,
): FrozenSemanticOpportunityModelV322 {
  if (!existsSync(path)) {
    throw new Error(`Frozen opportunity model not found at ${path}`);
  }
  const raw = readFileSync(path, "utf8");
  const sha = createHash("sha256").update(raw).digest("hex").toLowerCase();
  if (sha !== FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_SHA256) {
    throw new Error(`Frozen opportunity model SHA256 mismatch: got ${sha}, expected ${FROZEN_SEMANTIC_OPPORTUNITY_MODEL_V322_SHA256}`);
  }
  return JSON.parse(raw) as FrozenSemanticOpportunityModelV322;
}
