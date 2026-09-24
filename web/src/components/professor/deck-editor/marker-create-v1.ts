import { deckMarkerIdV1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckMarkerScopeV1, DeckMarkerV1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckEditOpV1 } from "@/lib/professor-deck-editor/ops-v1";

/**
 * Naming a tag and putting it on a card.
 *
 * Two things in the editor create a tag — the Mark menu on a row and the
 * "New tag" bucket in the grab tray — and both mean exactly the same act by
 * it, so both plan it here rather than each assembling its own operations. A
 * second creation route is how the two drift into disagreeing about what a
 * duplicate name means, or about which marker the assignment half names.
 *
 * The plan is a create and an assign together, so naming a tag "Need to buy"
 * and putting it on the card is one save and one undo rather than two. The id
 * is derived rather than returned by the server, which is why it has to be
 * computed with the same function the reducer uses.
 */
export type MarkerCreatePlanV1 = {
  /** The tag the card ends up carrying, whether it was made now or already existed. */
  markerId: string;
  /** The tag's display label — the existing one's when a name was reused, not what was typed. */
  label: string;
  /** True when the name landed on a tag the deck already had. */
  reused: boolean;
  /** Empty when there is nothing to do; see the two cases below. */
  ops: DeckEditOpV1[];
  /** Puts the deck back exactly as it was, so the toast can offer an Undo. */
  undo: DeckEditOpV1[];
};

export function planMarkerCreateV1(args: {
  label: string;
  /** The scope to create in, if the name does not already belong to a tag. */
  scope: DeckMarkerScopeV1;
  cardKey: string;
  cardMarkerIds: readonly string[];
  markers: readonly DeckMarkerV1[];
  /**
   * Whether a tag of the *other* scope with the same name counts as the same
   * tag. True where the person naming it was not offered the choice — the grab
   * tray has no room for a scope picker, and typing "Proxy" there when a
   * proxy tag already follows the card into every deck plainly means that one,
   * not a second tag with the same label. False where the scope was picked
   * deliberately, as it is in the Mark menu, since there the two are different
   * things and the customer said which they wanted.
   */
  matchAcrossScopes?: boolean;
}): MarkerCreatePlanV1 {
  const label = args.label.trim();
  const id = deckMarkerIdV1(label, args.scope);

  // `deckMarkerIdV1` throws away everything that is not a letter or a digit, so
  // a name of nothing but punctuation slugs down to the empty id the reducer
  // rejects. Treated here as no name at all — the same as an empty box — rather
  // than as an error worth putting in front of someone.
  if (!label || id === deckMarkerIdV1("", args.scope)) {
    return { markerId: id, label, reused: false, ops: [], undo: [] };
  }

  /**
   * A name is slugified into the id, so "Yo Yo", "yo yo" and "Yo-Yo" are one
   * tag while "yoyo" is another. Landing on a tag that exists reuses it instead
   * of failing: someone typing a name they have used before means the tag they
   * already have, and a second tag carrying the same label would be
   * indistinguishable from the first everywhere the editor shows it.
   */
  const otherScope: DeckMarkerScopeV1 = args.scope === "deck" ? "global" : "deck";
  const existing =
    args.markers.find((marker) => marker.id === id) ??
    (args.matchAcrossScopes
      ? args.markers.find((marker) => marker.id === deckMarkerIdV1(label, otherScope))
      : undefined);
  const markerId = existing?.id ?? id;

  // Already on the card: the deck is in the state that was asked for, so
  // nothing is sent. `assignMarker` would be rejected, and an error about a tag
  // the card visibly carries helps nobody.
  if (args.cardMarkerIds.includes(markerId)) {
    return { markerId, label: existing?.label ?? label, reused: true, ops: [], undo: [] };
  }

  const assign: DeckEditOpV1 = { op: "assignMarker", cardKey: args.cardKey, markerId };

  if (existing) {
    return {
      markerId,
      label: existing.label,
      reused: true,
      ops: [assign],
      undo: [{ op: "unassignMarker", cardKey: args.cardKey, markerId }],
    };
  }

  return {
    markerId,
    label,
    reused: false,
    ops: [{ op: "createMarker", label, scope: args.scope }, assign],
    // Deleting a tag clears every assignment of it, so one operation undoes
    // both halves of the batch.
    undo: [{ op: "deleteMarker", markerId }],
  };
}
