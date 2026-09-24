import type { InventoryAnalytics } from "../inventory/analytics";
import { v4 as uuidv4 } from "uuid";

export interface InventoryImportSnapshot {
  id: string;
  storeId: string;
  importedAt: string;
  created: number;
  updated: number;
  withdrawn: number;
  totalRows: number;
  totalUnits: number;
  inStockRows: number;
  catalogRows: number;
  totalListValue: number;
  totalMarketValue: number;
  listedShopifyRows: number;
  /** Rows in the uploaded file — distinct from totalRows, which counts saved rows. */
  csvRowCount?: number;
  /** Product lines the uploaded file covered; absent lines are never reconciled. */
  csvProductLines?: string[];
  /** Rows reconciliation skipped because their product line was absent from the file. */
  outOfScopeRowsSkipped?: number;
}

export function snapshotFromAnalytics(input: {
  storeId: string;
  analytics: InventoryAnalytics;
  listedShopifyRows: number;
  importStats: {
    created: number;
    updated: number;
    withdrawn: number;
    csvRowCount?: number;
    csvProductLines?: string[];
    outOfScopeRows?: number;
  };
}): InventoryImportSnapshot {
  return {
    id: uuidv4(),
    storeId: input.storeId,
    importedAt: new Date().toISOString(),
    created: input.importStats.created,
    updated: input.importStats.updated,
    withdrawn: input.importStats.withdrawn,
    totalRows: input.analytics.totalRows,
    totalUnits: input.analytics.totalUnits,
    inStockRows: input.analytics.inStockRows,
    catalogRows: input.analytics.catalogRows,
    totalListValue: input.analytics.totalListValue,
    totalMarketValue: input.analytics.totalMarketValue,
    listedShopifyRows: input.listedShopifyRows,
    csvRowCount: input.importStats.csvRowCount,
    csvProductLines: input.importStats.csvProductLines,
    outOfScopeRowsSkipped: input.importStats.outOfScopeRows,
  };
}
