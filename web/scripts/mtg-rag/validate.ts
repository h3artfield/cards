/**
 * MTG RAG — validate local source packages and optional Firestore chunk metadata.
 * Run: npm run mtg-rag:validate [-- --check-firestore]
 */
import { loadEnvLocal } from "../lib/script-env";
import { requireLocalFirestore } from "../lib/firestore-fail-fast";
import { listMtgKnowledgeSources } from "../../src/lib/mtg-rag/source-store";
import { MTG_RAG_TRANSCRIPT_FILES } from "../../src/lib/mtg-rag/source-definitions";
import {
  countCsvDataRows,
  countJsonlRows,
  defaultCuratedSourcesDir,
  defaultTranscriptsRoot,
  definitionsForSourceFilter,
  listTranscriptFilesOnDisk,
  resolvePrimarySourceFile,
  transcriptSearchDirs,
} from "./lib/resolve-sources";

const EXPECTED_COUNTS: Record<string, number> = {
  "curated-glossary-v1": 500,
  "curated-colors-v1": 30,
  "curated-commander-primers-v1": 75,
};

/** Minimum chunk counts after Phase 2 chunk+embed (approximate). */
const MIN_CHUNK_COUNTS: Record<string, number> = {
  "curated-glossary-v1": 500,
  "curated-colors-v1": 30,
  "curated-commander-primers-v1": 300,
  "official-comprehensive-rules": 300,
};

function hasFlag(argv: string[], flag: string): boolean {
  return argv.includes(flag);
}

async function main() {
  loadEnvLocal();
  const checkFirestore = hasFlag(process.argv.slice(2), "--check-firestore");

  console.log("\nMTG RAG — validate (Phase 2)\n");
  console.log(`Curated sources:   ${defaultCuratedSourcesDir()}`);
  console.log(`Transcripts root:  ${defaultTranscriptsRoot()}`);
  console.log(`Transcript dirs:   ${transcriptSearchDirs().join(", ")}`);
  console.log("");

  let failures = 0;
  const definitions = definitionsForSourceFilter("all");

  for (const def of definitions) {
    const primary = resolvePrimarySourceFile(def);
    const expected = EXPECTED_COUNTS[def.sourceId];

    if (!primary) {
      if (def.sourceKey === "transcripts") {
        console.log(`○ ${def.sourceId} — transcript not present (optional until provided)`);
        continue;
      }
      if (def.sourceKey === "comprehensive-rules") {
        console.log(`○ ${def.sourceId} — rules file not present (add before rules RAG)`);
        continue;
      }
      console.log(`✗ ${def.sourceId} — primary file missing`);
      failures++;
      continue;
    }

    const rows =
      countJsonlRows(primary.localPath) ?? countCsvDataRows(primary.localPath);
    const rowOk = expected == null || rows === expected;

    if (rowOk) {
      console.log(
        `✓ ${def.sourceId} — ${primary.filename}${rows != null ? ` (${rows} rows)` : ""}`,
      );
    } else {
      console.log(
        `✗ ${def.sourceId} — expected ${expected} rows, got ${rows ?? "unknown"}`,
      );
      failures++;
    }
  }

  const onDisk = listTranscriptFilesOnDisk();
  const catalogPresent = MTG_RAG_TRANSCRIPT_FILES.filter(({ filename }) =>
    Boolean(
      resolvePrimarySourceFile({
        sourceKey: "transcripts",
        sourceId: "",
        title: "",
        sourceType: "community_transcript",
        authorityTier: "community_education",
        corpus: "youtube_transcript",
        gcsSubdir: "transcripts",
        candidateFilenames: [filename],
      }),
    ),
  );
  console.log("");
  console.log(
    `Transcripts on disk: ${onDisk.length} .txt | catalog matched: ${catalogPresent.length}/${MTG_RAG_TRANSCRIPT_FILES.length}`,
  );

  if (checkFirestore) {
    console.log("");
    console.log("Firestore source metadata:");
    const sources = await requireLocalFirestore("mtg-rag validate firestore", () =>
      listMtgKnowledgeSources(),
    );
    if (sources.length === 0) {
      console.log("  (none — run npm run mtg-rag:ingest)");
      failures++;
    } else {
      for (const s of sources.sort((a, b) => a.sourceId.localeCompare(b.sourceId))) {
        const minChunks = MIN_CHUNK_COUNTS[s.sourceId];
        const chunkOk = minChunks == null || s.chunkCount >= minChunks;
        const marker = chunkOk ? "✓" : "✗";
        console.log(
          `  ${marker} ${s.sourceId} — ${s.status}, ${s.byteCount} bytes, chunks=${s.chunkCount}${minChunks != null ? ` (min ${minChunks})` : ""}`,
        );
        if (!chunkOk) failures++;
      }
    }
  }

  console.log("");
  if (failures > 0) {
    console.log(`Validation FAILED (${failures} issue(s))`);
    process.exit(1);
  }
  console.log("Validation PASSED");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
