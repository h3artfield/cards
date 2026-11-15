/**
 * Where a single lives in the shop, from its TCG market price and (Magic) its
 * colour identity and card type:
 *
 *   $6 and up      cabinets 1-4 for Magic by colour; 5-1 Pokémon, 5-2 Riftbound
 *   60¢ to $6      binders: Magic by colour, one Pokémon and one Riftbound binder
 *   under 60¢      bulk
 *
 * Each cabinet has a top shelf (-1) and a bottom shelf (-2).
 */
export const CABINET_MIN_V1 = 6;
export const BULK_BELOW_V1 = 0.6;

const MAGIC_CABINET: Record<string, string> = {
  W: "1-1",
  U: "1-2",
  B: "2-1",
  R: "2-2",
  G: "3-1",
  multi: "3-2",
  colorless: "4-1",
  land: "4-2",
};

const MAGIC_BINDER: Record<string, string> = {
  W: "Binder W",
  U: "Binder U",
  B: "Binder B",
  R: "Binder R",
  G: "Binder G",
  guild: "Binder Guilds",
  wedge: "Binder Wedges",
  colorless: "Binder Colorless",
  land: "Binder Lands",
};

/** Every cabinet shelf and binder, in the order they sit in the shop. */
export const SHELF_CABINETS_V1 = ["1-1", "1-2", "2-1", "2-2", "3-1", "3-2", "4-1", "4-2", "5-1", "5-2"] as const;
export const SHELF_BINDERS_V1 = [
  ...Object.values(MAGIC_BINDER),
  "Pokémon Binder",
  "Riftbound Binder",
] as const;

const GROUP_CONTENTS: Record<string, { label: string; swatch: string }> = {
  W: { label: "White", swatch: "#f5f0d6" },
  U: { label: "Blue", swatch: "#3b82f6" },
  B: { label: "Black", swatch: "#1f2937" },
  R: { label: "Red", swatch: "#ef4444" },
  G: { label: "Green", swatch: "#22c55e" },
  multi: { label: "Multicolor", swatch: "linear-gradient(135deg,#f5f0d6,#3b82f6,#1f2937,#ef4444,#22c55e)" },
  guild: { label: "Two-color (guilds)", swatch: "linear-gradient(135deg,#3b82f6 50%,#ef4444 50%)" },
  wedge: { label: "Three+ colors", swatch: "linear-gradient(135deg,#22c55e,#f5f0d6,#1f2937)" },
  colorless: { label: "Colorless & artifacts", swatch: "#a8a29e" },
  land: { label: "Lands", swatch: "#a16207" },
};

/** What each cabinet shelf and binder holds, for reports and signage. */
export const SHELF_CONTENTS_V1: Record<string, { label: string; swatch: string }> = {
  ...Object.fromEntries(Object.entries(MAGIC_CABINET).map(([group, spot]) => [spot, GROUP_CONTENTS[group]!])),
  ...Object.fromEntries(Object.entries(MAGIC_BINDER).map(([group, spot]) => [spot, GROUP_CONTENTS[group]!])),
  "5-1": { label: "Pokémon", swatch: "#facc15" },
  "5-2": { label: "Riftbound", swatch: "#8b5cf6" },
  "Pokémon Binder": { label: "Pokémon", swatch: "#facc15" },
  "Riftbound Binder": { label: "Riftbound", swatch: "#8b5cf6" },
};

export type ShelfLocationCardV1 = {
  productLine: string;
  market: number | null | undefined;
  /** Magic only: the card's colours (WUBRG); unset for colourless and for double-faced cards. */
  colors?: string[] | null;
  colorIdentity?: string[] | null;
  typeLine?: string | null;
};

type Game = "magic" | "pokemon" | "riftbound";

function gameOf(productLine: string): Game | null {
  const line = productLine.toLowerCase();
  if (line.includes("magic")) return "magic";
  if (line.includes("pokemon") || line.includes("pokémon")) return "pokemon";
  if (line.includes("riftbound")) return "riftbound";
  return null;
}

/**
 * "land", a single colour letter, or how many colours a multicoloured card has.
 * Colours are the card's colour identity (every mana symbol in its cost and
 * rules text, plus its colour indicator), so Dimir Signet files as blue-black.
 */
function magicGroup(card: ShelfLocationCardV1): { kind: "land" | "colorless" | "mono"; color?: string } | { kind: "multi"; count: number } | null {
  const typeLine = card.typeLine?.trim();
  if (!typeLine) return null;
  const front = typeLine.split("//")[0]!;
  if (/\bland\b/i.test(front)) return { kind: "land" };
  const identity = card.colorIdentity ?? card.colors ?? [];
  const colors = [...new Set(identity.filter((c) => /^[WUBRG]$/.test(c)))];
  if (!colors.length) return { kind: "colorless" };
  if (colors.length === 1) return { kind: "mono", color: colors[0] };
  return { kind: "multi", count: colors.length };
}

/** The location for `card`, or null when its price (or, for Magic, its colours) is not known yet. */
export function shelfLocationV1(card: ShelfLocationCardV1): string | null {
  const game = gameOf(card.productLine);
  const market = card.market;
  if (!game || market == null || !Number.isFinite(market) || market <= 0) return null;
  if (market < BULK_BELOW_V1) return "Bulk";
  const cabinet = market >= CABINET_MIN_V1;
  if (game === "pokemon") return cabinet ? "5-1" : "Pokémon Binder";
  if (game === "riftbound") return cabinet ? "5-2" : "Riftbound Binder";

  const group = magicGroup(card);
  if (!group) return null;
  if (group.kind === "multi") {
    return cabinet ? MAGIC_CABINET.multi! : group.count === 2 ? MAGIC_BINDER.guild! : MAGIC_BINDER.wedge!;
  }
  const key = group.kind === "mono" ? group.color! : group.kind;
  return (cabinet ? MAGIC_CABINET : MAGIC_BINDER)[key] ?? null;
}
