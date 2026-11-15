import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runMissedWinScenarioFixtures, type MissedWinFixture } from "./goldfish-missed-win-scenarios-v2-2";
import {
  classifyGoldfishCard,
  combatClockTurn,
  playGoldfishFromOpening,
  runGoldfishScenario,
  simulateGoldfish,
  type GoldfishSimCard,
} from "./goldfish-sim-v1";
import { keepMulliganV2 } from "./goldfish-mulligan-v2";
import { evaluateWin, resolveWin, emptyMana, type GraphCard } from "./goldfish-resource-graph-v2";

function land(i: number): GoldfishSimCard {
  return classifyGoldfishCard({ oracleId: `land-${i}`, name: "Forest", typeLine: "Basic Land — Forest", text: "({T}: Add {G}.)", cmc: 0 });
}

function ogre(i: number): GoldfishSimCard {
  return classifyGoldfishCard({
    oracleId: `ogre-${i}`,
    name: "Hill Giant",
    typeLine: "Creature — Giant",
    text: "",
    cmc: 4,
    power: 3,
  });
}

function solRing(): GoldfishSimCard {
  return classifyGoldfishCard({
    oracleId: "sol",
    name: "Sol Ring",
    typeLine: "Artifact",
    text: "{T}: Add {C}{C}.",
    cmc: 1,
  });
}

const stock: GoldfishSimCard[] = [
  classifyGoldfishCard({ oracleId: "cmd", name: "Commander", typeLine: "Legendary Creature", text: "", cmc: 4, power: 4, isCommander: true }),
  ...Array.from({ length: 36 }, (_, i) => land(i)),
  ...Array.from({ length: 63 }, (_, i) => ogre(i)),
];
const withRing = [...stock, solRing()];

const a = simulateGoldfish({ cards: stock, games: 800, seed: 1 });
const b = simulateGoldfish({ cards: withRing, games: 800, seed: 1 });
assert.ok(b.mean < a.mean, `Sol Ring should cut mean threat turn: ${b.mean} vs ${a.mean}`);
assert.ok(b.pByT6 >= a.pByT6, `Sol Ring should raise P(threat by T6): ${b.pByT6} vs ${a.pByT6}`);
assert.ok(a.p50 >= 7 && a.p50 <= 12, `precon-like median should sit ~8–10, got ${a.p50}`);
assert.equal(simulateGoldfish({ cards: stock, games: 200, seed: 99 }).p50, simulateGoldfish({ cards: stock, games: 200, seed: 99 }).p50);
assert.ok(solRing().modeledBeyondCast);
assert.ok(solRing().rampMana >= 2, `Sol Ring mana ${solRing().rampMana}`);
assert.equal(solRing().fidelity, "full");
assert.equal(
  classifyGoldfishCard({
    oracleId: "vault",
    name: "Mana Vault",
    typeLine: "Artifact",
    text: "{T}: Add {C}{C}{C}.",
    cmc: 1,
  }).fidelity,
  "full",
);
assert.ok(a.rmst15 >= 7 && a.rmst15 <= 12, `RMST₁₅ stock ${a.rmst15}`);

function oracle(): GoldfishSimCard {
  return classifyGoldfishCard({
    oracleId: "oracle",
    name: "Thassa's Oracle",
    typeLine: "Creature — Merfolk Wizard",
    text: "When Thassa's Oracle enters, if your devotion to blue is greater than or equal to your number of cards in library, you win the game.",
    cmc: 3,
    power: 1,
  });
}
function consult(): GoldfishSimCard {
  return classifyGoldfishCard({
    oracleId: "consult",
    name: "Demonic Consultation",
    typeLine: "Instant",
    text: "Choose a card name. Exile cards from the top of your library until you exile the chosen card, then exile the rest.",
    cmc: 1,
  });
}
const lineDeck: GoldfishSimCard[] = [
  classifyGoldfishCard({ oracleId: "cmd", name: "Commander", typeLine: "Legendary Creature", text: "", cmc: 4, power: 4, isCommander: true }),
  ...Array.from({ length: 14 }, (_, i) => land(i)),
  oracle(),
  consult(),
  ...Array.from({ length: 20 }, (_, i) => ogre(i)),
];
const line = simulateGoldfish({ cards: lineDeck, games: 600, seed: 7 });
assert.ok(line.pByT6 > 0.03, `Oracle+Consult should fire when drawn, pByT6=${line.pByT6}`);
assert.equal(oracle().fidelity, "full");
assert.equal(consult().fidelity, "full");
assert.equal(
  classifyGoldfishCard({
    oracleId: "swords",
    name: "Swords to Plowshares",
    typeLine: "Instant",
    text: "Exile target creature. Its controller gains life equal to its power.",
    cmc: 1,
  }).fidelity,
  "goldfishInert",
);
assert.equal(
  classifyGoldfishCard({
    oracleId: "greaves",
    name: "Lightning Greaves",
    typeLine: "Artifact — Equipment",
    text: "Equipped creature has haste and shroud. Equip {0}.",
    cmc: 2,
  }).fidelity,
  "full",
);
assert.ok(
  classifyGoldfishCard({
    oracleId: "witch",
    name: "Witch Enchanter // Witch-Blessed Meadow",
    typeLine: "Creature — Human Warlock // Land",
    text: "When Witch Enchanter enters, destroy target artifact or enchantment.\nWitch-Blessed Meadow enters tapped.",
    cmc: 4,
  }).isMdfcLand,
);
console.log(`goldfish-sim-v1.selftest ok (stock p50=${a.p50.toFixed(2)} +sol ${b.p50.toFixed(2)})`);

function C(input: Parameters<typeof classifyGoldfishCard>[0]): GoldfishSimCard {
  return classifyGoldfishCard(input);
}
function gcard(c: GoldfishSimCard, zone: GraphCard["zone"], i = 0): GraphCard {
  return {
    instanceId: `${zone}:${i}:${c.oracleId}`,
    oracleId: c.oracleId,
    name: c.name,
    cmc: c.cmc,
    zone,
    isCommander: c.isCommander,
    typeLine: c.typeLine,
    text: c.text,
    power: c.power,
    producedMana: c.producedMana,
  };
}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, cond: boolean, detail = ""): void {
  results.push({ name, ok: cond, detail });
  assert.ok(cond, `${name} ${detail}`);
}

const oracleC = C({
  oracleId: "oracle",
  name: "Thassa's Oracle",
  typeLine: "Creature — Merfolk Wizard",
  text: "When Thassa's Oracle enters, if your devotion to blue is greater than or equal to your number of cards in library, you win the game.",
  cmc: 2,
  power: 1,
});
const consultC = C({
  oracleId: "consult",
  name: "Demonic Consultation",
  typeLine: "Instant",
  text: "Choose a card name. Exile cards from the top of your library until you exile the chosen card, then exile the rest.",
  cmc: 1,
});
const pactC = C({
  oracleId: "pact",
  name: "Tainted Pact",
  typeLine: "Instant",
  text: "Exile the top card of your library. You may put it into your hand. Repeat this process until you put a card into your hand or exile two cards with the same name.",
  cmc: 2,
});
const thrasios = C({
  oracleId: "thrasios",
  name: "Thrasios, Triton Hero",
  typeLine: "Legendary Creature — Merfolk Wizard",
  text: "{4}: Scry 1, then reveal the top card of your library.",
  cmc: 2,
  power: 1,
  isCommander: true,
});
const isochron = C({
  oracleId: "iso",
  name: "Isochron Scepter",
  typeLine: "Artifact",
  text: "Imprint — When this artifact enters, you may exile an instant card with mana value 2 or less from your hand.",
  cmc: 2,
});
const dramatic = C({
  oracleId: "dr",
  name: "Dramatic Reversal",
  typeLine: "Instant",
  text: "Untap all nonland permanents you control.",
  cmc: 2,
});
const vault = C({
  oracleId: "vault",
  name: "Mana Vault",
  typeLine: "Artifact",
  text: "{T}: Add {C}{C}{C}.",
  cmc: 1,
});
const breach = C({
  oracleId: "breach",
  name: "Underworld Breach",
  typeLine: "Enchantment",
  text: "Each nonland card in your graveyard has escape.",
  cmc: 2,
});
const led = C({
  oracleId: "led",
  name: "Lion's Eye Diamond",
  typeLine: "Artifact",
  text: "{T}, Sacrifice this artifact: Add three mana of any one color. Activate only as an instant.",
  cmc: 0,
});
const brainFreeze = C({
  oracleId: "bf",
  name: "Brain Freeze",
  typeLine: "Instant",
  text: "Target player mills three cards. Storm.",
  cmc: 2,
});
const kinnan = C({
  oracleId: "kinnan",
  name: "Kinnan, Bonder Prodigy",
  typeLine: "Legendary Creature — Human Druid",
  text: "Whenever you tap a nontoken artifact for mana, add one mana of any type that artifact produced.",
  cmc: 2,
  power: 2,
  isCommander: true,
});
const basalt = C({
  oracleId: "basalt",
  name: "Basalt Monolith",
  typeLine: "Artifact",
  text: "{T}: Add {C}{C}{C}. {3}: Untap Basalt Monolith.",
  cmc: 3,
});
const ballista = C({
  oracleId: "ballista",
  name: "Walking Ballista",
  typeLine: "Artifact Creature — Construct",
  text: "{X}{X}: This creature enters with X +1/+1 counters. {4}: Put a +1/+1 counter. Remove a +1/+1 counter: It deals 1 damage to any target.",
  cmc: 0,
  power: 0,
});
const labman = C({
  oracleId: "lab",
  name: "Laboratory Maniac",
  typeLine: "Creature — Human Wizard",
  text: "If you would draw a card while your library has no cards in it, you win the game instead.",
  cmc: 3,
  power: 2,
});
const jace = C({
  oracleId: "jace",
  name: "Jace, Wielder of Mysteries",
  typeLine: "Legendary Planeswalker — Jace",
  text: "If you would draw a card while your library has no cards in it, you win the game instead.",
  cmc: 4,
});
const aetherflux = C({
  oracleId: "aeth",
  name: "Aetherflux Reservoir",
  typeLine: "Artifact",
  text: "Whenever you cast a spell, you gain 1 life for each spell you've cast this turn. {50}, Pay 50 life: This artifact deals 50 damage to any target.",
  cmc: 4,
});
const grapeshot = C({
  oracleId: "grape",
  name: "Grapeshot",
  typeLine: "Sorcery",
  text: "Grapeshot deals 1 damage to any target. Storm.",
  cmc: 2,
});
const tendrils = C({
  oracleId: "tend",
  name: "Tendrils of Agony",
  typeLine: "Sorcery",
  text: "Target player loses 2 life and you gain 2 life. Storm.",
  cmc: 4,
});
const tymna = C({
  oracleId: "tymna",
  name: "Tymna the Weaver",
  typeLine: "Legendary Creature — Human Cleric",
  text: "Lifelink. At the beginning of your postcombat main phase, you may pay X life, where X is the number of opponents that were dealt combat damage this turn. If you do, draw X cards.",
  cmc: 3,
  power: 2,
  isCommander: true,
});
const rhystic = C({
  oracleId: "rhystic",
  name: "Rhystic Study",
  typeLine: "Enchantment",
  text: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",
  cmc: 3,
});
const tithe = C({
  oracleId: "tithe",
  name: "Smothering Tithe",
  typeLine: "Enchantment",
  text: "Whenever an opponent casts a spell, that player may pay {2}. If they don't, you create a Treasure token.",
  cmc: 4,
});
const fynn = C({
  oracleId: "fynn",
  name: "Fynn, the Fangbearer",
  typeLine: "Legendary Creature — Human Warrior",
  text: "Whenever a creature you control with deathtouch deals combat damage to a player, that player gets two poison counters.",
  cmc: 2,
  power: 1,
  isCommander: true,
});
const dt1 = C({
  oracleId: "dt1",
  name: "Deadly Recluse",
  typeLine: "Creature — Spider",
  text: "Reach, deathtouch",
  cmc: 2,
  power: 1,
});
const dt2 = C({
  oracleId: "dt2",
  name: "Typhoid Rats",
  typeLine: "Creature — Rat",
  text: "Deathtouch",
  cmc: 1,
  power: 1,
});
const seal = C({
  oracleId: "seal",
  name: "Imperial Seal",
  typeLine: "Sorcery",
  text: "Search your library for a card, then shuffle and put that card on top. You lose 2 life.",
  cmc: 1,
});
const sol = C({
  oracleId: "sol2",
  name: "Sol Ring",
  typeLine: "Artifact",
  text: "{T}: Add {C}{C}.",
  cmc: 1,
});
const forest = C({ oracleId: "gland", name: "Forest", typeLine: "Basic Land — Forest", text: "({T}: Add {G}.)", cmc: 0 });
const island = C({ oracleId: "uland", name: "Island", typeLine: "Basic Land — Island", text: "({T}: Add {U}.)", cmc: 0 });
const swamp = C({ oracleId: "bland", name: "Swamp", typeLine: "Basic Land — Swamp", text: "({T}: Add {B}.)", cmc: 0 });
const bird = C({
  oracleId: "bird",
  name: "Spire Owl",
  typeLine: "Creature — Bird",
  text: "Flying",
  cmc: 1,
  power: 1,
});
const bird2 = C({
  oracleId: "bird2",
  name: "Healer's Hawk",
  typeLine: "Creature — Bird",
  text: "Flying, lifelink",
  cmc: 1,
  power: 1,
});

{
  const mana = emptyMana();
  mana.total = 3;
  mana.any = 3;
  const plan = resolveWin({
    cards: [gcard(oracleC, "H", 0), gcard(consultC, "H", 1)],
    mana,
    libraryCount: 90,
    variants: [],
    templateSatisfied: () => false,
  });
  check("1 Oracle+Consult {U}{U}{B} wins this turn", Boolean(plan && plan.terminal === "WIN"), plan?.line ?? "none");
}

{
  const mana = emptyMana();
  mana.total = 6;
  mana.any = 6;
  const plan = resolveWin({
    cards: [
      gcard(thrasios, "B", 0),
      gcard(isochron, "B", 1),
      gcard(dramatic, "H", 2),
      gcard(vault, "B", 3),
      gcard(oracleC, "L", 4),
    ],
    mana,
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  check("2 Thrasios+Isochron+DR+3rock+Oracle-in-lib wins", Boolean(plan && plan.terminal === "WIN"), plan?.line ?? "none");
}

{
  const mana = emptyMana();
  mana.total = 4;
  mana.any = 4;
  const plan = resolveWin({
    cards: [gcard(breach, "B"), gcard(led, "B", 1), gcard(brainFreeze, "H", 2)],
    mana,
    libraryCount: 50,
    variants: [],
    templateSatisfied: () => false,
  });
  check("3 Breach+LED+BrainFreeze → INF_MILL_EACH_OPP", Boolean(plan && plan.terminal === "INF_MILL_EACH_OPP"), plan?.line ?? "none");
}

{
  const mana = emptyMana();
  mana.total = 4;
  mana.any = 4;
  const plan = resolveWin({
    cards: [gcard(kinnan, "B"), gcard(basalt, "B", 1), gcard(ballista, "H", 2)],
    mana,
    libraryCount: 50,
    variants: [],
    templateSatisfied: () => false,
  });
  check("4 Kinnan+Basalt+Ballista → INF_DAMAGE", Boolean(plan && plan.terminal === "INF_DAMAGE_EACH_OPP"), plan?.line ?? "none");
}

{
  const play = playGoldfishFromOpening({
    commanders: [kinnan],
    hand: [sol, forest, island, C({ oracleId: "j1", name: "Hill Giant", typeLine: "Creature", cmc: 4, power: 3 })],
    library: Array.from({ length: 20 }, (_, i) => C({ oracleId: `f${i}`, name: "Forest", typeLine: "Basic Land — Forest", text: "({T}: Add {G}.)", cmc: 0 })),
  });
  check("5 Kinnan CZ T1 Sol Ring + G + U → Kinnan by T2", (play.commanderFirstCast["Kinnan, Bonder Prodigy"] ?? 99) <= 2, JSON.stringify(play.commanderFirstCast) + play.log.join("|"));
}

{
  const mana = emptyMana();
  mana.total = 3;
  mana.any = 3;
  const thisTurn = resolveWin({
    cards: [gcard(consultC, "H"), gcard(seal, "H", 1), gcard(oracleC, "L", 2)],
    mana,
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  const next = resolveWin({
    cards: [gcard(consultC, "H"), gcard(oracleC, "H", 1)],
    mana,
    libraryCount: 39,
    variants: [],
    templateSatisfied: () => false,
  });
  check("6 tutor-to-top Oracle does not win this turn", thisTurn == null, thisTurn?.line ?? "");
  check("6b wins next turn once Oracle is in hand", Boolean(next && next.terminal === "WIN"), next?.line ?? "none");
}

{
  const s = runGoldfishScenario({
    hand: [],
    battlefield: [tymna, bird, bird2],
    commanders: [tymna],
    mana: 0,
  });
  check("7 Tymna + two 1-power evasive draws 2", s.tymnaDraws === 2, `draws=${s.tymnaDraws}`);
}

{
  const s = runGoldfishScenario({ hand: [], battlefield: [rhystic], mana: 0 });
  check("8 Rhystic + passive-standard-v1 → 3 extra cards/round", s.extraCards === 3, `cards=${s.extraCards}`);
}

{
  const s = runGoldfishScenario({ hand: [], battlefield: [tithe], mana: 0 });
  check("9 Tithe → 3 Treasures/round", s.treasures === 3, `treasures=${s.treasures}`);
}

{
  const clock = combatClockTurn({
    creatures: [
      { power: 4, haste: true },
      { power: 3 },
      { power: 3 },
    ],
    commanderPower: 4,
    greaves: true,
    startTurn: 3,
  });
  check("10 precon 3 creatures + Greaves combat clock is finite", clock >= 3 && clock <= 10, `turn=${clock}`);
}

{
  const play = playGoldfishFromOpening({
    commanders: [fynn],
    hand: [],
    battlefield: [fynn, dt1, dt2],
    library: Array.from({ length: 30 }, (_, i) => C({ oracleId: `x${i}`, name: "Forest", typeLine: "Basic Land — Forest", text: "({T}: Add {G}.)", cmc: 0 })),
  });
  const expected = 3;
  check("11 Fynn + two deathtouch poison clock", play.tFirst <= expected + 1, `tFirst=${play.tFirst} log=${play.log.join("|")}`);
}

{
  const keep = keepMulliganV2({
    hand: [
      { name: "Island", oracleId: "i", cmc: 0, countsAsLand: true, isManaSource: true, isPlanCard: false, castableByT2: false },
      { name: "Chrome Mox", oracleId: "cm", cmc: 0, countsAsLand: false, isManaSource: true, isPlanCard: false, castableByT2: true },
      { name: "Mana Vault", oracleId: "mv", cmc: 1, countsAsLand: false, isManaSource: true, isPlanCard: false, castableByT2: true },
      { name: "Vampiric Tutor", oracleId: "vt", cmc: 1, countsAsLand: false, isManaSource: false, isPlanCard: true, castableByT2: true },
      { name: "Giant", oracleId: "g1", cmc: 3, countsAsLand: false, isManaSource: false, isPlanCard: false, castableByT2: false },
      { name: "Giant", oracleId: "g2", cmc: 3, countsAsLand: false, isManaSource: false, isPlanCard: false, castableByT2: false },
      { name: "Giant", oracleId: "g3", cmc: 3, countsAsLand: false, isManaSource: false, isPlanCard: false, castableByT2: false },
    ],
    mull: 0,
    hasTerminalLine: true,
  });
  const mull5 = keepMulliganV2({
    hand: [
      ...Array.from({ length: 5 }, (_, i) => ({
        name: "Island",
        oracleId: `i${i}`,
        cmc: 0,
        countsAsLand: true,
        isManaSource: true,
        isPlanCard: false,
        castableByT2: false,
      })),
      { name: "Blightsteel Colossus", oracleId: "b1", cmc: 12, countsAsLand: false, isManaSource: false, isPlanCard: false, castableByT2: false },
      { name: "Blightsteel Colossus", oracleId: "b2", cmc: 12, countsAsLand: false, isManaSource: false, isPlanCard: false, castableByT2: false },
    ],
    mull: 0,
    hasTerminalLine: true,
  });
  check("12 keep 1 land + Chrome + Vault + tutor", keep.keep, keep.reason);
  check("12b mull 5 lands + 2 six-drops", !mull5.keep, mull5.reason);
}

{
  const mana = emptyMana();
  mana.total = 6;
  mana.any = 6;
  const noRock = resolveWin({
    cards: [gcard(isochron, "B"), gcard(dramatic, "H", 1)],
    mana,
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  const withRock = resolveWin({
    cards: [gcard(isochron, "B"), gcard(dramatic, "H", 1), gcard(vault, "B", 2), gcard(ballista, "H", 3)],
    mana,
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  const noRockBallista = resolveWin({
    cards: [gcard(isochron, "B"), gcard(dramatic, "H", 1), gcard(ballista, "H", 2)],
    mana,
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  check("13 no 3+ rock → Scepter line not considered", noRock == null && noRockBallista == null, noRock?.line ?? "");
  check("13b 3+ rock enables Isochron INF_MANA/STORM", Boolean(withRock && withRock.terminal === "INF_DAMAGE_EACH_OPP"), withRock?.line ?? "none");
}

{
  const mana = emptyMana();
  mana.total = 6;
  mana.any = 6;
  const t = resolveWin({
    cards: [gcard(thrasios, "B"), gcard(vault, "B", 1), gcard(isochron, "B", 2), gcard(dramatic, "H", 3), gcard(oracleC, "L", 4)],
    mana,
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  check("14 Thrasios converter → DRAW_LIBRARY then WIN", Boolean(t && t.provenance.some((p) => p.token === "DRAW_LIBRARY") && t.terminal === "WIN"), t?.line ?? "none");
}

{
  const mana = emptyMana();
  mana.total = 2;
  mana.any = 2;
  mana.total = 0;
  const emptyLib = resolveWin({
    cards: [gcard(oracleC, "H")],
    mana: { ...emptyMana(), total: 2, any: 2 },
    libraryCount: 0,
    variants: [],
    templateSatisfied: () => false,
  });
  check("15 Oracle + LIBRARY_EMPTY → WIN", Boolean(emptyLib && emptyLib.terminal === "WIN"), emptyLib?.line ?? "none");
}

{
  const p = resolveWin({
    cards: [gcard(pactC, "H"), gcard(oracleC, "H", 1)],
    mana: { ...emptyMana(), total: 4, any: 4 },
    libraryCount: 80,
    variants: [],
    templateSatisfied: () => false,
  });
  check("16 Pact + Oracle → WIN", Boolean(p && p.terminal === "WIN"), p?.line ?? "none");
}

{
  const p = resolveWin({
    cards: [gcard(labman, "H")],
    mana: { ...emptyMana(), total: 3, any: 3 },
    libraryCount: 0,
    variants: [],
    templateSatisfied: () => false,
  });
  check("17 Lab Man + empty → WIN", Boolean(p && p.terminal === "WIN"), p?.line ?? "none");
}

{
  const p = resolveWin({
    cards: [gcard(jace, "H")],
    mana: { ...emptyMana(), total: 4, any: 4 },
    libraryCount: 0,
    variants: [],
    templateSatisfied: () => false,
  });
  check("18 Jace WoM + empty → WIN", Boolean(p && p.terminal === "WIN"), p?.line ?? "none");
}

{
  const p = resolveWin({
    cards: [gcard(aetherflux, "B"), gcard(isochron, "B", 1), gcard(dramatic, "H", 2), gcard(vault, "B", 3)],
    mana: { ...emptyMana(), total: 4, any: 4 },
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  check("19 Aetherflux + INF_STORM → INF_DAMAGE", Boolean(p && p.terminal === "INF_DAMAGE_EACH_OPP"), p?.line ?? "none");
}

{
  const p = resolveWin({
    cards: [gcard(grapeshot, "H"), gcard(isochron, "B", 1), gcard(dramatic, "H", 2), gcard(vault, "B", 3)],
    mana: { ...emptyMana(), total: 4, any: 4 },
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  check("20 Grapeshot + INF_STORM → INF_DAMAGE", Boolean(p && p.terminal === "INF_DAMAGE_EACH_OPP"), p?.line ?? "none");
}

{
  const p = resolveWin({
    cards: [gcard(tendrils, "H"), gcard(isochron, "B", 1), gcard(dramatic, "H", 2), gcard(vault, "B", 3)],
    mana: { ...emptyMana(), total: 6, any: 6 },
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  check("21 Tendrils + INF_STORM → INF_LIFELOSS", Boolean(p && p.terminal === "INF_LIFELOSS_EACH_OPP"), p?.line ?? "none");
}

{
  const p = resolveWin({
    cards: [gcard(thrasios, "B"), gcard(isochron, "B", 1), gcard(dramatic, "H", 2), gcard(vault, "B", 3), gcard(oracleC, "L", 4)],
    mana: { ...emptyMana(), total: 4, any: 4 },
    libraryCount: 10,
    variants: [],
    templateSatisfied: () => false,
  });
  check("22 DRAW_LIBRARY → LIBRARY_EMPTY", Boolean(p && p.provenance.some((x) => x.token === "LIBRARY_EMPTY") && p.terminal === "WIN"), p?.line ?? "none");
}

{
  const remora = C({
    oracleId: "rem",
    name: "Mystic Remora",
    typeLine: "Enchantment",
    text: "Whenever an opponent casts a noncreature spell, you may draw a card unless that player pays {4}.",
    cmc: 1,
  });
  const s = runGoldfishScenario({ hand: [], battlefield: [remora], mana: 0 });
  check("23 Remora template/tax class → 3 extra cards", s.extraCards === 3, `cards=${s.extraCards}`);
}

{
  const sent = C({
    oracleId: "sent",
    name: "Esper Sentinel",
    typeLine: "Artifact Creature — Human Soldier",
    text: "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}.",
    cmc: 1,
    power: 1,
  });
  const s = runGoldfishScenario({ hand: [], battlefield: [sent], mana: 0 });
  check("24 Esper Sentinel tax class → 3 extra cards", s.extraCards === 3, `cards=${s.extraCards}`);
}

{
  const hangar = C({
    oracleId: "hang",
    name: "Hangarback Walker",
    typeLine: "Artifact Creature — Construct",
    text: "{X}{X}: enters with X counters. Remove a counter: 1/1 thopter.",
    cmc: 0,
  });
  const p = resolveWin({
    cards: [gcard(kinnan, "B"), gcard(basalt, "B", 1), gcard(hangar, "H", 2)],
    mana: { ...emptyMana(), total: 4, any: 4 },
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  check("25 X-damage sink Hangarback + INF_MANA", Boolean(p && p.terminal === "INF_DAMAGE_EACH_OPP"), p?.line ?? "none");
}

{
  const instant = C({
    oracleId: "io",
    name: "Dramatic Reversal",
    typeLine: "Instant",
    text: "Untap all nonland permanents you control.",
    cmc: 2,
  });
  check("26 instant-or-sorcery template class (Dramatic Reversal is instant)", instant.isInstant && !instant.isCreature, instant.typeLine);
}

{
  const p1 = C({
    oracleId: "p1c",
    name: "Memnite",
    typeLine: "Artifact Creature — Construct",
    text: "",
    cmc: 0,
    power: 1,
  });
  check("27 creature power ≤1 template class", p1.isCreature && p1.power <= 1, `p=${p1.power}`);
}

{
  check("28 mana-rock 3+ template class (Mana Vault)", vault.producedMana >= 3, `produced=${vault.producedMana}`);
}

{
  const p = resolveWin({
    cards: [gcard(brainFreeze, "H"), gcard(breach, "B", 1), gcard(led, "B", 2)],
    mana: { ...emptyMana(), total: 2, any: 2 },
    libraryCount: 40,
    variants: [],
    templateSatisfied: () => false,
  });
  check("29 Brain Freeze converter after Breach loop", Boolean(p && p.terminal === "INF_MILL_EACH_OPP"), p?.line ?? "none");
}

{
  const mana = emptyMana();
  mana.total = 3;
  mana.any = 3;
  const p = resolveWin({
    cards: [gcard(consultC, "H"), gcard(oracleC, "H", 1)],
    mana,
    libraryCount: 80,
    variants: [],
    templateSatisfied: () => false,
  });
  check("30 consult+oracle converter pair is deterministic WIN", Boolean(p && p.converterIds.includes("consult-empty") && p.converterIds.includes("oracle-empty")), p?.line ?? "none");
}

{
  const play = playGoldfishFromOpening({
    commanders: [tymna],
    hand: [consultC],
    battlefield: [tymna, bird, bird2, island, island, swamp],
    library: [
      ...Array.from({ length: 20 }, (_, i) => C({ oracleId: `tl${i}`, name: "Island", typeLine: "Basic Land — Island", text: "({T}: Add {U}.)", cmc: 0 })),
      oracleC,
    ],
  });
  check(
    "31 Tymna draws Oracle post-combat with mana open → win that turn",
    play.tWin === 1 && /resolveWin|oracle/i.test(play.line),
    `tFirst=${play.tFirst} tWin=${play.tWin} line=${play.line} log=${play.log.join("|")}`,
  );
}

{
  const play = playGoldfishFromOpening({
    commanders: [oracleC],
    hand: [],
    battlefield: [oracleC, rhystic, swamp],
    library: [
      ...Array.from({ length: 20 }, (_, i) => C({ oracleId: `rl${i}`, name: "Island", typeLine: "Basic Land — Island", text: "({T}: Add {U}.)", cmc: 0 })),
      consultC,
    ],
  });
  check(
    "32 Rhystic opponent-turn Consult with Oracle on BF → instant win",
    play.tWin === 1 && /resolveWin|oracle/i.test(play.line),
    `tFirst=${play.tFirst} tWin=${play.tWin} line=${play.line} log=${play.log.join("|")}`,
  );
}

{
  const play = playGoldfishFromOpening({
    commanders: [],
    hand: [seal, consultC],
    battlefield: [swamp, island, island],
    library: [
      oracleC,
      ...Array.from({ length: 20 }, (_, i) => C({ oracleId: `ol${i}`, name: "Hill Giant", typeLine: "Creature — Giant", text: "", cmc: 4, power: 3 })),
    ],
  });
  const tutored = play.log.some((l) => /Imperial Seal/.test(l));
  check(
    "33 leftover-mana tutor to top → win next turn",
    tutored && play.tWin === 2,
    `tFirst=${play.tFirst} tWin=${play.tWin} line=${play.line} log=${play.log.join("|")}`,
  );
}

{
  const giant = C({ oracleId: "g37", name: "Hill Giant", typeLine: "Creature — Giant", text: "", cmc: 4, power: 3 });
  const play = playGoldfishFromOpening({ hand: [giant], battlefield: [island, island, sol], library: [forest, forest] });
  check(
    "37 opening battlefield lands are not also counted as rocks (2 Islands + Sol Ring = 4)",
    play.log.includes("T1 cast Hill Giant mana=0"),
    play.log.join("|"),
  );
}

{
  const worldly = C({
    oracleId: "worldly",
    name: "Worldly Tutor",
    typeLine: "Instant",
    text: "Search your library for a creature card, reveal it, then shuffle and put that card on top.",
    cmc: 1,
  });
  const play = playGoldfishFromOpening({
    commanders: [],
    hand: [worldly, consultC],
    battlefield: [swamp, island, island],
    library: [oracleC, ...Array.from({ length: 20 }, (_, i) => C({ oracleId: `wl${i}`, name: "Hill Giant", typeLine: "Creature — Giant", text: "", cmc: 4, power: 3 }))],
  });
  check(
    "38 creature-only tutor fetches a missing creature piece (no held legal tutor)",
    play.invariants.b === 0 && play.invariants.a === 0 && play.log.some((l) => /Worldly Tutor/.test(l)) && play.tWin === 2,
    `tWin=${play.tWin} inv=${JSON.stringify(play.invariants)} log=${play.log.join("|")}`,
  );
}

{
  const enlightened = C({
    oracleId: "enl",
    name: "Enlightened Tutor",
    typeLine: "Instant",
    text: "Search your library for an artifact or enchantment card, reveal it, then shuffle and put that card on top.",
    cmc: 1,
  });
  const play = playGoldfishFromOpening({
    commanders: [],
    hand: [enlightened, consultC],
    battlefield: [swamp, island, island],
    library: [oracleC, ...Array.from({ length: 20 }, (_, i) => C({ oracleId: `el${i}`, name: "Hill Giant", typeLine: "Creature — Giant", text: "", cmc: 4, power: 3 }))],
  });
  check(
    "39 artifact/enchantment tutor cannot fetch Oracle → distance stays 1, no invariant (b)",
    enlightened.tutorTypes.includes("artifact") && play.invariants.b === 0 && play.invariants.a === 0,
    `types=${enlightened.tutorTypes} inv=${JSON.stringify(play.invariants)}`,
  );
}

{
  const play = playGoldfishFromOpening({
    commanders: [],
    hand: [oracleC, consultC],
    battlefield: [swamp],
    library: Array.from({ length: 20 }, (_, i) => C({ oracleId: `ho${i}`, name: "Island", typeLine: "Basic Land — Island", text: "({T}: Add {U}.)", cmc: 0 })),
  });
  check(
    "40 Oracle is not cast into a full library while short on mana; wins once 3 mana",
    play.tWin === 3 && play.invariants.a === 0,
    `tWin=${play.tWin} line=${play.line} log=${play.log.join("|")}`,
  );
}

{
  const gary = C({
    oracleId: "gary",
    name: "Gray Merchant of Asphodel",
    typeLine: "Creature — Zombie",
    text: "When Gray Merchant of Asphodel enters, each opponent loses X life, where X is your devotion to black. You gain life equal to the life lost this way.",
    cmc: 5,
    power: 2,
  });
  const play = playGoldfishFromOpening({
    commanders: [],
    hand: [gary],
    battlefield: [swamp, swamp, swamp, swamp, swamp],
    library: Array.from({ length: 20 }, (_, i) => C({ oracleId: `gm${i}`, name: "Swamp", typeLine: "Basic Land — Swamp", text: "({T}: Add {B}.)", cmc: 0 })),
  });
  check(
    "41 drain win-text creature is not an instant win without a resolver plan",
    play.tWin == null && play.invariants.unbackedWinText >= 1,
    `tWin=${play.tWin} line=${play.line} inv=${JSON.stringify(play.invariants)}`,
  );
}

{
  const ev = evaluateWin({
    cards: [gcard(consultC, "H"), gcard(oracleC, "H", 1)],
    mana: { ...emptyMana(), total: 2, any: 2 },
    libraryCount: 80,
    variants: [],
    templateSatisfied: () => false,
  });
  check(
    "42 closest line charges mana already spent on present tokens (Consult paid, Oracle short 1)",
    ev.plan == null && !ev.resolverRejected && ev.closest?.manaShort === 1 && ev.closest.missingPieces.length === 0,
    JSON.stringify(ev.closest),
  );
}

{
  const ev = evaluateWin({
    cards: [gcard(consultC, "H"), gcard(oracleC, "H", 1)],
    mana: { ...emptyMana(), total: 3, U: 3 },
    libraryCount: 80,
    variants: [],
    templateSatisfied: () => false,
  });
  check(
    "43 all-blue 3 mana: Consult {B} unpayable → colorShort, distance ≥1, not resolver-rejected",
    ev.plan == null && !ev.resolverRejected && Boolean(ev.closest?.colorShort) && (ev.closest?.manaShort ?? 0) >= 1,
    JSON.stringify(ev.closest),
  );
}

{
  const fixturePath = join(__dirname, "fixtures", "goldfish-missed-win-scenarios-v2-2.json");
  if (existsSync(fixturePath)) {
    const fx = JSON.parse(readFileSync(fixturePath, "utf8")) as MissedWinFixture;
    for (const r of runMissedWinScenarioFixtures(fx)) {
      check(
        `MW ${r.id} (v2.1 ${r.v21Kind}) → no missed win, invariants a=b=0`,
        r.ok,
        `tWin=${r.tWin} line=${r.line} missed=${r.missedWin} a=${r.invariantA} b=${r.invariantB} ${r.detail}`,
      );
    }
  } else {
    check("MW fixture present", false, fixturePath);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`policy-v2 scenarios ${results.filter((r) => r.ok).length}/${results.length} passed`);
if (failed.length) {
  console.error(failed);
  throw new Error(`${failed.length} scenario tests failed`);
}

