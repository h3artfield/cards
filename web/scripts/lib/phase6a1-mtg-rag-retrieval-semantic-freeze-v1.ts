/**
 * Loader for the frozen MTG RAG semantic retrieval stack (ranking v4 / service v5).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MTG_KNOWLEDGE_SERVICE_VERSION } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import { MTG_RAG_RETRIEVAL_RANKING_VERSION } from "../../src/lib/mtg-rag/retrieval-ranking";

export const MTG_RAG_RETRIEVAL_SEMANTIC_FREEZE_V1_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-mtg-rag-retrieval-semantic-freeze-v1.json",
);

export type MtgRagRetrievalSemanticFreezeV1 = {
  version: string;
  frozenAt: string;
  scope: string;
  rankingVersion: string;
  serviceVersion: string;
  prospectiveEvidence: {
    holdoutVersion: string;
    qaArtifact: string;
    qaCanonicalSha256: string;
    qaScriptOutputSha256?: string;
    semanticAdjudication: string;
    semanticAdjudicationSha256: string;
    top4UsefulRate: number;
    verdict: string;
  };
  tuningPolicy: string;
};

export function loadMtgRagRetrievalSemanticFreezeV1(): MtgRagRetrievalSemanticFreezeV1 {
  const freeze = JSON.parse(readFileSync(MTG_RAG_RETRIEVAL_SEMANTIC_FREEZE_V1_PATH, "utf8")) as MtgRagRetrievalSemanticFreezeV1;
  return freeze;
}

export function assertMtgRagRetrievalSemanticFreezeV1(): MtgRagRetrievalSemanticFreezeV1 {
  const freeze = loadMtgRagRetrievalSemanticFreezeV1();
  if (freeze.rankingVersion !== MTG_RAG_RETRIEVAL_RANKING_VERSION) {
    throw new Error(
      `Retrieval semantic freeze pins ${freeze.rankingVersion} but runtime is ${MTG_RAG_RETRIEVAL_RANKING_VERSION}. Do not mutate frozen retrieval during Professor v3.`,
    );
  }
  if (freeze.serviceVersion !== MTG_KNOWLEDGE_SERVICE_VERSION) {
    throw new Error(
      `Retrieval semantic freeze pins ${freeze.serviceVersion} but runtime is ${MTG_KNOWLEDGE_SERVICE_VERSION}. Do not mutate frozen retrieval during Professor v3.`,
    );
  }
  return freeze;
}
