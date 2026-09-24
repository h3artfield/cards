import assert from "node:assert/strict";
import {
  deckListPrimaryNameV1,
  eventDeckPickerLabelV1,
  professorPlaystyleShortLabelV1,
} from "./deck-list-display-v1";
import type { CustomerDeckListEntryV1 } from "./deck-list-v1";

assert.equal(
  professorPlaystyleShortLabelV1(
    "Balanced / Flexible — strong all-around deck with synergy, interaction, resilience, and multiple paths",
  ),
  "Balanced / Flexible",
);

assert.equal(
  deckListPrimaryNameV1({
    deckName:
      "Aerith Gainsborough — Balanced / Flexible — strong all-around deck with synergy, interaction, resilience, and multiple paths",
    commanderName: "Aerith Gainsborough",
  }),
  "Aerith Gainsborough",
);

assert.equal(
  deckListPrimaryNameV1({
    deckName: "Sunday Night Golgari",
    commanderName: "Jarad, Golgari Lich Lord",
  }),
  "Sunday Night Golgari",
);

const entry: CustomerDeckListEntryV1 = {
  key: "k",
  deckId: "d",
  href: "/",
  deckName:
    "Shredder, Shadow Master — Balanced / Flexible — strong all-around deck with synergy, interaction, resilience, and multiple paths",
  commanderName: "Shredder, Shadow Master",
  origin: "professor",
  requestedBracket: 3,
  registrationBracket: 3,
  registrationBracketStale: false,
  measuredBracket: 3,
  measuredBracketStale: false,
  grade: "B+",
  playstyleLabel: "Balanced / Flexible",
  libraryCount: null,
  cosSnapshot: null,
  createdAt: "",
  updatedAt: "",
};

assert.equal(eventDeckPickerLabelV1(entry), "Shredder, Shadow Master · B3 · Balanced / Flexible");

console.log("deck-list-display-v1 selftest passed");
