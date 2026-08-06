import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";
import { sha256Hex } from "../../../src/lib/mtg-rag/hash";
import {
  allSourceDefinitions,
  MTG_RAG_SOURCE_DEFINITIONS,
  MTG_RAG_TRANSCRIPT_FILES,
  sourceDefinitionForKey,
  transcriptSourceDefinition,
  type MtgRagSourceDefinition,
  type MtgRagSourceKey,
} from "../../../src/lib/mtg-rag/source-definitions";

/** Curated CSV/JSONL packages (glossary, colors, commander primers). */
export function defaultCuratedSourcesDir(): string {
  const env = process.env.MTG_RAG_SOURCES_DIR?.trim();
  if (env) return resolve(env);
  return join(homedir(), "Downloads");
}

/** Parent folder containing `mtg/` and `Commander/` transcript subfolders. */
export function defaultTranscriptsRoot(): string {
  const env = process.env.MTG_RAG_TRANSCRIPTS_DIR?.trim();
  if (env) {
    const resolved = resolve(env);
    const base = resolved.replace(/[/\\]mtg[/\\]?$/i, "");
    if (base !== resolved && existsSync(base)) return base;
    if (existsSync(join(resolved, "mtg")) || existsSync(join(resolved, "Commander"))) {
      return resolved;
    }
    return resolved;
  }

  const sibling = resolve(__dirname, "../../../../../YTtranscripts");
  if (existsSync(sibling)) return sibling;

  return join(homedir(), "Downloads");
}

/** Primary folder for general MTG transcripts and comprehensive rules. */
export function defaultTranscriptsDir(): string {
  const env = process.env.MTG_RAG_TRANSCRIPTS_DIR?.trim();
  if (env) {
    const resolved = resolve(env);
    if (/[/\\]mtg[/\\]?$/i.test(resolved)) return resolved;
    const mtg = join(resolved, "mtg");
    if (existsSync(mtg)) return mtg;
    return resolved;
  }

  const mtg = join(defaultTranscriptsRoot(), "mtg");
  if (existsSync(mtg)) return mtg;

  return join(homedir(), "Downloads");
}

/** @deprecated Use defaultCuratedSourcesDir — kept for CLI backward compatibility. */
export function defaultSourcesDir(): string {
  return defaultCuratedSourcesDir();
}

/** Scan `mtg/` and sibling `Commander/` under the transcripts root (never venv/Downloads). */
export function transcriptSearchDirs(): string[] {
  const root = defaultTranscriptsRoot();
  return uniqueExistingDirs([join(root, "mtg"), join(root, "Commander")]);
}

/** List every catalog transcript .txt on disk (excludes comprehensive rules). */
export function listTranscriptFilesOnDisk(): Array<{
  filename: string;
  localPath: string;
  dir: string;
}> {
  const out: Array<{ filename: string; localPath: string; dir: string }> = [];
  const seen = new Set<string>();

  for (const dir of transcriptSearchDirs()) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".txt")) continue;
      if (entry.name.toLowerCase() === "mtg-comprehensive-rules.txt") continue;
      const key = entry.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ filename: entry.name, localPath: join(dir, entry.name), dir });
    }
  }

  return out.sort((a, b) => a.filename.localeCompare(b.filename));
}

export function allSearchDirs(definition: MtgRagSourceDefinition): string[] {
  const curated = defaultCuratedSourcesDir();
  const transcripts = transcriptSearchDirs();

  if (definition.sourceKey === "transcripts") {
    return transcripts;
  }
  if (definition.sourceKey === "comprehensive-rules") {
    return uniqueExistingDirs([defaultTranscriptsDir(), curated]);
  }
  return uniqueExistingDirs([curated, defaultTranscriptsDir()]);
}

function uniqueExistingDirs(dirs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of dirs) {
    const resolved = resolve(dir);
    if (seen.has(resolved) || !existsSync(resolved)) continue;
    seen.add(resolved);
    out.push(resolved);
  }
  return out;
}

export interface ResolvedSourceFile {
  definition: MtgRagSourceDefinition & { transcriptTopic?: string };
  localPath: string;
  filename: string;
  byteCount: number;
  contentHash: string;
  resolvedFromDir: string;
}

export function resolvePrimarySourceFile(
  definition: MtgRagSourceDefinition,
  sourcesDir?: string,
): ResolvedSourceFile | null {
  const searchDirs = sourcesDir
    ? [resolve(sourcesDir)]
    : allSearchDirs(definition);

  for (const dir of searchDirs) {
    for (const filename of definition.candidateFilenames) {
      const localPath = join(dir, filename);
      if (!existsSync(localPath)) continue;
      const buf = readFileSync(localPath);
      return {
        definition,
        localPath,
        filename,
        byteCount: buf.byteLength,
        contentHash: sha256Hex(buf),
        resolvedFromDir: dir,
      };
    }
  }
  return null;
}

export function resolveCompanionFiles(
  definition: MtgRagSourceDefinition,
  sourcesDir?: string,
): Array<{ filename: string; localPath: string; byteCount: number }> {
  const searchDirs = sourcesDir
    ? [resolve(sourcesDir)]
    : allSearchDirs(definition);
  const out: Array<{ filename: string; localPath: string; byteCount: number }> = [];

  for (const filename of definition.companionFilenames ?? []) {
    for (const dir of searchDirs) {
      const localPath = join(dir, filename);
      if (!existsSync(localPath)) continue;
      out.push({
        filename,
        localPath,
        byteCount: statSync(localPath).size,
      });
      break;
    }
  }
  return out;
}

/** Pick up extra .txt files in the transcripts folder not in the static catalog. */
export function discoverExtraTranscripts(): Array<
  MtgRagSourceDefinition & { transcriptTopic?: string }
> {
  const known = new Set(
    MTG_RAG_SOURCE_DEFINITIONS.flatMap((d) => d.candidateFilenames).map((f) =>
      f.toLowerCase(),
    ),
  );
  for (const { filename } of MTG_RAG_TRANSCRIPT_FILES) {
    known.add(filename.toLowerCase());
  }

  const extras: Array<MtgRagSourceDefinition & { transcriptTopic?: string }> = [];
  const seenNames = new Set<string>();

  for (const dir of transcriptSearchDirs()) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".txt")) continue;
      if (entry.name.toLowerCase() === "mtg-comprehensive-rules.txt") continue;
      if (known.has(entry.name.toLowerCase()) || seenNames.has(entry.name.toLowerCase())) {
        continue;
      }
      seenNames.add(entry.name.toLowerCase());
      extras.push(
        transcriptSourceDefinition(
          entry.name,
          "discovered YouTube or educational transcript",
        ),
      );
    }
  }
  return extras.sort((a, b) =>
    a.candidateFilenames[0]!.localeCompare(b.candidateFilenames[0]!),
  );
}

export function definitionsForSourceFilter(source: string) {
  if (source === "all") {
    return [...allSourceDefinitions(), ...discoverExtraTranscripts()];
  }
  const key = source as MtgRagSourceKey;
  const allowed: MtgRagSourceKey[] = [
    "glossary",
    "colors",
    "commander",
    "comprehensive-rules",
    "transcripts",
  ];
  if (!allowed.includes(key)) {
    throw new Error(`Unknown --source value: ${source}`);
  }
  if (key === "transcripts") {
    return [...sourceDefinitionForKey("transcripts"), ...discoverExtraTranscripts()];
  }
  return sourceDefinitionForKey(key);
}

export function countCsvDataRows(filePath: string): number | null {
  if (!filePath.toLowerCase().endsWith(".csv")) return null;
  const text = readFileSync(filePath, "utf8");

  if (text.includes("primer_id,")) {
    const matches = text.match(/^mtg-cmd-primer-\d+/gm);
    if (matches) return matches.length;
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return Math.max(0, lines.length - 1);
}

export function countJsonlRows(filePath: string): number | null {
  if (!filePath.toLowerCase().endsWith(".jsonl")) return null;
  const text = readFileSync(filePath, "utf8");
  return text.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
}
