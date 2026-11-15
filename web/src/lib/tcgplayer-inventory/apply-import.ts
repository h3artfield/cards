import type { InventoryItem } from "../types";
import {
  inventoryEffectiveQuantity,
  inventoryEffectiveStatus,
  isTcgplayerImportItem,
} from "../inventory/status";
import {
  assessTcgplayerWithdrawalRisk,
  TcgplayerImportWithdrawalBlockedError,
} from "./import-guard";
import {
  addCsvToInventoryItem,
  buildTcgplayerImportPreview,
  inventoryItemFromCsvRow,
  mergeCsvIntoInventoryItem,
} from "./import-preview";
import type { TcgplayerImportApplyResult, TcgplayerImportMode } from "./types";

function stock(item: InventoryItem | undefined): { total: number; inStore: number } {
  if (!item || inventoryEffectiveStatus(item) === "withdrawn" || inventoryEffectiveStatus(item) === "sold") {
    return { total: 0, inStore: 0 };
  }
  const total = inventoryEffectiveQuantity(item);
  return { total, inStore: item.quantityInStore != null ? Math.min(total, item.quantityInStore) : total };
}

/** Stamps the copies this import put on the shelf, so only those need new labels. */
function withAddedCopies(before: InventoryItem | undefined, after: InventoryItem, now: string): InventoryItem {
  const was = stock(before);
  const is = stock(after);
  const added = Math.max(0, is.total - was.total);
  if (!added) return after;
  return {
    ...after,
    lastImportBatchAt: now,
    lastImportAddedQuantity: added,
    lastImportAddedInStore: Math.min(added, Math.max(0, is.inStore - was.inStore)),
  };
}

export function applyTcgplayerInventoryImport(input: {
  csvText: string;
  storeId: string;
  existingInventory: InventoryItem[];
  skipConflicts?: boolean;
  /** Operator acknowledged a mass withdrawal after reviewing the preview. */
  confirmLargeWithdrawal?: boolean;
  mode?: TcgplayerImportMode;
}): TcgplayerImportApplyResult {
  const mode = input.mode ?? "replace";
  const preview = buildTcgplayerImportPreview(
    input.csvText,
    input.existingInventory,
    mode,
  );

  if (mode === "replace") {
    const risk = assessTcgplayerWithdrawalRisk(preview);
    if (risk.requiresConfirmation && !input.confirmLargeWithdrawal) {
      throw new TcgplayerImportWithdrawalBlockedError(risk);
    }
  }
  const now = new Date().toISOString();
  const byId = new Map(input.existingInventory.map((i) => [i.id, i]));
  const saved: InventoryItem[] = [];
  let created = 0;
  let updated = 0;
  let withdrawn = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const row of preview.rows) {
    if (row.action === "unchanged") {
      skipped += 1;
      continue;
    }
    if (row.action === "conflict") {
      conflicts += 1;
      if (input.skipConflicts) continue;
      continue;
    }

    if (row.action === "create") {
      const item = withAddedCopies(undefined, inventoryItemFromCsvRow(row.csvRow, input.storeId, now), now);
      saved.push(item);
      byId.set(item.id, item);
      created += 1;
      continue;
    }

    const existing = row.inventoryItemId
      ? byId.get(row.inventoryItemId)
      : undefined;
    if (!existing) {
      skipped += 1;
      continue;
    }

    if (row.action === "withdraw") {
      const next: InventoryItem = {
        ...existing,
        quantity: 0,
        status: "withdrawn",
        lastTcgplayerImportAt: now,
      };
      saved.push(next);
      byId.set(next.id, next);
      withdrawn += 1;
      continue;
    }

    if (row.action === "update") {
      const next = withAddedCopies(
        existing,
        mode === "add"
          ? addCsvToInventoryItem(existing, row.csvRow, now)
          : mergeCsvIntoInventoryItem(existing, row.csvRow, now),
        now,
      );
      saved.push(next);
      byId.set(next.id, next);
      updated += 1;
    }
  }

  for (const missing of preview.missingFromCsv) {
    if (missing.action === "conflict") {
      conflicts += 1;
      if (input.skipConflicts) continue;
      continue;
    }
    const existing = byId.get(missing.inventoryItemId);
    if (!existing || !isTcgplayerImportItem(existing) || existing.status === "sold") {
      continue;
    }
    const next: InventoryItem = {
      ...existing,
      quantity: 0,
      status: "withdrawn",
      lastTcgplayerImportAt: now,
    };
    saved.push(next);
    byId.set(next.id, next);
    withdrawn += 1;
  }

  return {
    mode,
    unitsAdded: preview.unitsAdded,
    created,
    updated,
    withdrawn,
    skipped,
    conflicts,
    csvRowCount: preview.parsedCount,
    csvProductLines: preview.csvProductLines,
    outOfScopeRows: preview.outOfScopeRows,
    items: saved,
  };
}

export { buildTcgplayerImportPreview } from "./import-preview";
