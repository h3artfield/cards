import {
  buildHeaderIndex,
  getCell,
  normalizeHeader,
  parseCsv,
  parseMoney,
  stripUtf8Bom,
} from "../shipping/csv-utils";
import type { CardCategory } from "../types";
import { buildTcgplayerListingKey } from "./listing-key";
import type { TcgplayerInventoryCsvRow } from "./types";

function parseIntQty(raw: string): number {
  const n = Number.parseInt(raw.replace(/[^0-9-]/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function mapProductLineToCategory(productLine: string): CardCategory {
  const line = productLine.trim().toLowerCase();
  if (line.includes("pokemon")) return "pokemon";
  if (line.includes("magic")) return "magic";
  if (line.includes("yugioh") || line.includes("yu-gi-oh")) return "yugioh";
  if (line.includes("sport")) return "sports";
  return "other";
}

function buildDisplayName(row: {
  title: string;
  productName: string;
  setName: string;
  number: string;
  condition: string;
}): string {
  const base =
    row.title.trim() ||
    row.productName.trim() ||
    [row.setName, row.number].filter(Boolean).join(" ");
  if (!row.condition.trim()) return base;
  return `${base} — ${row.condition.trim()}`;
}

/** Derive inventory counts from TCGplayer export columns.
 * Total Quantity → quantityOnHand (authoritative physical count).
 * My Store Reserve Qty → tcgplayerReportedReserve (TCGplayer reporting only; NOT an app hold).
 * quantityAvailable is computed at read time from on-hand minus app holds. */
export function resolveInventoryQuantities(
  storeReserveQty: number,
  totalQuantity: number,
): {
  quantityOnHand: number;
  tcgplayerReportedReserve: number;
  quantityAvailable: number;
  quantity: number;
} {
  const quantityOnHand = Math.max(0, totalQuantity);
  const tcgplayerReportedReserve = Math.max(0, storeReserveQty);
  const quantityAvailable = quantityOnHand;
  return {
    quantityOnHand,
    tcgplayerReportedReserve,
    quantityAvailable,
    quantity: quantityAvailable,
  };
}

/** Match headers like "TCG Low Price With Shipping" when Excel truncates the label. */
function getCellByHeaderPrefix(
  row: string[],
  headers: string[],
  index: Map<string, number>,
  prefix: string,
): string {
  const normPrefix = normalizeHeader(prefix);
  for (const header of headers) {
    const norm = normalizeHeader(header);
    if (!norm.startsWith(normPrefix)) continue;
    const idx = index.get(norm);
    if (idx != null && row[idx] != null) {
      return String(row[idx]).trim();
    }
  }
  return "";
}

function resolveTcgLowPrice(
  directLow: number,
  lowPrice: number,
  lowWithShipping: number,
): number {
  if (lowWithShipping > 0) return lowWithShipping;
  if (lowPrice > 0) return lowPrice;
  if (directLow > 0) return directLow;
  return 0;
}

function readMyStorePrice(
  row: string[],
  headers: string[],
  index: Map<string, number>,
): number {
  const raw =
    getCellByHeaderPrefix(row, headers, index, "My Store Price") ||
    getCell(
      row,
      index,
      "My Store Price",
      "MyStorePrice",
      "Store Price",
      "My Store Channel Price",
    );
  return parseMoney(raw);
}

export function parseTcgplayerInventoryExportCsv(
  text: string,
): { rows: TcgplayerInventoryCsvRow[]; skipped: number } {
  const parsed = parseCsv(stripUtf8Bom(text));
  if (parsed.length < 2) return { rows: [], skipped: 0 };

  const headers = parsed[0]!;
  const index = buildHeaderIndex(headers);
  const rows: TcgplayerInventoryCsvRow[] = [];
  let skipped = 0;

  for (let i = 1; i < parsed.length; i++) {
    const row = parsed[i]!;
    const raw: Record<string, string> = {};
    headers.forEach((h, col) => {
      raw[h] = row[col] ?? "";
    });

    const tcgplayerProductId = getCell(
      row,
      index,
      "TCGplayer Id",
      "TCGplayer ID",
      "TCGPlayer Id",
      "Product Id",
      "Product ID",
    );
    if (!tcgplayerProductId) {
      skipped += 1;
      continue;
    }

    const productLine = getCell(row, index, "Product Line", "ProductLine");
    const setName = getCell(row, index, "Set Name", "SetName");
    const productName = getCell(row, index, "Product Name", "ProductName");
    const title = getCell(row, index, "Title");
    const number = getCell(row, index, "Number", "Card Number", "CardNumber");
    const rarity = getCell(row, index, "Rarity");
    const condition = getCell(row, index, "Condition");
    const tcgMarketPrice = parseMoney(
      getCell(row, index, "TCG Market Price", "TCGMarketPrice", "Market Price"),
    );
    const tcgDirectLow = parseMoney(
      getCell(row, index, "TCG Direct Low", "TCGDirectLow"),
    );
    const tcgLowPrice = parseMoney(
      getCell(row, index, "TCG Low Price", "TCGLowPrice", "Low Price"),
    );
    const tcgLowPriceWithShipping = parseMoney(
      getCellByHeaderPrefix(row, headers, index, "TCG Low Price With") ||
        getCell(
          row,
          index,
          "TCG Low Price With Shipping",
          "TCGLowPriceWithShipping",
        ),
    );
    const resolvedTcgLowPrice = resolveTcgLowPrice(
      tcgDirectLow,
      tcgLowPrice,
      tcgLowPriceWithShipping,
    );
    const totalQuantity = parseIntQty(
      getCell(row, index, "Total Quantity", "TotalQuantity", "Quantity"),
    );
    const storeReserveQty = parseIntQty(
      getCell(
        row,
        index,
        "My Store Reserve Qty",
        "My Store Reserve Quantity",
        "Store Reserve Qty",
      ),
    );
    const storePrice = readMyStorePrice(row, headers, index);
    const tcgMarketplacePrice = parseMoney(
      getCell(
        row,
        index,
        "TCG Marketplace Price",
        "TCGMarketplacePrice",
        "Marketplace Price",
      ),
    );

    const quantities = resolveInventoryQuantities(storeReserveQty, totalQuantity);
    /** Shelf price — column Q "My Store Price" only; never TCG Marketplace fallback. */
    const listPrice = storePrice;
    const listingKey = buildTcgplayerListingKey(tcgplayerProductId, condition);
    const category = mapProductLineToCategory(productLine);

    rows.push({
      tcgplayerProductId,
      productLine,
      setName,
      productName,
      title,
      number,
      rarity,
      condition,
      tcgMarketPrice,
      tcgLowPrice: resolvedTcgLowPrice,
      totalQuantity,
      storeReserveQty,
      storePrice,
      tcgMarketplacePrice,
      listingKey,
      displayName: buildDisplayName({
        title,
        productName,
        setName,
        number,
        condition,
      }),
      category,
      quantity: quantities.quantity,
      quantityOnHand: quantities.quantityOnHand,
      tcgplayerReportedReserve: quantities.tcgplayerReportedReserve,
      quantityAvailable: quantities.quantityAvailable,
      listPrice,
      raw,
    });
  }

  return { rows, skipped };
}
