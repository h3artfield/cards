import { FieldValue } from "firebase-admin/firestore";
import { COLLECTIONS } from "../firebase/collections";
import { requireFirestore } from "../firebase/admin";
import { MTG_RAG_VECTOR_LIMIT } from "./constants";
import { embedQueryText } from "./embed-query";
import type { MtgKnowledgeChunk, MtgKnowledgeCorpus } from "./types";

export async function vectorSearchMtgChunks(input: {
  query: string;
  corpora?: MtgKnowledgeCorpus[];
  limit?: number;
}): Promise<MtgKnowledgeChunk[]> {
  const limit = input.limit ?? MTG_RAG_VECTOR_LIMIT;
  const embedding = await embedQueryText(input.query);
  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.mtgKnowledgeChunks);

  const corpora = input.corpora?.length ? input.corpora : undefined;
  const hits: MtgKnowledgeChunk[] = [];
  const seen = new Set<string>();

  const runSearch = async (corpus?: MtgKnowledgeCorpus) => {
    try {
      let q = col.where("active", "==", true);
      if (corpus) q = q.where("corpus", "==", corpus);

      const vectorQuery = q.findNearest({
        vectorField: "embedding",
        queryVector: FieldValue.vector(embedding),
        limit,
        distanceMeasure: "COSINE",
      });

      const snap = await vectorQuery.get();
      for (const doc of snap.docs) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        hits.push({ ...(doc.data() as MtgKnowledgeChunk), chunkId: doc.id });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("FAILED_PRECONDITION") ||
        message.includes("index is currently building")
      ) {
        return;
      }
      throw err;
    }
  };

  if (corpora) {
    for (const corpus of corpora) {
      await runSearch(corpus);
    }
  } else {
    await runSearch();
  }

  return hits.slice(0, limit);
}
