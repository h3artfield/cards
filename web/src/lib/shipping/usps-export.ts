import { parseCsv, stringifyCsv } from "./csv-utils";
import { effectiveRow } from "./prepare-rows";
import {
  formatUspsShippingDate,
  normalizeSenderProfile,
  totalWeightOz,
} from "./sender-profile";
import type { PreparedShippingRow, SenderProfile, ShippingDefaults } from "./types";

/**
 * USPS Click-N-Ship (CNSv2) bulk upload column headers.
 * Names must match the official template for auto-mapping.
 */
export const USPS_CLICK_N_SHIP_HEADERS = [
  "Reference Number 1",
  "Shipping Date",
  "Service Type",
  "Package Type",
  "Item Weight (lb.)",
  "Item Weight (oz)",
  "Package Weight (oz)",
  "Height",
  "Width",
  "Length (in)",
  "Package Value",
  "Insurance Amount",
  "Signature Confirmation",
  "Recipient First Name",
  "Recipient Last Name",
  "Recipient Company/Org Name",
  "Recipient Address Line 1",
  "Recipient Address Line 2",
  "Recipient Address Town/City",
  "Recipient State",
  "Recipient ZIP Code",
  "Recipient Country",
  "Sender First Name",
  "Sender Last Name",
  "Sender Company/Org Name",
  "Sender Address Line 1",
  "Sender Address Line 2",
  "Sender Address Town/City",
  "Sender State",
  "Sender ZIP Code",
  "Sender Country",
  "Sender Cell Phone",
  "Sender Email",
] as const;

/** Headers USPS auto-mapper requires — used for post-export verification. */
export const USPS_REQUIRED_AUTOMAP_HEADERS = [
  "Recipient Address Town/City",
  "Sender First Name",
  "Sender Last Name",
  "Sender Address Town/City",
  "Sender Cell Phone",
  "Sender Email",
  "Shipping Date",
  "Package Weight (oz)",
] as const;

export function verifyUspsExportHeaders(csv: string): string[] {
  const rows = parseCsv(csv);
  const headers = rows[0] ?? [];
  const set = new Set(headers.map((h) => h.trim()));
  return USPS_REQUIRED_AUTOMAP_HEADERS.filter((h) => !set.has(h));
}

function senderCells(sender: SenderProfile): string[] {
  const s = normalizeSenderProfile(sender);
  return [
    s.firstName,
    s.lastName,
    s.company ?? "",
    s.address1,
    s.address2 ?? "",
    s.city,
    s.state,
    s.postalCode,
    s.country,
    s.phone,
    s.email,
  ];
}

export function exportUspsClickNShipCsv(
  rows: PreparedShippingRow[],
  defaults: ShippingDefaults,
): { csv: string; exportedCount: number; skippedCount: number } {
  const exportRows: string[][] = [USPS_CLICK_N_SHIP_HEADERS.slice() as unknown as string[]];
  let exportedCount = 0;
  let skippedCount = 0;
  const shippingDate = formatUspsShippingDate(defaults.shipDate);

  for (const row of rows) {
    const effective = effectiveRow(row);
    if (effective.status === "error") {
      skippedCount++;
      continue;
    }
    if (!effective.uspsService || !effective.uspsPackageType) {
      skippedCount++;
      continue;
    }

    const o = effective.order;
    const packageWeightOz =
      effective.packedWeightOz ?? totalWeightOz(effective.weightLbs, effective.weightOz);

    exportRows.push([
      o.orderNumber,
      shippingDate,
      effective.uspsService,
      effective.uspsPackageType,
      String(effective.weightLbs),
      String(effective.weightOz),
      String(packageWeightOz),
      defaults.heightIn != null ? String(defaults.heightIn) : "",
      defaults.widthIn != null ? String(defaults.widthIn) : "",
      defaults.lengthIn != null ? String(defaults.lengthIn) : "",
      defaults.includePackageValue ? o.valueOfProducts.toFixed(2) : "",
      effective.insuranceAmount != null
        ? effective.insuranceAmount.toFixed(2)
        : "",
      effective.signatureRequired ? "Yes" : "No",
      o.firstName,
      o.lastName,
      "",
      o.address1,
      o.address2,
      o.city,
      o.state,
      o.postalCode,
      o.country,
      ...senderCells(defaults.sender),
    ]);
    exportedCount++;
  }

  return {
    csv: stringifyCsv(exportRows),
    exportedCount,
    skippedCount,
  };
}

export function exportValidationErrorReport(rows: PreparedShippingRow[]): string {
  const header = ["Status", "Order #", "Recipient", "Issues"];
  const data = rows
    .map((r) => effectiveRow(r))
    .filter((r) => r.status !== "ready")
    .map((r) => [
      r.status,
      r.order.orderNumber,
      `${r.order.firstName} ${r.order.lastName}`.trim(),
      r.messages.join("; "),
    ]);
  return stringifyCsv([header, ...data]);
}
