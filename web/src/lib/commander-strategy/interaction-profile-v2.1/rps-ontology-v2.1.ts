/**
 * Pruned RPS ontology v2.1 — only defensible vectors per family/zone.
 */
import type { AxisZone, RpsAxisFamily, RpsVectorKind } from "./types";

export type AxisDefinitionV2_1 = {
  family: RpsAxisFamily;
  vectors: RpsVectorKind[];
  zones: AxisZone[];
  definition: string;
};

/** Reliance contributor threshold for deck density aggregation. */
export const RELIANCE_CONTRIBUTOR_THRESHOLD = 0.2;

export const RPS_ONTOLOGY_V2_1: AxisDefinitionV2_1[] = [
  {
    family: "creatures",
    vectors: ["exposure", "reliance", "disruption"],
    zones: ["mainboard", "commandZone"],
    definition: "Creature density, creature-plan reliance, spot/mass removal.",
  },
  {
    family: "artifacts",
    vectors: ["exposure", "reliance", "disruption"],
    zones: ["mainboard", "commandZone"],
    definition: "Artifact density, artifact-synergy reliance, artifact interaction.",
  },
  {
    family: "enchantments",
    vectors: ["exposure", "disruption"],
    zones: ["mainboard", "commandZone"],
    definition: "Enchantment density and enchantment removal (reliance deferred).",
  },
  {
    family: "lands",
    vectors: ["exposure", "disruption"],
    zones: ["mainboard"],
    definition: "Land/nonbasic exposure and land denial (mainboard only).",
  },
  {
    family: "tokens",
    vectors: ["reliance", "disruption"],
    zones: ["mainboard", "commandZone"],
    definition: "Token generation reliance and board reset.",
  },
  {
    family: "graveyard",
    vectors: ["reliance", "disruption"],
    zones: ["mainboard", "commandZone"],
    definition: "Graveyard use/reanimation reliance and graveyard hate.",
  },
  {
    family: "library_search",
    vectors: ["reliance", "disruption"],
    zones: ["mainboard"],
    definition: "Tutor reliance and search denial (mainboard answers).",
  },
  {
    family: "hand_resources",
    vectors: ["reliance", "disruption"],
    zones: ["mainboard", "commandZone"],
    definition: "Card-draw engine reliance and hand disruption.",
  },
  {
    family: "exile",
    vectors: ["disruption"],
    zones: ["mainboard", "commandZone"],
    definition: "Exile-based answers.",
  },
  {
    family: "spells_stack",
    vectors: ["reliance", "disruption"],
    zones: ["mainboard", "commandZone"],
    definition: "Spell-chain engine reliance and countermagic.",
  },
  {
    family: "activated_abilities",
    vectors: ["reliance", "disruption"],
    zones: ["mainboard", "commandZone"],
    definition: "Activated-engine reliance and ability shutdown.",
  },
  {
    family: "triggered_abilities",
    vectors: ["reliance"],
    zones: ["mainboard", "commandZone"],
    definition: "Triggered-engine reliance (suppression unsupported).",
  },
  {
    family: "mana_acceleration",
    vectors: ["reliance"],
    zones: ["mainboard", "commandZone"],
    definition: "Ramp/ritual reliance density (not exposure).",
  },
  {
    family: "recursion",
    vectors: ["reliance"],
    zones: ["mainboard", "commandZone"],
    definition: "Return-from-yard plan reliance.",
  },
];

export function deckFeatureKey(
  zone: "mb" | "cmd",
  family: RpsAxisFamily,
  vector: RpsVectorKind,
): string {
  return `ipv2_1_${zone}_${family}_${vector}`;
}

export function allRetainedDeckFeatureKeys(): string[] {
  const keys: string[] = [];
  for (const axis of RPS_ONTOLOGY_V2_1) {
    for (const vector of axis.vectors) {
      if (axis.zones.includes("mainboard")) keys.push(deckFeatureKey("mb", axis.family, vector));
      if (axis.zones.includes("commandZone")) keys.push(deckFeatureKey("cmd", axis.family, vector));
    }
  }
  return keys;
}

export function isRetainedAxis(
  zone: "mb" | "cmd",
  family: RpsAxisFamily,
  vector: RpsVectorKind,
): boolean {
  const axisZone: AxisZone = zone === "mb" ? "mainboard" : "commandZone";
  const def = RPS_ONTOLOGY_V2_1.find((a) => a.family === family);
  return Boolean(def?.vectors.includes(vector) && def.zones.includes(axisZone));
}
