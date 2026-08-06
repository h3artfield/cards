import {
  DEFAULT_TCG_METHOD_RULES,
  DEFAULT_THRESHOLDS,
} from "./shipping-rules";
import type { PackagingProfileId, ShippingDefaults } from "./types";
import { mergeSenderDefaults } from "./sender-profile";
import { migratePackageType } from "./usps-service-packages";

const STORAGE_KEY = "cs9k-shipping-defaults";

export function defaultShippingDefaults(): ShippingDefaults {
  const today = new Date().toISOString().slice(0, 10);
  return {
    shipDate: today,
    uspsService: "First-Class Mail",
    uspsPackageType: "Letter",
    packagingProfileId: "plain_envelope",
    customPackagingTareOz: 0.93,
    includePackageValue: true,
    insuranceEnabled: false,
    insuranceThreshold: 100,
    signatureEnabled: false,
    signatureThreshold: 250,
    sender: {
      firstName: "",
      lastName: "",
      company: "",
      address1: "",
      city: "",
      state: "",
      postalCode: "",
      country: "US",
      phone: "",
      email: "",
    },
    thresholds: { ...DEFAULT_THRESHOLDS },
    tcgMethodRules: [...DEFAULT_TCG_METHOD_RULES],
    lowValueService: "First-Class Mail",
    lowValuePackageType: "Letter",
    lowValueMax: 20,
  };
}

export function loadShippingDefaults(storeId: string): ShippingDefaults {
  if (typeof window === "undefined") return defaultShippingDefaults();
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}:${storeId}`);
    if (!raw) return defaultShippingDefaults();
    const parsed = JSON.parse(raw) as Partial<ShippingDefaults>;
    const base = defaultShippingDefaults();
    const merged = {
      ...base,
      ...parsed,
      sender: mergeSenderDefaults(base.sender, parsed.sender),
      thresholds: { ...base.thresholds, ...parsed.thresholds },
      tcgMethodRules: (parsed.tcgMethodRules ?? base.tcgMethodRules).map((rule) => ({
        ...rule,
        uspsPackageType: migratePackageType(rule.uspsPackageType),
      })),
      uspsPackageType: migratePackageType(parsed.uspsPackageType),
      lowValuePackageType: migratePackageType(parsed.lowValuePackageType),
    };
    return merged;
  } catch {
    return defaultShippingDefaults();
  }
}

export function applyStoreSenderHints(
  defaults: ShippingDefaults,
  hints: { storeName?: string },
): ShippingDefaults {
  if (defaults.sender.firstName.trim() || defaults.sender.lastName.trim()) {
    return defaults;
  }
  const storeName = hints.storeName?.trim();
  if (!storeName) return defaults;
  const split = storeName.includes(" ")
    ? { firstName: storeName.split(" ")[0]!, lastName: storeName.split(" ").slice(1).join(" ") }
    : { firstName: storeName, lastName: "Store" };
  return {
    ...defaults,
    sender: mergeSenderDefaults(defaults.sender, {
      ...split,
      company: storeName,
    }),
  };
}

export function saveShippingDefaults(
  storeId: string,
  defaults: ShippingDefaults,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_KEY}:${storeId}`, JSON.stringify(defaults));
}

export function updatePackagingProfile(
  defaults: ShippingDefaults,
  profileId: PackagingProfileId,
): ShippingDefaults {
  return { ...defaults, packagingProfileId: profileId };
}
