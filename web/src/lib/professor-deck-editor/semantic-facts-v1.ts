/**
 * Server-only: what the oracle-text semantics know about each card in a deck.
 *
 * The editor already groups by the Professor's own role strings, but those only
 * exist on cards the Professor chose and are written by a model. These roles
 * are derived mechanically from parsed oracle text for the whole catalogue, so
 * they cover cards the player added themselves and mean the same thing on every
 * card. Both are worth having: the Professor's role says why a card is in *this*
 * deck, the derived roles say what the card actually does.
 *
 * Reads the semantic map points cache, which is shared with the semantic-map
 * routes and the Professor build path. The neighbours artifact is deliberately
 * not touched here — it is an order of magnitude larger and this runs on an
 * ordinary page load.
 */
import {
  getSemanticMapPoint,
  semanticMapArtifactsAvailable,
} from "@/lib/semantic-visualization/artifact-loader";
import type { EditableDeckCardV1 } from "./types-v1";

export type DeckEditorSemanticFactsV1 = {
  /** Mechanically derived functional roles, e.g. `removal`, `ramp`. */
  derivedRoles: string[];
  /** k-means cluster over the oracle-text feature space, or null if unmapped. */
  clusterId: number | null;
  /** Primitive oracle actions the card performs, most significant first. */
  topActions: string[];
};

// The role vocabulary lives in ./semantic-labels-v1 so the browser can use it
// without pulling in this module's filesystem reads.
export { DERIVED_ROLE_LABELS_V1, derivedRoleLabelV1 } from "./semantic-labels-v1";

/**
 * Attach semantic facts to each card.
 *
 * Degrades to nulls rather than throwing when the artifacts are not present, so
 * a deployment without the semantic map still serves a working editor with the
 * semantic groupings simply offering nothing.
 */
export function withSemanticFactsV1<T extends EditableDeckCardV1>(
  cards: readonly T[],
): Array<T & { semantic: DeckEditorSemanticFactsV1 }> {
  const empty: DeckEditorSemanticFactsV1 = {
    derivedRoles: [],
    clusterId: null,
    topActions: [],
  };
  try {
    if (!semanticMapArtifactsAvailable()) {
      return cards.map((card) => ({ ...card, semantic: empty }));
    }
    return cards.map((card) => {
      const point = card.oracleId ? getSemanticMapPoint(card.oracleId) : undefined;
      if (!point) return { ...card, semantic: empty };
      return {
        ...card,
        semantic: {
          derivedRoles: point.derivedRoles ?? [],
          clusterId: typeof point.clusterId === "number" ? point.clusterId : null,
          topActions: (point.topActions ?? []).slice(0, 6),
        },
      };
    });
  } catch (err) {
    console.warn("[deck-editor] semantic facts unavailable:", err);
    return cards.map((card) => ({ ...card, semantic: empty }));
  }
}
