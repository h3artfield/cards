import type { InventoryItem } from "../types";
import { isTcgplayerImportItem } from "../inventory/status";
import {
  buildTcgplayerImportPreview,
  inventoryItemFromCsvRow,
  mergeCsvIntoInventoryItem,
} from "./import-preview";
import type { TcgplayerImportApplyResult } from "./types";

export function applyTcgplayerInventoryImport(input: {
  csvText: string;
  storeId: string;
  existingInventory: InventoryItem[];
  skipConflicts?: boolean;
}): TcgplayerImportApplyResult {
  const preview = buildTcgplayerImportPreview(
    input.csvText,
    input.existingInventory,
  );
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
      const item = inventoryItemFromCsvRow(row.csvRow, input.storeId, now);
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
      const next = mergeCsvIntoInventoryItem(existing, row.csvRow, now);
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
    created,
    updated,
    withdrawn,
    skipped,
    conflicts,
    items: saved,
  };
}

export { buildTcgplayerImportPreview } from "./import-preview";
