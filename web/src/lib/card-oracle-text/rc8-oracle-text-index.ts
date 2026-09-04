/**
 * Oracle text by oracle id, reconstructed from the RC8 shadow parse.
 *
 * The semantic map stores coordinates and tags but not card text, so anything
 * that needs to read what a card actually says comes here. Cached for the life
 * of the process; the underlying artifact is a frozen snapshot.
 */
import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { semanticMapArtifactPath } from "@/lib/semantic-visualization/artifact-paths";

export type Rc8OracleTextEntry = {
  oracleId: string;
  name: string;
  oracleText: string;
};

let cached: Map<string, Rc8OracleTextEntry> | null = null;
let inflight: Promise<Map<string, Rc8OracleTextEntry>> | null = null;

async function build(): Promise<Map<string, Rc8OracleTextEntry>> {
  const index = new Map<string, Rc8OracleTextEntry>();
  const path = semanticMapArtifactPath("shadowParse");
  if (!existsSync(path)) return index;

  const rl = createInterface({
    input: createReadStream(path).pipe(createGunzip()),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as {
      oracleId?: string;
      canonicalName?: string;
      semantic?: { abilities?: Array<{ abilitySpan?: { text?: string } }> };
    };
    if (!rec.oracleId) continue;
    index.set(rec.oracleId, {
      oracleId: rec.oracleId,
      name: rec.canonicalName ?? rec.oracleId,
      oracleText: (rec.semantic?.abilities ?? [])
        .map((ability) => (ability.abilitySpan?.text ?? "").trim())
        .filter(Boolean)
        .join(" "),
    });
  }
  return index;
}

export function normalizeCardNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

let cachedByName: Map<string, Rc8OracleTextEntry> | null = null;

/** Name lookup for callers holding a decklist rather than oracle ids. */
export async function loadRc8OracleTextByName(): Promise<Map<string, Rc8OracleTextEntry>> {
  if (cachedByName) return cachedByName;
  const index = await loadRc8OracleTextIndex();
  const byName = new Map<string, Rc8OracleTextEntry>();
  for (const entry of index.values()) {
    const key = normalizeCardNameKey(entry.name);
    if (!byName.has(key)) byName.set(key, entry);
  }
  cachedByName = byName;
  return byName;
}

export async function loadRc8OracleTextIndex(): Promise<Map<string, Rc8OracleTextEntry>> {
  if (cached) return cached;
  if (!inflight) {
    inflight = build().then((index) => {
      cached = index;
      inflight = null;
      return index;
    });
  }
  return inflight;
}
