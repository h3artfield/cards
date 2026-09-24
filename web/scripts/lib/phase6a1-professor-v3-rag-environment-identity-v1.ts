/**
 * Deterministic MTG RAG environment identity for retrieval provenance / diagnostics.
 */
import { MTG_KNOWLEDGE_SERVICE_VERSION } from "../../src/lib/deck-intelligence/mtg-knowledge-service";
import { isMtgRagEnabled, MTG_RAG_INGESTION_VERSION } from "../../src/lib/mtg-rag/constants";
import { MTG_RAG_RETRIEVAL_RANKING_VERSION } from "../../src/lib/mtg-rag/retrieval-ranking";
import type { MtgKnowledgeSearchResult } from "../../src/lib/deck-intelligence/mtg-knowledge-service";

export const PROFESSOR_V3_RAG_ENVIRONMENT_IDENTITY_V1_VERSION = "phase6a1-professor-v3-rag-environment-identity-v1";

export function buildProfessorV3RagEnvironmentIdentityV1(result?: Pick<MtgKnowledgeSearchResult, "enabled" | "corpora">): string {
  const parts = [
    `mtgRagEnabled=${isMtgRagEnabled()}`,
    `knowledgeService=${MTG_KNOWLEDGE_SERVICE_VERSION}`,
    `ingestion=${MTG_RAG_INGESTION_VERSION}`,
    `ranking=${MTG_RAG_RETRIEVAL_RANKING_VERSION}`,
    `firebaseProject=${process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "(unset)"}`,
    `googleApplicationCredentials=${process.env.GOOGLE_APPLICATION_CREDENTIALS ? "(set)" : "(unset)"}`,
  ];
  if (result) {
    parts.push(`searchEnabled=${result.enabled}`, `corpora=${result.corpora.join("|")}`);
  }
  return parts.join(";");
}

export function classifyProfessorV3RetrievalAttemptStatusV1(
  result: Pick<MtgKnowledgeSearchResult, "enabled" | "hits">,
  error?: unknown,
): "SUCCESS" | "EMPTY" | "DISABLED" | "ERROR" {
  if (error) return "ERROR";
  if (!result.enabled) return "DISABLED";
  if (result.hits.length === 0) return "EMPTY";
  return "SUCCESS";
}
