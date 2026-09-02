/**
 * Explicit RPS ontology — axis definitions and deck feature key naming.
 */
import type { RpsAxisFamily, RpsVectorKind } from "./types";

export type AxisDefinition = {
  family: RpsAxisFamily;
  vectors: RpsVectorKind[];
  definition: string;
};

export const RPS_ONTOLOGY_V2: AxisDefinition[] = [
  {
    family: "creatures",
    vectors: ["exposure", "reliance", "disruption", "resilience"],
    definition: "Creature permanents, creature-based plans, spot/mass creature removal, protection/recursion.",
  },
  {
    family: "artifacts",
    vectors: ["exposure", "reliance", "disruption", "resilience"],
    definition: "Artifact presence vs artifact-synergy reliance vs artifact interaction vs resistance.",
  },
  {
    family: "enchantments",
    vectors: ["exposure", "reliance", "disruption"],
    definition: "Enchantment presence, enchantment synergy, enchantment interaction.",
  },
  {
    family: "lands",
    vectors: ["exposure", "disruption", "resilience"],
    definition: "Nonbasic/land-heavy exposure, land destruction, land recursion/resilience.",
  },
  {
    family: "tokens",
    vectors: ["exposure", "reliance", "disruption"],
    definition: "Token generation density, go-wide reliance, board reset pressure.",
  },
  {
    family: "graveyard",
    vectors: ["exposure", "reliance", "disruption", "resilience"],
    definition: "Graveyard zone use, recursion/reanimation reliance, graveyard hate, graveyard recovery.",
  },
  {
    family: "library_search",
    vectors: ["reliance", "disruption"],
    definition: "Tutor/search reliance vs search/library denial.",
  },
  {
    family: "hand_resources",
    vectors: ["reliance", "disruption", "resilience"],
    definition: "Card draw/engine reliance, hand disruption, refuel resilience.",
  },
  {
    family: "exile",
    vectors: ["disruption", "resilience"],
    definition: "Exile-based answers vs exile recovery.",
  },
  {
    family: "spells_stack",
    vectors: ["reliance", "disruption", "resilience"],
    definition: "Instant/sorcery chain reliance, countermagic, protection/recursion of spells.",
  },
  {
    family: "activated_abilities",
    vectors: ["reliance", "disruption", "resilience"],
    definition: "Activated-engine reliance, ability shutdown, resistance.",
  },
  {
    family: "triggered_abilities",
    vectors: ["reliance", "disruption"],
    definition: "Triggered-engine reliance and suppression.",
  },
  {
    family: "mana_acceleration",
    vectors: ["exposure", "reliance", "disruption"],
    definition: "Ramp density, mana-engine reliance, resource denial.",
  },
  {
    family: "recursion",
    vectors: ["reliance", "disruption", "resilience"],
    definition: "Return-from-yard plans, graveyard hate interaction, recursion resilience.",
  },
];

export function deckFeatureKey(
  zone: "mb" | "cmd",
  family: RpsAxisFamily,
  vector: RpsVectorKind,
): string {
  return `ipv2_${zone}_${family}_${vector}`;
}

export function allDeckFeatureKeys(): string[] {
  const keys: string[] = [];
  for (const axis of RPS_ONTOLOGY_V2) {
    for (const vector of axis.vectors) {
      keys.push(deckFeatureKey("mb", axis.family, vector));
      keys.push(deckFeatureKey("cmd", axis.family, vector));
    }
  }
  return keys;
}

/** Pairwise D2 term naming (design only — not trained yet). */
export function matchupTermKey(input: {
  direction: "oppDisruptsMy" | "myDisruptsOpp";
  myVector: RpsVectorKind;
  oppVector: RpsVectorKind;
  family: RpsAxisFamily;
  reducer: "mean" | "max" | "min" | "variance";
}): string {
  return `d2_${input.direction}_${input.family}_${input.myVector}_x_${input.oppVector}_${input.reducer}AcrossOpponents`;
}

export function proposedD2TermKeys(): string[] {
  const reducers = ["mean", "max", "min", "variance"] as const;
  const families = RPS_ONTOLOGY_V2.map((a) => a.family);
  const terms: string[] = [];
  for (const family of families) {
    for (const reducer of reducers) {
      terms.push(
        matchupTermKey({ direction: "oppDisruptsMy", family, myVector: "reliance", oppVector: "disruption", reducer }),
        matchupTermKey({ direction: "myDisruptsOpp", family, myVector: "disruption", oppVector: "reliance", reducer }),
        matchupTermKey({ direction: "myDisruptsOpp", family, myVector: "disruption", oppVector: "exposure", reducer }),
        matchupTermKey({ direction: "oppDisruptsMy", family, myVector: "resilience", oppVector: "disruption", reducer }),
      );
    }
  }
  return terms;
}
