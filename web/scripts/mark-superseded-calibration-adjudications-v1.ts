/**
 * Mark v1 calibration adjudications as superseded audit history (excluded from v3 gold).
 *
 * Run: cd web && npx tsx scripts/mark-superseded-calibration-adjudications-v1.ts
 */
import { loadEnvLocal } from "./lib/script-env";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { SUPERSEDED_CALIBRATION_BATCH_HASH_V1 } from "../src/lib/catalog-coverage/adjudication-config";

loadEnvLocal();

async function main() {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);
  const db = requireFirestore();

  const snap = await db
    .collection(COLLECTIONS.catalogCoverageAdjudications)
    .where("phase", "==", "calibration")
    .where("calibrationBatchHash", "==", SUPERSEDED_CALIBRATION_BATCH_HASH_V1)
    .get();

  let updated = 0;
  for (const doc of snap.docs) {
    await doc.ref.set(
      {
        supersededCalibrationBatch: SUPERSEDED_CALIBRATION_BATCH_HASH_V1,
        excludedFromV3Gold: true,
        supersededAt: new Date().toISOString(),
        supersededReason: "Calibration batch v1 superseded by paper population v3 calibration batch v2",
      },
      { merge: true },
    );
    updated += 1;
  }

  console.log(JSON.stringify({ updated, supersededCalibrationBatch: SUPERSEDED_CALIBRATION_BATCH_HASH_V1 }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
