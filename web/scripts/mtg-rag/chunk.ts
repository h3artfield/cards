/**
 * MTG RAG Phase 2 — chunk, embed, and write Firestore knowledge chunks.
 * Run: npm run mtg-rag:chunk -- [--source glossary|colors|all] [--limit N]
 */
import { loadEnvLocal } from "../lib/script-env";
import { withFirestoreScriptTimeout } from "../lib/firestore-fail-fast";
import { getMtgKnowledgeSource } from "../../src/lib/mtg-rag/source-store";
import { runChunkPipeline } from "./chunk-pipeline";
import { parseMtgRagCli, printMtgRagUsage } from "./lib/cli";
import {
  defaultCuratedSourcesDir,
  defaultTranscriptsRoot,
  definitionsForSourceFilter,
  resolvePrimarySourceFile,
  transcriptSearchDirs,
} from "./lib/resolve-sources";

const CHUNK_FIRESTORE_TIMEOUT_MS = 600_000;

async function withChunkFirestore<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return withFirestoreScriptTimeout(label, fn, CHUNK_FIRESTORE_TIMEOUT_MS);
}

async function main() {
  loadEnvLocal();
  const opts = parseMtgRagCli(process.argv.slice(2));
  opts.chunks = true;

  console.log("\nMTG RAG — chunk + embed (Phase 2)\n");
  console.log(`Curated sources:   ${defaultCuratedSourcesDir()}`);
  console.log(`Transcripts root:  ${defaultTranscriptsRoot()}`);
  console.log(`Transcript dirs:   ${transcriptSearchDirs().join(", ")}`);
  console.log(`Source filter:     ${opts.source}`);
  console.log(`Embed:             ${opts.embed}`);
  console.log(`Dry run:           ${opts.dryRun}`);
  if (opts.limit) console.log(`Limit:             ${opts.limit} chunks/source`);
  console.log("");

  const definitions = definitionsForSourceFilter(opts.source);
  let processed = 0;
  let totalChunks = 0;
  let failed = 0;

  for (const def of definitions) {
    const primary = resolvePrimarySourceFile(def, opts.sourcesDir);
    if (!primary) {
      console.log(`  skip (missing): ${def.sourceId}`);
      continue;
    }

    const existing = opts.writeFirestore
      ? await withChunkFirestore(`mtg-rag source ${def.sourceId}`, () =>
          getMtgKnowledgeSource(def.sourceId),
        )
      : null;

    if (
      existing &&
      existing.contentHash === primary.contentHash &&
      existing.chunkCount > 0 &&
      !opts.force
    ) {
      console.log(`  skip (chunks current): ${def.sourceId} (${existing.chunkCount} chunks)`);
      continue;
    }

    console.log(`  chunk: ${def.sourceId}`);
    try {
      const result = await withChunkFirestore(`mtg-rag chunk ${def.sourceId}`, () =>
        runChunkPipeline(def, primary, {
          dryRun: opts.dryRun,
          embed: opts.embed,
          writeFirestore: opts.writeFirestore,
          limit: opts.limit,
        }),
      );
      totalChunks += result.chunkCount;
      processed++;
    } catch (err) {
      failed++;
      console.error(`    failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("");
  console.log(`Done: ${processed} sources chunked, ${totalChunks} total chunks, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  printMtgRagUsage("chunk");
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
