import {
  SOL_DIRECTED_DECK_DISPLAY_ORDER_V1,
  SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS,
} from "@/lib/deck-synthesis/professor-sol-directed-deck-display-v1-1-1";
import {
  derivedRoleLabelV1,
  oracleActionLabelV1,
} from "@/lib/professor-deck-editor/semantic-labels-v1";
import type { DeckEditorCard } from "./types";

/**
 * How the deck is drawn, how it is divided into sections, and how cards order
 * inside them. These are three independent axes on purpose: the most-requested
 * thing Moxfield still does not do is sort by colour while grouping by
 * something else, because there the two are entangled.
 */

export type DeckEditorViewModeV1 = "text" | "condensed" | "grid" | "stacks" | "spoiler";

export type DeckEditorGroupModeV1 =
  | "type"
  | "typeTag"
  | "subtype"
  | "role"
  | "package"
  | "semanticRole"
  | "oracleAction"
  | "tag"
  | "mana"
  | "color"
  | "price"
  | "none";

export type DeckEditorSortModeV1 = "name" | "mana" | "color" | "type" | "price";

export const DECK_EDITOR_VIEW_LABELS_V1: Record<DeckEditorViewModeV1, string> = {
  text: "Text",
  condensed: "Condensed text",
  grid: "Visual grid",
  stacks: "Visual stacks",
  spoiler: "Visual spoiler",
};

export const DECK_EDITOR_GROUP_LABELS_V1: Record<DeckEditorGroupModeV1, string> = {
  type: "Card type",
  typeTag: "Type & tag",
  subtype: "Subtype",
  role: "Professor role",
  package: "Professor package",
  semanticRole: "What it does",
  oracleAction: "Oracle action",
  tag: "Tag",
  mana: "Mana value",
  color: "Colour",
  price: "Price",
  none: "No grouping",
};

export const DECK_EDITOR_SORT_LABELS_V1: Record<DeckEditorSortModeV1, string> = {
  name: "Name",
  mana: "Mana value",
  color: "Colour",
  type: "Card type",
  price: "Price",
};

const UNRECOGNISED_GROUP_V1 = "Not in the catalog";
export const UNTAGGED_PREFIX_V1 = "Untagged ";

export type GroupingContextV1 = {
  /** Marker id -> display label, for the tag groupings. */
  markerLabels: Map<string, string>;
  /** Lowercased card name -> price, for the price grouping and sort. */
  priceByName?: Map<string, number>;
};

function titleCaseV1(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (character) => character.toUpperCase());
}

function typeLabelV1(card: DeckEditorCard): string {
  const category = card.display?.category;
  return category ? SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS[category] : UNRECOGNISED_GROUP_V1;
}

/**
 * Every tag on the card, not just the primary one. A card tagged both "Needs
 * buying" and "Ramp" belongs in both columns; collapsing to one would quietly
 * hide it from a list the player is using to shop.
 */
function tagLabelsV1(card: DeckEditorCard, markerLabels: Map<string, string>): string[] {
  const labels = card.markerIds
    .map((id) => markerLabels.get(id) ?? null)
    .filter((label): label is string => Boolean(label));
  return [...new Set(labels)];
}

const COLOUR_NAMES_V1: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};
const COLOUR_ORDER_V1 = ["W", "U", "B", "R", "G"];

/** The colours in a mana cost string like `{2}{G}{G}`. */
export function coloursInManaCostV1(manaCost: string | null | undefined): string[] {
  if (!manaCost) return [];
  const found = new Set<string>();
  for (const symbol of manaCost.toUpperCase().matchAll(/\{([^}]+)\}/g)) {
    for (const letter of symbol[1].split(/[\/\s]/)) {
      if (COLOUR_ORDER_V1.includes(letter)) found.add(letter);
    }
  }
  return COLOUR_ORDER_V1.filter((c) => found.has(c));
}

function colourLabelV1(card: DeckEditorCard): string {
  if (card.isLand) return "Lands";
  const colours = coloursInManaCostV1(card.display?.manaCost);
  if (colours.length === 0) return "Colourless";
  if (colours.length > 1) return "Multicolour";
  return COLOUR_NAMES_V1[colours[0]] ?? "Colourless";
}

/** The bit of a type line after the dash, e.g. "Creature — Snake" -> ["Snake"]. */
export function subtypesInTypeLineV1(typeLine: string | null | undefined): string[] {
  if (!typeLine) return [];
  // Type lines use an em dash; double-faced cards join faces with //.
  const face = typeLine.split("//")[0];
  const dash = face.indexOf("—") >= 0 ? "—" : face.indexOf("-") >= 0 ? "-" : null;
  if (!dash) return [];
  const tail = face.slice(face.indexOf(dash) + 1).trim();
  return tail.split(/\s+/).filter(Boolean);
}

function priceBandV1(price: number | undefined): string {
  if (price == null) return "Unpriced";
  if (price < 1) return "Under $1";
  if (price < 5) return "$1 – $5";
  if (price < 20) return "$5 – $20";
  if (price < 50) return "$20 – $50";
  return "$50+";
}

/**
 * The sections a card belongs to. Returns several keys when a grouping can
 * legitimately place one card in more than one column.
 */
export function groupKeysForV1(
  card: DeckEditorCard,
  mode: DeckEditorGroupModeV1,
  ctx: GroupingContextV1,
): string[] {
  switch (mode) {
    case "none":
      return ["All cards"];
    case "type":
      return [typeLabelV1(card)];
    case "typeTag": {
      // Moxfield's default: tags take over as the columns, and anything
      // untagged falls back to its type so nothing silently disappears.
      const tags = tagLabelsV1(card, ctx.markerLabels);
      return tags.length ? tags : [UNTAGGED_PREFIX_V1 + typeLabelV1(card)];
    }
    case "tag": {
      const tags = tagLabelsV1(card, ctx.markerLabels);
      return tags.length ? tags : ["Untagged"];
    }
    case "subtype": {
      const subtypes = subtypesInTypeLineV1(card.display?.typeLine);
      return subtypes.length ? subtypes : [typeLabelV1(card)];
    }
    case "role": {
      if (card.professor?.primaryRole?.trim()) return [titleCaseV1(card.professor.primaryRole)];
      if (card.isLand) return ["Mana base"];
      return [card.origin === "user" ? "Your additions" : "Unassigned"];
    }
    case "package": {
      const packages = card.professor?.packageMembership ?? [];
      if (packages.length) return [...new Set(packages.map(titleCaseV1))];
      if (card.isLand) return ["Mana base"];
      return [card.origin === "user" ? "Your additions" : "No package"];
    }
    case "semanticRole": {
      // Derived mechanically from oracle text for the whole catalogue, so these
      // hold for cards the player added as well as the ones the Professor
      // picked. A card that does three things appears under all three, which is
      // the honest answer for a card like a removal spell that also draws.
      //
      // `mana_generation` is the oracle twin of Ramp — every tap-for-mana land
      // gets it — so it is dropped here. Lands that only tap for one sit in
      // Mana base; lands that actually accelerate stay in Ramp.
      const roles = (card.semantic?.derivedRoles ?? [])
        .filter((role) => role !== "mana_generation")
        .map(derivedRoleLabelV1);
      if (card.isLand) {
        if (card.display?.manaAcceleration) {
          return roles.includes("Ramp") ? roles : ["Ramp", ...roles];
        }
        return ["Mana base"];
      }
      if (roles.length) return roles;
      return ["No derived role"];
    }
    case "oracleAction": {
      const actions = card.semantic?.topActions ?? [];
      if (actions.length) return actions.map(oracleActionLabelV1);
      if (card.isLand) return ["Mana base"];
      return ["No parsed action"];
    }
    case "mana": {
      if (card.isLand) return ["Lands"];
      const manaValue = card.display?.manaValue;
      if (manaValue == null) return ["Unknown cost"];
      return [manaValue >= 7 ? "Mana value 7+" : `Mana value ${manaValue}`];
    }
    case "color":
      return [colourLabelV1(card)];
    case "price":
      return [priceBandV1(ctx.priceByName?.get(card.name.toLowerCase()))];
  }
}

const COLOUR_SECTION_ORDER_V1 = [
  "White",
  "Blue",
  "Black",
  "Red",
  "Green",
  "Multicolour",
  "Colourless",
  "Lands",
];

const PRICE_SECTION_ORDER_V1 = ["$50+", "$20 – $50", "$5 – $20", "$1 – $5", "Under $1", "Unpriced"];

/**
 * Section order. Type follows the printed-card convention every deck site uses;
 * mana and price follow their own scales; the rest sort by size, largest first,
 * because under those groupings the big sections are the ones describing the
 * deck. Untagged fallbacks always sink below real sections.
 */
export function sortGroupsV1(
  mode: DeckEditorGroupModeV1,
  groups: Array<[string, DeckEditorCard[]]>,
): Array<[string, DeckEditorCard[]]> {
  const byFixedOrder = (order: string[]) => (a: [string, unknown], b: [string, unknown]) => {
    const ai = order.indexOf(a[0]);
    const bi = order.indexOf(b[0]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a[0].localeCompare(b[0]);
  };

  if (mode === "type") {
    const order = SOL_DIRECTED_DECK_DISPLAY_ORDER_V1.map(
      (category) => SOL_DIRECTED_DECK_DISPLAY_SECTION_LABELS[category],
    );
    return groups.sort(byFixedOrder(order));
  }
  if (mode === "color") return groups.sort(byFixedOrder(COLOUR_SECTION_ORDER_V1));
  if (mode === "price") return groups.sort(byFixedOrder(PRICE_SECTION_ORDER_V1));
  if (mode === "mana") {
    const rank = (label: string) => {
      if (label === "Lands") return -1;
      if (label === "Unknown cost") return 100;
      if (label === "Mana value 7+") return 7;
      return Number(label.replace(/\D+/g, "")) || 0;
    };
    return groups.sort((a, b) => rank(a[0]) - rank(b[0]));
  }
  return groups.sort((a, b) => {
    const aFallback = a[0].startsWith(UNTAGGED_PREFIX_V1) || a[0] === "Untagged";
    const bFallback = b[0].startsWith(UNTAGGED_PREFIX_V1) || b[0] === "Untagged";
    if (aFallback !== bFallback) return aFallback ? 1 : -1;
    return b[1].length - a[1].length || a[0].localeCompare(b[0]);
  });
}

/** Card order inside a section, independent of how sections were chosen. */
export function sortCardsV1(
  cards: DeckEditorCard[],
  mode: DeckEditorSortModeV1,
  ctx: GroupingContextV1,
): DeckEditorCard[] {
  const typeOrder = new Map(
    SOL_DIRECTED_DECK_DISPLAY_ORDER_V1.map((category, index) => [category, index]),
  );
  const colourRank = (card: DeckEditorCard) => {
    if (card.isLand) return 9;
    const colours = coloursInManaCostV1(card.display?.manaCost);
    if (colours.length === 0) return 8;
    if (colours.length > 1) return 7;
    return COLOUR_ORDER_V1.indexOf(colours[0]);
  };
  const price = (card: DeckEditorCard) => ctx.priceByName?.get(card.name.toLowerCase()) ?? -1;

  const byName = (a: DeckEditorCard, b: DeckEditorCard) => a.name.localeCompare(b.name);

  return [...cards].sort((a, b) => {
    switch (mode) {
      case "name":
        return byName(a, b);
      case "mana":
        return (a.display?.manaValue ?? 99) - (b.display?.manaValue ?? 99) || byName(a, b);
      case "color":
        return colourRank(a) - colourRank(b) || byName(a, b);
      case "type":
        return (
          (a.display?.category ? (typeOrder.get(a.display.category) ?? 99) : 99) -
            (b.display?.category ? (typeOrder.get(b.display.category) ?? 99) : 99) || byName(a, b)
        );
      case "price":
        return price(b) - price(a) || byName(a, b);
    }
  });
}
