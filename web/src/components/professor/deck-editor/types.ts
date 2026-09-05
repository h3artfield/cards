import type { CardSearchHitV1 } from "@/lib/professor-deck-editor/card-search-v1";
import type { DeckEditorDisplayFactsV1 } from "@/lib/professor-deck-editor/display-facts-v1";
import type { DerivedMarkerV1, MarkerFacetV1 } from "@/lib/professor-deck-editor/derived-markers-v1";
import type { DeckEditorLegalityReportV1 } from "@/lib/professor-deck-editor/legality-v1";
import type { EditableDeckCardV1, EditableDeckV1 } from "@/lib/professor-deck-editor/types-v1";

/**
 * A card as the editor sees it: what is stored, plus the two things computed
 * fresh on every read.
 *
 * Both enrichments are optional because the client applies edits with the same
 * pure reducer the server uses, and a card that reducer has just created has no
 * derived markers or display facts until the server's response comes back.
 */
export type DeckEditorCard = EditableDeckCardV1 & {
  derivedMarkers?: DerivedMarkerV1[];
  display?: DeckEditorDisplayFactsV1;
};

export type DeckEditorDeck = Omit<EditableDeckV1, "cards"> & {
  cards: DeckEditorCard[];
};

export type DeckEditorPayload = {
  deck: DeckEditorDeck;
  legality: DeckEditorLegalityReportV1;
  markerFacets: MarkerFacetV1[];
};

export type DeckEditorSearchHit = CardSearchHitV1 & { inStock: boolean };

export type DeckEditorSearchResponse = {
  query: string;
  totalMatches: number;
  hits: DeckEditorSearchHit[];
};

/** How the mainboard is broken into sections. */
export type DeckEditorGroupMode = "type" | "role" | "marker" | "mana";

export const DECK_EDITOR_GROUP_LABELS: Record<DeckEditorGroupMode, string> = {
  type: "Card type",
  role: "Professor role",
  marker: "Marker",
  mana: "Mana value",
};
