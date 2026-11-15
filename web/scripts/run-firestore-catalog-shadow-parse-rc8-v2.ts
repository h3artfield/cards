/**
 * Corrected card-structure-aware RC8 shadow parse (v2 population frame).
 * Preserves v1 top-level-text snapshot separately.
 *
 * Run: cd web && npx tsx scripts/run-firestore-catalog-shadow-parse-rc8-v2.ts
 */
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { createGzip } from "node:zlib";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { loadEnvLocal } from "./lib/script-env";
import { loadFirestoreCatalogPopulationSnapshotV2 } from "./lib/firestore-catalog-population-snapshot-v2";
import {
  buildCatalogShadowParseRecord,
  getCatalogShadowParserBlobClosure,
  gitHeadSha,
  stableCatalogShadowDigest,
} from "./lib/catalog-shadow-parse-record-v1";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { CATALOG_COMPLEXITY_BUCKET_DEFINITION_VERSION } from "./lib/catalog-complexity-bucket-v1";
import { CATALOG_HEALTH_METRIC_DEFINITIONS } from "./lib/catalog-health-metric-definitions-v1";

loadEnvLocal();

const OUT_DIR = "data/milestones/catalog-shadow";
const FRAME = "firestore-v2-card-structure";
const ARTIFACT_STEM = "catalog-shadow-parse-rc8-firestore-v2";

async function main() {
  const { snapshot, eligibleRecords } = await loadFirestoreCatalogPopulationSnapshotV2();
  console.error(`Parsing ${eligibleRecords.length} card-structure-eligible Firestore oracle records…`);

  const records = eligibleRecords.map((card) => buildCatalogShadowParseRecord(card));
  const digest = stableCatalogShadowDigest(records);
  const jsonlPath = resolve(OUT_DIR, `${ARTIFACT_STEM}.jsonl.gz`);
  const manifestPath = resolve(OUT_DIR, `${ARTIFACT_STEM}-manifest.json`);
  const populationManifestPath = resolve(OUT_DIR, "catalog-population-snapshot-firestore-v2.json");

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  writeFileSync(populationManifestPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  const lines = records.map((row) => `${JSON.stringify(row)}\n`).join("");
  const gzip = createGzip();
  const out = createWriteStream(jsonlPath);
  await pipeline(Readable.from([lines]), gzip, out);

  const contentHash = createHash("sha256").update(lines).digest("hex");

  const layoutCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const card of eligibleRecords) {
    const layoutKey = card.layout ?? "(none)";
    layoutCounts[layoutKey] = (layoutCounts[layoutKey] ?? 0) + 1;
    categoryCounts[card.populationCategory] = (categoryCounts[card.populationCategory] ?? 0) + 1;
  }

  const manifest = {
    artifactType: "CatalogShadowParseManifest",
    version: "catalog-shadow-parse-rc8-v2",
    frame: FRAME,
    generatedAt: new Date().toISOString(),
    status: "SHADOW_ONLY",
    note: "Corrected card-structure-aware population frame (A+B+C). No production writes.",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: gitHeadSha(),
    parserBlobClosure: getCatalogShadowParserBlobClosure(),
    catalogSource: "firestore",
    catalogSourceDetail: "catalogOracleCards",
    catalogVersion: snapshot.catalogVersion,
    importVersion: snapshot.importVersion,
    populationSnapshotPath: populationManifestPath.replace(/\\/g, "/"),
    populationHash: snapshot.populationHash,
    cardStructurePopulationHash: snapshot.cardStructurePopulationHash,
    firestoreTotalCatalogOracleCards: snapshot.firestoreTotalCatalogOracleCards,
    eligibleOracleIds: snapshot.eligibleOracleIds,
    legacyV1EligibleOracleIds: snapshot.legacyFrame.eligibleOracleIds,
    populationCategoryCounts: snapshot.categoryCounts,
    eligiblePopulationCategoryCounts: categoryCounts,
    layoutCounts,
    exactExclusions: snapshot.excludedRecords,
    cardCount: records.length,
    contentHash,
    complexityBucketDefinitionVersion: CATALOG_COMPLEXITY_BUCKET_DEFINITION_VERSION,
    healthMetricDefinitions: CATALOG_HEALTH_METRIC_DEFINITIONS,
    artifactPath: jsonlPath.replace(/\\/g, "/"),
    digest,
    preservedSnapshots: {
      v1TopLevelTextFrame: {
        label: "top-level-text population shadow snapshot",
        artifactStem: "catalog-shadow-parse-rc8-firestore-v1",
        eligibleCount: snapshot.legacyFrame.eligibleOracleIds,
        note: "Not 'all parse-eligible Magic cards' until population audit complete.",
      },
      bulkCacheHistorical: {
        artifactStem: "catalog-shadow-parse-rc8-75ce13bb133f5fde",
        note: "Historical bulk-cache run preserved separately.",
      },
    },
    blindStatus: "DO_NOT_TOUCH",
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        manifestPath,
        jsonlPath,
        cardCount: records.length,
        digest,
        populationHash: snapshot.populationHash,
        cardStructurePopulationHash: snapshot.cardStructurePopulationHash,
        legacyV1Eligible: snapshot.legacyFrame.eligibleOracleIds,
        correctedEligible: snapshot.eligibleOracleIds,
      },
      null,
      2,
    ),
  );
}

const isDirectRun = process.argv[1]?.replace(/\\/g, "/").endsWith("run-firestore-catalog-shadow-parse-rc8-v2.ts");
if (isDirectRun) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
