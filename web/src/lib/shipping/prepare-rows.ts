import { computePackedWeightOz } from "./packaging-profiles";
import { resolveShippingForOrder, letterWeightWarning, orderRequiresTrackedShipping } from "./shipping-rules";
import { detectDuplicateOrderNumbers } from "./tcgplayer-import";
import { US_STATE_CODES } from "./tcgplayer-import";
import { splitWeightOz } from "./csv-utils";
import type {
  PreparedShippingRow,
  RowValidationStatus,
  ShippingDefaults,
  TcgplayerOrderRow,
} from "./types";

const UNSUPPORTED_CHARS = /[^\x09\x0A\x0D\x20-\x7E]/;

function mergeStatus(a: RowValidationStatus, b: RowValidationStatus): RowValidationStatus {
  if (a === "error" || b === "error") return "error";
  if (a === "warning" || b === "warning") return "warning";
  return "ready";
}

export function prepareShippingRows(
  orders: TcgplayerOrderRow[],
  defaults: ShippingDefaults,
): PreparedShippingRow[] {
  const dupes = detectDuplicateOrderNumbers(orders);

  return orders.map((order) => {
    const messages: string[] = [];
    let status: RowValidationStatus = "ready";

    if (!order.firstName.trim()) {
      messages.push("Missing first name");
      status = "error";
    }
    if (!order.lastName.trim()) {
      messages.push("Missing last name");
      status = "error";
    }
    if (!order.address1.trim()) {
      messages.push("Missing address line 1");
      status = "error";
    }
    if (!order.city.trim()) {
      messages.push("Missing city");
      status = "error";
    }
    if (!order.state.trim()) {
      messages.push("Missing state");
      status = "error";
    } else if (
      order.country === "US" &&
      !US_STATE_CODES.has(order.state.trim().toUpperCase())
    ) {
      messages.push(`Unrecognized state: ${order.state}`);
      status = mergeStatus(status, "warning");
    }
    if (!order.postalCode.trim()) {
      messages.push("Missing ZIP/postal code");
      status = "error";
    }
    if (!order.orderNumber.trim()) {
      messages.push("Missing order number");
      status = "error";
    }
    if (dupes.has(order.orderNumber.trim())) {
      messages.push("Duplicate order number");
      status = mergeStatus(status, "warning");
    }

    for (const field of [
      order.firstName,
      order.lastName,
      order.address1,
      order.address2,
      order.city,
    ]) {
      if (UNSUPPORTED_CHARS.test(field)) {
        messages.push("Unsupported characters in address — normalize before export");
        status = mergeStatus(status, "warning");
        break;
      }
    }

    const productWeightOz = order.productWeightOz;
    const packedWeightOz = computePackedWeightOz({
      productWeightOz,
      packagingProfileId: defaults.packagingProfileId,
      customTareOz: defaults.customPackagingTareOz,
      customPackedWeightOz: defaults.customPackedWeightOz,
    });

    if (productWeightOz <= 0) {
      messages.push("Product weight is zero — verify TCGplayer export");
      status = mergeStatus(status, "warning");
    }

    if (packedWeightOz <= 0) {
      messages.push("Packed weight must be greater than zero");
      status = "error";
    }

    const shipping = resolveShippingForOrder(order, defaults);
    messages.push(...shipping.notes);

    let uspsService = shipping.service;
    let uspsPackageType = shipping.packageType;

    const letterWarn = letterWeightWarning(uspsPackageType, packedWeightOz);
    if (letterWarn) {
      messages.push(letterWarn);
      status = mergeStatus(status, "warning");
    }

    const serviceLocked = orderRequiresTrackedShipping(
      order.valueOfProducts,
      defaults.thresholds.trackingRequiredMin,
    );

    const { lbs, oz } = splitWeightOz(packedWeightOz);

    return {
      order,
      status,
      messages,
      productWeightOz,
      packedWeightOz: packedWeightOz > 0 ? packedWeightOz : null,
      weightLbs: lbs,
      weightOz: oz,
      uspsService,
      uspsPackageType,
      signatureRequired: shipping.signatureRequired,
      insuranceAmount: shipping.insuranceAmount,
      serviceLocked,
    };
  });
}

export function applyRowOverrides(row: PreparedShippingRow): PreparedShippingRow {
  const o = row.overrides;
  if (!o) return row;

  const locked = row.serviceLocked;
  const nextService = locked ? row.uspsService : (o.uspsService ?? row.uspsService);
  const nextPackage = locked
    ? row.uspsPackageType
    : (o.uspsPackageType ?? row.uspsPackageType);

  return {
    ...row,
    uspsService: nextService,
    uspsPackageType: nextPackage,
    packedWeightOz: o.packedWeightOz ?? row.packedWeightOz,
    weightLbs:
      o.packedWeightOz != null
        ? splitWeightOz(o.packedWeightOz).lbs
        : row.weightLbs,
    weightOz:
      o.packedWeightOz != null
        ? splitWeightOz(o.packedWeightOz).oz
        : row.weightOz,
    signatureRequired: o.signatureRequired ?? row.signatureRequired,
  };
}

export function canOverrideRowService(row: PreparedShippingRow): boolean {
  return !row.serviceLocked;
}

export function effectiveRow(row: PreparedShippingRow): PreparedShippingRow {
  return applyRowOverrides(row);
}

export function rowsReadyForExport(rows: PreparedShippingRow[]): PreparedShippingRow[] {
  return rows.filter((r) => effectiveRow(r).status !== "error");
}

export function rowsBlockedFromExport(rows: PreparedShippingRow[]): PreparedShippingRow[] {
  return rows.filter((r) => effectiveRow(r).status === "error");
}
