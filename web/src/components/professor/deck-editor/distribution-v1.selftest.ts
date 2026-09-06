import assert from "node:assert";
import {
  buildDeckDistributionV1,
  deckDistributionChartableV1,
} from "./distribution-v1";
import type { DeckEditorCard } from "./types";

/**
 * The distribution strip, checked against the cases that made it worth
 * scoping in the first place: a real 99-card deck produces 8 mana-value
 * groups but 55 Professor-role groups, and one card can sit in several
 * functional-role groups at once.
 */

function card(name: string, copies = 1): DeckEditorCard {
  return {
    cardKey: name.toLowerCase(),
    oracleId: null,
    name,
    board: "mainboard",
    copies,
    isLand: false,
    isBasicLand: false,
    origin: "professor",
    markerIds: [],
  } as unknown as DeckEditorCard;
}

function groups(entries: Array<[string, number]>) {
  return entries.map(
    ([label, count]) =>
      [label, Array.from({ length: count }, (_, i) => card(`${label}-${i}`))] as const,
  );
}

// Which axes draw at all.
assert.equal(deckDistributionChartableV1("mana"), true);
assert.equal(deckDistributionChartableV1("color"), true);
assert.equal(deckDistributionChartableV1("semanticRole"), true);
// The noisy ones stay quiet: 55 bars of height one is not a chart.
assert.equal(deckDistributionChartableV1("role"), false);
assert.equal(deckDistributionChartableV1("package"), false);
assert.equal(deckDistributionChartableV1("subtype"), false);
assert.equal(deckDistributionChartableV1("tag"), false);
assert.equal(deckDistributionChartableV1("none"), false);
assert.equal(buildDeckDistributionV1("role", groups([["Removal", 4]])), null);

// An ordered axis keeps the order it was given, so the curve reads as a curve
// rather than as a ranking.
const curve = buildDeckDistributionV1(
  "mana",
  groups([
    ["Lands", 35],
    ["Mana value 1", 6],
    ["Mana value 2", 12],
    ["Mana value 3", 9],
  ]),
);
assert.ok(curve);
assert.equal(curve.ordered, true);
assert.deepEqual(
  curve.bars.map((bar) => bar.label),
  ["Lands", "Mana value 1", "Mana value 2", "Mana value 3"],
);
assert.equal(curve.measures, "cards");
assert.equal(curve.total, 62);
assert.equal(curve.foldedGroups, 0);

// An unordered axis ranks by size and folds its tail, keeping the total honest.
const ranked = buildDeckDistributionV1(
  "semanticRole",
  groups([
    ["Aardvarks", 1],
    ["Card advantage", 11],
    ["Interaction", 10],
    ["Ramp", 9],
    ["Evasion", 5],
    ["Protection", 4],
    ["Recursion", 3],
    ["Tutors", 3],
    ["Sacrifice", 2],
    ["Wheels", 2],
    ["Storm", 1],
  ]),
);
assert.ok(ranked);
assert.equal(ranked.ordered, false);
// Cards sit in several functional roles at once, so these are entries.
assert.equal(ranked.measures, "entries");
assert.equal(ranked.bars.length, 9, "eight ranked bars plus Other");
assert.equal(ranked.bars[0].label, "Card advantage");
const other = ranked.bars.at(-1);
assert.equal(other?.label, "Other");
assert.equal(other?.key, "__other__");
// Aardvarks, Wheels and Storm: folded, not dropped.
assert.equal(other?.count, 4);
assert.equal(ranked.foldedGroups, 3);
assert.equal(
  ranked.bars.reduce((sum, bar) => sum + bar.count, 0),
  ranked.total,
  "the bars must account for every entry, or the chart misreports the deck",
);

// A short unordered axis needs no fold and no Other bar.
const short = buildDeckDistributionV1(
  "oracleAction",
  groups([
    ["Draw a card", 7],
    ["Destroy target", 4],
  ]),
);
assert.ok(short);
assert.equal(short.bars.length, 2);
assert.equal(short.foldedGroups, 0);
assert.ok(!short.bars.some((bar) => bar.label === "Other"));

// Copies count, not rows. A basic land base is one row carrying seventeen
// cards, and a curve that draws it as one card lies about the mana base.
const basics = buildDeckDistributionV1("mana", [
  ["Lands", [card("Forest", 17), card("Yavimaya")]],
  ["Mana value 2", [card("Ambush Viper")]],
] as Array<readonly [string, DeckEditorCard[]]>);
assert.ok(basics);
assert.equal(basics.bars[0].count, 18, "seventeen Forests plus one Yavimaya");
assert.equal(basics.total, 19);

// Empty groups never become zero-height bars, and an empty board draws nothing.
const sparse = buildDeckDistributionV1(
  "color",
  groups([
    ["Green", 40],
    ["Colourless", 0],
  ]),
);
assert.ok(sparse);
assert.equal(sparse.bars.length, 1);
assert.equal(buildDeckDistributionV1("color", []), null);
assert.equal(buildDeckDistributionV1("color", groups([["Green", 0]])), null);

console.log("distribution-v1 selftest passed");
