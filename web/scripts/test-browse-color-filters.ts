import assert from "node:assert/strict";
import {
  matchesSelectedColorFilters,
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

console.log("\nAll browse color filter tests passed.");
