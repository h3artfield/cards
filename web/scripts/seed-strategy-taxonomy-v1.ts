#!/usr/bin/env npx tsx
/** Seed strategyTaxonomy Firestore collection from MTGSalvation seed JSON. */
import { loadStrategyTaxonomy } from "../src/lib/commander-strategy/taxonomy";
import { COLLECTIONS } from "../src/lib/firebase/collections";

async function main() {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } = await import(
    "../src/lib/firebase/admin"
  );
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) {
    throw new Error("Firestore required.");
  }
  const db = requireFirestore();
  const entries = loadStrategyTaxonomy();
  let written = 0;
  for (const entry of entries) {
    await db.collection(COLLECTIONS.strategyTaxonomy).doc(entry.strategyId).set(entry, { merge: true });
    written += 1;
  }
  console.log(`Seeded ${written} strategy taxonomy entries.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
