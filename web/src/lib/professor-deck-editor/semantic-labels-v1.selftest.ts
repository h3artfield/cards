import assert from "node:assert";
import {
  derivedRoleHintV1,
  derivedRoleLabelV1,
  pickDistinctRoleHeadlinesV1,
} from "./semantic-labels-v1";

assert.equal(derivedRoleLabelV1("mana_generation"), "Mana sources");
assert.equal(derivedRoleLabelV1("ramp"), "Ramp");

const bars = [
  { label: "Mana generation", count: 42 },
  { label: "Ramp", count: 42 },
  { label: "Card advantage", count: 29 },
  { label: "Interaction", count: 18 },
  { label: "Token generation", count: 17 },
  { label: "Card draw", count: 14 },
];

assert.deepEqual(
  pickDistinctRoleHeadlinesV1(bars, (bar) => bar.label, 5).map((bar) => bar.label),
  ["Ramp", "Card advantage", "Interaction", "Token generation", "Card draw"],
  "Ramp and mana generation must not both occupy the five headline slots",
);

assert.match(derivedRoleHintV1("Ramp"), /one land per turn/i);
assert.match(derivedRoleHintV1("Mana base"), /Tap-for-one/);

console.log("semantic-labels-v1 selftest: all assertions passed");
