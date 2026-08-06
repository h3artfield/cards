/**
 * Commander eligibility v2 regression tests.
 * Run: npx --yes tsx scripts/test-commander-eligibility-v2.ts
 */
import assert from "node:assert/strict";
import {
  deriveCommanderClassification,
  hasExplicitCanBeCommanderText,
  isCommanderFormatLegal,
} from "../src/lib/deck-builder/commander-classification";

function classify(input: {
  name: string;
  typeLine: string;
  oracleText?: string;
  colorIdentity?: string[];
  commander?: string;
}) {
  return deriveCommanderClassification({
    name: input.name,
    typeLine: input.typeLine,
    oracleText: input.oracleText,
    colorIdentity: input.colorIdentity ?? [],
    legalities: { commander: input.commander ?? "legal" },
  });
}

function assertNotSoleCommander(
  label: string,
  c: ReturnType<typeof classify>,
  formatLegal = true,
) {
  assert.equal(c.canBeSoleCommander, false, `${label}: canBeSoleCommander`);
  assert.equal(c.canOccupyCommandZone, false, `${label}: canOccupyCommandZone`);
  if (formatLegal) {
    assert.equal(c.commanderFormatStatus, "legal", `${label}: format`);
  }
}

function assertSoleCommander(label: string, c: ReturnType<typeof classify>) {
  assert.equal(c.canBeSoleCommander, true, `${label}: canBeSoleCommander`);
  assert.equal(c.canOccupyCommandZone, true, `${label}: canOccupyCommandZone`);
  assert.equal(c.requiresCompatiblePair, false, `${label}: requiresCompatiblePair`);
}

function assertPairedParticipant(label: string, c: ReturnType<typeof classify>) {
  assert.equal(c.canBeSoleCommander, false, `${label}: canBeSoleCommander`);
  assert.equal(c.canBePartOfCommandZone, true, `${label}: canBePartOfCommandZone`);
  assert.equal(c.requiresCompatiblePair, true, `${label}: requiresCompatiblePair`);
}

// Negative regressions
assertNotSoleCommander(
  "Sculpting Steel",
  classify({
    name: "Sculpting Steel",
    typeLine: "Artifact",
    oracleText: "You may have this artifact enter as a copy of any artifact on the battlefield.",
  }),
);
assert.equal(isCommanderFormatLegal({ commander: "legal" }), true);

assertNotSoleCommander(
  "Sol Ring",
  classify({
    name: "Sol Ring",
    typeLine: "Artifact",
    oracleText: "{T}: Add {C}{C}.",
    commander: "not_legal",
  }),
  false,
);

assertNotSoleCommander(
  "Aetherspouts",
  classify({
    name: "Aetherspouts",
    typeLine: "Instant",
    oracleText: "Create three 1/1 blue Elemental creature tokens. Tap all creatures your opponents control.",
  }),
);

assertNotSoleCommander(
  "Embrace the Unknown",
  classify({
    name: "Embrace the Unknown",
    typeLine: "Sorcery",
    oracleText: "Exile the top card of your library. Until end of turn, you may play that card.",
  }),
);

assertNotSoleCommander(
  "Lórien Revealed",
  classify({
    name: "Lórien Revealed",
    typeLine: "Sorcery",
    oracleText: "Surveil 3, then draw a card.",
  }),
);

assertNotSoleCommander(
  "Command Tower",
  classify({
    name: "Command Tower",
    typeLine: "Land",
    oracleText: "{T}: Add one mana of any color in your commander's color identity.",
  }),
);

assertNotSoleCommander(
  "Legendary enchantment without permission",
  classify({
    name: "Sterling Grove",
    typeLine: "Legendary Enchantment",
    oracleText: "{1}, {T}, Sacrifice this enchantment: Search your library for an enchantment card, reveal it, put it into your hand, then shuffle.",
  }),
);

assertNotSoleCommander(
  "Jace planeswalker without permission",
  classify({
    name: "Jace, the Mind Sculptor",
    typeLine: "Legendary Planeswalker — Jace",
    oracleText: "+2: Look at the top card of target player's library.",
  }),
);

assert.equal(
  hasExplicitCanBeCommanderText(
    "Your commander is the face-up side of a planar card.",
  ),
  false,
  "generic commander mention must not qualify",
);

// Positive sole-commander regressions
assertSoleCommander(
  "Ordinary legendary creature (Atraxa)",
  classify({
    name: "Atraxa, Praetors' Voice",
    typeLine: "Legendary Creature — Phyrexian Angel Horror",
    colorIdentity: ["W", "U", "B", "G"],
  }),
);
assert.equal(
  classify({
    name: "Atraxa, Praetors' Voice",
    typeLine: "Legendary Creature — Phyrexian Angel Horror",
  }).eligibilityBasis,
  "legendary_creature",
);

assertSoleCommander(
  "Partner creature alone (Thrasios)",
  classify({
    name: "Thrasios, Triton Hero",
    typeLine: "Legendary Creature — Merfolk Wizard",
    oracleText: "Partner (You can have two commanders if both have partner.)",
  }),
);
assert.equal(
  classify({
    name: "Thrasios, Triton Hero",
    typeLine: "Legendary Creature — Merfolk Wizard",
    oracleText: "Partner (You can have two commanders if both have partner.)",
  }).pairingMechanic,
  "partner",
);

assertSoleCommander(
  "Choose a Background commander (Haunted One)",
  classify({
    name: "Haunted One",
    typeLine: "Legendary Creature — Human Noble",
    oracleText: "Choose a Background (You can have a Background as a second commander.)",
  }),
);
assert.equal(
  classify({
    name: "Haunted One",
    typeLine: "Legendary Creature — Human Noble",
    oracleText: "Choose a Background (You can have a Background as a second commander.)",
  }).pairingMechanic,
  "choose_background",
);

assertSoleCommander(
  "Doctor commander",
  classify({
    name: "The Tenth Doctor",
    typeLine: "Legendary Creature — Time Lord Doctor",
    oracleText: "Whenever you attack, draw a card.",
  }),
);

assertSoleCommander(
  "Teysa planeswalker commander",
  classify({
    name: "Teysa, Envoy of Ghosts",
    typeLine: "Legendary Planeswalker — Teysa",
    oracleText: "This card can be your commander.",
  }),
);

assertSoleCommander(
  "Nahiri artifact commander",
  classify({
    name: "Nahiri, the Lithomancer",
    typeLine: "Legendary Planeswalker — Nahiri",
    oracleText: "Nahiri, the Lithomancer can be your commander.",
  }),
);

// Paired participants — cannot be sole commander
assertPairedParticipant(
  "Background by itself",
  classify({
    name: "Abandoned Campground",
    typeLine: "Enchantment — Background",
    oracleText: "Your premonition creatures get +1/+0.",
  }),
);
assert.equal(
  classify({
    name: "Abandoned Campground",
    typeLine: "Enchantment — Background",
  }).pairingMechanic,
  "choose_background",
);

assertPairedParticipant(
  "Doctor's companion alone",
  classify({
    name: "Amy Rose",
    typeLine: "Legendary Creature — Hedgehog Soldier",
    oracleText: "Doctor's companion (You can have two commanders if the other is the Doctor.)",
  }),
);
assert.equal(
  classify({
    name: "Amy Rose",
    typeLine: "Legendary Creature — Hedgehog Soldier",
    oracleText: "Doctor's companion (You can have two commanders if the other is the Doctor.)",
  }).pairingMechanic,
  "doctors_companion",
);

// Two compatible Partner commanders — each can be sole commander
const thrasios = classify({
  name: "Thrasios, Triton Hero",
  typeLine: "Legendary Creature — Merfolk Wizard",
  oracleText: "Partner (You can have two commanders if both have partner.)",
});
const tymna = classify({
  name: "Tymna the Weaver",
  typeLine: "Legendary Creature — Human Cleric",
  oracleText: "Partner (You can have two commanders if both have partner.)",
});
assert.equal(thrasios.canBeSoleCommander, true);
assert.equal(tymna.canBeSoleCommander, true);
assert.equal(thrasios.pairingMechanic, "partner");
assert.equal(tymna.pairingMechanic, "partner");

// Incompatible partner-with pairing alone is still a sole commander
assertSoleCommander(
  "Partner with creature alone",
  classify({
    name: "Thrasios, Triton Hero",
    typeLine: "Legendary Creature — Merfolk Wizard",
    oracleText: "Partner with Kydele, Chosen of Kruphix",
  }),
);
assert.equal(
  classify({
    name: "Thrasios, Triton Hero",
    typeLine: "Legendary Creature — Merfolk Wizard",
    oracleText: "Partner with Kydele, Chosen of Kruphix",
  }).pairingMechanic,
  "partner_with",
);

const previewUnreleased = classify({
  name: "Preview Commander",
  typeLine: "Legendary Creature — Human",
  commander: "not_legal",
});
assert.equal(previewUnreleased.structurallyEligible, true);
assert.equal(previewUnreleased.canBeSoleCommander, false);
assert.equal(previewUnreleased.commanderFormatStatus, "not_legal");

console.log("commander eligibility v2 regression tests passed");
