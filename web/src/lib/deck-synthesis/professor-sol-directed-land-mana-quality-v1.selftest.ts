/**
 * Tests the land mana-quality classifier against the real land base from the
 * Mikaeus build (5cdc0d1e), which the Head Professor graded C- and called
 * "the deck's decisive flaw".
 *
 * Oracle text below is verbatim RC8 text, so the parser is pinned to the data
 * it will actually see rather than to a paraphrase.
 */
import assert from "node:assert/strict";
import {
  classifyLandManaQualityV1,
  isLandUnusableInIdentityV1,
  landManaQualityRankV1,
  summarizeLandBaseManaV1,
} from "./professor-sol-directed-land-mana-quality-v1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

const MONO_BLACK = ["B"];

const ORACLE: Record<string, string> = {
  Swamp: "({T}: Add {B}.)",
  Forest: "({T}: Add {G}.)",
  "Bant Panorama":
    "{T}: Add {C}. {1}, {T}, Sacrifice this land: Search your library for a basic Forest, Plains, or Island card, put it onto the battlefield tapped, then shuffle.",
  "Prismatic Vista":
    "{T}, Pay 1 life, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield, then shuffle.",
  "Marsh Flats":
    "{T}, Pay 1 life, Sacrifice this land: Search your library for a Plains or Swamp card, put it onto the battlefield, then shuffle.",
  "Cabal Coffers": "{2}, {T}: Add {B} for each Swamp you control.",
  "Cabal Stronghold": "{T}: Add {C}. {3}, {T}: Add {B} for each basic Swamp you control.",
  "Phyrexian Tower": "{T}: Add {C}. {T}, Sacrifice a creature: Add {B}{B}.",
  "Nykthos, Shrine to Nyx":
    "{T}: Add {C}. {2}, {T}: Choose a color. Add an amount of mana of that color equal to your devotion to that color. (Your devotion to a color is the number of mana symbols of that color in the mana costs of permanents you control.)",
  "Bojuka Bog": "This land enters tapped. When this land enters, exile target player's graveyard. {T}: Add {B}.",
  "Vault of Whispers": "{T}: Add {B}.",
  "Castle Locthwain":
    "This land enters tapped unless you control a Swamp. {T}: Add {B}. {1}{B}{B}, {T}: Draw a card, then you lose life equal to the number of cards in your hand.",
  "Command Tower": "{T}: Add one mana of any color in your commander's color identity.",
  "Urborg, Tomb of Yawgmoth": "Each land is a Swamp in addition to its other land types.",
  "Ancient Tomb": "{T}: Add {C}{C}. This land deals 2 damage to you.",
  Wasteland: "{T}: Add {C}. {T}, Sacrifice this land: Destroy target nonbasic land.",
  "Foundry of the Consuls":
    "{T}: Add {C}. {5}, {T}, Sacrifice this land: Create two 1/1 colorless Thopter artifact creature tokens with flying.",
  "Interplanar Beacon":
    "Whenever you cast a planeswalker spell, you gain 1 life. {T}: Add {C}. {1}, {T}: Add two mana of different colors. Spend this mana only to cast planeswalker spells.",
  "Lotus Vale":
    "If this land would enter, sacrifice two untapped lands instead. If you do, put this land onto the battlefield. If you don't, put it into its owner's graveyard. {T}: Add three mana of any one color.",
  "Hall of Oracles":
    "{T}: Add {C}. {1}, {T}: Add one mana of any color. {T}: Put a +1/+1 counter on target creature. Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn.",
  "Escape Tunnel":
    "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.",
};

function profile(name: string, identity = MONO_BLACK) {
  const oracleText = ORACLE[name];
  assert.ok(oracleText != null, `missing oracle text fixture for ${name}`);
  return classifyLandManaQualityV1({ name, oracleText, commanderColorIdentity: identity });
}

console.log("land mana quality");

check("Bant Panorama is unusable in mono-black", () => {
  // Its only ability fetches Forest, Plains, or Island — none legal in a
  // mono-black deck. This is the land the old pool could not reject.
  const p = profile("Bant Panorama");
  assert.equal(p.role, "DEAD_IN_IDENTITY");
  assert.equal(p.hasOnlyOffIdentityFetch, true);
  assert.equal(p.countsAsIdentitySource, false);
  assert.equal(isLandUnusableInIdentityV1(p), true);
  assert.equal(landManaQualityRankV1(p), 0);
});

check("Bant Panorama is fine in a deck that can use it", () => {
  const p = profile("Bant Panorama", ["G", "W", "U"]);
  assert.equal(p.role, "IDENTITY_FETCH");
  assert.equal(isLandUnusableInIdentityV1(p), false);
});

check("a basic in identity is an untapped unconditional source", () => {
  const p = profile("Swamp");
  assert.equal(p.role, "IDENTITY_SOURCE_UNTAPPED");
  assert.deepEqual(p.untappedIdentityColors, ["B"]);
});

check("an off-identity basic is dead", () => {
  assert.equal(profile("Forest").role, "DEAD_IN_IDENTITY");
});

check("plain-tap black sources are untapped sources", () => {
  for (const name of ["Vault of Whispers", "Command Tower"]) {
    assert.equal(profile(name).role, "IDENTITY_SOURCE_UNTAPPED", name);
  }
});

check("a land that enters tapped is ranked below one that does not", () => {
  const bog = profile("Bojuka Bog");
  assert.equal(bog.role, "IDENTITY_SOURCE_TAPPED");
  assert.ok(landManaQualityRankV1(bog) < landManaQualityRankV1(profile("Vault of Whispers")));
});

check("'enters tapped unless' is not treated as always tapped", () => {
  const castle = profile("Castle Locthwain");
  assert.equal(castle.entersTappedConditionally, true);
  assert.equal(castle.role, "IDENTITY_SOURCE_UNTAPPED");
});

check("colored mana behind an extra cost is conditional, not a real source", () => {
  for (const name of ["Cabal Coffers", "Cabal Stronghold", "Phyrexian Tower", "Nykthos, Shrine to Nyx"]) {
    assert.equal(profile(name).role, "IDENTITY_SOURCE_CONDITIONAL", name);
  }
});

check("fetchlands that can find a Swamp count as identity sources", () => {
  for (const name of ["Prismatic Vista", "Marsh Flats", "Escape Tunnel"]) {
    const p = profile(name);
    assert.equal(p.fetchesIdentitySource, true, name);
    assert.equal(p.countsAsIdentitySource, true, name);
  }
});

check("Urborg is an enabler, not a source", () => {
  const p = profile("Urborg, Tomb of Yawgmoth");
  assert.equal(p.role, "IDENTITY_ENABLER");
  assert.equal(p.untappedIdentityColors.length, 0);
  assert.equal(p.countsAsIdentitySource, true);
});

check("purpose-locked mana is not a source", () => {
  // Interplanar Beacon's colored mana is castable only on planeswalkers.
  const p = profile("Interplanar Beacon");
  assert.equal(p.role, "COLORLESS_ONLY");
  assert.equal(p.countsAsIdentitySource, false);
});

check("colorless utility lands are colorless-only", () => {
  for (const name of ["Ancient Tomb", "Wasteland", "Foundry of the Consuls"]) {
    assert.equal(profile(name).role, "COLORLESS_ONLY", name);
  }
});

check("Lotus Vale is penalised for its entry cost", () => {
  const p = profile("Lotus Vale");
  assert.equal(p.hasEntryCost, true);
  assert.ok(landManaQualityRankV1(p) < landManaQualityRankV1(profile("Vault of Whispers")));
});

check("untapped colored sources outrank colorless utility", () => {
  assert.ok(
    landManaQualityRankV1(profile("Vault of Whispers")) > landManaQualityRankV1(profile("Wasteland")),
    "a black source must be preferred over a colorless utility land",
  );
});

console.log("\nthe shipped Mikaeus mana base");

check("the shipped land base is measurably short on real sources", () => {
  // The subset of the shipped 36 that this fixture covers.
  const shipped: Array<[string, number]> = [
    ["Swamp", 7],
    ["Prismatic Vista", 1],
    ["Marsh Flats", 1],
    ["Bojuka Bog", 1],
    ["Vault of Whispers", 1],
    ["Castle Locthwain", 1],
    ["Command Tower", 1],
    ["Urborg, Tomb of Yawgmoth", 1],
    ["Cabal Coffers", 1],
    ["Cabal Stronghold", 1],
    ["Phyrexian Tower", 1],
    ["Nykthos, Shrine to Nyx", 1],
    ["Ancient Tomb", 1],
    ["Wasteland", 1],
    ["Foundry of the Consuls", 1],
    ["Interplanar Beacon", 1],
    ["Lotus Vale", 1],
    ["Hall of Oracles", 1],
    ["Escape Tunnel", 1],
    ["Bant Panorama", 1],
  ];

  const summary = summarizeLandBaseManaV1(
    shipped.map(([name, copies]) => ({ profile: profile(name), copies })),
  );

  assert.equal(summary.totalLands, 26);
  assert.deepEqual(summary.unusable, ["Bant Panorama"], "the dead land must be named");

  // This is the whole point of the module. Counted generously, 21 of these 26
  // "produce black" and the architect's ~24 target looks nearly met — which is
  // why a count-based check saw no problem. Only 11 tap for black on a plain
  // tap: 7 Swamps plus Vault of Whispers, Castle Locthwain, Command Tower, and
  // Lotus Vale, and Lotus Vale costs two lands to enter.
  assert.equal(summary.identitySources, 21);
  assert.equal(summary.untappedUnconditionalSources, 11);
  assert.ok(
    summary.identitySources - summary.untappedUnconditionalSources >= 10,
    "the gap between nominal and usable sources is what the Head Professor was reacting to",
  );
  assert.equal(summary.colorlessOnly, 4);
});

console.log(`\n${n} checks passed`);
