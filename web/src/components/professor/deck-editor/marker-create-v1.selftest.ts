import assert from "node:assert";
import { applyDeckEditOpsV1 } from "@/lib/professor-deck-editor/ops-v1";
import type { EditableDeckV1 } from "@/lib/professor-deck-editor/types-v1";
import type { DeckMarkerV1 } from "@/lib/professor-deck-editor/types-v1";
import { planMarkerCreateV1 } from "./marker-create-v1";

/**
 * Naming a tag, checked against the cases the "New tag" bucket in the grab
 * tray can be walked into: the same name typed twice, a name that only differs
 * by punctuation, a name that collides with a board, and a blank one.
 *
 * The plans are also run through the real reducer, because the whole point of
 * reusing an existing tag is that nothing is rejected — a plan the reducer
 * turns down would surface as an error toast the customer cannot act on.
 */

const NEED_TO_BUY: DeckMarkerV1 = { id: "d:need-to-buy", label: "Need to Buy", scope: "deck" };
const PROXY: DeckMarkerV1 = { id: "g:proxy", label: "Proxy", scope: "global" };

function plan(label: string, over: {
  markers?: DeckMarkerV1[];
  cardMarkerIds?: string[];
  scope?: "deck" | "global";
  matchAcrossScopes?: boolean;
} = {}) {
  return planMarkerCreateV1({
    label,
    scope: over.scope ?? "deck",
    cardKey: "o:sol-ring",
    cardMarkerIds: over.cardMarkerIds ?? [],
    markers: over.markers ?? [],
    matchAcrossScopes: over.matchAcrossScopes ?? true,
  });
}

/** A deck just big enough for the reducer to accept operations against it. */
function deck(markers: DeckMarkerV1[], markerIds: string[] = []): EditableDeckV1 {
  return {
    markers,
    revision: 3,
    baselineCards: [],
    cards: [
      {
        cardKey: "o:sol-ring",
        oracleId: "sol-ring",
        name: "Sol Ring",
        copies: 1,
        board: "mainboard",
        isLand: false,
        isBasicLand: false,
        origin: "professor",
        professor: null,
        markerIds,
        primaryMarkerId: markerIds[0] ?? null,
      },
    ],
  } as unknown as EditableDeckV1;
}

// A name nobody has used: made and applied in one batch, undone by one.
const fresh = plan("Testing");
assert.equal(fresh.reused, false);
assert.equal(fresh.markerId, "d:testing");
assert.equal(fresh.label, "Testing");
assert.deepEqual(fresh.ops, [
  { op: "createMarker", label: "Testing", scope: "deck" },
  { op: "assignMarker", cardKey: "o:sol-ring", markerId: "d:testing" },
]);
assert.deepEqual(fresh.undo, [{ op: "deleteMarker", markerId: "d:testing" }]);

// The rule this whole module exists for: a name that slugs onto a tag the deck
// already has applies that tag rather than making a second one.
const again = plan("need to buy", { markers: [NEED_TO_BUY] });
assert.equal(again.reused, true);
assert.equal(again.markerId, NEED_TO_BUY.id);
assert.deepEqual(again.ops, [
  { op: "assignMarker", cardKey: "o:sol-ring", markerId: "d:need-to-buy" },
]);
// The toast names the tag as it is written on the deck, not as it was typed.
assert.equal(again.label, "Need to Buy");
assert.deepEqual(again.undo, [
  { op: "unassignMarker", cardKey: "o:sol-ring", markerId: "d:need-to-buy" },
]);

// Punctuation and spacing are slugged away, so these are the same tag.
for (const typed of ["Need-To-Buy", "  need   to buy  ", "NEED TO BUY!"]) {
  assert.equal(plan(typed, { markers: [NEED_TO_BUY] }).markerId, NEED_TO_BUY.id, typed);
}

// But the slug is not a fuzzy match: taking the spaces out makes a new tag,
// because that is a different id and the reducer would store it as one.
assert.equal(plan("needtobuy", { markers: [NEED_TO_BUY] }).reused, false);

// A tag named after a board is a tag. Nothing in this path can move a card, so
// "cut" is only ever a label — the tray keeps them apart by prefixing the
// marker bucket ids, not by refusing the name.
const cut = plan("cut");
assert.equal(cut.markerId, "d:cut");
assert.equal(cut.ops[0]?.op, "createMarker");

// Scope. The tray has no picker, so it takes the scope of a tag that already
// carries the name — otherwise a global "Proxy" and a deck "Proxy" would sit in
// the column as two identical buckets.
assert.equal(plan("Proxy", { markers: [PROXY] }).markerId, "g:proxy");
// The Mark menu does have a picker, so a scope chosen there is honoured.
assert.equal(
  plan("Proxy", { markers: [PROXY], matchAcrossScopes: false }).markerId,
  "d:proxy",
);

// Blank, whitespace-only and punctuation-only names are all cancellations: no
// operations at all, so the card is left exactly as it was.
for (const empty of ["", "   ", "\t\n", "---", "!!!"]) {
  const nothing = plan(empty);
  assert.deepEqual(nothing.ops, [], JSON.stringify(empty));
  assert.deepEqual(nothing.undo, []);
}

// A tag the card already carries is a no-op rather than a rejection.
const owned = plan("Need to buy", { markers: [NEED_TO_BUY], cardMarkerIds: [NEED_TO_BUY.id] });
assert.deepEqual(owned.ops, []);
assert.equal(owned.reused, true);

// Every plan the module emits has to be one the reducer accepts, in order.
for (const [name, made, before] of [
  ["a new tag", fresh, deck([])],
  ["a reused tag", again, deck([NEED_TO_BUY])],
] as const) {
  const outcome = applyDeckEditOpsV1({ deck: before, ops: made.ops, now: "2026-01-01T00:00:00Z" });
  assert.deepEqual(outcome.rejected, [], `${name} was rejected: ${JSON.stringify(outcome.rejected)}`);
  assert.equal(outcome.applied, made.ops.length, name);
  const card = outcome.deck.cards[0];
  assert.ok(card.markerIds.includes(made.markerId), name);
  assert.equal(outcome.deck.markers.length, 1, `${name} must leave exactly one tag of that name`);

  // And the undo has to put it back, or the toast's Undo button lies.
  const reverted = applyDeckEditOpsV1({
    deck: outcome.deck,
    ops: made.undo,
    now: "2026-01-01T00:00:01Z",
  });
  assert.deepEqual(reverted.rejected, [], `${name} undo was rejected`);
  assert.ok(!reverted.deck.cards[0].markerIds.includes(made.markerId), `${name} undo`);
  assert.equal(reverted.deck.cards[0].primaryMarkerId, null, `${name} undo clears the primary`);
}

console.log("marker-create-v1 selftest passed");
