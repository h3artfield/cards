import assert from "node:assert/strict";
import {
  MAGIC_TYPE_LINE_GROUPS,
  parseMagicTypeLineSelection,
  toggleMagicTypeLineSelection,
} from "./magic-type-line-options";

const labels = MAGIC_TYPE_LINE_GROUPS.map((group) => group.label);
assert.deepEqual(labels, [
  "Types",
  "Supertypes",
  "Artifact types",
  "Enchantment types",
  "Land types",
  "Spell types",
  "Battle types",
  "Planeswalker types",
  "Creature types",
  "Planar types",
]);
assert.ok(MAGIC_TYPE_LINE_GROUPS.find((group) => group.id === "creature")!.options.length > 300);
assert.ok(MAGIC_TYPE_LINE_GROUPS.find((group) => group.id === "planeswalker")!.options.includes("Ajani"));
assert.ok(MAGIC_TYPE_LINE_GROUPS.find((group) => group.id === "planar")!.options.includes("New Phyrexia"));

assert.deepEqual(parseMagicTypeLineSelection("Legendary Creature Elf"), [
  "Legendary",
  "Creature",
  "Elf",
]);
assert.deepEqual(parseMagicTypeLineSelection("Time Lord"), ["Time Lord"]);
assert.deepEqual(parseMagicTypeLineSelection("New Phyrexia"), ["New Phyrexia"]);
assert.equal(
  toggleMagicTypeLineSelection("Creature", "Elf"),
  "Creature Elf",
);
assert.equal(toggleMagicTypeLineSelection("Creature Elf", "Elf"), "Creature");
assert.equal(toggleMagicTypeLineSelection("", "Time Lord"), "Time Lord");

console.log("magic type line options: ok");
