export type PackagingProfileId =
  | "plain_envelope"
  | "rigid_mailer"
  | "bubble_mailer"
  | "box"
  | "custom";

export type UspsServiceType =
  | "USPS Ground Advantage"
  | "Priority Mail"
  | "Priority Mail Express"
  | "First-Class Mail";

export type UspsPackageType =
  | "Letter"
  | "Large Envelope"
  | "Choose Your Own Box"
  | "Custom Packaging"
  | "Flat Rate Envelope"
  | "Flat Rate Legal Envelope"
  | "Small Flat Rate Box"
  | "Medium Flat Rate Box"
  | "Small Flat Rate Envelope"
  | "Large Flat Rate Box"
  | "Padded Flat Rate Envelope"
  | "Window Flat Rate Envelope";

export type RowValidationStatus = "ready" | "warning" | "error";

export interface PackagingProfile {
  id: PackagingProfileId;
  label: string;
  tareOz: number;
  defaultPackageType: UspsPackageType;
}

export interface ShippingRuleThresholds {
  /** Recommend tracking at or above this value (TCGplayer: $20). */
  trackingRecommendedMin: number;
  /** Require tracking at or above this value (TCGplayer: $50). */
  trackingRequiredMin: number;
  /** Require signature at or above this value (TCGplayer: $250). */
  signatureRequiredMin: number;
}

export interface TcgplayerShippingMethodRule {
  tcgMethodPattern: string;
  uspsService: UspsServiceType;
  uspsPackageType: UspsPackageType;
}

export interface SenderProfile {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
}

export interface ShippingDefaults {
  shipDate: string;
  uspsService: UspsServiceType;
  uspsPackageType: UspsPackageType;
  packagingProfileId: PackagingProfileId;
  customPackagingTareOz: number;
  customPackedWeightOz?: number;
  lengthIn?: number;
  widthIn?: number;
  heightIn?: number;
  includePackageValue: boolean;
  insuranceEnabled: boolean;
  insuranceThreshold: number;
  signatureEnabled: boolean;
  signatureThreshold: number;
  sender: SenderProfile;
  thresholds: ShippingRuleThresholds;
  tcgMethodRules: TcgplayerShippingMethodRule[];
  lowValueService: UspsServiceType;
  lowValuePackageType: UspsPackageType;
  lowValueMax: number;
}

export interface TcgplayerOrderRow {
  orderNumber: string;
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  orderDate: string;
  productWeightOz: number;
  shippingMethod: string;
  itemCount: number;
  valueOfProducts: number;
  shippingFeePaid: number;
  trackingNumber: string;
  carrier: string;
  /** Original raw row for tracking re-export. */
  raw: Record<string, string>;
}

export interface PreparedShippingRow {
  order: TcgplayerOrderRow;
  status: RowValidationStatus;
  messages: string[];
  productWeightOz: number;
  packedWeightOz: number | null;
  weightLbs: number;
  weightOz: number;
  uspsService: UspsServiceType | null;
  uspsPackageType: UspsPackageType | null;
  signatureRequired: boolean;
  insuranceAmount: number | null;
  /** Order value ≥ tracking threshold — service/package cannot be downgraded to letter mail. */
  serviceLocked: boolean;
  /** Per-row overrides from preview edits. */
  overrides?: Partial<{
    uspsService: UspsServiceType;
    uspsPackageType: UspsPackageType;
    packedWeightOz: number;
    signatureRequired: boolean;
  }>;
}

export interface TrackingImportRow {
  referenceNumber: string;
  trackingNumber: string;
  carrier: string;
}
