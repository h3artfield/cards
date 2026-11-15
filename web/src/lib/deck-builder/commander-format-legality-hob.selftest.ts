import assert from "node:assert/strict";
import {
  assessCommanderFormatLegality,
  isPlayableInCommanderFormat,
  loadCommanderFormatLegalitySnapshot,
} from "./commander-format-legality-snapshot-v1";

const snapshot = loadCommanderFormatLegalitySnapshot();
assert.ok(snapshot, "commander-format-legality-snapshot-v1.json must exist");

const hobReleasedAt = "2026-08-14";

function hobCard(input: {
  oracleId: string;
  name: string;
  typeLine: string;
}): Parameters<typeof isPlayableInCommanderFormat>[0] {
  return {
    oracleId: input.oracleId,
    canonicalName: input.name,
    typeLine: input.typeLine,
    colorIdentity: ["R"],
    legalities: { commander: "not_legal" },
    releaseInformation: {
      setCode: "hob",
      setName: "The Hobbit",
      releasedAt: hobReleasedAt,
    },
  };
}

const cases = [
  {
    oracleId: "0d420e41-43e9-41d6-832c-5a9f410c994e",
    name: "Balin, Loremaster",
    typeLine: "Legendary Creature — Dwarf Bard",
  },
  {
    oracleId: "011da9c5-aa8a-4fa0-b1f2-62b9f3760476",
    name: "Belladonna Took",
    typeLine: "Legendary Creature — Halfling Citizen",
  },
  {
    oracleId: "38503d34-f4f9-4eeb-9b1e-4fec1df921b3",
    name: "An Unexpected Party // At the Door",
    typeLine: "Enchantment // Sorcery — Adventure",
  },
];

for (const card of cases) {
  const row = hobCard(card);
  const assessment = assessCommanderFormatLegality({
    card: row,
    snapshot,
    legalityAsOf: "2026-09-10T00:00:00.000Z",
  });
  assert.equal(
    isPlayableInCommanderFormat(row),
    true,
    `${card.name} should be Commander legal after Hobbit release despite stale not_legal`,
  );
  assert.equal(assessment.currentCommanderFormatLegality, "LEGAL");
  assert.equal(assessment.staleLegalityMetadata, true);
}

const staples: Array<Parameters<typeof isPlayableInCommanderFormat>[0]> = [
  {
    oracleId: "32286688-66ff-471a-528d-7ea4f4b0b967",
    canonicalName: "Arcane Signet",
    typeLine: "Artifact",
    colorIdentity: [],
    legalities: { commander: "legal" },
  },
  {
    oracleId: "4c8e3399-2abc-4970-8f26-87c527b5a8b0",
    canonicalName: "Akroma's Will",
    typeLine: "Instant",
    colorIdentity: ["W"],
    legalities: { commander: "legal" },
  },
  {
    oracleId: "d5280ea8-4573-4061-81b2-4b278f6c8b6d",
    canonicalName: "Arid Mesa",
    typeLine: "Land",
    colorIdentity: [],
    legalities: { commander: "legal" },
  },
];

for (const card of staples) {
  assert.equal(
    isPlayableInCommanderFormat(card),
    true,
    `${card.canonicalName} must be legal in Commander decks`,
  );
}

console.log("commander-format-legality-hob: all assertions passed");
