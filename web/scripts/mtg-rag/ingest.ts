/**
 * MTG RAG Phase 1 — upload raw sources to GCS and write Firestore source metadata.
 * Run: npm run mtg-rag:ingest -- [--source transcripts|comprehensive-rules|all]
 */
import { loadEnvLocal } from "../lib/script-env";
import { requireLocalFirestore } from "../lib/firestore-fail-fast";
import {
  createMtgIngestionRun,
  finishMtgIngestionRun,
  getMtgKnowledgeSource,
  newIngestionRunId,
  upsertMtgKnowledgeSource,
} from "../../src/lib/mtg-rag/source-store";
import { uploadMtgRagFile } from "../../src/lib/mtg-rag/storage";
import { parseMtgRagCli, printMtgRagUsage } from "./lib/cli";
import {
  defaultCuratedSourcesDir,
  defaultTranscriptsRoot,
  definitionsForSourceFilter,
  resolveCompanionFiles,
  resolvePrimarySourceFile,
  transcriptSearchDirs,
} from "./lib/resolve-sources";

async function ingestOneSource(
  def: ReturnType<typeof definitionsForSourceFilter>[number],
  opts: ReturnType<typeof parseMtgRagCli>,
): Promise<"uploaded" | "skipped" | "missing" | "failed"> {
  const primary = resolvePrimarySourceFile(def, opts.sourcesDir);
  if (!primary) {
    console.log(`  skip (missing file): ${def.sourceId}`);
    return "missing";
  }

  const existing = opts.writeFirestore
    ? await requireLocalFirestore(`mtg-rag source ${def.sourceId}`, () =>
        getMtgKnowledgeSource(def.sourceId),
      )
    : null;

  if (
    existing &&
    existing.contentHash === primary.contentHash &&
    !opts.force &&
    !opts.dryRun
  ) {
    console.log(`  skip (unchanged): ${def.sourceId}`);
    if (opts.writeFirestore) {
      const runId = newIngestionRunId(def.sourceId);
      await requireLocalFirestore(`mtg-rag run ${runId}`, async () => {
        await createMtgIngestionRun({
          runId,
          sourceId: def.sourceId,
          contentHash: primary.contentHash,
          previousContentHash: existing.contentHash,
          dryRun: opts.dryRun,
          forced: opts.force,
        });
        await finishMtgIngestionRun({
          runId,
          status: "skipped",
          storagePath: existing.storagePath,
          skippedReason: "content hash unchanged",
        });
      });
    }
    return "skipped";
  }

  const runId = newIngestionRunId(def.sourceId);
  console.log(`  ingest: ${def.sourceId} ← ${primary.filename}`);

  if (opts.dryRun) {
    console.log(`    dry-run upload → mtg-rag/raw/${def.gcsSubdir}/${primary.filename}`);
    for (const c of resolveCompanionFiles(def, opts.sourcesDir)) {
      console.log(`    dry-run companion → ${c.filename}`);
    }
    return "uploaded";
  }

  if (opts.writeFirestore) {
    await requireLocalFirestore(`mtg-rag run ${runId}`, async () => {
      await createMtgIngestionRun({
        runId,
        sourceId: def.sourceId,
        contentHash: primary.contentHash,
        previousContentHash: existing?.contentHash,
        dryRun: opts.dryRun,
        forced: opts.force,
      });
    });
  }

  try {
    let storagePath = existing?.storagePath ?? "";
    let byteCount = primary.byteCount;

    if (opts.uploadGcs) {
      const upload = await uploadMtgRagFile({
        localPath: primary.localPath,
        filename: primary.filename,
        gcsSubdir: def.gcsSubdir,
      });
      storagePath = upload.gsUri;
      byteCount = upload.byteCount;
      console.log(`    uploaded: ${upload.gsUri}`);

      for (const companion of resolveCompanionFiles(def, opts.sourcesDir)) {
        const companionUpload = await uploadMtgRagFile({
          localPath: companion.localPath,
          filename: companion.filename,
          gcsSubdir: def.gcsSubdir,
        });
        console.log(`    companion: ${companionUpload.gsUri}`);
      }
    } else {
      console.log("    gcs upload skipped (--no-gcs)");
    }

    if (opts.writeFirestore) {
      await requireLocalFirestore(`mtg-rag source write ${def.sourceId}`, async () => {
        await upsertMtgKnowledgeSource({
          sourceId: def.sourceId,
          title: def.title,
          sourceType: def.sourceType,
          authorityTier: def.authorityTier,
          storagePath,
          originalFilename: primary.filename,
          contentHash: primary.contentHash,
          byteCount,
          chunkCount: 0,
          status: "active",
        });
        await finishMtgIngestionRun({
          runId,
          status: "completed",
          storagePath,
          chunkCount: 0,
          aliasCount: 0,
        });
      });
      console.log(`    firestore: mtgKnowledgeSources/${def.sourceId}`);
    }

    return "uploaded";
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`    failed: ${message}`);
    if (opts.writeFirestore) {
      await requireLocalFirestore(`mtg-rag run fail ${runId}`, async () => {
        await finishMtgIngestionRun({
          runId,
          status: "failed",
          errorMessage: message,
        });
      });
    }
    return "failed";
  }
}

async function main() {
  loadEnvLocal();
  const opts = parseMtgRagCli(process.argv.slice(2));
  const definitions = definitionsForSourceFilter(opts.source);

  console.log("\nMTG RAG — ingest (Phase 1: raw upload + source metadata)\n");
  console.log(`Curated sources:   ${defaultCuratedSourcesDir()}`);
  console.log(`Transcripts root:  ${defaultTranscriptsRoot()}`);
  console.log(`Transcript dirs:   ${transcriptSearchDirs().join(", ")}`);
  if (opts.sourcesDir) console.log(`Override dir:      ${opts.sourcesDir}`);
  console.log(`Source filter:     ${opts.source}`);
  console.log(`Dry run:           ${opts.dryRun}`);
  console.log(`Force:             ${opts.force}`);
  console.log("");

  const stats = { uploaded: 0, skipped: 0, missing: 0, failed: 0 };

  for (const def of definitions) {
    const result = await ingestOneSource(def, opts);
    stats[result === "uploaded" ? "uploaded" : result]++;
  }

  console.log("");
  console.log(
    `Done: ${stats.uploaded} uploaded, ${stats.skipped} skipped, ${stats.missing} missing, ${stats.failed} failed`,
  );

  if (stats.failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  printMtgRagUsage("ingest");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
