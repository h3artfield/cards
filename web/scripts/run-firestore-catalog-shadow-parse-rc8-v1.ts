/**
 * Authoritative Firestore-backed RC8 shadow parse.
 * Produces separate artifacts from the preserved bulk-cache run.
 *
 * Run: cd web && npx tsx scripts/run-firestore-catalog-shadow-parse-rc8-v1.ts
 */
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { createGzip } from "node:zlib";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { loadEnvLocal } from "./lib/script-env";
import { loadFirestoreCatalogPopulationSnapshot } from "./lib/firestore-catalog-population-snapshot-v1";
import {
  buildCatalogShadowParseRecord,
  getCatalogShadowParserBlobClosure,
  gitHeadSha,
  stableCatalogShadowDigest,
} from "./lib/catalog-shadow-parse-record-v1";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { CATALOG_COMPLEXITY_BUCKET_DEFINITION_VERSION } from "./lib/catalog-complexity-bucket-v1";

loadEnvLocal();

const OUT_DIR = "data/milestones/catalog-shadow";
const FRAME = "firestore";
const ARTIFACT_STEM = "catalog-shadow-parse-rc8-firestore-v1";

export const CATALOG_HEALTH_METRIC_DEFINITIONS = {
  cardsWithAnyIntegrityIssue:
    "semanticInvalid OR idInvalid OR provenanceInvalid OR acceptedActionOutsideOwnerSpanCount > 0 OR forbiddenEmissionCount > 0",
  cardsWithAnyParserDiagnostic: "semantic.diagnostics.length > 0",
  cardsWithAnyNeedsReview: "needsReviewActions.length > 0",
  cardsNonPublishable: "publishable === false (structuralInvalid OR idInvalid OR provenanceInvalid)",
  cardsWithNoDiagnostics:
    "semantic.diagnostics.length === 0 (orthogonal to correctness — many valid cards emit zero diagnostics)",
};

async function main() {
  const { snapshot, eligibleRecords } = await loadFirestoreCatalogPopulationSnapshot();
  console.error(`Parsing ${eligibleRecords.length} eligible Firestore oracle records…`);

  const records = eligibleRecords.map((card) => buildCatalogShadowParseRecord(card));
  const digest = stableCatalogShadowDigest(records);
  const jsonlPath = resolve(OUT_DIR, `${ARTIFACT_STEM}.jsonl.gz`);
  const manifestPath = resolve(OUT_DIR, `${ARTIFACT_STEM}-manifest.json`);
  const populationManifestPath = resolve(OUT_DIR, "catalog-population-snapshot-firestore-v1.json");

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  writeFileSync(populationManifestPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  const lines = records.map((row) => `${JSON.stringify(row)}\n`).join("");
  const gzip = createGzip();
  const out = createWriteStream(jsonlPath);
  await pipeline(Readable.from([lines]), gzip, out);

  const contentHash = createHash("sha256").update(lines).digest("hex");
  const manifest = {
    artifactType: "CatalogShadowParseManifest",
    version: "catalog-shadow-parse-rc8-v1",
    frame: FRAME,
    generatedAt: new Date().toISOString(),
    status: "SHADOW_ONLY",
    note: "Authoritative Firestore population frame — not written to production semantic collection.",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: gitHeadSha(),
    parserBlobClosure: getCatalogShadowParserBlobClosure(),
    catalogSource: "firestore",
    catalogSourceDetail: "catalogOracleCards",
    catalogVersion: snapshot.catalogVersion,
    importVersion: snapshot.importVersion,
    populationSnapshotPath: populationManifestPath.replace(/\\/g, "/"),
    populationHash: snapshot.populationHash,
    firestoreTotalCatalogOracleCards: snapshot.firestoreTotalCatalogOracleCards,
    eligibleOracleIds: snapshot.eligibleOracleIds,
    cardCount: records.length,
    contentHash,
    complexityBucketDefinitionVersion: CATALOG_COMPLEXITY_BUCKET_DEFINITION_VERSION,
    healthMetricDefinitions: CATALOG_HEALTH_METRIC_DEFINITIONS,
    artifactPath: jsonlPath.replace(/\\/g, "/"),
    digest,
    preservedBulkSnapshotNote:
      "Historical bulk-cache run catalog-shadow-parse-rc8-75ce13bb133f5fde preserved separately.",
    blindStatus: "DO_NOT_TOUCH",
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ manifestPath, jsonlPath, cardCount: records.length, digest, populationHash: snapshot.populationHash }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
