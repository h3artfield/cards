import type { CollectionCard } from "../types";

export const COLLECTION_IMPORT_CANDIDATES_KEY = "importCandidates";
export const MAX_COLLECTION_IMPORT_LINES = 250;

export type CollectionImportLine = {
  name: string;
  quantity: number;
  setCode?: string;
  collectorNumber?: string;
};

export type CollectionImportCandidate = {
  scryfallId: string;
  name: string;
  setName?: string;
  setCode: string;
  collectorNumber: string;
  rarity?: string;
  imageNormal?: string;
  typeLine?: string;
};

const SET_IN_PARENS = /^(.*?)\s+\(([A-Za-z0-9]{2,6})\)\s*(\S+)?\s*$/;
const SET_IN_BRACKETS = /^(.*?)\s+\[([A-Za-z0-9]{2,6})\]\s*(\S+)?\s*$/;

function stripQty(line: string): { quantity: number; rest: string } | null {
  const leading = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
  if (leading) {
    return { quantity: Number.parseInt(leading[1]!, 10), rest: leading[2]!.trim() };
  }
  const trailing = line.match(/^(.+?)\s+[xX](\d+)$/);
  if (trailing) {
    return { quantity: Number.parseInt(trailing[2]!, 10), rest: trailing[1]!.trim() };
  }
  if (line.trim()) return { quantity: 1, rest: line.trim() };
  return null;
}

function parseNameSet(rest: string): CollectionImportLine | null {
  const qtyWrap = stripQty(rest);
  if (!qtyWrap || !Number.isFinite(qtyWrap.quantity) || qtyWrap.quantity <= 0) {
    return null;
  }
  let name = qtyWrap.rest.replace(/\s+#[\w-]+$/, "").trim();
  let setCode: string | undefined;
  let collectorNumber: string | undefined;

  const parens = name.match(SET_IN_PARENS);
  if (parens) {
    name = parens[1]!.trim();
    setCode = parens[2]!.toLowerCase();
    collectorNumber = parens[3]?.replace(/^#/, "");
  } else {
    const brackets = name.match(SET_IN_BRACKETS);
    if (brackets) {
      name = brackets[1]!.trim();
      setCode = brackets[2]!.toLowerCase();
      collectorNumber = brackets[3]?.replace(/^#/, "");
    }
  }

  if (!name || name.length < 2) return null;
  return { name, quantity: qtyWrap.quantity, setCode, collectorNumber };
}

function parseCsvRows(text: string): CollectionImportLine[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase().replace(/"/g, ""));
  const nameIdx = header.findIndex((h) => h === "name" || h === "card name" || h === "card");
  if (nameIdx < 0) return [];
  const qtyIdx = header.findIndex((h) =>
    ["count", "qty", "quantity", "copies"].includes(h),
  );
  const setIdx = header.findIndex((h) =>
    ["set", "edition", "set code", "setcode"].includes(h),
  );
  const numIdx = header.findIndex((h) =>
    ["collector number", "number", "cn", "card number"].includes(h),
  );

  const rows: CollectionImportLine[] = [];
  for (const raw of lines.slice(1)) {
    const cols = raw.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const name = cols[nameIdx]?.trim();
    if (!name) continue;
    const quantity = Math.max(1, Number.parseInt(cols[qtyIdx] ?? "1", 10) || 1);
    const setCode = setIdx >= 0 ? cols[setIdx]?.trim().toLowerCase() : undefined;
    const collectorNumber = numIdx >= 0 ? cols[numIdx]?.trim() : undefined;
    rows.push({ name, quantity, setCode: setCode || undefined, collectorNumber });
  }
  return rows;
}

function parseDekXml(text: string): CollectionImportLine[] {
  const rows: CollectionImportLine[] = [];
  const tags = text.match(/<(?:Cards|card)\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = tag.match(/\bName="([^"]+)"/i)?.[1]?.trim();
    if (!name) continue;
    const quantity = Math.max(
      1,
      Number.parseInt(tag.match(/\b(?:Quantity|Qty)="(\d+)"/i)?.[1] ?? "1", 10) || 1,
    );
    const setCode = tag.match(/\b(?:Edition|Set)="([^"]+)"/i)?.[1]?.trim().toLowerCase();
    rows.push({ name, quantity, setCode: setCode || undefined });
  }
  return rows;
}

export function parseCollectionImportText(text: string): CollectionImportLine[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  if (/<(?:Deck|Cards|card)\b/i.test(trimmed)) {
    const dek = parseDekXml(trimmed);
    if (dek.length) return dek.slice(0, MAX_COLLECTION_IMPORT_LINES);
  }

  const csv = parseCsvRows(trimmed);
  if (csv.length) return csv.slice(0, MAX_COLLECTION_IMPORT_LINES);

  const merged = new Map<string, CollectionImportLine>();
  for (const raw of trimmed.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;
    if (/^(commander|mainboard|sideboard|deck|maybeboard):?$/i.test(line)) continue;
    if (/^~~?/.test(line)) continue;
    const parsed = parseNameSet(line);
    if (!parsed) continue;
    const key = [
      parsed.name.toLowerCase(),
      parsed.setCode ?? "",
      parsed.collectorNumber ?? "",
    ].join("|");
    const existing = merged.get(key);
    if (existing) existing.quantity += parsed.quantity;
    else merged.set(key, parsed);
  }
  return [...merged.values()].slice(0, MAX_COLLECTION_IMPORT_LINES);
}

export function importCandidatesFromCard(
  card: CollectionCard,
): CollectionImportCandidate[] {
  const raw = card.visionJson?.[COLLECTION_IMPORT_CANDIDATES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is CollectionImportCandidate =>
      Boolean(row && typeof row === "object" && typeof row.scryfallId === "string"),
  );
}
