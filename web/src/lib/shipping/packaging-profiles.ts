import type { PackagingProfile, PackagingProfileId } from "./types";

export const PACKAGING_PROFILES: PackagingProfile[] = [
  {
    id: "plain_envelope",
    label: "Plain envelope (+ sleeve/toploader)",
    tareOz: 0.93,
    defaultPackageType: "Letter",
  },
  {
    id: "rigid_mailer",
    label: "Rigid card mailer",
    tareOz: 1.5,
    defaultPackageType: "Choose Your Own Box",
  },
  {
    id: "bubble_mailer",
    label: "Bubble mailer",
    tareOz: 1.2,
    defaultPackageType: "Choose Your Own Box",
  },
  {
    id: "box",
    label: "Box + packing material",
    tareOz: 3.0,
    defaultPackageType: "Choose Your Own Box",
  },
  {
    id: "custom",
    label: "Custom tare weight",
    tareOz: 0,
    defaultPackageType: "Choose Your Own Box",
  },
];

export function getPackagingProfile(id: PackagingProfileId): PackagingProfile {
  return PACKAGING_PROFILES.find((p) => p.id === id) ?? PACKAGING_PROFILES[0]!;
}

export function computePackedWeightOz(input: {
  productWeightOz: number;
  packagingProfileId: PackagingProfileId;
  customTareOz: number;
  customPackedWeightOz?: number;
}): number {
  if (input.packagingProfileId === "custom" && input.customPackedWeightOz != null) {
    return Math.max(0, input.customPackedWeightOz);
  }
  const profile = getPackagingProfile(input.packagingProfileId);
  const tare =
    input.packagingProfileId === "custom"
      ? input.customTareOz
      : profile.tareOz;
  return Math.round((input.productWeightOz + tare) * 100) / 100;
}
