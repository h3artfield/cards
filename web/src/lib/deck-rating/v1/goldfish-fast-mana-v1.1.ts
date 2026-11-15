/**
 * Authored fast-mana table (spec rev2 work-order step 2).
 * These are no longer generic "add N every turn" rocks.
 */
export const DR_FAST_MANA_TABLE = "deck-rating-fast-mana-v1.1";

export type FastManaKind =
  | "untapRock"
  | "noUntapRock"
  | "oneShot"
  | "ritual"
  | "land"
  | "imprintRock"
  | "discardLandRock"
  | "metalcraftRock"
  | "legendaryRock"
  | "commanderLotus"
  | "led";

export type FastManaModel = {
  name: string;
  kind: FastManaKind;
  tapMana: number;
};

export const FAST_MANA_TABLE: Record<string, FastManaModel> = {
  "Mana Vault": { name: "Mana Vault", kind: "noUntapRock", tapMana: 3 },
  "Grim Monolith": { name: "Grim Monolith", kind: "noUntapRock", tapMana: 3 },
  "Lotus Petal": { name: "Lotus Petal", kind: "oneShot", tapMana: 1 },
  "Chrome Mox": { name: "Chrome Mox", kind: "imprintRock", tapMana: 1 },
  "Mox Diamond": { name: "Mox Diamond", kind: "discardLandRock", tapMana: 1 },
  "Ancient Tomb": { name: "Ancient Tomb", kind: "land", tapMana: 2 },
  "Dark Ritual": { name: "Dark Ritual", kind: "ritual", tapMana: 3 },
  "Cabal Ritual": { name: "Cabal Ritual", kind: "ritual", tapMana: 3 },
  "Mana Crypt": { name: "Mana Crypt", kind: "untapRock", tapMana: 2 },
  "Jeweled Lotus": { name: "Jeweled Lotus", kind: "commanderLotus", tapMana: 3 },
  "Mox Opal": { name: "Mox Opal", kind: "metalcraftRock", tapMana: 1 },
  "Mox Amber": { name: "Mox Amber", kind: "legendaryRock", tapMana: 1 },
  "Lion's Eye Diamond": { name: "Lion's Eye Diamond", kind: "led", tapMana: 3 },
};

export function fastManaModel(name: string): FastManaModel | undefined {
  return FAST_MANA_TABLE[name];
}

export function isAuthoredFastMana(name: string): boolean {
  return name in FAST_MANA_TABLE;
}
