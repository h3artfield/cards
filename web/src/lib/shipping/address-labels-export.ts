import { stringifyCsv } from "./csv-utils";
import { effectiveRow } from "./prepare-rows";
import type { PreparedShippingRow } from "./types";

/** Printable address list for stamped First-Class envelope workflow (non–Click-N-Ship). */
export const ADDRESS_LABEL_HEADERS = [
  "Order #",
  "Recipient Name",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "ZIP Code",
  "Country",
  "Value",
] as const;

export function exportAddressLabelsCsv(rows: PreparedShippingRow[]): {
  csv: string;
  exportedCount: number;
  skippedCount: number;
} {
  const exportRows: string[][] = [ADDRESS_LABEL_HEADERS.slice() as unknown as string[]];
  let exportedCount = 0;
  let skippedCount = 0;

  for (const row of rows) {
    const effective = effectiveRow(row);
    if (effective.status === "error") {
      skippedCount++;
      continue;
    }

    const o = effective.order;
    exportRows.push([
      o.orderNumber,
      `${o.firstName} ${o.lastName}`.trim(),
      o.address1,
      o.address2,
      o.city,
      o.state,
      o.postalCode,
      o.country,
      o.valueOfProducts.toFixed(2),
    ]);
    exportedCount++;
  }

  return {
    csv: stringifyCsv(exportRows),
    exportedCount,
    skippedCount,
  };
}
