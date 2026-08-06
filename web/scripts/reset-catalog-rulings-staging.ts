/**
 * Clear failed staging rulings for a run — does NOT touch live catalogRulings.
 * Run: npx tsx scripts/reset-catalog-rulings-staging.ts [--run-id=UUID]
 */
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import {
  acquireRulingsJobLock,
  RulingsJobLockError,
} from "../src/lib/deck-builder/golden-catalog/rulings-job-lock";

loadEnvLocal();

async function main() {
  const runIdArg = process.argv.find((a) => a.startsWith("--run-id="));
  const runId = runIdArg?.slice("--run-id=".length);

  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);

  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );

  let release: ((s: "completed" | "failed", m?: string) => Promise<void>) | undefined;
  try {
    const lock = await acquireRulingsJobLock(db, "reset");
    release = lock.release;
  } catch (err) {
    if (err instanceof RulingsJobLockError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  try {
    const query = runId
      ? db.collection(COLLECTIONS.catalogRulingsStaging).where("importRunId", "==", runId)
      : db.collection(COLLECTIONS.catalogRulingsStaging);

    const snap = await query.select().get();
    console.log(`Deleting ${snap.size} staging ruling docs${runId ? ` for run ${runId}` : ""}…`);

    const batchSize = 500;
    for (let i = 0; i < snap.docs.length; i += batchSize) {
      const batch = db.batch();
      for (const doc of snap.docs.slice(i, i + batchSize)) {
        batch.delete(doc.ref);
      }
      await batch.commit();
    }

    console.log("Staging cleared. Live catalogRulings was not modified.");
    if (release) await release("completed");
  } catch (err) {
    if (release) await release("failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

main().catch(console.error);
