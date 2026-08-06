import {
  buildHeaderIndex,
  getCell,
  normalizeCountry,
  normalizePostalCode,
  parseCsv,
  parseMoney,
  parseWeightOz,
} from "./csv-utils";
import type { TcgplayerOrderRow } from "./types";

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR", "VI", "GU", "AS", "MP",
]);

export { US_STATE_CODES };

export function parseTcgplayerShippingCsv(text: string): TcgplayerOrderRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const headers = rows[0]!;
  const index = buildHeaderIndex(headers);
  const orders: TcgplayerOrderRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const raw: Record<string, string> = {};
    headers.forEach((h, col) => {
      raw[h] = row[col] ?? "";
    });

    const country = normalizeCountry(
      getCell(row, index, "Country"),
    );
    const postalCode = normalizePostalCode(
      getCell(row, index, "PostalCode", "Postal Code", "Zip", "ZIP Code"),
      country,
    );

    orders.push({
      orderNumber: getCell(row, index, "Order #", "Order Number", "Order"),
      firstName: getCell(row, index, "FirstName", "First Name"),
      lastName: getCell(row, index, "LastName", "Last Name"),
      address1: getCell(row, index, "Address1", "Address 1"),
      address2: getCell(row, index, "Address2", "Address 2"),
      city: getCell(row, index, "City"),
      state: getCell(row, index, "State").toUpperCase(),
      postalCode,
      country,
      orderDate: getCell(row, index, "Order Date", "OrderDate"),
      productWeightOz: parseWeightOz(
        getCell(row, index, "Product Weight", "ProductWeight"),
      ),
      shippingMethod: getCell(row, index, "Shipping Method", "ShippingMethod"),
      itemCount: Number.parseInt(
        getCell(row, index, "Item Count", "ItemCount") || "0",
        10,
      ) || 0,
      valueOfProducts: parseMoney(
        getCell(row, index, "Value Of Products", "Value of Products"),
      ),
      shippingFeePaid: parseMoney(
        getCell(row, index, "Shipping Fee Paid", "ShippingFeePaid"),
      ),
      trackingNumber: getCell(
        row,
        index,
        "Tracking #",
        "Tracking Number",
        "Tracking",
      ),
      carrier: getCell(row, index, "Carrier"),
      raw,
    });
  }

  return orders;
}

export function detectDuplicateOrderNumbers(
  orders: TcgplayerOrderRow[],
): Set<string> {
  const seen = new Map<string, number>();
  const dupes = new Set<string>();
  for (const o of orders) {
    const key = o.orderNumber.trim();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    if ((seen.get(key) ?? 0) > 1) dupes.add(key);
  }
  return dupes;
}
