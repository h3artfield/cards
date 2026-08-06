/**
 * @deprecated Use reset-catalog-rulings-staging.ts — live collection must not be reset in place.
 * This script now refuses unless --legacy-dangerous flag is passed.
 */
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

async function main() {
  if (!process.argv.includes("--legacy-dangerous")) {
    console.error(
      "Refusing in-place live catalogRulings reset.\n" +
        "Use reset-catalog-rulings-staging.ts for failed staging runs.\n" +
        "Imports write to catalogRulingsStaging and promote only after reconciliation.",
    );
    process.exit(1);
  }

  const { requireLocalFirestore } = await import("./lib/firestore-fail-fast");
  const { acquireRulingsJobLock, RulingsJobLockError } =
    await import("../src/lib/deck-builder/golden-catalog/rulings-job-lock");
  const { COLLECTIONS } = await import("../src/lib/firebase/collections");

  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);

  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );

  let release: ((s: "completed" | "failed") => Promise<void>) | undefined;
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

  const snap = await db.collection(COLLECTIONS.catalogRulings).select().get();
  console.warn(`LEGACY DANGEROUS: deleting ${snap.size} live ruling docs`);
  const batchSize = 500;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + batchSize)) batch.delete(doc.ref);
    await batch.commit();
  }
  if (release) await release("completed");
}

main().catch(console.error);
