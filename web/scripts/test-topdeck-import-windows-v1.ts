#!/usr/bin/env npx tsx
/** Tests for TopDeck import window planning — no API calls. */
import assert from "node:assert/strict";
import {
  importConfigKey,
  logicalMonthWindows,
  subdivideIntoWeekWindows,
  subdivideByDays,
} from "../src/lib/commander-strategy/topdeck/window-planner";

function testLogicalMonth(start: string, expectedLabel: string): void {
  const windows = logicalMonthWindows({
    startAt: new Date(`${start}T00:00:00.000Z`),
    months: 1,
  });
  assert.equal(windows.length, 1, `${start} should produce one window`);
  assert.equal(windows[0].label, expectedLabel, `${start} label mismatch`);
  assert.equal(windows[0].start.toISOString().slice(0, 10), `${expectedLabel}-01`);
}

testLogicalMonth("2026-06-01", "2026-06");
testLogicalMonth("2026-07-01", "2026-07");
testLogicalMonth("2026-08-01", "2026-08");

const juneOnly = logicalMonthWindows({ startAt: new Date("2026-06-01T00:00:00.000Z"), months: 1 });
assert.deepEqual(
  juneOnly.map((w) => w.label),
  ["2026-06"],
  "--start 2026-06-01 --months 1 => June only",
);

const julyOnly = logicalMonthWindows({ startAt: new Date("2026-07-01T00:00:00.000Z"), months: 1 });
assert.deepEqual(julyOnly.map((w) => w.label), ["2026-07"]);

const augustOnly = logicalMonthWindows({ startAt: new Date("2026-08-01T00:00:00.000Z"), months: 1 });
assert.deepEqual(augustOnly.map((w) => w.label), ["2026-08"]);

const keyA = importConfigKey({ startAt: new Date("2026-06-01T00:00:00.000Z"), months: 1 });
const keyB = importConfigKey({ startAt: new Date("2026-07-01T00:00:00.000Z"), months: 1 });
assert.notEqual(keyA, keyB, "Different --start values must produce different config keys");

const juneWeeks = subdivideIntoWeekWindows(juneOnly[0]);
assert.ok(juneWeeks.length >= 4, "June should subdivide into multiple week windows");
assert.ok(juneWeeks.length <= 6, "June week split should be reasonable");

const oneDay = subdivideByDays(juneOnly[0], 1);
assert.ok(oneDay.length >= 28 && oneDay.length <= 31, "Daily split covers June");

console.log("topdeck-import-window tests: OK");
