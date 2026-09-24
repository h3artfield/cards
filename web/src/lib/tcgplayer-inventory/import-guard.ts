import type { InventoryItem } from "../types";
import type {
  TcgplayerImportPreview,
  TcgplayerInventoryCsvRow,
} from "./types";

/**
 * A TCGplayer export filtered to one product line must never be able to zero
 * out the product lines it omits. Reconciliation ("missing from CSV → mark
 * withdrawn") is therefore scoped to the product lines the file actually
 * contains, and a file that would still wipe out most of the remaining stock
 * needs explicit confirmation.
 */

/** Share of in-stock rows an import may withdraw before it needs confirmation. */
export const WITHDRAWAL_CONFIRMATION_RATIO = 0.3;
/** Small withdrawals stay silent regardless of ratio (tiny or near-empty stores). */
export const WITHDRAWAL_CONFIRMATION_ROW_FLOOR = 25;

export function normalizeProductLineKey(value: string | undefined | null): string {
  return (value ?? "").trim().toLowerCase();
}

/** Raw "Product Line" values present in the file, for display and snapshots. */
export function listCsvProductLines(rows: TcgplayerInventoryCsvRow[]): string[] {
  const seen = new Map<string, string>();
  for (const row of rows) {
    const key = normalizeProductLineKey(row.productLine);
    if (key && !seen.has(key)) seen.set(key, row.productLine.trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function buildCsvProductLineScope(
  rows: TcgplayerInventoryCsvRow[],
): Set<string> {
  const scope = new Set<string>();
  for (const row of rows) {
    const line = normalizeProductLineKey(row.productLine);
    if (line) scope.add(line);
    const category = normalizeProductLineKey(row.category);
    if (category) scope.add(category);
  }
  return scope;
}

/** Category is only a fallback — legacy rows imported before productLine existed. */
export function inventoryProductLineKey(item: InventoryItem): string {
  return (
    normalizeProductLineKey(item.productLine) ||
    normalizeProductLineKey(item.category)
  );
}

export function isItemInCsvScope(
  item: InventoryItem,
  scope: Set<string>,
): boolean {
  const key = inventoryProductLineKey(item);
  if (!key) return false;
  return scope.has(key);
}

export interface TcgplayerImportWithdrawalRisk {
  requiresConfirmation: boolean;
  /** TCGplayer-managed rows holding stock before this import. */
  inStockRowsBefore: number;
  /** Rows this import would drop from quantity > 0 to 0. */
  withdrawnInStockRows: number;
  /** Units those rows currently hold. */
  withdrawnUnits: number;
  /** withdrawnInStockRows / inStockRowsBefore, 0 when there is nothing in stock. */
  ratio: number;
  csvProductLines: string[];
  outOfScopeRows: number;
  message: string | null;
}

export function assessTcgplayerWithdrawalRisk(
  preview: TcgplayerImportPreview,
): TcgplayerImportWithdrawalRisk {
  const ratio =
    preview.inStockRowsBefore > 0
      ? preview.withdrawnInStockRows / preview.inStockRowsBefore
      : 0;
  const requiresConfirmation =
    preview.withdrawnInStockRows >= WITHDRAWAL_CONFIRMATION_ROW_FLOOR &&
    ratio > WITHDRAWAL_CONFIRMATION_RATIO;

  return {
    requiresConfirmation,
    inStockRowsBefore: preview.inStockRowsBefore,
    withdrawnInStockRows: preview.withdrawnInStockRows,
    withdrawnUnits: preview.withdrawnUnits,
    ratio,
    csvProductLines: preview.csvProductLines,
    outOfScopeRows: preview.outOfScopeRows,
    message: requiresConfirmation
      ? `This file would take ${preview.withdrawnInStockRows.toLocaleString()} of ${preview.inStockRowsBefore.toLocaleString()} in-stock rows (${Math.round(
          ratio * 100,
        )}%, ${preview.withdrawnUnits.toLocaleString()} units) down to zero. That usually means the export was filtered or truncated. Re-export your full inventory, or confirm to apply anyway.`
      : null,
  };
}

export class TcgplayerImportWithdrawalBlockedError extends Error {
  readonly risk: TcgplayerImportWithdrawalRisk;

  constructor(risk: TcgplayerImportWithdrawalRisk) {
    super(risk.message ?? "Import would withdraw an unusual amount of stock");
    this.name = "TcgplayerImportWithdrawalBlockedError";
    this.risk = risk;
  }
}
