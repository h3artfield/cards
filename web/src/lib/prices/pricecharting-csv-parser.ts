import { centsToUsd } from "../processing/pricing/pricecharting-utils";

/** Minimal CSV parser for PriceCharting export files. */
export function parseCsvText(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0] ?? "");
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.trim()) continue;
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j] ?? `col${j}`] = cells[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function normalizePcHeaderKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "-");
}

export function rowToNormalizedRecord(
  row: Record<string, string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[normalizePcHeaderKey(k)] = v;
  }
  return out;
}

function readField(row: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim()) return String(v).trim();
  }
  return undefined;
}

function readCents(row: Record<string, unknown>, ...keys: string[]): number | undefined {
  const raw = readField(row, ...keys);
  if (!raw) return undefined;
  const n = parseInt(raw.replace(/[^0-9-]/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

export function normalizedRowToProductFields(row: Record<string, unknown>): {
  priceChartingProductId: string;
  productName: string;
  consoleName?: string;
  genre?: string;
  loosePrice?: number;
  cibPrice?: number;
  newPrice?: number;
  gradedPrice?: number;
  boxOnlyPrice?: number;
  manualOnlyPrice?: number;
  bgs10Price?: number;
  cgc10Price?: number;
  sgc10Price?: number;
  retailLooseBuy?: number;
  retailLooseSell?: number;
  retailNewBuy?: number;
  retailNewSell?: number;
  salesVolume?: number;
} | null {
  const productName = readField(row, "product-name", "productname", "name");
  const id = readField(row, "id", "product-id");
  if (!productName || !id) return null;

  const cents = (k: string) => centsToUsd(readCents(row, k));

  return {
    priceChartingProductId: id,
    productName,
    consoleName: readField(row, "console-name", "consolename"),
    genre: readField(row, "genre"),
    loosePrice: cents("loose-price"),
    cibPrice: cents("cib-price"),
    newPrice: cents("new-price"),
    gradedPrice: cents("graded-price"),
    boxOnlyPrice: cents("box-only-price"),
    manualOnlyPrice: cents("manual-only-price"),
    bgs10Price: cents("bgs-10-price"),
    cgc10Price: cents("condition-17-price"),
    sgc10Price: cents("condition-18-price"),
    retailLooseBuy: cents("retail-loose-buy"),
    retailLooseSell: cents("retail-loose-sell"),
    retailNewBuy: cents("retail-new-buy"),
    retailNewSell: cents("retail-new-sell"),
    salesVolume: readCents(row, "sales-volume"),
  };
}
