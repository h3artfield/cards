import type { CardCategory, InventoryItem } from "../types";

export interface TcgplayerInventoryCsvRow {
  tcgplayerProductId: string;
  productLine: string;
  setName: string;
  productName: string;
  title: string;
  number: string;
  rarity: string;
  condition: string;
  tcgMarketPrice: number;
  /** Best available from CSV: low w/ shipping → low → direct low. */
  tcgLowPrice: number;
  totalQuantity: number;
  storeReserveQty: number;
  storePrice: number;
  tcgMarketplacePrice: number;
  listingKey: string;
  displayName: string;
  category: CardCategory;
  quantity: number;
  quantityOnHand: number;
  tcgplayerReportedReserve: number;
  quantityAvailable: number;
  listPrice: number;
  raw: Record<string, string>;
}

export type TcgplayerImportAction =
  | "create"
  | "update"
  | "unchanged"
  | "conflict"
  | "withdraw";

export interface TcgplayerImportPreviewRow {
  action: TcgplayerImportAction;
  listingKey: string;
  tcgplayerProductId: string;
  displayName: string;
  condition: string;
  quantity: number;
  listPrice: number;
  previousQuantity?: number;
  previousListPrice?: number;
  inventoryItemId?: string;
  message?: string;
  csvRow: TcgplayerInventoryCsvRow;
}

export interface TcgplayerImportPreview {
  parsedCount: number;
  skippedCount: number;
  /** Raw "Product Line" values present in the file. */
  csvProductLines: string[];
  /** Rows reconciliation left alone — their product line is absent from the file. */
  outOfScopeRows: number;
  outOfScopeUnits: number;
  /** TCGplayer-managed rows holding stock before this import. */
  inStockRowsBefore: number;
  /** Rows this import would drop from quantity > 0 to 0. */
  withdrawnInStockRows: number;
  withdrawnUnits: number;
  creates: number;
  /** New rows with qty > 0. */
  createsInStock: number;
  /** New rows with qty 0 — sealed/restock catalog slots. */
  createsCatalog: number;
  updates: number;
  unchanged: number;
  conflicts: number;
  withdrawals: number;
  rows: TcgplayerImportPreviewRow[];
  missingFromCsv: Array<{
    inventoryItemId: string;
    listingKey: string;
    displayName: string;
    quantity: number;
    action: "withdraw" | "conflict";
    message: string;
  }>;
}

export interface TcgplayerImportApplyResult {
  created: number;
  updated: number;
  withdrawn: number;
  skipped: number;
  conflicts: number;
  csvRowCount: number;
  csvProductLines: string[];
  outOfScopeRows: number;
  items: InventoryItem[];
}
