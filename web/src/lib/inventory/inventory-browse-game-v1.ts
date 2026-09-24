import { inventoryEffectiveQuantity } from "./status";
import type { InventoryItem } from "../types";

/** Browse filter slug — one button per distinct game/product line in stock. */
export type InventoryBrowseGameKey = string;

const GAME_LABELS: Record<string, string> = {
  magic: "Magic",
  pokemon: "Pokémon",
  riftbound: "Riftbound",
  yugioh: "Yu-Gi-Oh!",
  "flesh-blood": "Flesh & Blood",
  lorcana: "Lorcana",
  "one-piece": "One Piece",
  "star-wars-unlimited": "Star Wars Unlimited",
  sports: "Sports",
  supplies: "Supplies",
  other: "Other",
};

function slugifyProductLine(line: string): string {
  return (
    line
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "other"
  );
}

/** Stable key used in browse URLs and game filter pills. */
export function inventoryBrowseGameKey(item: InventoryItem): InventoryBrowseGameKey {
  const lineRaw = item.productLine?.trim() ?? "";
  const line = lineRaw.toLowerCase();
  const name = `${item.productName ?? ""} ${item.displayName ?? ""}`.toLowerCase();

  if (line.includes("riftbound") || name.includes("riftbound")) return "riftbound";
  if (line.includes("magic")) return "magic";
  if (line.includes("pokemon") || line.includes("pokémon")) {
    if (line.includes("japan")) return "pokemon-japan";
    return "pokemon";
  }
  if (line.includes("yugioh") || line.includes("yu-gi-oh")) return "yugioh";
  if (line.includes("flesh") && line.includes("blood")) return "flesh-blood";
  if (line.includes("lorcana")) return "lorcana";
  if (line.includes("one piece")) return "one-piece";
  if (line.includes("star wars")) return "star-wars-unlimited";
  if (line.includes("sport")) return "sports";
  if (line.includes("supply") || line.includes("deck box")) return "supplies";

  if (lineRaw) return slugifyProductLine(lineRaw);

  const category = (item.category ?? "").toLowerCase();
  if (category && category !== "other") return category;
  return "other";
}

export function inventoryBrowseGameLabel(key: InventoryBrowseGameKey): string {
  if (GAME_LABELS[key]) return GAME_LABELS[key];
  return key
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function matchesInventoryBrowseGame(
  item: InventoryItem,
  game: InventoryBrowseGameKey | "all",
): boolean {
  if (game === "all") return true;
  return inventoryBrowseGameKey(item) === game;
}

/** In-stock row counts per browse game key for filter pills. */
export function inventoryBrowseGameFacets(
  items: readonly InventoryItem[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (inventoryEffectiveQuantity(item) <= 0) continue;
    const key = inventoryBrowseGameKey(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
