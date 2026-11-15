#!/usr/bin/env npx tsx
/**
 * P1 — Migrate existing embedding._values into native Firestore vector fields.
 * Does NOT call OpenAI. Does NOT re-chunk or ingest new material.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { FieldPath } from "firebase-admin/firestore";
import { loadProjectEnvLocal } from "../lib/script-env";
import { COLLECTIONS } from "../../src/lib/firebase/collections";
import { getProjectId, requireFirestore } from "../../src/lib/firebase/admin";
import {
  MTG_RAG_EMBEDDING_DIMENSIONS,
  MTG_RAG_EMBEDDING_MODEL,
} from "../../src/lib/mtg-rag/constants";
import {
  extractStoredEmbeddingValues,
  prepareMtgKnowledgeChunkVectorMigrationUpdate,
  validateMtgKnowledgeEmbeddingValues,
} from "../../src/lib/mtg-rag/firestore-chunk-write";
import { rawSelfVectorSearchMtgChunk } from "../../src/lib/mtg-rag/chunk-retrieval";
import type { MtgKnowledgeCorpus } from "../../src/lib/mtg-rag/types";

const OUT_PATH = resolve(
  "data/milestones/deck-synthesis/phase6a1-mtg-rag-vector-migration-v1.json",
);
const BATCH_LIMIT = 50;
const SELF_TEST_CHUNK_IDS = {
  comprehensive_rules: "000f3782acef2686691b6963d9bf7af6de2a7fe5817548f7493df6e90a350a77",
  youtube_transcript: "064e7a505cd542015b8d5480eb898381a8a779853ec5c1fc15c17489ddf66f19",
} as const;

type InvalidRecord = { chunkId: string; corpus: string; reason: string };

function checksumValues(values: number[]): string {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

async function main() {
  loadProjectEnvLocal();
  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.mtgKnowledgeChunks);

  const stats = {
    chunksInspected: 0,
    chunksMigrated: 0,
    invalidVectors: [] as InvalidRecord[],
    missingVectors: [] as string[],
    skippedAlreadyNative: 0,
  };
  const sourceChecksumParts: string[] = [];
  let last: FirebaseFirestore.DocumentSnapshot | undefined;

  while (true) {
    let q = col.where("active", "==", true).orderBy(FieldPath.documentId()).limit(500);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;

    const pending: Array<{ ref: FirebaseFirestore.DocumentReference; update: Record<string, unknown> }> =
      [];

    for (const doc of snap.docs) {
      stats.chunksInspected++;
      const data = doc.data();
      const extracted = extractStoredEmbeddingValues(data.embedding);
      if (!extracted) {
        stats.missingVectors.push(doc.id);
        continue;
      }

      const validated = validateMtgKnowledgeEmbeddingValues({
        values: extracted.values,
        embeddingModel: String(data.embeddingModel ?? MTG_RAG_EMBEDDING_MODEL),
      });
      if (!validated.ok) {
        stats.invalidVectors.push({
          chunkId: doc.id,
          corpus: String(data.corpus ?? "unknown"),
          reason: validated.reason,
        });
        continue;
      }

      sourceChecksumParts.push(`${doc.id}:${checksumValues(validated.values)}`);
      pending.push({
        ref: doc.ref,
        update: prepareMtgKnowledgeChunkVectorMigrationUpdate({ values: validated.values }),
      });
    }

    for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      const slice = pending.slice(i, i + BATCH_LIMIT);
      for (const item of slice) {
        batch.update(item.ref, item.update);
      }
      await batch.commit();
      stats.chunksMigrated += slice.length;
      process.stdout.write(`\rMigrated ${stats.chunksMigrated} / inspected ${stats.chunksInspected}`);
    }

    last = snap.docs[snap.docs.length - 1];
  }

  console.log("\nRunning post-migration self-match smoke tests...");
  const selfTests: Record<string, unknown> = {};
  for (const [corpus, chunkId] of Object.entries(SELF_TEST_CHUNK_IDS)) {
    const doc = await col.doc(chunkId).get();
    const extracted = extractStoredEmbeddingValues(doc.data()?.embedding);
    if (!extracted) {
      selfTests[corpus] = { chunkId, pass: false, reason: "missing_embedding_after_migration" };
      continue;
    }
    const raw = await rawSelfVectorSearchMtgChunk({
      chunkId,
      corpus: corpus as MtgKnowledgeCorpus,
      values: extracted.values,
      limit: 5,
    });
    const top = raw.candidates[0];
    selfTests[corpus] = {
      chunkId,
      pass: top?.chunkId === chunkId,
      topChunkId: top?.chunkId ?? null,
      topDistance: top?.distance ?? null,
      candidateCount: raw.candidates.length,
    };
  }

  const postWriteVectorCount = stats.chunksMigrated;
  const sourceVectorChecksum = createHash("sha256")
    .update(sourceChecksumParts.sort().join("\n"))
    .digest("hex");

  const report = {
    version: "phase6a1-mtg-rag-vector-migration-v1",
    generatedAt: new Date().toISOString(),
    firestoreProject: getProjectId(),
    embeddingModel: MTG_RAG_EMBEDDING_MODEL,
    embeddingDimensions: MTG_RAG_EMBEDDING_DIMENSIONS,
    writePathFix: "prepareMtgKnowledgeChunkForWrite — FieldValue.vector bypasses JSON sanitizer",
    migrationPolicy: "preserve_existing_numerical_embeddings_no_openai",
    ...stats,
    sourceVectorChecksum,
    postWriteVectorCount,
    selfMatchSmokeTests: selfTests,
    exactSelfMatchPass:
      Object.values(selfTests).every((t) => (t as { pass?: boolean }).pass === true),
  };

  mkdirSync(resolve(OUT_PATH, ".."), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));

  if (!report.exactSelfMatchPass) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
