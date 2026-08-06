import {
  buildHeaderIndex,
  getCell,
  parseCsv,
  stringifyCsv,
} from "./csv-utils";
import type { TcgplayerOrderRow, TrackingImportRow } from "./types";

export function parseTrackingResultsCsv(text: string): TrackingImportRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const headers = rows[0]!;
  const index = buildHeaderIndex(headers);
  const results: TrackingImportRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const referenceNumber = getCell(
      row,
      index,
      "Reference Number 1",
      "Reference Number",
      "Order #",
      "Order Number",
      "Reference",
    );
    const trackingNumber = getCell(
      row,
      index,
      "Tracking Number",
      "Tracking #",
      "Tracking",
    );
    const carrier = getCell(row, index, "Carrier", "Shipping Carrier") || "USPS";

    if (!referenceNumber || !trackingNumber) continue;

    results.push({ referenceNumber, trackingNumber, carrier });
  }

  return results;
}

export function buildTcgplayerTrackingCsv(
  matches: Array<{ orderNumber: string; trackingNumber: string; carrier: string }>,
): string {
  return stringifyCsv([
    ["Order #", "Tracking #", "Carrier"],
    ...matches.map((m) => [m.orderNumber, m.trackingNumber, m.carrier]),
  ]);
}

export function mergeTrackingIntoTcgplayerExport(
  originalOrders: TcgplayerOrderRow[],
  tracking: TrackingImportRow[],
): string {
  const byOrder = new Map(
    tracking.map((t) => [t.referenceNumber.trim(), t]),
  );

  if (!originalOrders.length) {
    return buildTcgplayerTrackingCsv(
      tracking.map((t) => ({
        orderNumber: t.referenceNumber,
        trackingNumber: t.trackingNumber,
        carrier: t.carrier,
      })),
    );
  }

  const headers = Object.keys(originalOrders[0]!.raw);
  const rows: string[][] = [headers];

  for (const order of originalOrders) {
    const match = byOrder.get(order.orderNumber.trim());
    const raw = { ...order.raw };
    if (match) {
      for (const key of headers) {
        const norm = key.toLowerCase();
        if (norm.includes("tracking")) {
          raw[key] = match.trackingNumber;
        }
        if (norm === "carrier") {
          raw[key] = match.carrier;
        }
      }
    }
    rows.push(headers.map((h) => raw[h] ?? ""));
  }

  return stringifyCsv(rows);
}

export function matchTrackingToOrders(
  originalOrders: TcgplayerOrderRow[],
  tracking: TrackingImportRow[],
): {
  matched: Array<{ orderNumber: string; trackingNumber: string; carrier: string }>;
  unmatched: TrackingImportRow[];
} {
  const orderSet = new Set(originalOrders.map((o) => o.orderNumber.trim()));
  const matched: Array<{
    orderNumber: string;
    trackingNumber: string;
    carrier: string;
  }> = [];
  const unmatched: TrackingImportRow[] = [];

  for (const t of tracking) {
    const ref = t.referenceNumber.trim();
    if (orderSet.has(ref)) {
      matched.push({
        orderNumber: ref,
        trackingNumber: t.trackingNumber,
        carrier: t.carrier || "USPS",
      });
    } else {
      unmatched.push(t);
    }
  }

  return { matched, unmatched };
}
