/**
 * Remove transcript source metadata accidentally ingested from Downloads.
 * Run once after fixing transcriptSearchDirs to exclude Downloads.
 */
import { loadEnvLocal } from "../lib/script-env";
import { requireLocalFirestore } from "../lib/firestore-fail-fast";
import { COLLECTIONS } from "../../src/lib/firebase/collections";
import { requireFirestore } from "../../src/lib/firebase/admin";
import {
  MTG_RAG_TRANSCRIPT_FILES,
  transcriptSourceId,
} from "../../src/lib/mtg-rag/source-definitions";

const ALLOWED = new Set(
  MTG_RAG_TRANSCRIPT_FILES.map(({ filename }) => transcriptSourceId(filename)),
);

async function main() {
  loadEnvLocal();
  const dryRun = process.argv.includes("--dry-run");

  const removed = await requireLocalFirestore("mtg-rag cleanup", async () => {
    const db = requireFirestore();
    const snap = await db.collection(COLLECTIONS.mtgKnowledgeSources).get();
    const toRemove = snap.docs.filter((d) => {
      const id = d.id;
      return id.startsWith("transcript-") && !ALLOWED.has(id);
    });

    for (const doc of toRemove) {
      console.log(`${dryRun ? "would remove" : "removing"}: ${doc.id}`);
      if (!dryRun) await doc.ref.delete();
    }
    return toRemove.map((d) => d.id);
  });

  console.log(`\n${removed.length} junk transcript source(s) ${dryRun ? "would be" : ""} removed.`);
  console.log("GCS objects were left in place; delete manually if desired under mtg-rag/raw/transcripts/");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
