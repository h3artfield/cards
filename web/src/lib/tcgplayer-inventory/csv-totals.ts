import type { TcgplayerInventoryCsvRow } from "./types";

/** Spreadsheet-style totals from a parsed TCGplayer export (for import preview). */
export function computeCsvImportTotals(rows: TcgplayerInventoryCsvRow[]) {
  let units = 0;
  let inStockRows = 0;
  let sumStoreUnit = 0;
  let sumTcgLowUnit = 0;
  let sumStoreExtended = 0;
  let sumTcgLowExtended = 0;
  let sumMarketExtended = 0;

  for (const row of rows) {
    units += row.quantity;
    sumStoreUnit += row.storePrice;
    sumTcgLowUnit += row.tcgLowPrice;
    if (row.quantity > 0) {
      inStockRows += 1;
      sumStoreExtended += row.storePrice * row.quantity;
      sumTcgLowExtended += row.tcgLowPrice * row.quantity;
      sumMarketExtended += row.tcgMarketPrice * row.quantity;
    }
  }

  return {
    rows: rows.length,
    inStockRows,
    units,
    sumStoreUnit,
    sumTcgLowUnit,
    sumStoreExtended,
    sumTcgLowExtended,
    sumMarketExtended,
  };
}
