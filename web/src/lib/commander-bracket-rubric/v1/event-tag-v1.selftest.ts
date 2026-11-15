import assert from "node:assert/strict";
import { fieldBracketV1, tagEventFromTitleV1 } from "./event-tag-v1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

console.log("event-tag-v1 selftest");

check("cEDH titles declare bracket 5", () => {
  assert.deepEqual(tagEventFromTitleV1("Krypton Weekly CEDH"), { kind: "cedh", declaredBracket: 5 });
  assert.deepEqual(tagEventFromTitleV1("cEDH 1k"), { kind: "cedh", declaredBracket: 5 });
  assert.deepEqual(tagEventFromTitleV1("Competitive Commander"), { kind: "cedh", declaredBracket: 5 });
});

check("bracket labels are taken from the title", () => {
  assert.deepEqual(tagEventFromTitleV1("Liga LANDFALL Mayo Bracket 3, fecha 1"), {
    kind: "bracket_labeled",
    declaredBracket: 3,
  });
  assert.deepEqual(tagEventFromTitleV1("Friday Night B2"), {
    kind: "bracket_labeled",
    declaredBracket: 2,
  });
});

check("precon and casual are not treated as cEDH", () => {
  assert.deepEqual(tagEventFromTitleV1("Clash of the Precons"), { kind: "precon", declaredBracket: 1 });
  assert.deepEqual(tagEventFromTitleV1("Torneo casual EDH"), { kind: "casual", declaredBracket: null });
});

check("a plain weekly EDH is unknown, not B4", () => {
  assert.deepEqual(tagEventFromTitleV1("Monday Night Commander"), { kind: "unknown", declaredBracket: null });
});

check("a measured Optimized list in a cEDH event is the B5 field", () => {
  assert.equal(fieldBracketV1({ measured: 4, tag: { kind: "cedh", declaredBracket: 5 } }), 5);
  assert.equal(fieldBracketV1({ measured: 3, tag: { kind: "cedh", declaredBracket: 5 } }), 3);
});

console.log(`\nevent-tag-v1 selftest passed (${n} checks)`);
