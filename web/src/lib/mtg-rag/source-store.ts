import { Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "../firebase/collections";
import { forFirestore } from "../firebase/for-firestore";
import { requireFirestore } from "../firebase/admin";
import {
  MTG_RAG_EMBEDDING_DIMENSIONS,
  MTG_RAG_EMBEDDING_MODEL,
  MTG_RAG_INGESTION_VERSION,
} from "./constants";
import type {
  MtgKnowledgeIngestionRun,
  MtgKnowledgeSource,
  MtgKnowledgeSourceStatus,
} from "./types";

export async function getMtgKnowledgeSource(
  sourceId: string,
): Promise<MtgKnowledgeSource | null> {
  const db = requireFirestore();
  const snap = await db
    .collection(COLLECTIONS.mtgKnowledgeSources)
    .doc(sourceId)
    .get();
  if (!snap.exists) return null;
  return snap.data() as MtgKnowledgeSource;
}

export async function upsertMtgKnowledgeSource(input: {
  sourceId: string;
  title: string;
  sourceType: MtgKnowledgeSource["sourceType"];
  authorityTier: MtgKnowledgeSource["authorityTier"];
  storagePath: string;
  originalFilename: string;
  contentHash: string;
  byteCount: number;
  chunkCount?: number;
  status?: MtgKnowledgeSourceStatus;
  version?: string;
  effectiveDate?: string;
}): Promise<MtgKnowledgeSource> {
  const db = requireFirestore();
  const ref = db.collection(COLLECTIONS.mtgKnowledgeSources).doc(input.sourceId);
  const existing = await ref.get();
  const now = Timestamp.now();

  const doc: MtgKnowledgeSource = {
    sourceId: input.sourceId,
    title: input.title,
    sourceType: input.sourceType,
    authorityTier: input.authorityTier,
    storagePath: input.storagePath,
    originalFilename: input.originalFilename,
    contentHash: input.contentHash,
    byteCount: input.byteCount,
    chunkCount: input.chunkCount ?? existing.data()?.chunkCount ?? 0,
    status: input.status ?? "active",
    importedAt: existing.exists
      ? ((existing.data()?.importedAt as Timestamp) ?? now)
      : now,
    updatedAt: now,
    embeddingModel: MTG_RAG_EMBEDDING_MODEL,
    embeddingDimensions: MTG_RAG_EMBEDDING_DIMENSIONS,
    ingestionVersion: MTG_RAG_INGESTION_VERSION,
    ...(input.version ? { version: input.version } : {}),
    ...(input.effectiveDate ? { effectiveDate: input.effectiveDate } : {}),
  };

  await ref.set(forFirestore(doc), { merge: true });
  return doc;
}

export async function createMtgIngestionRun(input: {
  runId: string;
  sourceId: string;
  contentHash: string;
  previousContentHash?: string;
  dryRun: boolean;
  forced: boolean;
}): Promise<void> {
  const db = requireFirestore();
  const run: MtgKnowledgeIngestionRun = {
    runId: input.runId,
    sourceId: input.sourceId,
    status: "running",
    contentHash: input.contentHash,
    previousContentHash: input.previousContentHash,
    chunkCount: 0,
    aliasCount: 0,
    dryRun: input.dryRun,
    forced: input.forced,
    ingestionVersion: MTG_RAG_INGESTION_VERSION,
    startedAt: Timestamp.now(),
  };
  await db
    .collection(COLLECTIONS.mtgKnowledgeIngestionRuns)
    .doc(input.runId)
    .set(forFirestore(run));
}

export async function finishMtgIngestionRun(input: {
  runId: string;
  status: MtgKnowledgeIngestionRun["status"];
  storagePath?: string;
  chunkCount?: number;
  aliasCount?: number;
  skippedReason?: string;
  errorMessage?: string;
}): Promise<void> {
  const db = requireFirestore();
  await db
    .collection(COLLECTIONS.mtgKnowledgeIngestionRuns)
    .doc(input.runId)
    .set(
      forFirestore({
        status: input.status,
        storagePath: input.storagePath,
        chunkCount: input.chunkCount ?? 0,
        aliasCount: input.aliasCount ?? 0,
        skippedReason: input.skippedReason,
        errorMessage: input.errorMessage,
        completedAt: Timestamp.now(),
      }),
      { merge: true },
    );
}

export async function listMtgKnowledgeSources(): Promise<MtgKnowledgeSource[]> {
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.mtgKnowledgeSources).get();
  return snap.docs.map((d) => d.data() as MtgKnowledgeSource);
}

export async function updateMtgKnowledgeSourceChunkCount(
  sourceId: string,
  chunkCount: number,
): Promise<void> {
  const db = requireFirestore();
  await db.collection(COLLECTIONS.mtgKnowledgeSources).doc(sourceId).set(
    forFirestore({
      chunkCount,
      updatedAt: Timestamp.now(),
      ingestionVersion: MTG_RAG_INGESTION_VERSION,
    }),
    { merge: true },
  );
}

export function newIngestionRunId(sourceId: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${sourceId}__${stamp}`;
}
