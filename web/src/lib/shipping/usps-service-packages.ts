import type { UspsPackageType, UspsServiceType } from "./types";

/** Max weight (oz) for First-Class Mail letter rate in Click-N-Ship. */
export const FIRST_CLASS_LETTER_MAX_OZ = 3.5;

/** Valid Service Type + Package Type pairs from CNSv2 File Upload guide (May 2026). */
export const VALID_SERVICE_PACKAGE: Partial<
  Record<UspsServiceType, readonly UspsPackageType[]>
> = {
  "First-Class Mail": ["Letter", "Large Envelope"],
  "USPS Ground Advantage": ["Choose Your Own Box"],
  "Priority Mail": [
    "Choose Your Own Box",
    "Custom Packaging",
    "Flat Rate Envelope",
    "Flat Rate Legal Envelope",
    "Small Flat Rate Box",
    "Medium Flat Rate Box",
    "Small Flat Rate Envelope",
    "Large Flat Rate Box",
    "Padded Flat Rate Envelope",
    "Window Flat Rate Envelope",
  ],
  "Priority Mail Express": [
    "Choose Your Own Box",
    "Flat Rate Envelope",
    "Flat Rate Legal Envelope",
    "Padded Flat Rate Envelope",
  ],
};

export function migratePackageType(value: string | undefined): UspsPackageType {
  if (!value || value === "Package") return "Choose Your Own Box";
  return value as UspsPackageType;
}

export function isValidServicePackageCombo(
  service: UspsServiceType,
  packageType: UspsPackageType,
): boolean {
  const allowed = VALID_SERVICE_PACKAGE[service];
  return allowed?.includes(packageType) ?? false;
}

export function defaultPackageForService(service: UspsServiceType): UspsPackageType {
  if (service === "First-Class Mail") return "Letter";
  return "Choose Your Own Box";
}

export function normalizeServicePackage(
  service: UspsServiceType,
  packageType: UspsPackageType,
): { service: UspsServiceType; packageType: UspsPackageType; adjusted: boolean } {
  const pkg = migratePackageType(packageType);
  if (isValidServicePackageCombo(service, pkg)) {
    return { service, packageType: pkg, adjusted: pkg !== packageType };
  }
  const fallback = defaultPackageForService(service);
  return { service, packageType: fallback, adjusted: true };
}
