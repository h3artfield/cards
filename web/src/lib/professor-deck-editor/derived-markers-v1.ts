/**
 * Markers the system knows without being told.
 *
 * Archidekt and Moxfield both make the user tag everything by hand, so "Owned"
 * on their sites means "I remembered to tick a box", which decays the moment
 * you buy a card. We already hold the store's inventory and the customer's
 * collection, so those markers can be facts instead of chores.
 *
 * The cost of that is they must never be written to the deck document. A stored
 * "in stock" flag is wrong as soon as somebody buys the last copy, and a stored
 * Game Changer flag is wrong the next time the bracket list is revised. So they
 * are computed on read, every read, from whatever the current truth is.
 */
import {
  overlayTone,
  splitCopyOwnership,
  type CopyOwnershipSplit,
} from "../collection/owned-index";

export type { CopyOwnershipSplit };
import { normalizeDeckCardNameV1 } from "./types-v1";
import type { EditableDeckCardV1, EditableDeckV1 } from "./types-v1";

export const PROFESSOR_DECK_EDITOR_DERIVED_MARKERS_V1_VERSION =
  "professor-deck-editor-derived-markers-v1";

export type DerivedMarkerKindV1 =
  | "game_changer"
  | "in_stock"
  | "owned"
  | "need_elsewhere"
  | "professor_role"
  | "professor_package"
  | "structural"
  | "user_added";

export type DerivedMarkerV1 = {
  id: string;
  kind: DerivedMarkerKindV1;
  label: string;
  /**
   * Tooltip text, and null whenever the client can already say it.
   *
   * A role marker's explanation is the card's own `whyInThisDeck`, and a
   * package marker's is a fixed sentence around the label. Copying either into
   * the marker repeated the deck's entire rationale four or five times over and
   * pushed a single response past 64KB, so those are left for the client to
   * render from fields it already has.
   */
  detail: string | null;
};

/**
 * Current truth for the derived markers, all optional.
 *
 * Absent means "not known right now" and produces no marker, rather than a
 * marker asserting the negative. A card is not "not owned" because the
 * collection failed to load.
 */
export type DerivedMarkerFactsV1 = {
  gameChangerOracleIds?: ReadonlySet<string>;
  /** Store inventory is keyed by card name, so this is too. */
  inStockNames?: ReadonlySet<string>;
  inStockQtyByName?: ReadonlyMap<string, number>;
  ownedOracleIds?: ReadonlySet<string>;
  ownedNames?: ReadonlySet<string>;
  ownedQtyByOracleId?: ReadonlyMap<string, number>;
  ownedQtyByName?: ReadonlyMap<string, number>;
};

function titleCaseRole(role: string): string {
  return role
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function collectionKnown(facts: DerivedMarkerFactsV1): boolean {
  return Boolean(
    facts.ownedQtyByOracleId ||
      facts.ownedQtyByName ||
      facts.ownedOracleIds ||
      facts.ownedNames,
  );
}

function inventoryKnown(facts: DerivedMarkerFactsV1): boolean {
  return Boolean(facts.inStockQtyByName || facts.inStockNames);
}

function ownedQtyForCard(card: EditableDeckCardV1, facts: DerivedMarkerFactsV1): number | null {
  if (!collectionKnown(facts)) return null;
  if (facts.ownedQtyByOracleId || facts.ownedQtyByName) {
    if (card.oracleId && facts.ownedQtyByOracleId?.has(card.oracleId)) {
      return facts.ownedQtyByOracleId.get(card.oracleId) ?? 0;
    }
    return facts.ownedQtyByName?.get(normalizeDeckCardNameV1(card.name)) ?? 0;
  }
  if (card.oracleId && facts.ownedOracleIds?.has(card.oracleId)) return Number.POSITIVE_INFINITY;
  if (facts.ownedNames?.has(normalizeDeckCardNameV1(card.name))) return Number.POSITIVE_INFINITY;
  return 0;
}

function shopQtyForCard(card: EditableDeckCardV1, facts: DerivedMarkerFactsV1): number | null {
  if (!inventoryKnown(facts)) return null;
  const name = normalizeDeckCardNameV1(card.name);
  if (facts.inStockQtyByName) return facts.inStockQtyByName.get(name) ?? 0;
  return facts.inStockNames?.has(name) ? Number.POSITIVE_INFINITY : 0;
}

export function copyOwnershipForCardV1(
  card: EditableDeckCardV1,
  facts: DerivedMarkerFactsV1 = {},
): CopyOwnershipSplit | undefined {
  const ownedQty = ownedQtyForCard(card, facts);
  const shopQty = shopQtyForCard(card, facts);
  if (ownedQty === null && shopQty === null) return undefined;
  const owned = ownedQty ?? 0;
  const shop = shopQty ?? 0;
  const split = splitCopyOwnership(card.copies, owned, shop);
  if (ownedQty === null) {
    return { owned: 0, buyHere: split.buyHere, needElsewhere: 0 };
  }
  if (shopQty === null) {
    return { owned: split.owned, buyHere: 0, needElsewhere: 0 };
  }
  return split;
}

export function derivedMarkersForCardV1(
  card: EditableDeckCardV1,
  facts: DerivedMarkerFactsV1 = {},
): DerivedMarkerV1[] {
  const markers: DerivedMarkerV1[] = [];

  if (card.oracleId && facts.gameChangerOracleIds?.has(card.oracleId)) {
    markers.push({
      id: "game-changer",
      kind: "game_changer",
      label: "Game Changer",
      detail: "On the official Commander Game Changer list, which raises the deck's bracket",
    });
  }

  const ownership = copyOwnershipForCardV1(card, facts);
  if (ownership && ownership.owned > 0) {
    markers.push({
      id: "owned",
      kind: "owned",
      label: "Owned",
      detail: "Already in your binder",
    });
  }

  if (ownership && ownership.buyHere > 0) {
    markers.push({
      id: "in-stock",
      kind: "in_stock",
      label: "Buy here",
      detail: "Not in your binder, and this store has it on the shelf",
    });
  }

  if (ownership && ownership.needElsewhere > 0) {
    markers.push({
      id: "need-elsewhere",
      kind: "need_elsewhere",
      label: "Need elsewhere",
      detail: "Not in your binder, and not on this store's shelf",
    });
  }

  if (card.professor) {
    const role = card.professor.primaryRole?.trim();
    if (role) {
      markers.push({
        id: `role:${role}`,
        kind: "professor_role",
        label: titleCaseRole(role),
        detail: null,
      });
    }
    for (const pkg of card.professor.packageMembership) {
      const name = pkg.trim();
      if (!name) continue;
      markers.push({
        id: `package:${name}`,
        kind: "professor_package",
        label: titleCaseRole(name),
        detail: null,
      });
    }
    if (card.professor.structuralNecessity === "REQUIRED") {
      markers.push({
        id: "required",
        kind: "structural",
        label: "Core",
        detail: "The Professor marked this as load-bearing for the deck's plan",
      });
    }
  }

  if (card.origin === "user") {
    markers.push({
      id: "user-added",
      kind: "user_added",
      label: "Your addition",
      // Worth surfacing: it explains why this card has no Professor rationale
      // and why the grade no longer covers the whole deck.
      detail: "You added this card, so the Professor's grade does not account for it",
    });
  }

  return markers;
}

export type EditableDeckCardWithMarkersV1 = EditableDeckCardV1 & {
  derivedMarkers: DerivedMarkerV1[];
  copyOwnership?: CopyOwnershipSplit;
};

export function withDerivedMarkersV1(
  deck: EditableDeckV1,
  facts: DerivedMarkerFactsV1 = {},
): EditableDeckCardWithMarkersV1[] {
  return deck.cards.map((card) => ({
    ...card,
    derivedMarkers: derivedMarkersForCardV1(card, facts),
    copyOwnership: copyOwnershipForCardV1(card, facts),
  }));
}

export { overlayTone as overlayToneV1 };

export type MarkerFacetV1 = {
  id: string;
  label: string;
  kind: DerivedMarkerKindV1 | "user";
  /** How many mainboard cards carry it, for the filter chip count. */
  count: number;
};

/**
 * Every marker present on the deck, with counts, for building filter chips.
 *
 * Sorted by count so the useful facets surface first — a role covering twelve
 * cards is a more useful filter than one covering a single card, and a deck can
 * easily carry thirty distinct roles.
 */
export function markerFacetsV1(
  deck: EditableDeckV1,
  facts: DerivedMarkerFactsV1 = {},
): MarkerFacetV1[] {
  const counts = new Map<string, MarkerFacetV1>();

  const bump = (facet: Omit<MarkerFacetV1, "count">) => {
    const existing = counts.get(facet.id);
    if (existing) existing.count += 1;
    else counts.set(facet.id, { ...facet, count: 1 });
  };

  const userLabels = new Map(deck.markers.map((m) => [m.id, m.label]));

  for (const card of deck.cards) {
    if (card.board !== "mainboard") continue;
    for (const marker of derivedMarkersForCardV1(card, facts)) {
      bump({ id: marker.id, label: marker.label, kind: marker.kind });
    }
    for (const markerId of card.markerIds) {
      bump({ id: markerId, label: userLabels.get(markerId) ?? markerId, kind: "user" });
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}
