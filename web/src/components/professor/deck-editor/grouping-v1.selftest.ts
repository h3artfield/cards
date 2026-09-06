/**
 * Tests for deck editor grouping, sorting and colour parsing.
 *
 * Written against the behaviours that are easy to get subtly wrong and that
 * competitors are visibly asked about: a multi-tagged card quietly appearing in
 * only one column, untagged cards vanishing instead of falling back to their
 * type, and curve sections ordering as text so "Mana value 10" sorts before
 * "Mana value 2".
 */
import assert from "node:assert/strict";
import {
  coloursInManaCostV1,
  groupKeysForV1,
  sortCardsV1,
  sortGroupsV1,
  subtypesInTypeLineV1,
  UNTAGGED_PREFIX_V1,
} from "./grouping-v1";
import type { GroupingContextV1 } from "./grouping-v1";
import type { DeckEditorCard } from "./types";

function card(over: Partial<DeckEditorCard> & { name: string }): DeckEditorCard {
  return {
    cardKey: over.name.toLowerCase(),
    oracleId: over.name.toLowerCase(),
    copies: 1,
    board: "mainboard",
    isLand: false,
    isBasicLand: false,
    origin: "professor",
    professor: null,
    markerIds: [],
    primaryMarkerId: null,
    ...over,
  } as DeckEditorCard;
}

const ctx: GroupingContextV1 = {
  markerLabels: new Map([
    ["d:need-to-buy", "Need to buy"],
    ["d:ramp", "Ramp"],
  ]),
  priceByName: new Map([["sol ring", 2.5]]),
};

// --- multi-tag placement -----------------------------------------------------
{
  const twoTags = card({
    name: "Sol Ring",
    markerIds: ["d:need-to-buy", "d:ramp"],
    display: { typeLine: "Artifact", manaCost: "{1}", manaValue: 1, category: "artifact" },
  });
  const keys = groupKeysForV1(twoTags, "tag", ctx);
  assert.deepEqual(keys.sort(), ["Need to buy", "Ramp"], "a card with two tags belongs to both");

  const viaTypeTag = groupKeysForV1(twoTags, "typeTag", ctx);
  assert.deepEqual(viaTypeTag.sort(), ["Need to buy", "Ramp"], "type & tag prefers real tags");
}

// --- untagged falls back rather than disappearing ----------------------------
{
  const untagged = card({
    name: "Llanowar Elves",
    display: { typeLine: "Creature — Elf Druid", manaCost: "{G}", manaValue: 1, category: "creature" },
  });
  assert.deepEqual(
    groupKeysForV1(untagged, "typeTag", ctx),
    [UNTAGGED_PREFIX_V1 + "Creatures"],
    "untagged cards fall back to their type, not into nothing",
  );
  assert.deepEqual(groupKeysForV1(untagged, "tag", ctx), ["Untagged"]);
}

// --- subtype parsing ---------------------------------------------------------
{
  assert.deepEqual(subtypesInTypeLineV1("Creature — Elf Druid"), ["Elf", "Druid"]);
  assert.deepEqual(subtypesInTypeLineV1("Artifact"), [], "no dash means no subtype");
  assert.deepEqual(
    subtypesInTypeLineV1("Creature — Human Wizard // Instant"),
    ["Human", "Wizard"],
    "double-faced cards group on their front face",
  );
}

// --- colour parsing ----------------------------------------------------------
{
  assert.deepEqual(coloursInManaCostV1("{2}{G}{G}"), ["G"], "repeats collapse to one colour");
  assert.deepEqual(coloursInManaCostV1("{W}{U}{B}{R}{G}"), ["W", "U", "B", "R", "G"]);
  assert.deepEqual(coloursInManaCostV1("{2/W}"), ["W"], "hybrid pips count");
  assert.deepEqual(coloursInManaCostV1(null), []);
  assert.deepEqual(coloursInManaCostV1("{3}"), [], "generic costs are colourless");

  const gold = card({
    name: "Winding Constrictor",
    display: { typeLine: "Creature — Snake", manaCost: "{B}{G}", manaValue: 2, category: "creature" },
  });
  assert.deepEqual(groupKeysForV1(gold, "color", ctx), ["Multicolour"]);

  const land = card({ name: "Overgrown Tomb", isLand: true });
  assert.deepEqual(groupKeysForV1(land, "color", ctx), ["Lands"], "lands are their own colour section");
}

// --- curve sections order numerically ----------------------------------------
{
  const groups: Array<[string, DeckEditorCard[]]> = [
    ["Mana value 10", []],
    ["Mana value 2", []],
    ["Lands", []],
    ["Mana value 7+", []],
  ];
  assert.deepEqual(
    sortGroupsV1("mana", groups).map(([label]) => label),
    ["Lands", "Mana value 2", "Mana value 7+", "Mana value 10"],
    "curve sections sort numerically, not as text",
  );
}

// --- untagged sections sink below real ones ----------------------------------
{
  const groups: Array<[string, DeckEditorCard[]]> = [
    [UNTAGGED_PREFIX_V1 + "Lands", [card({ name: "a" }), card({ name: "b" }), card({ name: "c" })]],
    ["Ramp", [card({ name: "d" })]],
  ];
  assert.deepEqual(
    sortGroupsV1("typeTag", groups).map(([label]) => label),
    ["Ramp", UNTAGGED_PREFIX_V1 + "Lands"],
    "a big untagged pile still sorts below a small real tag",
  );
}

// --- sorting is independent of grouping --------------------------------------
{
  const cards = [
    card({ name: "Zealous Conscripts", display: { typeLine: "Creature", manaCost: "{4}{R}", manaValue: 5, category: "creature" } }),
    card({ name: "Arbor Elf", display: { typeLine: "Creature", manaCost: "{G}", manaValue: 1, category: "creature" } }),
    card({ name: "Brainstorm", display: { typeLine: "Instant", manaCost: "{U}", manaValue: 1, category: "instant" } }),
  ];
  assert.deepEqual(
    sortCardsV1(cards, "color", ctx).map((c) => c.name),
    ["Brainstorm", "Zealous Conscripts", "Arbor Elf"],
    "colour sort runs WUBRG regardless of the active grouping",
  );
  assert.deepEqual(
    sortCardsV1(cards, "mana", ctx).map((c) => c.name),
    ["Arbor Elf", "Brainstorm", "Zealous Conscripts"],
  );
  assert.deepEqual(sortCardsV1(cards, "name", ctx)[0].name, "Arbor Elf");
}

// --- no grouping is a single section -----------------------------------------
{
  assert.deepEqual(groupKeysForV1(card({ name: "Anything" }), "none", ctx), ["All cards"]);
}

console.log("grouping-v1 selftest: all assertions passed");
