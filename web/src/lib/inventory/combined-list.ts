import {
  buildHeaderIndex,
  getCell,
  parseCsv,
  parseMoney,
  stringifyCsv,
  stripUtf8Bom,
} from "../shipping/csv-utils";
import type { ScryfallBulkIndex } from "../deck-builder/scryfall-bulk-index";
import type { CatalogCard } from "../deck-builder/types";
import { normalizeCardNameForMatch } from "../store-inventory/clerk-tools/magic-commander-inventory";
import { parseTcgplayerInventoryExportCsv } from "../tcgplayer-inventory/parse-export-csv";
import { buildTcgplayerListingKey } from "../tcgplayer-inventory/listing-key";
import { cardLinkKeyV1, cardLinkUrlV1 } from "./card-link-key";
import { shelfLocationV1 } from "./shelf-location";
import { shelfPriceFromMarketV1 } from "./shelf-price";

/** What the store's inventory already knows about a listing, keyed by TCGplayer listing key. */
export type KnownListingV1 = {
  market: number | null;
  colors?: string[];
  colorIdentity?: string[];
  typeLine?: string;
  /** Day (YYYY-MM-DD) a copy last sold. */
  lastSold?: string;
};

/** One row of the store's own shelf list. */
export type StoreListRowV1 = {
  /** Source file name when several sheets are combined. */
  file: string;
  line: number;
  productLine: string;
  productName: string;
  condition: string;
  number: string;
  setName: string;
  rarity: string;
  inStore: number;
  online: number;
  savedPrice: number;
  location: string;
  ingestedAt: string;
  /** Present on lists downloaded from here and uploaded again. */
  tcgplayerId: string;
};

export type CombinedRowV1 = {
  tcgplayerProductId: string;
  productLine: string;
  setName: string;
  productName: string;
  title: string;
  number: string;
  rarity: string;
  condition: string;
  tcgMarketPrice: number | null;
  storePrice: number | null;
  inStore: number;
  online: number;
  location: string;
  ingestedAt: string;
  lastSold: string;
  /** Says where the price came from when it isn't JustTCG's price for this exact card. */
  priceNote: string;
  photoUrl: string;
  cardLinkKey: string | null;
  /** How the row got its TCGplayer id. */
  source: "tcgplayer" | "both" | "store_matched" | "store_catalog";
};

export type UnmatchedStoreRowV1 = StoreListRowV1 & { reason: string };

export type CombinedListV1 = {
  rows: CombinedRowV1[];
  unmatched: UnmatchedStoreRowV1[];
  /** Ready for the TCGplayer import pipeline (and for download). */
  csv: string;
  counts: {
    tcgplayerRows: number;
    /** Online units (Add to Quantity) summed over the TCGplayer files. */
    tcgplayerUnits: number;
    storeRows: number;
    matchedInFile: number;
    matchedCatalog: number;
    merged: number;
  };
};

const qty = (raw: string) => {
  const n = Number.parseInt(raw.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

const CONDITION_WORDS: Array<[RegExp, string]> = [
  [/^(nm|near mint|m|mint)\b/, "Near Mint"],
  [/^(lp|lightly played|ex|excellent|sp)\b/, "Lightly Played"],
  [/^(mp|moderately played|vg|played)\b/, "Moderately Played"],
  [/^(hp|heavily played|poor)\b/, "Heavily Played"],
  [/^(dmg|damaged|d)\b/, "Damaged"],
];

/** "NM foil", "LP", "Near Mint Foil" → TCGplayer's own wording, so both lists key the same way. */
export function normalizeConditionV1(raw: string): string {
  const c = raw.trim().toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  if (!c) return "Near Mint";
  if (/unopened|sealed/.test(c)) return raw.trim();
  const base = CONDITION_WORDS.find(([re]) => re.test(c))?.[1] ?? "Near Mint";
  const foil = /\bfoil\b/.test(c) && !/\bnon ?foil\b/.test(c);
  const lang = c.match(/\b(japanese|chinese|korean|german|french|italian|spanish|portuguese|russian)\b/)?.[1];
  const langLabel = lang ? ` - ${lang[0]!.toUpperCase()}${lang.slice(1)}` : "";
  return `${base}${foil ? " Foil" : ""}${langLabel}`;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
/** "0011", "11", "011/264" all read as 11. */
const normNumber = (s: string) => {
  const head = s.trim().split("/")[0] ?? "";
  return head.replace(/^0+(?=\w)/, "").toLowerCase();
};

/** "Magic" and "Magic: The Gathering", "Pokemon" and "Pokémon", name the same game. */
const normLine = (s: string) => {
  const l = norm(s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  return l.startsWith("magic") ? "magic" : l.startsWith("pokemon") ? "pokemon" : l;
};

function matchKey(r: { productLine: string; productName: string; setName: string; number: string; condition: string }, loose = false) {
  const name = loose ? normalizeCardNameForMatch(r.productName) : norm(r.productName);
  return [normLine(r.productLine), name, norm(r.setName), normNumber(r.number), norm(normalizeConditionV1(r.condition))].join("|");
}

export function parseStoreListCsvV1(text: string, file = ""): StoreListRowV1[] {
  const parsed = parseCsv(stripUtf8Bom(text));
  if (parsed.length < 2) return [];
  const index = buildHeaderIndex(parsed[0]!);
  const out: StoreListRowV1[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i]!;
    const productName = getCell(row, index, "Product Name", "Name", "Card Name");
    if (!productName) continue;
    const inStoreRaw = getCell(row, index, "In Store", "InStore");
    const onlineRaw = getCell(row, index, "Online");
    const quantity = qty(getCell(row, index, "Quantity", "Qty"));
    const split = inStoreRaw.trim() !== "" || onlineRaw.trim() !== "";
    const ingestedRaw = getCell(row, index, "Ingestion Date", "Injestion Date", "Date Added");
    const ms = ingestedRaw ? Date.parse(ingestedRaw) : NaN;
    out.push({
      file,
      line: i + 1,
      productLine: getCell(row, index, "Product Line", "Game") || "Magic",
      productName,
      condition: normalizeConditionV1(getCell(row, index, "Condition")),
      number: getCell(row, index, "Number", "Card Number", "Collector Number"),
      setName: getCell(row, index, "Set", "Set Name"),
      rarity: getCell(row, index, "Rarity"),
      inStore: split ? qty(inStoreRaw) : quantity,
      online: split ? qty(onlineRaw) : 0,
      savedPrice: parseMoney(getCell(row, index, "Saved Price", "Price")),
      location: getCell(row, index, "Location"),
      ingestedAt: Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : "",
      tcgplayerId: getCell(row, index, "TCGplayer Id", "TCGplayer ID", "TCGPlayer Id").replace(/\D/g, ""),
    });
  }
  return out;
}

/** The store's own sheet layout, with the TCGplayer id last so prices and re-uploads never need a lookup. */
const HEADERS = [
  "Product Line",
  "Product Name",
  "Condition",
  "Number",
  "Set",
  "Rarity",
  "Quantity",
  "Saved Price",
  "Location",
  "QR Code",
  "In Store",
  "Online",
  "Injestion Date",
  "Last Sold",
  "Monthly Sales",
  "TCGplayer Id",
  "Price Note",
];

const money = (n: number | null) => (n != null && n > 0 ? n.toFixed(2) : "");

/**
 * Joins the TCGplayer export (the online stock) and the store's shelf list
 * into one list keyed by TCGplayer product and condition. TCGplayer units
 * count as online; shelf rows keep their In Store / Online split. A shelf row
 * without a twin in the export is looked up in the Scryfall catalog (Magic)
 * by set and collector number; whatever still has no TCGplayer id is
 * returned for the store to fix by hand.
 */
export type InventoryCsvFileV1 = { name: string; text: string };

export type ResolvedProductV1 = { tcgplayerId: string; setName: string };

export const storeRowKeyV1 = (r: { file: string; line: number }) => `${r.file}\u0000${r.line}`;

export function combineInventoryListsV1(input: {
  tcgplayerFiles: InventoryCsvFileV1[];
  storeFiles: InventoryCsvFileV1[];
  catalog: ScryfallBulkIndex | null;
  /** Ids found outside the catalog (JustTCG search), keyed by `storeRowKeyV1`. */
  resolved?: Map<string, ResolvedProductV1>;
  /** The store's current inventory, for market prices and colours the uploads lack. */
  known?: Map<string, KnownListingV1>;
  /** Seller exports carry SKU ids (one per condition); JustTCG maps them to product ids. */
  skuToProduct?: Map<string, string>;
  /** JustTCG market prices by listing key; they win over the price in either upload. */
  justTcgPrices?: Map<string, number>;
  /** Why a JustTCG price is an estimate (another language, condition or printing), by listing key. */
  priceNotes?: Map<string, string>;
  linkBaseUrl: string;
  storeSlug: string;
}): CombinedListV1 {
  const tcg = input.tcgplayerFiles
    .filter((f) => f.text.trim())
    .flatMap((f) => parseTcgplayerInventoryExportCsv(f.text).rows);
  const store = input.storeFiles
    .filter((f) => f.text.trim())
    .flatMap((f) => parseStoreListCsvV1(f.text, f.name));

  const byListingKey = new Map<string, CombinedRowV1>();
  const strict = new Map<string, string>();
  const loose = new Map<string, string[]>();

  for (const r of tcg) {
    const condition = r.condition || "Near Mint";
    const productId =
      input.skuToProduct?.get(r.tcgplayerProductId) ?? catalogProductIdV1(r, input.catalog) ?? r.tcgplayerProductId;
    const listingKey = buildTcgplayerListingKey(productId, condition);
    const prev = byListingKey.get(listingKey);
    if (prev) {
      prev.online += r.totalQuantity;
      continue;
    }
    const market = r.tcgMarketPrice > 0 ? r.tcgMarketPrice : null;
    byListingKey.set(listingKey, {
      tcgplayerProductId: productId,
      productLine: r.productLine,
      setName: r.setName,
      productName: r.productName,
      title: r.title,
      number: r.number,
      rarity: r.rarity,
      condition,
      tcgMarketPrice: market,
      storePrice: shelfPriceFromMarketV1(market),
      inStore: 0,
      online: r.totalQuantity,
      location: r.shelfLocation ?? "",
      ingestedAt: "",
      lastSold: "",
      priceNote: "",
      photoUrl: r.raw["Photo URL"] ?? "",
      cardLinkKey: cardLinkKeyV1(productId, condition),
      source: "tcgplayer",
    });
    const keyed = { ...r, condition };
    strict.set(matchKey(keyed), listingKey);
    const lk = matchKey(keyed, true);
    loose.set(lk, [...(loose.get(lk) ?? []), listingKey]);
  }

  const unmatched: UnmatchedStoreRowV1[] = [];
  let matchedInFile = 0;
  let matchedCatalog = 0;
  let merged = 0;

  for (const s of store) {
    let listingKey = strict.get(matchKey(s));
    if (!listingKey) {
      const candidates = loose.get(matchKey(s, true)) ?? [];
      if (candidates.length === 1) listingKey = candidates[0];
    }
    if (listingKey) {
      const row = byListingKey.get(listingKey)!;
      row.inStore += s.inStore;
      row.online += s.online;
      row.location ||= s.location;
      row.ingestedAt ||= s.ingestedAt;
      if (row.source === "tcgplayer") {
        row.source = "both";
        matchedInFile += 1;
      } else {
        merged += 1;
      }
      continue;
    }

    const found = s.tcgplayerId
      ? { tcgplayerId: s.tcgplayerId, setName: s.setName }
      : (input.resolved?.get(storeRowKeyV1(s)) ?? resolveFromCatalog(s, input.catalog));
    if ("reason" in found) {
      unmatched.push({ ...s, reason: found.reason });
      continue;
    }
    const key = buildTcgplayerListingKey(found.tcgplayerId, s.condition);
    const existing = byListingKey.get(key);
    if (existing) {
      existing.inStore += s.inStore;
      existing.online += s.online;
      existing.location ||= s.location;
      existing.ingestedAt ||= s.ingestedAt;
      merged += 1;
      continue;
    }
    matchedCatalog += 1;
    byListingKey.set(key, {
      tcgplayerProductId: found.tcgplayerId,
      productLine: s.productLine,
      setName: found.setName || s.setName,
      productName: s.productName,
      title: "",
      number: s.number,
      rarity: s.rarity,
      condition: s.condition,
      tcgMarketPrice: null,
      storePrice: s.savedPrice > 0 ? s.savedPrice : null,
      inStore: s.inStore,
      online: s.online,
      location: s.location,
      ingestedAt: s.ingestedAt,
      lastSold: "",
      priceNote: "",
      photoUrl: "",
      cardLinkKey: cardLinkKeyV1(found.tcgplayerId, s.condition),
      source: "store_catalog",
    });
  }

  for (const [key, row] of byListingKey) {
    const known = input.known?.get(key);
    const justTcg = input.justTcgPrices?.get(key);
    if (justTcg != null) {
      row.tcgMarketPrice = justTcg;
      row.priceNote = input.priceNotes?.get(key) ?? "";
    } else if (row.tcgMarketPrice != null) {
      row.priceNote = input.justTcgPrices ? "TCGplayer file's market price; JustTCG has none" : "";
    } else if (known?.market != null) {
      row.tcgMarketPrice = known.market;
      row.priceNote = "Last saved price; JustTCG has none today";
    } else {
      row.priceNote = "No price found";
    }
    row.lastSold ||= known?.lastSold ?? "";
    finishRowV1(row, input.catalog, known);
  }

  const rows = sortRowsV1([...byListingKey.values()]);
  return {
    rows,
    unmatched,
    csv: combinedCsvV1(rows, input.linkBaseUrl, input.storeSlug),
    counts: {
      tcgplayerRows: tcg.length,
      tcgplayerUnits: tcg.reduce((t, r) => t + r.totalQuantity, 0),
      storeRows: store.length,
      matchedInFile,
      matchedCatalog,
      merged,
    },
  };
}

export const sortRowsV1 = (rows: CombinedRowV1[]) =>
  rows.sort(
    (a, b) => a.productLine.localeCompare(b.productLine) || a.setName.localeCompare(b.setName) || a.productName.localeCompare(b.productName),
  );

/** Shelf price and location from the row's market price; the rules override a typed location. */
export function finishRowV1(row: CombinedRowV1, catalog: ScryfallBulkIndex | null, known?: KnownListingV1) {
  if (row.tcgMarketPrice != null) row.storePrice = shelfPriceFromMarketV1(row.tcgMarketPrice);
  const card = catalogCardForLocationV1(catalog, row.tcgplayerProductId, row.productName, row.setName);
  const ruled = shelfLocationV1({
    productLine: row.productLine,
    market: row.tcgMarketPrice,
    colors: card ? card.colors : known?.colors,
    colorIdentity: card ? card.colorIdentity : known?.colorIdentity,
    typeLine: card?.typeLine ?? known?.typeLine,
  });
  if (ruled) row.location = ruled;
}

/** The catalog card whose colour identity and type decide a Magic card's shelf, tokens included. */
export function catalogCardForLocationV1(
  catalog: ScryfallBulkIndex | null,
  tcgplayerProductId: string,
  productName: string,
  setName: string,
): CatalogCard | undefined {
  if (!catalog) return undefined;
  return (
    catalog.byTcgplayerId.get(tcgplayerProductId) ??
    catalog.tokensByTcgplayerId?.get(tcgplayerProductId) ??
    (/\b(token|emblem)\b/i.test(productName) ? tokenByNameV1(catalog, productName, setName) : undefined)
  );
}

/** "Soldier Token", "Emblem - Sephiroth, One-Winged Angel // Robot Warrior Double-Sided Token" → the bare names. */
const tokenNameKey = (s: string) =>
  foldCardNameV1(
    s
      .replace(/\([^)]*\)/g, " ")
      .replace(/\b(double[- ]sided|token|emblem|card)\b/gi, " ")
      .replace(/^\s*-\s*|\s*-\s*$/g, " "),
  );

const tokensByName = new WeakMap<ScryfallBulkIndex, Map<string, CatalogCard[]>>();

/** A token TCGplayer and Scryfall give different ids, found by its name and set. */
function tokenByNameV1(catalog: ScryfallBulkIndex, productName: string, setName: string): CatalogCard | undefined {
  let byName = tokensByName.get(catalog);
  if (!byName) {
    byName = new Map();
    for (const t of catalog.tokens ?? []) {
      for (const part of [t.name, ...t.name.split("//")]) {
        const k = tokenNameKey(part);
        if (k) byName.set(k, [...(byName.get(k) ?? []), t]);
      }
    }
    tokensByName.set(catalog, byName);
  }
  const parts = productName.split(/\/\/|\s+-\s+/).map(tokenNameKey).filter(Boolean);
  const candidates = [...new Set(parts.flatMap((p) => byName.get(p) ?? []))];
  if (!candidates.length) return undefined;
  const words = setWordsV1(setName);
  const inSet = candidates.filter((c) => [...setWordsV1(c.setName ?? "")].some((w) => words.has(w)));
  const pool = inSet.length ? inSet : candidates;
  const colorKey = (c: CatalogCard) => (c.colors ?? []).slice().sort().join("");
  return new Set(pool.map(colorKey)).size === 1 ? pool[0] : undefined;
}

export function combinedCsvV1(rows: CombinedRowV1[], linkBaseUrl: string, storeSlug: string): string {
  return stringifyCsv([
    HEADERS,
    ...rows.map((r) => [
      r.productLine,
      r.productName,
      r.condition,
      r.number,
      r.setName,
      r.rarity,
      String(r.inStore + r.online),
      money(r.storePrice),
      r.location,
      r.cardLinkKey ? cardLinkUrlV1(linkBaseUrl, storeSlug, r.cardLinkKey) : "",
      String(r.inStore),
      String(r.online),
      r.ingestedAt,
      r.lastSold,
      "",
      r.tcgplayerProductId,
      r.priceNote,
    ]),
  ]);
}

/**
 * The product id of a TCGplayer export row whose id is a SKU. An id the
 * catalog knows under the same card name is already a product id; SKUs and
 * product ids overlap in range, so the name has to agree.
 */
function catalogProductIdV1(
  r: { tcgplayerProductId: string; productLine: string; productName: string; setName: string; number: string; rarity: string; condition: string },
  catalog: ScryfallBulkIndex | null,
): string | null {
  if (!catalog || !/magic/i.test(r.productLine)) return null;
  const same = catalog.byTcgplayerId.get(r.tcgplayerProductId) ?? catalog.tokensByTcgplayerId?.get(r.tcgplayerProductId);
  if (same && sameCardName(same.name, r.productName)) return r.tcgplayerProductId;
  const found = resolveFromCatalog(
    { ...r, file: "", line: 0, inStore: 0, online: 0, savedPrice: 0, location: "", ingestedAt: "", tcgplayerId: "" },
    catalog,
  );
  return "reason" in found ? null : found.tcgplayerId;
}

export function storeListNeedsCatalogV1(storeFiles: InventoryCsvFileV1[]): boolean {
  return storeFiles.some((f) => parseStoreListCsvV1(f.text).some((r) => /magic/i.test(r.productLine)));
}

function resolveFromCatalog(
  s: StoreListRowV1,
  catalog: ScryfallBulkIndex | null,
): { tcgplayerId: string; setName: string } | { reason: string } {
  if (!/magic/i.test(s.productLine)) return { reason: `No ${s.productLine} card by this name and set was found` };
  if (!catalog) return { reason: "Card catalog unavailable; try again" };

  const setKeys = new Set<string>();
  const setLc = s.setName.trim().toLowerCase();
  const code = catalog.setNameToCode.get(setLc);
  if (code) setKeys.add(code);
  if (setLc) setKeys.add(setLc);
  const numbers = s.number.trim() ? new Set([s.number.trim().toLowerCase(), normNumber(s.number)]) : new Set<string>();
  let wrongName: CatalogCard | null = null;
  for (const setKey of setKeys) {
    for (const cn of numbers) {
      const hit = catalog.bySetKeyAndCn.get(`${setKey}:${cn}`);
      if (!hit) continue;
      if (!sameCardName(hit.name, s.productName)) {
        wrongName ??= hit;
        continue;
      }
      if (!hit.tcgplayerId) return { reason: "Found in the catalog but it has no TCGplayer id" };
      return { tcgplayerId: hit.tcgplayerId, setName: hit.setName ?? s.setName };
    }
  }

  const byName = resolveByNameAndNumber(s, catalog);
  if (!("reason" in byName)) return byName;
  if (wrongName) {
    return { reason: `Set ${s.setName} #${s.number} is "${wrongName.name}" in the catalog, not "${s.productName}"` };
  }
  return byName;
}

/** Card-name key that keeps accented letters ("Fíli" → "fili") instead of dropping them. */
export const foldCardNameV1 = (name: string) =>
  normalizeCardNameForMatch(name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

const frontFace = (name: string) => foldCardNameV1(name.split("//")[0] ?? "");

/**
 * Every name a sheet row could mean. TCGplayer lists alternate-name printings
 * (Secret Lair, Through the Ages) as "Alt Name - Real Name", tags treatments
 * like "(Showcase)", and double-faced cards may carry only the front face.
 */
export function cardNameVariantsV1(name: string): string[] {
  const out = new Set<string>();
  for (const part of [name, ...name.split(/\s+-\s+/)]) {
    out.add(foldCardNameV1(part));
    out.add(frontFace(part));
  }
  out.delete("");
  return [...out];
}

function sameCardName(catalogName: string, sheetName: string): boolean {
  const catalogKeys = [foldCardNameV1(catalogName), frontFace(catalogName)];
  return cardNameVariantsV1(sheetName).some((v) => catalogKeys.includes(v));
}

const printingsByName = new WeakMap<ScryfallBulkIndex, Map<string, CatalogCard[]>>();

function printingsFor(catalog: ScryfallBulkIndex, name: string): CatalogCard[] {
  let byName = printingsByName.get(catalog);
  if (!byName) {
    byName = new Map();
    for (const card of catalog.byScryfallId.values()) {
      if (!card.tcgplayerId) continue;
      const keys = new Set([foldCardNameV1(card.name), frontFace(card.name)]);
      for (const k of keys) {
        if (!k) continue;
        const list = byName.get(k);
        if (list) list.push(card);
        else byName.set(k, [card]);
      }
    }
    printingsByName.set(catalog, byName);
  }
  const keys = cardNameVariantsV1(name);
  const seen = new Set<string>();
  const out: CatalogCard[] = [];
  for (const k of keys) {
    for (const card of byName.get(k) ?? []) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      out.push(card);
    }
  }
  return out;
}

/** "0203", "203s", "203p", "MH2-203", "203/264" all have the core number 203. */
export const coreCardNumberV1 = (cn: string) =>
  (cn.split("/")[0] ?? "").trim().toLowerCase().match(/(\d+)[^\d]*$/)?.[1]?.replace(/^0+(?=\d)/, "") ?? "";
const coreNumber = coreCardNumberV1;

/** Words that differ between TCGplayer and Scryfall set names without telling sets apart. */
const SET_NOISE = new Set([
  "the", "of", "and", "cards", "card", "series", "reprints", "eternal", "legal", "universes", "beyond",
  "promo", "promos", "pack", "prerelease", "drop", "commander", "set",
]);
export const setWordsV1 = (name: string) =>
  new Set(name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !SET_NOISE.has(w)));
const setWords = setWordsV1;

/**
 * TCGplayer and Scryfall name many sets differently ("Commander: Kamigawa:
 * Neon Dynasty" vs "Neon Dynasty Commander", "Prerelease Cards" vs "<set>
 * Promos" with an "s" number), so this finds the card's printings by name
 * and picks the one whose number and set best fit the sheet.
 */
function resolveByNameAndNumber(
  s: StoreListRowV1,
  catalog: ScryfallBulkIndex,
): { tcgplayerId: string; setName: string } | { reason: string } {
  const printings = printingsFor(catalog, s.productName);
  if (!printings.length) return { reason: `No card named "${s.productName}" found` };
  if (new Set(printings.map((p) => p.tcgplayerId)).size === 1) {
    return { tcgplayerId: printings[0]!.tcgplayerId!, setName: s.setName || printings[0]!.setName || "" };
  }

  const core = coreNumber(s.number);
  const tcgSet = s.setName.toLowerCase();
  const wantSuffix = /prerelease/.test(tcgSet) ? "s" : /promo pack/.test(tcgSet) ? "p" : "";
  const wantCommander = /commander/.test(tcgSet);
  const words = setWords(s.setName);
  const sheetNumber = normNumber(s.number);

  const scored = printings.map((p) => {
    const cn = p.collectorNumber.toLowerCase();
    const pWords = setWords(p.setName ?? "");
    const overlap = words.size ? [...words].filter((w) => pWords.has(w)).length / words.size : 0;
    const numberMatch = core !== "" && coreNumber(cn) === core;
    let score = (numberMatch ? 6 : 0) + overlap * 4;
    if (wantSuffix) score += cn.endsWith(wantSuffix) ? 5 : 0;
    else if (cn.replace(/^0+(?=\w)/, "") === sheetNumber) score += 1;
    if (wantCommander === /commander/i.test(p.setName ?? "")) score += 1;
    // A wrong number is still trusted when the sheet's set fully names the printing's set.
    return { p, score, eligible: numberMatch || overlap === 1 };
  });
  const eligible = scored.filter((x) => x.eligible).sort((a, b) => b.score - a.score);
  if (!eligible.length) {
    if (!s.setName && !s.number) {
      return { reason: `"${s.productName}" has ${printings.length} printings; add the set and number` };
    }
    return { reason: `"${s.productName}" has no #${s.number} printing in "${s.setName}"; check the number or set` };
  }
  const best = eligible[0]!;
  const tied = eligible.filter((x) => x.score === best.score && x.p.tcgplayerId !== best.p.tcgplayerId);
  if (tied.length) {
    const sets = [best, ...tied].map((x) => `${x.p.setName} #${x.p.collectorNumber}`).slice(0, 4);
    return { reason: `More than one printing fits: ${sets.join(", ")}. Fix the set name in the sheet` };
  }
  return { tcgplayerId: best.p.tcgplayerId!, setName: s.setName || best.p.setName || "" };
}
