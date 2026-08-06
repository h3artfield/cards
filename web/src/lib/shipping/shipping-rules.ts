import {
  defaultPackageForService,
  FIRST_CLASS_LETTER_MAX_OZ,
  isValidServicePackageCombo,
  migratePackageType,
  normalizeServicePackage,
} from "./usps-service-packages";
import type {
  ShippingDefaults,
  ShippingRuleThresholds,
  TcgplayerOrderRow,
  TcgplayerShippingMethodRule,
  UspsPackageType,
  UspsServiceType,
} from "./types";

export const DEFAULT_THRESHOLDS: ShippingRuleThresholds = {
  trackingRecommendedMin: 20,
  trackingRequiredMin: 50,
  signatureRequiredMin: 250,
};

export const DEFAULT_TCG_METHOD_RULES: TcgplayerShippingMethodRule[] = [
  {
    tcgMethodPattern: "standard",
    uspsService: "USPS Ground Advantage",
    uspsPackageType: "Choose Your Own Box",
  },
  {
    tcgMethodPattern: "first class",
    uspsService: "First-Class Mail",
    uspsPackageType: "Letter",
  },
  {
    tcgMethodPattern: "priority",
    uspsService: "Priority Mail",
    uspsPackageType: "Choose Your Own Box",
  },
];

export function resolveServiceFromTcgMethod(
  shippingMethod: string,
  rules: TcgplayerShippingMethodRule[],
  fallback: { service: UspsServiceType; packageType: UspsPackageType },
): { service: UspsServiceType; packageType: UspsPackageType } {
  const method = shippingMethod.trim().toLowerCase();
  for (const rule of rules) {
    if (method.includes(rule.tcgMethodPattern.toLowerCase())) {
      return normalizeServicePackage(rule.uspsService, rule.uspsPackageType);
    }
  }
  return normalizeServicePackage(fallback.service, fallback.packageType);
}

export function orderRequiresTrackedShipping(
  valueOfProducts: number,
  trackingRequiredMin: number,
): boolean {
  return valueOfProducts >= trackingRequiredMin;
}

export function trackedShippingService(): UspsServiceType {
  return "USPS Ground Advantage";
}

export function trackedShippingPackageType(): UspsPackageType {
  return "Choose Your Own Box";
}

export function resolveShippingForOrder(
  order: TcgplayerOrderRow,
  defaults: ShippingDefaults,
): {
  service: UspsServiceType;
  packageType: UspsPackageType;
  signatureRequired: boolean;
  insuranceAmount: number | null;
  notes: string[];
} {
  const notes: string[] = [];
  const value = order.valueOfProducts;
  const { thresholds } = defaults;

  let service: UspsServiceType;
  let packageType: UspsPackageType;

  if (value < defaults.lowValueMax) {
    service = defaults.lowValueService;
    packageType = migratePackageType(defaults.lowValuePackageType);
    notes.push(`Low-value profile (< $${defaults.lowValueMax})`);
  } else {
    const resolved = resolveServiceFromTcgMethod(
      order.shippingMethod,
      defaults.tcgMethodRules,
      {
        service: defaults.uspsService,
        packageType: migratePackageType(defaults.uspsPackageType),
      },
    );
    service = resolved.service;
    packageType = resolved.packageType;
  }

  const normalized = normalizeServicePackage(service, packageType);
  service = normalized.service;
  packageType = normalized.packageType;
  if (normalized.adjusted) {
    notes.push(`Adjusted to valid USPS combo: ${service} + ${packageType}`);
  }

  if (value >= thresholds.trackingRequiredMin) {
    notes.push(`Tracking required (≥ $${thresholds.trackingRequiredMin}) — locked to Ground Advantage`);
    service = trackedShippingService();
    packageType = trackedShippingPackageType();
  } else if (value >= thresholds.trackingRecommendedMin) {
    notes.push(`Tracking recommended (≥ $${thresholds.trackingRecommendedMin})`);
  }

  if (!isValidServicePackageCombo(service, packageType)) {
    packageType = defaultPackageForService(service);
    notes.push(`Using default package type for ${service}: ${packageType}`);
  }

  let signatureRequired = false;
  if (value >= thresholds.signatureRequiredMin) {
    signatureRequired = true;
    notes.push(`Signature required (≥ $${thresholds.signatureRequiredMin})`);
  } else if (defaults.signatureEnabled && value >= defaults.signatureThreshold) {
    signatureRequired = true;
  }

  let insuranceAmount: number | null = null;
  if (defaults.insuranceEnabled && value >= defaults.insuranceThreshold) {
    insuranceAmount = value;
    notes.push(`Insurance $${value.toFixed(2)}`);
  }

  return { service, packageType, signatureRequired, insuranceAmount, notes };
}

export function letterWeightWarning(
  packageType: UspsPackageType,
  packedWeightOz: number,
): string | null {
  if (packageType === "Letter" && packedWeightOz > FIRST_CLASS_LETTER_MAX_OZ) {
    return `Letter rate applies up to ${FIRST_CLASS_LETTER_MAX_OZ} oz — use Large Envelope or tracked package`;
  }
  return null;
}
