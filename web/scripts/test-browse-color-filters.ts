import assert from "node:assert/strict";
import {
  matchesColorMode,
  matchesCommanderIdentity,
  matchesExactManaCost,
  matchesRulesText,
  matchesSelectedColorFilters,
  matchesTypeLineQuery,
  parseBrowseColorParams,
} from "../src/lib/deck-builder/store-inventory-browse";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
}

test("mono red: only [R]", () => {
  assert.equal(matchesSelectedColorFilters(["R"], ["R"], "all"), true);
  assert.equal(matchesSelectedColorFilters(["R", "G"], ["R"], "all"), false);
  assert.equal(matchesSelectedColorFilters(["R", "B"], ["R"], "all"), false);
});

test("red + black: must include both", () => {
  assert.equal(matchesSelectedColorFilters(["R", "B"], ["R", "B"], "all"), true);
  assert.equal(matchesSelectedColorFilters(["R", "B", "G"], ["R", "B"], "all"), true);
  assert.equal(matchesSelectedColorFilters(["R"], ["R", "B"], "all"), false);
  assert.equal(matchesSelectedColorFilters(["B"], ["R", "B"], "all"), false);
});

test("toggle off red leaves mono black", () => {
  assert.equal(matchesSelectedColorFilters(["B"], ["B"], "all"), true);
  assert.equal(matchesSelectedColorFilters(["R", "B"], ["B"], "all"), false);
});

test("colorless alone", () => {
  assert.equal(matchesSelectedColorFilters([], ["C"], "all"), true);
  assert.equal(matchesSelectedColorFilters(["R"], ["C"], "all"), false);
});

test("parse colors query param", () => {
  assert.deepEqual(parseBrowseColorParams({ colors: "R,B" }), {
    selectedColors: ["R", "B"],
    colorCount: "all",
  });
  assert.deepEqual(parseBrowseColorParams({ color: "R" }), {
    selectedColors: ["R"],
    colorCount: "all",
  });
  assert.deepEqual(parseBrowseColorParams({ colorCount: "two" }), {
    selectedColors: [],
    colorCount: "two",
  });
});

test("color modes", () => {
  assert.equal(
    matchesColorMode(["R"], ["R"], "exact"),
    true,
  );
  assert.equal(matchesColorMode(["R", "G"], ["R"], "exact"), false);
  assert.equal(matchesColorMode(["R", "G"], ["R"], "including"), true);
  assert.equal(matchesColorMode(["R"], ["R", "G"], "including"), false);
  assert.equal(matchesColorMode(["R"], ["R", "G"], "atmost"), true);
  assert.equal(matchesColorMode(["R", "U"], ["R", "G"], "atmost"), false);
  assert.equal(matchesCommanderIdentity(["G"], ["G", "U"]), true);
  assert.equal(matchesCommanderIdentity(["R"], ["G", "U"]), false);
  assert.equal(matchesCommanderIdentity([], ["C"]), true);
  assert.equal(matchesCommanderIdentity(["G"], ["C"]), false);
  assert.equal(matchesRulesText("Draw a card.", "draw card"), true);
  assert.equal(matchesTypeLineQuery("Legendary Creature — Elf", "creature", false), true);
  assert.equal(matchesTypeLineQuery("Legendary Creature — Elf", "creat", false), false);
  assert.equal(matchesTypeLineQuery("Legendary Creature — Elf", "creat", true), true);
  assert.equal(matchesTypeLineQuery("Legendary Creature — Elf Wizard", "creature elf", false), true);
  assert.equal(matchesTypeLineQuery("Legendary Creature — Elf Wizard", "creature elf", true), true);
  assert.equal(matchesTypeLineQuery("Legendary Creature — Elf", "creature goblin", false), false);
  assert.equal(matchesExactManaCost("{W}{W}", "{W}{W}"), true);
  assert.equal(matchesExactManaCost("{1}{W}{W}", "{W}{W}"), false);
});
