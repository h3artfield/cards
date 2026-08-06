/**
 * MTG RAG Phase 1 — inspect local source packages without uploading.
 * Run: npm run mtg-rag:inspect [-- --source all]
 */
import { loadEnvLocal } from "../lib/script-env";
import { MTG_RAG_INGESTION_VERSION } from "../../src/lib/mtg-rag/constants";
import { resolveMtgRagBucket } from "../../src/lib/mtg-rag/storage";
import { parseMtgRagCli, printMtgRagUsage } from "./lib/cli";
import {
  countCsvDataRows,
  countJsonlRows,
  defaultCuratedSourcesDir,
  defaultTranscriptsRoot,
  definitionsForSourceFilter,
  listTranscriptFilesOnDisk,
  resolveCompanionFiles,
  resolvePrimarySourceFile,
  transcriptSearchDirs,
} from "./lib/resolve-sources";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  loadEnvLocal();
  const opts = parseMtgRagCli(process.argv.slice(2));

  console.log("\nMTG RAG — source inspection (Phase 1)\n");
  console.log(`Ingestion version: ${MTG_RAG_INGESTION_VERSION}`);
  console.log(`Curated sources:   ${defaultCuratedSourcesDir()}`);
  console.log(`Transcripts root:  ${defaultTranscriptsRoot()}`);
  console.log(`Transcript dirs:   ${transcriptSearchDirs().join(", ")}`);
  if (opts.sourcesDir) console.log(`Override dir:      ${opts.sourcesDir}`);
  console.log(`Target GCS bucket: ${resolveMtgRagBucket() ?? "(not configured)"}`);
  console.log("");

  const definitions = definitionsForSourceFilter(opts.source);
  let found = 0;
  let missing = 0;

  for (const def of definitions) {
    const primary = resolvePrimarySourceFile(def, opts.sourcesDir);
    const companions = resolveCompanionFiles(def, opts.sourcesDir);
    const rowCount =
      primary == null
        ? null
        : (countJsonlRows(primary.localPath) ??
          countCsvDataRows(primary.localPath));

    if (primary) {
      found++;
      console.log(`✓ ${def.sourceId}`);
      console.log(`  title: ${def.title}`);
      console.log(`  file:  ${primary.filename} (${formatBytes(primary.byteCount)})`);
      console.log(`  from:  ${primary.resolvedFromDir}`);
      console.log(`  hash:  ${primary.contentHash.slice(0, 16)}…`);
      if (rowCount != null) console.log(`  rows:  ${rowCount}`);
      if (companions.length) {
        console.log(
          `  companions: ${companions.map((c) => c.filename).join(", ")}`,
        );
      }
      console.log(`  gcs:   mtg-rag/raw/${def.gcsSubdir}/${primary.filename}`);
    } else {
      missing++;
      console.log(`✗ ${def.sourceId} — MISSING`);
      console.log(`  expected one of: ${def.candidateFilenames.join(", ")}`);
    }
    console.log("");
  }

  console.log(`Summary: ${found} found, ${missing} missing (${definitions.length} total)`);
  if (opts.source === "all" || opts.source === "transcripts") {
    const onDisk = listTranscriptFilesOnDisk();
    console.log(`Transcript .txt files on disk: ${onDisk.length} (excluding comprehensive rules)`);
  }
  if (missing > 0) process.exitCode = 1;
}

main().catch((err) => {
  printMtgRagUsage("inspect");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
