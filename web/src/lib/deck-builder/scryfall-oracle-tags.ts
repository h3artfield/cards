import { gunzipSync } from "node:zlib";
import { fetchScryfallBulkDownloadUri } from "./scryfall-catalog";

export interface ScryfallOracleTagsIndex {
  byOracleId: Map<string, string[]>;
  tagCount: number;
  loadedAt: string;
}

interface OracleTagBulkEntry {
  type?: string;
  slug?: string;
  taggings?: Array<{
    oracle_id?: string;
    weight?: string;
  }>;
}

let cachedIndex: ScryfallOracleTagsIndex | null = null;
let loadPromise: Promise<ScryfallOracleTagsIndex> | null = null;

const SKIP_WEIGHTS = new Set(["weak"]);

/** Invert oracle-tags bulk: oracle_id → sorted tag slugs. */
export function buildOracleTagsIndexFromEntries(
  entries: OracleTagBulkEntry[],
): ScryfallOracleTagsIndex {
  const byOracleId = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (entry.type !== "oracle" || !entry.slug) continue;
    for (const tagging of entry.taggings ?? []) {
      const oracleId = tagging.oracle_id?.trim();
      if (!oracleId) continue;
      if (tagging.weight && SKIP_WEIGHTS.has(tagging.weight)) continue;
      let tags = byOracleId.get(oracleId);
      if (!tags) {
        tags = new Set();
        byOracleId.set(oracleId, tags);
      }
      tags.add(entry.slug);
    }
  }

  const sorted = new Map<string, string[]>();
  for (const [oracleId, tags] of byOracleId) {
    sorted.set(oracleId, [...tags].sort());
  }

  return {
    byOracleId: sorted,
    tagCount: entries.length,
    loadedAt: new Date().toISOString(),
  };
}

function parseBulkPayload(text: string): OracleTagBulkEntry[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    return JSON.parse(trimmed) as OracleTagBulkEntry[];
  }
  const entries: OracleTagBulkEntry[] = [];
  for (const line of trimmed.split("\n")) {
    if (!line.trim()) continue;
    entries.push(JSON.parse(line) as OracleTagBulkEntry);
  }
  return entries;
}

export async function loadScryfallOracleTagsIndex(): Promise<ScryfallOracleTagsIndex> {
  const uri = await fetchScryfallBulkDownloadUri("oracle_tags");
  if (!uri) throw new Error("Could not resolve Scryfall oracle_tags bulk URI");

  const started = Date.now();
  const res = await fetch(uri, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        process.env.SCRYFALL_USER_AGENT ??
        "CardBuyback/1.0 (+https://buyback-web-staging-rrogeqxyea-uc.a.run.app)",
    },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`Scryfall oracle_tags download failed (${res.status})`);
  }

  const raw = Buffer.from(await res.arrayBuffer());
  const text = uri.endsWith(".gz")
    ? gunzipSync(raw).toString("utf8")
    : raw.toString("utf8");
  const index = buildOracleTagsIndexFromEntries(parseBulkPayload(text));
  index.loadedAt = new Date().toISOString();
  console.info(
    `[oracle-tags] loaded ${index.byOracleId.size} oracle cards with tags (${index.tagCount} tag entries) in ${Date.now() - started}ms`,
  );
  return index;
}

export async function getScryfallOracleTagsIndex(): Promise<ScryfallOracleTagsIndex> {
  if (cachedIndex) return cachedIndex;
  if (!loadPromise) {
    loadPromise = loadScryfallOracleTagsIndex()
      .then((index) => {
        cachedIndex = index;
        return index;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}

export function clearScryfallOracleTagsIndexCache(): void {
  cachedIndex = null;
  loadPromise = null;
}

export function lookupOracleTags(
  index: ScryfallOracleTagsIndex | null | undefined,
  oracleId?: string,
): string[] {
  if (!index || !oracleId) return [];
  return index.byOracleId.get(oracleId) ?? [];
}
