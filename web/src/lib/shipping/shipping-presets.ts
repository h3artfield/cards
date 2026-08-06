import type { ShippingDefaults } from "./types";

export type ShippingPresetId = "letter_mail" | "tracked_package";

export const SHIPPING_PRESETS: {
  id: ShippingPresetId;
  label: string;
  description: string;
}[] = [
  {
    id: "letter_mail",
    label: "Letter mail",
    description: "First-Class Mail + Letter (~1 oz singles, ~$0.78)",
  },
  {
    id: "tracked_package",
    label: "Tracked package",
    description: "USPS Ground Advantage + Choose Your Own Box",
  },
];

export function applyShippingPreset(
  presetId: ShippingPresetId,
  defaults: ShippingDefaults,
): ShippingDefaults {
  if (presetId === "letter_mail") {
    return {
      ...defaults,
      uspsService: "First-Class Mail",
      uspsPackageType: "Letter",
      packagingProfileId: "plain_envelope",
      customPackagingTareOz: 0.93,
      lowValueService: "First-Class Mail",
      lowValuePackageType: "Letter",
      lowValueMax: 20,
    };
  }
  return {
    ...defaults,
    uspsService: "USPS Ground Advantage",
    uspsPackageType: "Choose Your Own Box",
    lowValueService: "USPS Ground Advantage",
    lowValuePackageType: "Choose Your Own Box",
  };
}
