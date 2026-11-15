import assert from "node:assert/strict";
import { cardMatchesSemanticFilter } from "../src/lib/deck-builder/store-inventory-semantic";
import {
  matchesExactManaCost,
  matchesRulesText,
  matchesTypeLineQuery,
} from "../src/lib/deck-builder/store-inventory-browse";
import {
  clerkQueryToBrowseFilterPatch,
  clerkSearchBaseSemantic,
} from "../src/lib/store-inventory/clerk-tools/clerk-browse-sync";
import { parseClerkSearchBaseParam } from "../src/lib/store-inventory/inventory-browse-filter-params";

const draw = clerkQueryToBrowseFilterPatch({ userQuestion: "draw one card" });
assert.equal(draw.q, "");
assert.deepEqual(draw.baseSemantic?.oracleTagsAny, ["draw"]);
assert.ok(draw.baseSemantic?.oracleTextAny?.includes("draw a card"));
assert.equal(draw.baseSemantic?.oracleTextAny?.includes("draw two cards"), true);
assert.equal(draw.selectedColors.length, 0);
assert.equal(draw.baseSemantic?.colorIdentityExact, undefined);

const named = clerkQueryToBrowseFilterPatch({ userQuestion: "sol ring" });
assert.equal(named.baseSemantic, undefined);
assert.match(named.q ?? "", /sol ring/i);

const blueDraw = clerkQueryToBrowseFilterPatch({
  userQuestion: "blue cards that draw one card",
});
assert.deepEqual(blueDraw.selectedColors, ["U"]);
assert.ok(blueDraw.baseSemantic?.oracleTagsAny?.includes("draw"));
assert.equal(blueDraw.baseSemantic && "colorIdentityExact" in blueDraw.baseSemantic, false);

const roundTrip = parseClerkSearchBaseParam(JSON.stringify(draw.baseSemantic));
assert.deepEqual(roundTrip?.oracleTagsAny, ["draw"]);

const dirty = parseClerkSearchBaseParam(
  JSON.stringify({
    oracleTagsAny: ["draw", 5, ""],
    dropMe: ["nope"],
    cmcMin: 3,
    colorIdentityExact: ["U"],
  }),
);
assert.deepEqual(dirty?.oracleTagsAny, ["draw"]);
assert.equal(dirty && "cmcMin" in dirty, false);
assert.equal(dirty && "dropMe" in dirty, false);
assert.equal(dirty && "colorIdentityExact" in dirty, false);
assert.equal(parseClerkSearchBaseParam("{"), undefined);
assert.equal(parseClerkSearchBaseParam(null), undefined);

const drawCard = {
  oracleTags: ["card-draw"],
  oracleText: "Draw a card.",
  typeLine: "Instant",
  manaCost: "{U}",
};
const bolt = {
  oracleTags: [] as string[],
  oracleText: "Lightning Bolt deals 3 damage to any target.",
  typeLine: "Instant",
  manaCost: "{R}",
};
assert.equal(cardMatchesSemanticFilter(drawCard, draw.baseSemantic), true);
assert.equal(cardMatchesSemanticFilter(bolt, draw.baseSemantic), false);
assert.equal(matchesTypeLineQuery(drawCard.typeLine, "instant", false), true);
assert.equal(matchesTypeLineQuery(bolt.typeLine, "creature", false), false);
assert.equal(matchesExactManaCost(drawCard.manaCost, "{U}"), true);
assert.equal(matchesExactManaCost(bolt.manaCost, "{U}"), false);
assert.equal(matchesRulesText("Draw a card. Then discard a card.", "discard"), true);
assert.equal(matchesRulesText(drawCard.oracleText, "discard"), false);

const merged = clerkSearchBaseSemantic(
  { oracleTagsAny: ["draw"] },
  { oracleTextAny: ["draw a card"], colorIdentityExact: ["U"], cmcMin: 3 },
);
assert.deepEqual(merged?.oracleTagsAny, ["draw"]);
assert.deepEqual(merged?.oracleTextAny, ["draw a card"]);
assert.equal(merged && "colorIdentityExact" in merged, false);
assert.equal(merged && "cmcMin" in merged, false);

console.log("clerk search base: ok");
