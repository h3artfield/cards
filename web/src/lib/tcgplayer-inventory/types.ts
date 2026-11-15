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
  /** Present on combined store lists, which split stock by channel. */
  quantityInStore?: number;
  quantityOnline?: number;
  shelfLocation?: string;
  ingestedAt?: string;
  raw: Record<string, string>;
}

/** "replace" treats the file as the full count; "add" only adds a new batch on top of stock. */
export type TcgplayerImportMode = "add" | "replace";

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
  /** Add mode: copies this file adds to the row. */
  addedQuantity?: number;
  inventoryItemId?: string;
  message?: string;
  csvRow: TcgplayerInventoryCsvRow;
}

export interface TcgplayerImportPreview {
  mode: TcgplayerImportMode;
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
  /** Add mode: copies added across new and existing rows. */
  unitsAdded: number;
  /** Add mode: rows with quantity 0, left alone. */
  ignoredZeroQtyRows: number;
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
  mode: TcgplayerImportMode;
  unitsAdded: number;
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
