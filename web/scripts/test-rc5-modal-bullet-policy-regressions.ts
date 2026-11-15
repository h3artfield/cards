/**
 * RC5 Pass 3 — modal bullet option routing (vh14-0133, vh14-0137).
 * Run: cd web && npx tsx scripts/test-rc5-modal-bullet-policy-regressions.ts
 */
import assert from "node:assert/strict";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { isTokenCopyCreation } from "../src/lib/deck-builder/golden-catalog/oracle-action-structural-blocks";

function accepted(text: string, oracleId = "test-rc5-modal") {
  return parseOracleSemanticsRC3({ oracleId, oracleText: text }).actions.filter(
    (a) => a.reviewStatus === "accepted",
  );
}

// vh14-0133 — Ezio tutor bullet recovered; conditional shuffle reminder suppressed as search
{
  const text =
    "Choose one or both —\n• Return target creature to its owner's hand.\n• Target player searches their library and/or graveyard for a card named Ezio, Blade of Vengeance, reveals it, and puts it into their hand. If they search their library this way, they shuffle.";
  const actions = accepted(text, "72075231-e3b3-46cc-b994-2d95b24cf904");
  assert.ok(
    actions.some(
      (a) =>
        a.actionType === "search_library" &&
        /searches their library and\/or graveyard for/i.test(a.provenance.actionSpan.text),
    ),
    "Ezio search_library from modal bullet 2",
  );
  assert.ok(
    actions.some(
      (a) =>
        a.actionType === "return_to_hand" &&
        /Return target creature to its owner's hand/i.test(a.provenance.actionSpan.text),
    ),
    "opt-1 return_to_hand preserved",
  );
  assert.equal(
    actions.filter((a) => /search their library this way/i.test(a.provenance.actionSpan.text)).length,
    0,
    "conditional shuffle reminder must not emit spurious search_library",
  );
}

// vh14-0137 — destroy bullet recovered; sibling damage + optional tutor chain preserved
{
  const text =
    "Choose one or both —\n• Avengers Disassembled deals 3 damage to each creature.\n• Destroy target land. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.";
  const actions = accepted(text, "34493cf5-7586-48ef-806d-57273b2ab034");
  assert.ok(
    actions.some((a) => a.actionType === "destroy" && /Destroy target land/i.test(a.provenance.actionSpan.text)),
  );
  assert.ok(actions.some((a) => a.actionType === "deal_damage" && /deals 3 damage to each creature/i.test(a.provenance.actionSpan.text)));
  assert.ok(actions.some((a) => a.actionType === "search_library" && /search their library for/i.test(a.provenance.actionSpan.text)));
  assert.ok(actions.some((a) => a.actionType === "put_onto_battlefield"));
  assert.ok(actions.some((a) => a.actionType === "shuffle_library"));
}

// Contrast — genuine non-modal search still works
{
  const text = "Search your library for a basic land card, put it onto the battlefield, then shuffle.";
  assert.ok(accepted(text).some((a) => a.actionType === "search_library"));
}

// Ashling policy contrast — token copy is create_token, not primitive copy
{
  const ev = "Create a token that's a copy of target Elemental you control.";
  assert.ok(isTokenCopyCreation(ev));
}

// Queza policy contrast — draw in trigger header is L1 reference, not L2
{
  const text = "Vigilance\nWhenever you draw a card, target opponent loses 1 life and you gain 1 life.";
  const commaIdx = text.indexOf(", ");
  const drawIdx = text.indexOf("draw a card");
  assert.ok(drawIdx >= 0 && drawIdx < commaIdx, "draw in Whenever-you-draw header is trigger reference");
  const actions = accepted(text, "ee30f36e336b10ad33c3f320c0b71396c588233947b9a75a17744667660ab81c");
  assert.equal(actions.filter((a) => a.actionType === "draw").length, 0);
  assert.ok(actions.some((a) => a.actionType === "lose_life"));
}

console.log("test-rc5-modal-bullet-policy-regressions: all passed");
