import { createGunzip } from "node:zlib";
import { Readable } from "node:stream";
import readline from "node:readline";
import type { InventoryItem } from "../types";
import { normalizeScryfallCollectorNumber } from "../processing/scryfall-client";
import { normalizeCardNameForMatch } from "../store-inventory/clerk-tools/magic-commander-inventory";
import { cardNameFromInventoryItem } from "../inventory/image-fallback";
import {
  catalogCardFromScryfall,
  fetchScryfallBulkJsonlUri,
} from "./scryfall-catalog";
import type { CatalogCard } from "./types";

export interface ScryfallBulkIndex {
  byTcgplayerId: Map<string, CatalogCard>;
  bySetKeyAndCn: Map<string, CatalogCard>;
  byNormalizedName: Map<string, CatalogCard>;
  byScryfallId: Map<string, CatalogCard>;
  setNameToCode: Map<string, string>;
  cardCount: number;
  loadedAt: string;
}

export interface ScryfallBulkLoadStats {
  cardCount: number;
  loadMs: number;
  tcgplayerKeys: number;
  setCnKeys: number;
}

let cachedIndex: ScryfallBulkIndex | null = null;
let loadPromise: Promise<ScryfallBulkIndex> | null = null;

function normalizeSetKey(name: string): string {
  return name.trim().toLowerCase();
}

function setCnKey(setKey: string, cn: string): string {
  return `${setKey.toLowerCase()}:${cn.trim().toLowerCase()}`;
}

function collectorKeys(cn: string): string[] {
  const trimmed = cn.trim().toLowerCase();
  const keys = new Set<string>([trimmed]);
  const digits = normalizeScryfallCollectorNumber(cn);
  if (digits) keys.add(digits.toLowerCase());
  return [...keys];
}

function isPaperInventoryCard(raw: Record<string, unknown>): boolean {
  const games = raw.games as string[] | undefined;
  if (games?.length && !games.includes("paper")) return false;
  if (raw.layout === "token") return false;
  const typeLine = String(raw.type_line ?? "").toLowerCase();
  if (typeLine.includes("token")) return false;
  return true;
}

function indexCatalogCard(index: ScryfallBulkIndex, card: CatalogCard, raw: Record<string, unknown>): void {
  index.cardCount += 1;
  index.byScryfallId.set(card.id, card);

  if (card.tcgplayerId) {
    index.byTcgplayerId.set(card.tcgplayerId, card);
  }

  const setCode = card.set.toLowerCase();
  const setName = normalizeSetKey(String(raw.set_name ?? card.setName ?? ""));
  if (setName) {
    index.setNameToCode.set(setName, setCode);
  }
  index.setNameToCode.set(setCode, setCode);

  for (const cn of collectorKeys(card.collectorNumber)) {
    index.bySetKeyAndCn.set(setCnKey(setCode, cn), card);
    if (setName) {
      index.bySetKeyAndCn.set(setCnKey(setName, cn), card);
    }
  }

  const nameKey = normalizeCardNameForMatch(card.name);
  if (nameKey && !index.byNormalizedName.has(nameKey)) {
    index.byNormalizedName.set(nameKey, card);
  }
}

function emptyBulkIndex(): ScryfallBulkIndex {
  return {
    byTcgplayerId: new Map(),
    bySetKeyAndCn: new Map(),
    byNormalizedName: new Map(),
    byScryfallId: new Map(),
    setNameToCode: new Map(),
    cardCount: 0,
    loadedAt: new Date().toISOString(),
  };
}

/** Stream-parse Scryfall default_cards JSONL (optionally gzip-compressed). */
export async function streamDefaultCardsBulk(input: {
  body: ReadableStream<Uint8Array> | NodeJS.ReadableStream;
  gzip?: boolean;
  onRawCard?: (raw: Record<string, unknown>, card: CatalogCard) => void;
}): Promise<ScryfallBulkIndex> {
  const index = emptyBulkIndex();
  const nodeStream =
    input.body instanceof Readable
      ? input.body
      : Readable.fromWeb(input.body as import("stream/web").ReadableStream);

  const parsed = input.gzip === false ? nodeStream : nodeStream.pipe(createGunzip());
  const rl = readline.createInterface({ input: parsed, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (!isPaperInventoryCard(raw)) continue;
    const card = catalogCardFromScryfall(raw);
    if (!card) continue;
    indexCatalogCard(index, card, raw);
    input.onRawCard?.(raw, card);
  }

  return index;
}

export async function loadScryfallBulkIndex(): Promise<ScryfallBulkIndex> {
  const uri = await fetchScryfallBulkJsonlUri();
  if (!uri) throw new Error("Could not resolve Scryfall default_cards bulk URI");

  const started = Date.now();
  const res = await fetch(uri, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        process.env.SCRYFALL_USER_AGENT ??
        "CardBuyback/1.0 (+https://buyback-web-staging-rrogeqxyea-uc.a.run.app)",
    },
    signal: AbortSignal.timeout(240_000),
  });
  if (!res.ok) {
    throw new Error(`Scryfall bulk download failed (${res.status})`);
  }
  if (!res.body) {
    throw new Error("Scryfall bulk download returned empty body");
  }

  const index = await streamDefaultCardsBulk({
    body: res.body,
    gzip: uri.endsWith(".gz"),
  });
  index.loadedAt = new Date().toISOString();
  console.info(
    `[scryfall-bulk] loaded ${index.cardCount} paper cards in ${Date.now() - started}ms`,
  );
  return index;
}

export async function getScryfallBulkIndex(): Promise<ScryfallBulkIndex> {
  if (cachedIndex) return cachedIndex;
  if (!loadPromise) {
    loadPromise = loadScryfallBulkIndex()
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

export function clearScryfallBulkIndexCache(): void {
  cachedIndex = null;
  loadPromise = null;
}

export function resolveCatalogFromBulkIndex(
  item: InventoryItem,
  index: ScryfallBulkIndex,
): { catalog: CatalogCard; matchMethod: "tcgplayer_id" | "set_search" | "name_search" } | null {
  if (item.catalogScryfallId) {
    const byId = index.byScryfallId.get(item.catalogScryfallId);
    if (byId) return { catalog: byId, matchMethod: "tcgplayer_id" };
  }

  const productName =
    item.productName?.trim() ||
    cardNameFromInventoryItem(item) ||
    item.displayName.split(" — ")[0]?.trim() ||
    "";

  if (item.tcgplayerProductId) {
    const hit = index.byTcgplayerId.get(item.tcgplayerProductId.trim());
    if (hit) return { catalog: hit, matchMethod: "tcgplayer_id" };
  }

  if (item.setName && item.cardNumber) {
    const setName = item.setName.trim();
    const setKeys = new Set<string>();
    const code = index.setNameToCode.get(normalizeSetKey(setName));
    if (code) setKeys.add(code);
    setKeys.add(normalizeSetKey(setName));

    for (const setKey of setKeys) {
      for (const cn of collectorKeys(item.cardNumber)) {
        const hit = index.bySetKeyAndCn.get(setCnKey(setKey, cn));
        if (hit) return { catalog: hit, matchMethod: "set_search" };
      }
    }
  }

  if (productName) {
    const hit = index.byNormalizedName.get(normalizeCardNameForMatch(productName));
    if (hit) return { catalog: hit, matchMethod: "name_search" };
  }

  return null;
}

/** Build an index from JSONL text (tests / fixtures). */
export function buildBulkIndexFromJsonl(jsonl: string): ScryfallBulkIndex {
  const index = emptyBulkIndex();
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    const raw = JSON.parse(line) as Record<string, unknown>;
    if (!isPaperInventoryCard(raw)) continue;
    const card = catalogCardFromScryfall(raw);
    if (!card) continue;
    indexCatalogCard(index, card, raw);
  }
  return index;
}
