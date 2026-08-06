/**
 * Mark extra printing records identified by catalog reconciliation as stale.
 * Run: npx tsx scripts/mark-stale-printings.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { CATALOG_PRINTINGS_COLLECTION } from "../src/lib/deck-builder/golden-catalog/schemas";
import { fetchBulkMetadata } from "../src/lib/deck-builder/golden-catalog/bulk-metadata";

loadEnvLocal();

async function main() {
  const reconciliationPath = resolve(
    process.cwd(),
    "reports",
    "catalog-id-reconciliation.json",
  );
  const reconciliation = JSON.parse(readFileSync(reconciliationPath, "utf8")) as {
    printings: { extraPrintingIds: string[] };
  };
  const staleIds = reconciliation.printings.extraPrintingIds;
  if (!staleIds.length) {
    console.log("No extra printing IDs to mark stale.");
    return;
  }

  const defaultMeta = await fetchBulkMetadata("default_cards");
  const bulkVersion = defaultMeta?.updatedAt ?? "unknown";

  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);
  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );

  const now = new Date().toISOString();
  const updated: string[] = [];
  for (const id of staleIds) {
    const ref = db.collection(CATALOG_PRINTINGS_COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) continue;
    await ref.set(
      {
        catalogStatus: "stale",
        lastSeenBulkVersion: snap.data()?.sourceVersion ?? bulkVersion,
        missingFromCurrentBulkAt: now,
        updatedAt: now,
      },
      { merge: true },
    );
    updated.push(id);
  }

  const report = {
    generatedAt: now,
    staleIds,
    updatedCount: updated.length,
    bulkVersion,
  };
  const outPath = resolve(process.cwd(), "reports", "stale-printings-marked.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`Marked ${updated.length} printing(s) as stale`);
  console.log(`Report: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
