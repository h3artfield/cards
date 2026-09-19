import type { CardSearchHitV1 } from "@/lib/professor-deck-editor/card-search-v1";
import type { DeckEditorDisplayFactsV1 } from "@/lib/professor-deck-editor/display-facts-v1";
import type {
  CopyOwnershipSplit,
  DerivedMarkerV1,
  MarkerFacetV1,
} from "@/lib/professor-deck-editor/derived-markers-v1";
import type { DeckEditorLegalityReportV1 } from "@/lib/professor-deck-editor/legality-v1";
import type { DeckEditorSemanticFactsV1 } from "@/lib/professor-deck-editor/semantic-facts-v1";
import type { SynergyLinkV1 } from "@/lib/professor-deck-editor/synergy-v1";
import type { EditableDeckCardV1, EditableDeckV1 } from "@/lib/professor-deck-editor/types-v1";

/**
 * A card as the editor sees it: what is stored, plus the things computed fresh
 * on every read.
 *
 * All three enrichments are optional because the client applies edits with the
 * same pure reducer the server uses, and a card that reducer has just created
 * has no derived markers, display facts or semantics until the server's
 * response comes back.
 */
export type DeckEditorCard = EditableDeckCardV1 & {
  derivedMarkers?: DerivedMarkerV1[];
  copyOwnership?: CopyOwnershipSplit;
  display?: DeckEditorDisplayFactsV1;
  semantic?: DeckEditorSemanticFactsV1;
};

/** A card's synergy partners, fetched lazily the first time one is asked for. */
export type DeckEditorSynergy = {
  linksByCardKey: Record<string, SynergyLinkV1[]>;
  comboCount: number;
  semanticUnavailable: boolean;
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

// View, grouping and sorting live in ./grouping-v1, which owns the section
// keys and the orders as one unit.
