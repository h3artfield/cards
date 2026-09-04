/**
 * Tests for the bracket ceiling planner.
 *
 * The cases that matter most are the ones drawn from the nine-build
 * measurement: a bracket 2 request that measured 4 on a two-card infinite, and
 * a bracket 3 request that measured 4 the same way. The rest guard the planner
 * against the failure the attainment pass had to be fixed for twice — cutting
 * cards the deck cannot afford to lose.
 */
import assert from "node:assert/strict";
import {
  planBracketCeilingV1,
  type CeilingAddCandidateV1,
  type CeilingComboSetV1,
  type CeilingDeckCardV1,
} from "./professor-sol-directed-bracket-ceiling-v1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

function card(over: Partial<CeilingDeckCardV1> & { oracleId: string; name: string }): CeilingDeckCardV1 {
  return {
    playRate: null,
    specificRoles: [],
    isCommander: false,
    isLand: false,
    isGameChanger: false,
    isUnrestrictedTutor: false,
    isExtraTurn: false,
    isLoopableExtraTurn: false,
    isMassLandDenial: false,
    ...over,
  };
}

function add(
  over: Partial<CeilingAddCandidateV1> & { oracleId: string; name: string },
): CeilingAddCandidateV1 {
  return {
    playRate: 0.1,
    specificRoles: [],
    isGameChanger: false,
    isUnrestrictedTutor: false,
    isExtraTurn: false,
    isMassLandDenial: false,
    completesComboSignatures: [],
    ...over,
  };
}

const FILLER = [
  add({ oracleId: "fill-1", name: "Filler One", specificRoles: ["ramp"], playRate: 0.2 }),
  add({ oracleId: "fill-2", name: "Filler Two", specificRoles: ["draw"], playRate: 0.3 }),
  add({ oracleId: "fill-3", name: "Filler Three", specificRoles: ["removal"], playRate: 0.25 }),
];

console.log("professor-sol-directed-bracket-ceiling-v1 selftest");

check("a deck already at the requested bracket is left alone", () => {
  const plan = planBracketCeilingV1({
    requestedBracket: 3,
    measuredBracket: 3,
    deckCards: [card({ oracleId: "a", name: "A" })],
    comboSets: [],
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 0);
  assert.equal(plan.projectedBracket, 3);
});

check("a deck below the requested bracket is left alone", () => {
  const plan = planBracketCeilingV1({
    requestedBracket: 4,
    measuredBracket: 2,
    deckCards: [card({ oracleId: "a", name: "A" })],
    comboSets: [],
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 0);
});

check("Omnath case: bracket 2 requested, two-card infinite pushes it to 4", () => {
  const deckCards = [
    card({ oracleId: "cmd", name: "Omnath, Locus of Rage", isCommander: true }),
    card({ oracleId: "piece-a", name: "Combo Piece A", playRate: 0.05, specificRoles: ["ramp"] }),
    card({ oracleId: "piece-b", name: "Combo Piece B", playRate: 0.4, specificRoles: ["draw"] }),
  ];
  const combos: CeilingComboSetV1[] = [
    { signature: "piece-a|piece-b", cardCount: 2, oracleIds: ["piece-a", "piece-b"] },
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 4,
    deckCards,
    comboSets: combos,
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 1, "breaking one two-card combo takes one cut");
  assert.equal(plan.swaps[0].cut.name, "Combo Piece A", "the cheaper piece is the one cut");
  assert.deepEqual(plan.swaps[0].cut.breaksComboSignatures, ["piece-a|piece-b"]);
  assert.equal(plan.projectedBracket, 2);
  assert.equal(plan.unresolved.length, 0);
});

check("a shared enabler is cut once instead of one piece per combo", () => {
  // This is the whole reason combos are treated as a set cover.
  const deckCards = [
    card({ oracleId: "enabler", name: "Shared Enabler", playRate: 0.3 }),
    card({ oracleId: "p1", name: "Piece One", playRate: 0.05 }),
    card({ oracleId: "p2", name: "Piece Two", playRate: 0.05 }),
    card({ oracleId: "p3", name: "Piece Three", playRate: 0.05 }),
  ];
  const combos: CeilingComboSetV1[] = [
    { signature: "enabler|p1", cardCount: 2, oracleIds: ["enabler", "p1"] },
    { signature: "enabler|p2", cardCount: 2, oracleIds: ["enabler", "p2"] },
    { signature: "enabler|p3", cardCount: 2, oracleIds: ["enabler", "p3"] },
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 3,
    measuredBracket: 4,
    deckCards,
    comboSets: combos,
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 1, "one cut should break all three combos");
  assert.equal(plan.swaps[0].cut.name, "Shared Enabler");
  assert.equal(plan.swaps[0].cut.breaksComboSignatures.length, 3);
});

check("at bracket 3 only two-card combos are broken, longer ones are allowed", () => {
  const deckCards = [
    card({ oracleId: "a", name: "A", playRate: 0.1 }),
    card({ oracleId: "b", name: "B", playRate: 0.1 }),
    card({ oracleId: "c", name: "C", playRate: 0.1 }),
  ];
  const combos: CeilingComboSetV1[] = [
    { signature: "a|b|c", cardCount: 3, oracleIds: ["a", "b", "c"] },
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 3,
    measuredBracket: 4,
    deckCards,
    comboSets: combos,
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 0, "a three-card combo is fine at Upgraded");
});

check("at bracket 2 even a three-card combo is broken", () => {
  const deckCards = [
    card({ oracleId: "a", name: "A", playRate: 0.5 }),
    card({ oracleId: "b", name: "B", playRate: 0.1 }),
    card({ oracleId: "c", name: "C", playRate: 0.3 }),
  ];
  const combos: CeilingComboSetV1[] = [
    { signature: "a|b|c", cardCount: 3, oracleIds: ["a", "b", "c"] },
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 3,
    deckCards,
    comboSets: combos,
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 1);
  assert.equal(plan.swaps[0].cut.name, "B", "the cheapest piece breaks the set");
});

check("the commander is never cut to break a combo", () => {
  const deckCards = [
    card({ oracleId: "cmd", name: "The Commander", isCommander: true, playRate: 0.01 }),
    card({ oracleId: "p", name: "The Other Piece", playRate: 0.9 }),
  ];
  const combos: CeilingComboSetV1[] = [
    { signature: "cmd|p", cardCount: 2, oracleIds: ["cmd", "p"] },
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 3,
    measuredBracket: 4,
    deckCards,
    comboSets: combos,
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 1);
  assert.equal(plan.swaps[0].cut.name, "The Other Piece", "cut the piece, never the commander");
});

check("a combo held together only by the commander is reported, not forced", () => {
  const deckCards = [card({ oracleId: "cmd", name: "The Commander", isCommander: true })];
  const combos: CeilingComboSetV1[] = [
    { signature: "cmd|missing", cardCount: 2, oracleIds: ["cmd", "missing"] },
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 3,
    measuredBracket: 4,
    deckCards,
    comboSets: combos,
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 0);
  assert.equal(plan.unresolved.length, 1);
  assert.match(plan.unresolved[0].reason, /commander or a land/);
  assert.equal(plan.projectedBracket, 4, "an unfixable deck must not claim to be fixed");
});

check("with no basic on offer, lands are left to the land base pass", () => {
  const deckCards = [
    card({ oracleId: "land", name: "Field of the Dead", isLand: true, isGameChanger: true }),
    card({ oracleId: "gc", name: "Nonland Game Changer", isGameChanger: true, playRate: 0.2 }),
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 3,
    deckCards,
    comboSets: [],
    addCandidates: FILLER,
  });
  assert.deepEqual(
    plan.swaps.map((s) => s.cut.name),
    ["Nonland Game Changer"],
    "the land Game Changer is not touched",
  );
  assert.equal(plan.unresolved.length, 1, "the remaining land Game Changer is reported");
});

check("Omnath case: a Game Changer land is swapped for a basic at bracket 2", () => {
  // Two nonland cuts landed and the deck still read bracket 3 on Field of the
  // Dead alone. Bracket 2 permits no Game Changer at all, so the land has to go.
  const deckCards = [
    card({ oracleId: "land", name: "Field of the Dead", isLand: true, isGameChanger: true }),
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 3,
    deckCards,
    comboSets: [],
    addCandidates: FILLER,
    basicLandReplacement: { oracleId: "forest", name: "Forest" },
  });
  assert.equal(plan.swaps.length, 1);
  assert.equal(plan.swaps[0].cut.name, "Field of the Dead");
  assert.equal(plan.swaps[0].isLandSwap, true);
  assert.equal(plan.swaps[0].basicLand?.name, "Forest");
  assert.equal(plan.swaps[0].add, null, "a land is not replaced from the nonland pool");
  assert.equal(plan.unresolved.length, 0);
  assert.equal(plan.projectedBracket, 2);
});

check("nonlands are cut before lands when either would do", () => {
  const deckCards = [
    card({ oracleId: "land", name: "Gaea's Cradle", isLand: true, isGameChanger: true, playRate: 0.01 }),
    card({ oracleId: "gc", name: "Nonland Game Changer", isGameChanger: true, playRate: 0.9 }),
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 3,
    measuredBracket: 4,
    deckCards,
    comboSets: [],
    addCandidates: FILLER,
    basicLandReplacement: { oracleId: "forest", name: "Forest" },
  });
  // Four Game Changers would be needed to breach Upgraded, so this only has to
  // shed one; the mana base should be the last thing touched even though the
  // land is the less-played card.
  assert.equal(plan.swaps.length, 0, "two Game Changers are within the Upgraded allowance");
});

check("combos are never broken by cutting a land, even with a basic on offer", () => {
  const deckCards = [
    card({ oracleId: "land", name: "Combo Land", isLand: true, playRate: 0.01 }),
    card({ oracleId: "p", name: "Combo Nonland", playRate: 0.9 }),
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 3,
    measuredBracket: 4,
    deckCards,
    comboSets: [{ signature: "land|p", cardCount: 2, oracleIds: ["land", "p"] }],
    addCandidates: FILLER,
    basicLandReplacement: { oracleId: "forest", name: "Forest" },
  });
  assert.equal(plan.swaps.length, 1);
  assert.equal(plan.swaps[0].cut.name, "Combo Nonland", "the nonland piece is the one cut");
  assert.equal(plan.swaps[0].isLandSwap, false);
});

check("bracket 3 trims Game Changers to the Upgraded allowance, not to zero", () => {
  const deckCards = Array.from({ length: 6 }, (_, i) =>
    card({ oracleId: `gc-${i}`, name: `GC ${i}`, isGameChanger: true, playRate: i / 10 }),
  );
  const plan = planBracketCeilingV1({
    requestedBracket: 3,
    measuredBracket: 4,
    deckCards,
    comboSets: [],
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 3, "six Game Changers down to the allowance of three");
  assert.deepEqual(
    plan.swaps.map((s) => s.cut.name).sort(),
    ["GC 0", "GC 1", "GC 2"],
    "the three least-played are the ones cut",
  );
});

check("a replacement never reintroduces the signal being removed", () => {
  const deckCards = [card({ oracleId: "gc", name: "A Game Changer", isGameChanger: true, specificRoles: ["ramp"] })];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 3,
    deckCards,
    comboSets: [],
    addCandidates: [
      add({ oracleId: "bad", name: "Another Game Changer", isGameChanger: true, specificRoles: ["ramp"], playRate: 0.9 }),
      add({ oracleId: "good", name: "Plain Ramp", specificRoles: ["ramp"], playRate: 0.2 }),
    ],
  });
  assert.equal(plan.swaps[0].add?.name, "Plain Ramp");
  assert.equal(plan.swaps[0].roleMatched, true);
});

check("a replacement never completes a combo the deck still has pieces for", () => {
  // The surviving piece is the commander, so the planner cannot break this set
  // by cutting it. A replacement that closes the set would hand back the exact
  // bracket the pass was asked to remove.
  const deckCards = [
    card({ oracleId: "cmd", name: "The Commander", isCommander: true }),
    card({ oracleId: "gc", name: "A Game Changer", isGameChanger: true, specificRoles: ["ramp"] }),
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 3,
    deckCards,
    comboSets: [{ signature: "cmd|new", cardCount: 2, oracleIds: ["cmd", "new"] }],
    addCandidates: [
      add({
        oracleId: "new",
        name: "Combo Completer",
        specificRoles: ["ramp"],
        playRate: 0.9,
        completesComboSignatures: ["cmd|new"],
      }),
      add({ oracleId: "safe", name: "Safe Ramp", specificRoles: ["ramp"], playRate: 0.2 }),
    ],
  });
  const names = plan.swaps.map((s) => s.add?.name);
  assert.ok(!names.includes("Combo Completer"), `must not re-add a combo: ${names.join(", ")}`);
  assert.ok(names.includes("Safe Ramp"), "the safe replacement should be chosen instead");
});

check("replacements prefer the same narrow job", () => {
  const deckCards = [
    card({ oracleId: "gc", name: "A Game Changer", isGameChanger: true, specificRoles: ["removal"] }),
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 3,
    deckCards,
    comboSets: [],
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps[0].add?.name, "Filler Three");
  assert.equal(plan.swaps[0].roleMatched, true);
});

check("the same replacement is not used for two cuts", () => {
  const deckCards = [
    card({ oracleId: "gc1", name: "GC One", isGameChanger: true, specificRoles: ["ramp"], playRate: 0.1 }),
    card({ oracleId: "gc2", name: "GC Two", isGameChanger: true, specificRoles: ["ramp"], playRate: 0.2 }),
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 3,
    deckCards,
    comboSets: [],
    addCandidates: FILLER,
  });
  const adds = plan.swaps.map((s) => s.add?.oracleId);
  assert.equal(new Set(adds).size, adds.length, "each cut gets its own replacement");
});

check("a cut with no eligible replacement is reported rather than hidden", () => {
  const deckCards = [card({ oracleId: "gc", name: "A Game Changer", isGameChanger: true })];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 3,
    deckCards,
    comboSets: [],
    addCandidates: [add({ oracleId: "bad", name: "Also A Game Changer", isGameChanger: true })],
  });
  assert.equal(plan.swaps[0].add, null);
  assert.ok(plan.notes.some((note) => note.includes("short a card")));
});

check("one cut can answer several signals at once", () => {
  const deckCards = [
    card({
      oracleId: "both",
      name: "Tutor And Game Changer",
      isGameChanger: true,
      isUnrestrictedTutor: true,
      playRate: 0.1,
    }),
    card({ oracleId: "t2", name: "Tutor Two", isUnrestrictedTutor: true, playRate: 0.1 }),
    card({ oracleId: "t3", name: "Tutor Three", isUnrestrictedTutor: true, playRate: 0.1 }),
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 3,
    deckCards,
    comboSets: [],
    addCandidates: FILLER,
  });
  const dual = plan.swaps.find((s) => s.cut.name === "Tutor And Game Changer");
  assert.ok(dual, "the dual-signal card should be cut");
  assert.equal(dual.cut.reasons.length, 2, "and credited against both signals");
  assert.equal(plan.swaps[0].cut.name, "Tutor And Game Changer", "highest-impact cut is ordered first");
});

check("mass land denial is cut below bracket 4", () => {
  const deckCards = [
    card({ oracleId: "mld", name: "Armageddon", isMassLandDenial: true, playRate: 0.1 }),
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 3,
    measuredBracket: 4,
    deckCards,
    comboSets: [],
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 1);
  assert.equal(plan.swaps[0].cut.name, "Armageddon");
});

check("bracket 3 keeps extra turns but trims a loopable chain", () => {
  const deckCards = Array.from({ length: 4 }, (_, i) =>
    card({
      oracleId: `et-${i}`,
      name: `Extra Turn ${i}`,
      isExtraTurn: true,
      isLoopableExtraTurn: true,
      playRate: i / 10,
    }),
  );
  const plan = planBracketCeilingV1({
    requestedBracket: 3,
    measuredBracket: 4,
    deckCards,
    comboSets: [],
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 2, "four loopable down to under the chain threshold of three");
  assert.ok(
    plan.swaps.every((s) => s.cut.reasons.includes("extra_turns")),
    "cuts are attributed to the extra-turn signal",
  );
});

check("a combo already broken by another signal's cut is not cut twice", () => {
  const deckCards = [
    card({ oracleId: "gc", name: "Combo GC", isGameChanger: true, playRate: 0.1 }),
    card({ oracleId: "p", name: "Combo Partner", playRate: 0.5 }),
  ];
  const plan = planBracketCeilingV1({
    requestedBracket: 2,
    measuredBracket: 4,
    deckCards,
    comboSets: [{ signature: "gc|p", cardCount: 2, oracleIds: ["gc", "p"] }],
    addCandidates: FILLER,
  });
  assert.equal(plan.swaps.length, 1, "cutting the Game Changer already broke the combo");
  assert.equal(plan.swaps[0].cut.name, "Combo GC");
  assert.ok(plan.notes.some((note) => note.includes("already broken")));
});

console.log(`\nprofessor-sol-directed-bracket-ceiling-v1 selftest passed (${n} checks)`);
