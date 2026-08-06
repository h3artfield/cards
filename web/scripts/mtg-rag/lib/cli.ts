import { defaultSourcesDir } from "./resolve-sources";

export interface MtgRagCliOptions {
  /** When set, restricts all lookups to this single directory. */
  sourcesDir?: string;
  source: string;
  dryRun: boolean;
  force: boolean;
  writeFirestore: boolean;
  uploadGcs: boolean;
  chunks: boolean;
  embed: boolean;
  limit?: number;
}

export function parseMtgRagCli(argv: string[]): MtgRagCliOptions {
  const opts: MtgRagCliOptions = {
    source: "all",
    dryRun: false,
    force: false,
    writeFirestore: true,
    uploadGcs: true,
    chunks: false,
    embed: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--sources-dir" && argv[i + 1]) {
      opts.sourcesDir = argv[++i]!;
    } else if (arg === "--source" && argv[i + 1]) {
      opts.source = argv[++i]!;
    } else if (arg === "--limit" && argv[i + 1]) {
      opts.limit = parseInt(argv[++i]!, 10);
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--force") {
      opts.force = true;
    } else if (arg === "--chunks") {
      opts.chunks = true;
    } else if (arg === "--no-embed") {
      opts.embed = false;
    } else if (arg === "--no-firestore") {
      opts.writeFirestore = false;
    } else if (arg === "--no-gcs") {
      opts.uploadGcs = false;
    }
  }

  return opts;
}

export function printMtgRagUsage(script: string): void {
  console.error(`Usage: npm run mtg-rag:${script} -- [options]

Options:
  --sources-dir <path>   Restrict lookups to one directory (default: curated=Downloads, transcripts=../YTtranscripts/mtg)
  --source <key|all>     glossary | colors | commander | comprehensive-rules | transcripts | all
  --dry-run              Plan only; do not upload or write Firestore
  --force                Re-upload even when content hash is unchanged
  --chunks               Parse, embed, and write mtgKnowledgeChunks (+ aliases)
  --no-embed             Write chunks without embeddings (parse/validate only)
  --limit <n>            Cap chunks per source (dev/testing)
  --no-firestore         Skip Firestore metadata writes
  --no-gcs               Skip Cloud Storage uploads
`);
}
