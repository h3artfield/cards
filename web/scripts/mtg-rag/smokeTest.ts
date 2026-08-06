/**
 * MTG RAG Phase 3 — smoke tests for chunkers, router, and scaffolding.
 */
import { loadEnvLocal } from "../lib/script-env";
import { COLLECTIONS } from "../../src/lib/firebase/collections";
import { sha256Hex } from "../../src/lib/mtg-rag/hash";
import {
  MTG_RAG_EMBEDDING_DIMENSIONS,
  MTG_RAG_EMBEDDING_MODEL,
  MTG_RAG_GCS_PREFIX,
  MTG_RAG_INGESTION_VERSION,
  isMtgRagEnabled,
} from "../../src/lib/mtg-rag/constants";
import { routeMtgKnowledgeQuery } from "../../src/lib/mtg-rag/mtg-query-router";
import { chunkGlossary } from "./chunkers/glossary";
import { resolvePrimarySourceFile } from "./lib/resolve-sources";
import { definitionsForSourceFilter } from "./lib/resolve-sources";
import { MTG_RAG_EVAL_CASE_COUNT } from "./evaluation-cases";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function main() {
  loadEnvLocal();
  console.log("\nMTG RAG — smoke test (Phase 3)\n");

  assert(COLLECTIONS.mtgKnowledgeChunks === "mtgKnowledgeChunks", "chunks collection");
  assert(MTG_RAG_INGESTION_VERSION.startsWith("phase2"), "ingestion version");
  assert(MTG_RAG_EMBEDDING_DIMENSIONS === 1536, "embedding dimensions");
  assert(MTG_RAG_GCS_PREFIX === "mtg-rag/raw", "gcs prefix");
  assert(MTG_RAG_EMBEDDING_MODEL.length > 0, "embedding model");

  const glossaryDef = definitionsForSourceFilter("glossary")[0];
  assert(Boolean(glossaryDef), "glossary definition");
  const primary = glossaryDef
    ? resolvePrimarySourceFile(glossaryDef)
    : null;

  if (primary) {
    const { chunks } = await chunkGlossary({
      sourceId: glossaryDef!.sourceId,
      localPath: primary.localPath,
      filename: primary.filename,
      contentHash: primary.contentHash,
    });
    assert(chunks.length === 500, `glossary chunk count expected 500, got ${chunks.length}`);
    assert(chunks[0]!.corpus === "glossary", "glossary corpus");
    console.log(`Glossary chunker: ${chunks.length} chunks OK`);
  } else {
    console.log("Glossary file not found locally — skipping chunker test");
  }

  assert(sha256Hex("test").length === 64, "sha256");
  assert(MTG_RAG_EVAL_CASE_COUNT >= 75, "evaluation case count");

  const route = await routeMtgKnowledgeQuery({ question: "What is a mana dork?" });
  assert(route.intent === "terminology_question", "query router terminology");

  console.log(`MTG RAG enabled: ${isMtgRagEnabled()}`);
  console.log(`Evaluation cases: ${MTG_RAG_EVAL_CASE_COUNT}`);

  console.log("");
  console.log("Smoke test PASSED (Phase 3)");
}

main().catch((err) => {
  console.error(`Smoke test FAILED: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
