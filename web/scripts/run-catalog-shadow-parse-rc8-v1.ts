/**
 * Phase 1 — shadow-parse the entire Oracle catalog with frozen RC8 semantics.
 * Does NOT write to production semantic collection.
 *
 * Run: cd web && npx tsx scripts/run-catalog-shadow-parse-rc8-v1.ts
 *      cd web && npx tsx scripts/run-catalog-shadow-parse-rc8-v1.ts --source=bulk --limit=100
 */
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { createGzip } from "node:zlib";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { loadCatalogOracleRecords } from "./lib/load-catalog-oracle-records-v1";
import {
  buildCatalogShadowParseRecord,
  getCatalogShadowParserBlobClosure,
  gitHeadSha,
  stableCatalogShadowDigest,
} from "./lib/catalog-shadow-parse-record-v1";
import { ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { CATALOG_COMPLEXITY_BUCKET_DEFINITION_VERSION } from "./lib/catalog-complexity-bucket-v1";

const OUT_DIR = "data/milestones/catalog-shadow";

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${prefix}=`))?.split("=").slice(1).join("=");
}

async function main() {
  const source = (argValue("--source") ?? "auto") as "auto" | "firestore" | "bulk";
  const limitRaw = argValue("--limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const cachePath = argValue("--cache");

  const catalog = await loadCatalogOracleRecords({ source, cachePath, limit });
  console.error(
    `Loaded ${catalog.cardCount} oracle records from ${catalog.source} (${catalog.sourceDetail})`,
  );

  const records = catalog.records.map((card) => buildCatalogShadowParseRecord(card));
  const digest = stableCatalogShadowDigest(records);
  const artifactStem = `catalog-shadow-parse-rc8-${digest.slice(0, 16)}`;
  const jsonlPath = resolve(OUT_DIR, `${artifactStem}.jsonl.gz`);
  const manifestPath = resolve(OUT_DIR, `${artifactStem}-manifest.json`);

  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const lines = records.map((row) => `${JSON.stringify(row)}\n`).join("");
  const gzip = createGzip();
  const out = createWriteStream(jsonlPath);
  await pipeline(Readable.from([lines]), gzip, out);

  const contentHash = createHash("sha256").update(lines).digest("hex");
  const manifest = {
    artifactType: "CatalogShadowParseManifest",
    version: "catalog-shadow-parse-rc8-v1",
    generatedAt: new Date().toISOString(),
    status: "SHADOW_ONLY",
    note: "Offline shadow parse — not written to production semantic collection.",
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    parserCommitSha: gitHeadSha(),
    parserBlobClosure: getCatalogShadowParserBlobClosure(),
    catalogSource: catalog.source,
    catalogSourceDetail: catalog.sourceDetail,
    catalogVersion: catalog.catalogVersion,
    cardCount: records.length,
    contentHash,
    complexityBucketDefinitionVersion: CATALOG_COMPLEXITY_BUCKET_DEFINITION_VERSION,
    artifactPath: jsonlPath.replace(/\\/g, "/"),
    digest,
    blindStatus: "DO_NOT_TOUCH",
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({ manifestPath, jsonlPath, cardCount: records.length, digest }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
