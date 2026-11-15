/**
 * Card-structure-aware Firestore population snapshot (v2).
 *
 * Run: cd web && npx tsx scripts/run-firestore-catalog-population-snapshot-v2.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadFirestoreCatalogPopulationSnapshotV2 } from "./lib/firestore-catalog-population-snapshot-v2";

loadEnvLocal();

const OUT_DIR = "data/milestones/catalog-shadow";

async function main() {
  const { snapshot, eligibleRecords } = await loadFirestoreCatalogPopulationSnapshotV2();
  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const populationPath = resolve(OUT_DIR, "catalog-population-snapshot-firestore-v2.json");
  const identitiesPath = resolve(OUT_DIR, "catalog-population-identities-firestore-v2.jsonl");

  writeFileSync(populationPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  writeFileSync(
    identitiesPath,
    snapshot.identities.map((row) => `${JSON.stringify(row)}\n`).join(""),
  );

  console.log(
    JSON.stringify(
      {
        populationPath,
        identitiesPath,
        firestoreTotalCatalogOracleCards: snapshot.firestoreTotalCatalogOracleCards,
        categoryCounts: snapshot.categoryCounts,
        legacyEligible: snapshot.legacyFrame.eligibleOracleIds,
        correctedEligible: snapshot.correctedFrame.eligibleOracleIds,
        delta: snapshot.correctedFrame.eligibleOracleIds - snapshot.legacyFrame.eligibleOracleIds,
        populationHash: snapshot.populationHash,
        cardStructurePopulationHash: snapshot.cardStructurePopulationHash,
        snapshotAt: snapshot.snapshotAt,
        eligibleRecordCount: eligibleRecords.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
