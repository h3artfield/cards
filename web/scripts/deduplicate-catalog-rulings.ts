/**
 * @deprecated Deduplication runs automatically during import via contentHash doc IDs.
 * Refuses to run while another rulings job is active.
 */
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import {
  acquireRulingsJobLock,
  RulingsJobLockError,
} from "../src/lib/deck-builder/golden-catalog/rulings-job-lock";

loadEnvLocal();

async function main() {
  console.error(
    "deduplicate-catalog-rulings.ts is deprecated.\n" +
      "Import uses contentHash document IDs and deduplicates at parse time.\n" +
      "No standalone dedupe job is required.",
  );

  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);

  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );

  try {
    await acquireRulingsJobLock(db, "deduplicate");
    console.error("Lock acquired but dedupe is a no-op — exiting.");
    process.exit(1);
  } catch (err) {
    if (err instanceof RulingsJobLockError) {
      console.error("Correctly blocked — active job:", err.activeLock);
      process.exit(1);
    }
    throw err;
  }
}

main().catch(console.error);
