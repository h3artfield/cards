import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS } from "../firebase/collections";
import { forFirestore } from "../firebase/for-firestore";
import { requireFirestore } from "../firebase/admin";
import type { MtgKnowledgeAlias, MtgKnowledgeChunk } from "./types";

const CHUNK_BATCH_LIMIT = 50;
const ALIAS_BATCH_LIMIT = 100;

export async function upsertMtgKnowledgeChunks(
  chunks: Array<MtgKnowledgeChunk & { embedding?: number[] }>,
): Promise<number> {
  if (chunks.length === 0) return 0;
  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.mtgKnowledgeChunks);
  let written = 0;

  for (let i = 0; i < chunks.length; i += CHUNK_BATCH_LIMIT) {
    const batch = db.batch();
    const slice = chunks.slice(i, i + CHUNK_BATCH_LIMIT);
    for (const chunk of slice) {
      const { embedding, ...rest } = chunk;
      const doc = {
        ...rest,
        ...(embedding?.length
          ? { embedding: FieldValue.vector(embedding) }
          : {}),
      };
      batch.set(col.doc(chunk.chunkId), forFirestore(doc), { merge: true });
    }
    await batch.commit();
    written += slice.length;
  }

  return written;
}

export async function upsertMtgKnowledgeAliases(
  aliases: MtgKnowledgeAlias[],
): Promise<number> {
  if (aliases.length === 0) return 0;
  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.mtgKnowledgeAliases);
  let written = 0;

  for (let i = 0; i < aliases.length; i += ALIAS_BATCH_LIMIT) {
    const batch = db.batch();
    const slice = aliases.slice(i, i + ALIAS_BATCH_LIMIT);
    for (const alias of slice) {
      batch.set(col.doc(alias.aliasHash), forFirestore(alias), { merge: true });
    }
    await batch.commit();
    written += slice.length;
  }

  return written;
}

export async function deactivateStaleMtgChunks(input: {
  sourceId: string;
  activeChunkIds: Set<string>;
}): Promise<number> {
  const db = requireFirestore();
  const snap = await db
    .collection(COLLECTIONS.mtgKnowledgeChunks)
    .where("sourceId", "==", input.sourceId)
    .where("active", "==", true)
    .get();

  let deactivated = 0;
  for (let i = 0; i < snap.docs.length; i += CHUNK_BATCH_LIMIT) {
    const batch = db.batch();
    let batchOps = 0;
    for (const doc of snap.docs.slice(i, i + CHUNK_BATCH_LIMIT)) {
      if (input.activeChunkIds.has(doc.id)) continue;
      batch.update(doc.ref, { active: false });
      batchOps++;
      deactivated++;
    }
    if (batchOps > 0) await batch.commit();
  }

  return deactivated;
}

export async function deactivateStaleMtgAliases(input: {
  sourceId: string;
  activeAliasHashes: Set<string>;
}): Promise<number> {
  const db = requireFirestore();
  const snap = await db
    .collection(COLLECTIONS.mtgKnowledgeAliases)
    .where("sourceId", "==", input.sourceId)
    .where("active", "==", true)
    .get();

  let deactivated = 0;
  for (let i = 0; i < snap.docs.length; i += CHUNK_BATCH_LIMIT) {
    const batch = db.batch();
    let batchOps = 0;
    for (const doc of snap.docs.slice(i, i + CHUNK_BATCH_LIMIT)) {
      if (input.activeAliasHashes.has(doc.id)) continue;
      batch.update(doc.ref, { active: false });
      batchOps++;
      deactivated++;
    }
    if (batchOps > 0) await batch.commit();
  }

  return deactivated;
}
