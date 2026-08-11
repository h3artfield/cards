/**
 * Authoritative Firestore population snapshot + optional shadow parse trigger.
 *
 * Run: cd web && npx tsx scripts/run-firestore-catalog-population-snapshot-v1.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadFirestoreCatalogPopulationSnapshot } from "./lib/firestore-catalog-population-snapshot-v1";

loadEnvLocal();

const OUT_DIR = "data/milestones/catalog-shadow";

async function main() {
  const { snapshot, eligibleRecords } = await loadFirestoreCatalogPopulationSnapshot();
  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const populationPath = resolve(OUT_DIR, "catalog-population-snapshot-firestore-v1.json");
  const identitiesPath = resolve(OUT_DIR, "catalog-population-identities-firestore-v1.jsonl");

  writeFileSync(populationPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  writeFileSync(
    identitiesPath,
    snapshot.identities.map((row) => `${JSON.stringify(row)}\n`).join(""),
  );

  const summary = {
    populationPath,
    identitiesPath,
    firestoreTotalCatalogOracleCards: snapshot.firestoreTotalCatalogOracleCards,
    recordsWithOracleText: snapshot.recordsWithOracleText,
    recordsWithoutOracleText: snapshot.recordsWithoutOracleText,
    duplicateOracleIds: snapshot.duplicateOracleIds,
    eligibleOracleIds: snapshot.eligibleOracleIds,
    catalogVersion: snapshot.catalogVersion,
    importVersion: snapshot.importVersion,
    populationHash: snapshot.populationHash,
    snapshotAt: snapshot.snapshotAt,
    eligibleRecordCount: eligibleRecords.length,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
