import { getAdminFirestore } from "../firebase/admin";
import { shelfConditionLabel, shelfConditionShort, shelfCustomerName } from "../inventory/shelf-row-edit";
import {
  PRICE_ALERTS_COLLECTION,
  PRICE_RUNS_COLLECTION,
  type InventoryPriceAlertV1,
  type PriceRunReportV1,
} from "../pricing/nightly-price-refresh";
import { dataStore } from "../storage/data-store";
import type { InventoryChangeLogEntry, InventoryItem, InventorySalesChannel } from "../types";

/** Days are cut at midnight shop time, not UTC. */
export const STORE_TIME_ZONE = "America/Chicago";
const MAX_DAYS = 90;
/** Nightly alerts fire on any 20% move; pennies doubling isn't news. */
export const BIG_MOVE_MIN_DOLLARS = 1;

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STORE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-11-12" in shop time. */
export function storeDay(iso: string | number | Date): string {
  return dayFormatter.format(new Date(iso));
}

export type DailySaleLine = {
  inventoryItemId: string;
  name: string;
  setName: string;
  condition: string;
  location: string;
  quantity: number;
  unitPrice: number;
  channel: InventorySalesChannel;
  at: string;
};

export type DailyChangeLine = InventoryChangeLogEntry & {
  inventoryItemId: string;
  name: string;
};

export type DailyReport = {
  date: string;
  sales: {
    units: number;
    revenue: number;
    inStore: { units: number; revenue: number };
    online: { units: number; revenue: number };
    lines: DailySaleLine[];
  };
  /** Sales from the 1st of the month through this day. */
  monthToDate: { units: number; revenue: number };
  priceRun: Pick<PriceRunReportV1, "priced" | "changed" | "alerts" | "toMove" | "finished"> | null;
  priceAlerts: Array<
    Pick<InventoryPriceAlertV1, "inventoryItemId" | "displayName" | "condition" | "previousPrice" | "newPrice" | "change" | "status">
  >;
  moveSuggestions: Array<{ inventoryItemId: string; name: string; from: string; to: string }>;
  manualChanges: DailyChangeLine[];
  imports: Array<{ at: string; created: number; updated: number; withdrawn: number; totalUnits: number }>;
  pickups: { placed: number; paid: number };
};

export type DailyReportSummary = {
  date: string;
  salesUnits: number;
  revenue: number;
  priceAlerts: number;
  manualChanges: number;
  moves: number;
  imports: number;
};

function emptyDay(date: string): DailyReport {
  return {
    date,
    sales: { units: 0, revenue: 0, inStore: { units: 0, revenue: 0 }, online: { units: 0, revenue: 0 }, lines: [] },
    monthToDate: { units: 0, revenue: 0 },
    priceRun: null,
    priceAlerts: [],
    moveSuggestions: [],
    manualChanges: [],
    imports: [],
    pickups: { placed: 0, paid: 0 },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function saleEvents(item: InventoryItem): Array<{ at: string; quantity: number; unitPrice: number; channel: InventorySalesChannel }> {
  if (item.saleLog?.length) return item.saleLog;
  if (item.soldAt) {
    return [{ at: item.soldAt, quantity: 1, unitPrice: item.soldPrice ?? 0, channel: item.soldChannel ?? "shopify" }];
  }
  return [];
}

export async function buildDailyReports(storeId: string, now = new Date()): Promise<DailyReport[]> {
  const db = getAdminFirestore();
  const [inventory, snapshots, reservations, alertDocs, runDocs] = await Promise.all([
    dataStore.getInventory(storeId),
    dataStore.listInventoryImportSnapshots(storeId, 60),
    dataStore.getPickupReservations(storeId),
    db ? db.collection(PRICE_ALERTS_COLLECTION).where("storeId", "==", storeId).get() : null,
    db ? db.collection(PRICE_RUNS_COLLECTION).where("storeId", "==", storeId).get() : null,
  ]);

  const days = new Map<string, DailyReport>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) {
      d = emptyDay(date);
      days.set(date, d);
    }
    return d;
  };
  day(storeDay(now));

  for (const item of inventory) {
    const name = shelfCustomerName(item);
    for (const sale of saleEvents(item)) {
      const d = day(storeDay(sale.at));
      const revenue = sale.quantity * sale.unitPrice;
      d.sales.units += sale.quantity;
      d.sales.revenue += revenue;
      const bucket = sale.channel === "in_store" ? d.sales.inStore : d.sales.online;
      bucket.units += sale.quantity;
      bucket.revenue += revenue;
      d.sales.lines.push({
        inventoryItemId: item.id,
        name,
        setName: item.setName ?? "",
        condition: shelfConditionShort(shelfConditionLabel(item)),
        location: item.shelfLocation ?? "",
        quantity: sale.quantity,
        unitPrice: sale.unitPrice,
        channel: sale.channel,
        at: sale.at,
      });
    }
    for (const change of item.changeLog ?? []) {
      day(storeDay(change.at)).manualChanges.push({ ...change, inventoryItemId: item.id, name });
    }
    if (item.suggestedLocation && item.suggestedLocation !== item.shelfLocation && item.suggestedLocationAt) {
      day(storeDay(item.suggestedLocationAt)).moveSuggestions.push({
        inventoryItemId: item.id,
        name,
        from: item.shelfLocation ?? "",
        to: item.suggestedLocation,
      });
    }
  }

  for (const doc of alertDocs?.docs ?? []) {
    const a = doc.data() as InventoryPriceAlertV1;
    if (Math.abs(a.newPrice - a.previousPrice) < BIG_MOVE_MIN_DOLLARS) continue;
    day(storeDay(a.createdAt)).priceAlerts.push({
      inventoryItemId: a.inventoryItemId,
      displayName: a.displayName,
      condition: a.condition,
      previousPrice: a.previousPrice,
      newPrice: a.newPrice,
      change: a.change,
      status: a.status,
    });
  }
  for (const doc of runDocs?.docs ?? []) {
    const r = doc.data() as PriceRunReportV1;
    if (!r.priced) continue;
    day(storeDay(r.startedAt)).priceRun = {
      priced: r.priced,
      changed: r.changed,
      alerts: r.alerts,
      toMove: r.toMove ?? 0,
      finished: r.finished,
    };
  }
  for (const s of snapshots) {
    day(storeDay(s.importedAt)).imports.push({
      at: s.importedAt,
      created: s.created,
      updated: s.updated,
      withdrawn: s.withdrawn,
      totalUnits: s.totalUnits,
    });
  }
  for (const r of reservations) {
    day(storeDay(r.createdAt)).pickups.placed += 1;
    if (r.status === "completed" && r.completedAt) day(storeDay(r.completedAt)).pickups.paid += 1;
  }

  const ordered = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  let month = "";
  let mtd = { units: 0, revenue: 0 };
  for (const d of ordered) {
    if (d.date.slice(0, 7) !== month) {
      month = d.date.slice(0, 7);
      mtd = { units: 0, revenue: 0 };
    }
    mtd = { units: mtd.units + d.sales.units, revenue: mtd.revenue + d.sales.revenue };
    d.monthToDate = { units: mtd.units, revenue: round2(mtd.revenue) };
    d.sales.revenue = round2(d.sales.revenue);
    d.sales.inStore.revenue = round2(d.sales.inStore.revenue);
    d.sales.online.revenue = round2(d.sales.online.revenue);
    d.sales.lines.sort((a, b) => b.at.localeCompare(a.at));
    d.manualChanges.sort((a, b) => b.at.localeCompare(a.at));
    d.priceAlerts.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    d.moveSuggestions.sort((a, b) => a.to.localeCompare(b.to) || a.name.localeCompare(b.name));
  }
  return ordered.reverse().slice(0, MAX_DAYS);
}

export function summarizeDailyReport(d: DailyReport): DailyReportSummary {
  return {
    date: d.date,
    salesUnits: d.sales.units,
    revenue: d.sales.revenue,
    priceAlerts: d.priceAlerts.length,
    manualChanges: d.manualChanges.length,
    moves: d.moveSuggestions.length,
    imports: d.imports.length,
  };
}
