/** Infer foil vs nonfoil from inventory text — we do not store a finish field. */

export type InventoryFinishKind =
  | "nonfoil"
  | "foil"
  | "foil_etched"
  | "surge_foil"
  | "galaxy_foil"
  | "textured_foil"
  | "rainbow_foil"
  | "cold_foil"
  | "gold_foil"
  | "holofoil"
  | "reverse_holo";

export type InventoryFinishFilter = "all" | "foil" | "nonfoil";

export type InventoryFinishSource = {
  productName?: string;
  title?: string;
  displayName?: string;
  rarity?: string;
  /** TCGplayer CSV Condition — often "Near Mint Foil", "Near Mint Rainbow Foil". */
  tcgplayerCondition?: string;
  condition?: string;
};

const FINISH_LABELS: Record<InventoryFinishKind, string | null> = {
  nonfoil: null,
  foil: "Foil",
  foil_etched: "Etched",
  surge_foil: "Surge Foil",
  galaxy_foil: "Galaxy Foil",
  textured_foil: "Textured Foil",
  rainbow_foil: "Rainbow Foil",
  cold_foil: "Cold Foil",
  gold_foil: "Gold Foil",
  holofoil: "Holofoil",
  reverse_holo: "Reverse Holo",
};

/** More specific treatments first. Do not match the MTG card named Foil. */
const FINISH_MARKERS: Array<{ kind: Exclude<InventoryFinishKind, "nonfoil">; re: RegExp }> = [
  { kind: "reverse_holo", re: /\breverse\s+holo(?:foil)?\b/i },
  { kind: "holofoil", re: /\bholofoil\b/i },
  { kind: "surge_foil", re: /\bsurge\s+foil\b/i },
  { kind: "galaxy_foil", re: /\bgalaxy\s+foil\b/i },
  { kind: "textured_foil", re: /\btextured\s+foil\b/i },
  { kind: "rainbow_foil", re: /\brainbow\s+foil\b/i },
  { kind: "cold_foil", re: /\bcold\s+foil\b/i },
  { kind: "gold_foil", re: /\bgold\s+foil\b/i },
  { kind: "foil_etched", re: /\b(?:foil[\s-]?etched|etched[\s-]?foil)\b/i },
  { kind: "foil", re: /\(\s*(?:traditional\s+)?foil\s*\)/i },
  { kind: "foil", re: /\bfoil\s+edition\b/i },
  { kind: "foil", re: /(?:^|[\s|])[-–—]\s*foil\s*$/i },
  { kind: "foil", re: /\balternate\s+art\s+foil\b/i },
  { kind: "foil", re: /\b(?:near mint|lightly played|moderately played|heavily played|damaged)\s+foil\b/i },
];

function finishHaystack(item: InventoryFinishSource): string {
  return [
    item.productName,
    item.title,
    item.displayName,
    item.rarity,
    item.tcgplayerCondition,
    item.condition,
  ]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" | ");
}

function conditionText(item: InventoryFinishSource): string {
  return [item.tcgplayerCondition, item.condition]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" | ");
}

function finishFromText(text: string): InventoryFinishKind | null {
  if (!text) return null;
  if (/\bnon[\s-]?foil\b/i.test(text)) return "nonfoil";
  for (const marker of FINISH_MARKERS) {
    if (marker.re.test(text)) return marker.kind;
  }
  return null;
}

export function inferInventoryFinish(item: InventoryFinishSource): InventoryFinishKind {
  const condition = conditionText(item);
  const fromCondition = finishFromText(condition);
  if (fromCondition) return fromCondition;
  // TCGplayer Condition is "Near Mint Foil" / "LP Rainbow Foil" — "foil" here
  // is the finish, never a card name.
  if (condition && /\bfoil\b/i.test(condition)) return "foil";

  const fromName = finishFromText(finishHaystack(item));
  if (fromName) return fromName;
  return "nonfoil";
}

export function inventoryFinishIsFoil(kind: InventoryFinishKind): boolean {
  return kind !== "nonfoil";
}

export function inventoryFinishBadgeLabel(kind: InventoryFinishKind): string | null {
  return FINISH_LABELS[kind];
}

export function inventoryItemMatchesFinishFilter(
  item: InventoryFinishSource,
  filter: InventoryFinishFilter | undefined,
): boolean {
  if (!filter || filter === "all") return true;
  const foil = inventoryFinishIsFoil(inferInventoryFinish(item));
  return filter === "foil" ? foil : !foil;
}

export function parseInventoryFinishFilter(
  raw: string | null | undefined,
): InventoryFinishFilter {
  if (raw === "foil" || raw === "nonfoil") return raw;
  return "all";
}
