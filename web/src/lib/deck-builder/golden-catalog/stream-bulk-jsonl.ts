import { createGunzip } from "node:zlib";
import { createReadStream } from "node:fs";
import readline from "node:readline";

export async function countJsonlLines(cachePath: string): Promise<number> {
  const gzip = cachePath.endsWith(".gz");
  const input = gzip
    ? createReadStream(cachePath).pipe(createGunzip())
    : createReadStream(cachePath);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let count = 0;
  for await (const line of rl) {
    if (line.trim()) count += 1;
  }
  return count;
}

export async function streamJsonlFile<T>(input: {
  cachePath: string;
  onLine: (
    raw: Record<string, unknown>,
    lineNumber: number,
  ) => Promise<T | void> | T | void;
  limit?: number;
  filter?: (raw: Record<string, unknown>) => boolean;
}): Promise<{ linesProcessed: number; results: number; errors: number }> {
  const gzip = input.cachePath.endsWith(".gz");
  const fileStream = createReadStream(input.cachePath);
  const parsed = gzip ? fileStream.pipe(createGunzip()) : fileStream;
  const rl = readline.createInterface({ input: parsed, crlfDelay: Infinity });

  let linesProcessed = 0;
  let results = 0;
  let errors = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    linesProcessed += 1;
    if (input.limit != null && linesProcessed > input.limit) break;

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line) as Record<string, unknown>;
    } catch {
      errors += 1;
      continue;
    }

    if (input.filter && !input.filter(raw)) continue;

    try {
      const out = await input.onLine(raw, linesProcessed);
      if (out !== undefined) results += 1;
    } catch {
      errors += 1;
    }
  }

  return { linesProcessed, results, errors };
}

/** Stream oracle_tags bulk (JSON array or JSONL). */
export async function streamOracleTagsFile(input: {
  cachePath: string;
  onEntry: (entry: Record<string, unknown>) => Promise<void> | void;
}): Promise<{ entriesProcessed: number }> {
  const { readFile } = await import("node:fs/promises");
  const { gunzipSync } = await import("node:zlib");
  const raw = await readFile(input.cachePath);
  const text = input.cachePath.endsWith(".gz")
    ? gunzipSync(raw).toString("utf8")
    : raw.toString("utf8");

  const trimmed = text.trim();
  let entries: Record<string, unknown>[] = [];
  if (trimmed.startsWith("[")) {
    entries = JSON.parse(trimmed) as Record<string, unknown>[];
  } else {
    for (const line of trimmed.split("\n")) {
      if (!line.trim()) continue;
      entries.push(JSON.parse(line) as Record<string, unknown>);
    }
  }

  for (const entry of entries) {
    await input.onEntry(entry);
  }
  return { entriesProcessed: entries.length };
}
