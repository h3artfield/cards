import assert from "node:assert/strict";
import {
  declaredReplaceableNamesV1,
  planBracketAttainmentV1,
  targetGameChangerCountV1,
  type BracketAttainmentAddCandidateV1,
  type BracketAttainmentCutCandidateV1,
} from "./professor-sol-directed-bracket-attainment-v1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

function cut(
  name: string,
  overrides: Partial<BracketAttainmentCutCandidateV1> = {},
): BracketAttainmentCutCandidateV1 {
  return {
    oracleId: `cut:${name}`,
    name,
    primaryArchitectRequirement: "ramp",
    playRate: 0.05,
    declaredReplaceable: false,
    isComboPiece: false,
    isGameChanger: false,
    specificRoles: [],
    ...overrides,
  };
}

function add(
  name: string,
  overrides: Partial<BracketAttainmentAddCandidateV1> = {},
): BracketAttainmentAddCandidateV1 {
  return {
    oracleId: `add:${name}`,
    name,
    playRate: 0.2,
    isGameChanger: true,
    specificRoles: [],
    ...overrides,
  };
}

console.log("professor-sol-directed-bracket-attainment-v1 selftest");

check("the Game Changer target matches the rubric's floors", () => {
  assert.equal(targetGameChangerCountV1(1), 0, "Exhibition has no measurable floor");
  assert.equal(targetGameChangerCountV1(2), 0, "Core is the base bracket");
  assert.equal(targetGameChangerCountV1(3), 1, "one Game Changer reaches Upgraded");
  assert.equal(targetGameChangerCountV1(4), 4, "Upgraded allows 3, so 4 reaches Optimized");
  assert.equal(targetGameChangerCountV1(5), 4, "cEDH is not inferable, so it targets Optimized");
});

check("a replaceable list of bare card names is read directly", () => {
  const declared = declaredReplaceableNamesV1({
    replaceableFlex: ["Cultivate", "Kodama's Reach"],
    nonlandNames: ["Cultivate", "Kodama's Reach", "Sol Ring"],
  });
  assert.deepEqual([...declared].sort(), ["Cultivate", "Kodama's Reach"]);
});

check("only the subject of a prose line is treated as replaceable", () => {
  // Earthcraft appears as a card to avoid, not a card to cut.
  const declared = declaredReplaceableNamesV1({
    replaceableFlex: [
      "Squirrel Nest can be exchanged for another fair repeatable token producer, provided Earthcraft is not added.",
    ],
    nonlandNames: ["Squirrel Nest", "Earthcraft"],
  });
  assert.deepEqual([...declared], ["Squirrel Nest"]);
});

check("a replaceable line naming no deck card is ignored", () => {
  const declared = declaredReplaceableNamesV1({
    replaceableFlex: ["One of the three utility lands can be exchanged for a colored dual."],
    nonlandNames: ["Sol Ring"],
  });
  assert.equal(declared.size, 0);
});

check("a deck already at or above the requested bracket is left alone", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 4,
    currentGameChangerCount: 5,
    cutCandidates: [cut("Filler")],
    addCandidates: [add("Rhystic Study")],
  });
  assert.deepEqual(plan.swaps, []);
  assert.equal(plan.incomplete, false);
});

check("a bracket 2 request proposes nothing, since Core is the floor", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 2,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [cut("Filler")],
    addCandidates: [add("Rhystic Study")],
  });
  assert.deepEqual(plan.swaps, []);
});

check("a bracket 3 request one short of the floor proposes exactly one swap", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [cut("Weak Filler"), cut("Other Filler")],
    addCandidates: [add("Rhystic Study"), add("Smothering Tithe")],
  });
  assert.equal(plan.shortfall, 1);
  assert.equal(plan.swaps.length, 1, "asking for Upgraded must not add a second Game Changer");
  assert.equal(plan.incomplete, false);
});

check("a bracket 4 request from three Game Changers needs only the fourth", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 4,
    measuredBracket: 3,
    currentGameChangerCount: 3,
    cutCandidates: [cut("A"), cut("B"), cut("C"), cut("D")],
    addCandidates: [add("W"), add("X"), add("Y"), add("Z")],
  });
  assert.equal(plan.targetGameChangerCount, 4);
  assert.equal(plan.shortfall, 1);
  assert.equal(plan.swaps.length, 1);
});

check("cards the Constructor called replaceable are cut before anything else", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [
      cut("Very Fringe", { playRate: 0.001 }),
      cut("Declared Flex", { declaredReplaceable: true, playRate: 0.1 }),
    ],
    addCandidates: [add("Rhystic Study", { playRate: 0.3 })],
  });
  assert.equal(plan.swaps[0]?.cut.name, "Declared Flex");
});

check("measured play rate outranks the Constructor's own flex label", () => {
  // The label is the model's opinion; the play rate is data. A card the model
  // called flexible but the field plays more than the addition stays put.
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [
      cut("Fringe", { playRate: 0.001 }),
      cut("Declared But Popular", { declaredReplaceable: true, playRate: 0.8 }),
    ],
    addCandidates: [add("Rhystic Study", { playRate: 0.3 })],
  });
  assert.equal(plan.swaps[0]?.cut.name, "Fringe");
});

check("the least-played card is cut once no replaceable is declared", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [cut("Popular", { playRate: 0.5 }), cut("Fringe", { playRate: 0.01 })],
    addCandidates: [add("Rhystic Study")],
  });
  assert.equal(plan.swaps[0]?.cut.name, "Fringe");
});

check("combo pieces and existing Game Changers are never cut", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 4,
    measuredBracket: 3,
    currentGameChangerCount: 3,
    cutCandidates: [
      cut("Combo Piece", { isComboPiece: true, playRate: 0.001 }),
      cut("Existing GC", { isGameChanger: true, playRate: 0.002 }),
      cut("Safe Filler", { playRate: 0.05 }),
    ],
    addCandidates: [add("Rhystic Study")],
  });
  assert.equal(plan.swaps.length, 1);
  assert.equal(plan.swaps[0]?.cut.name, "Safe Filler");
});

check("an unmeasured card is not treated as the most disposable", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [cut("Unmeasured", { playRate: null }), cut("Fringe", { playRate: 0.02 })],
    addCandidates: [add("Rhystic Study")],
  });
  assert.equal(plan.swaps[0]?.cut.name, "Fringe");
});

check("an addition filling a role the deck already uses is offered first", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [cut("Filler")],
    addCandidates: [
      add("Unrelated", { playRate: 0.9 }),
      add("Fits Deck", { playRate: 0.1, sharedRoles: ["card_advantage"] }),
    ],
  });
  assert.equal(plan.swaps[0]?.add.name, "Fits Deck");
});

check("an addition replaces a card doing the same job, not the least-played card", () => {
  // The regression this guards: cEDH play rates rank a green deck's finisher
  // below its filler ramp, so a naive plan cuts Craterhoof to add a mana rock.
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [
      cut("Craterhoof Behemoth", { playRate: 0.01, specificRoles: ["finisher"] }),
      cut("Worn Powerstone", { playRate: 0.2, specificRoles: ["mana_generation"] }),
    ],
    addCandidates: [add("Mana Vault", { specificRoles: ["mana_generation"] })],
  });
  assert.equal(plan.swaps[0]?.cut.name, "Worn Powerstone");
  assert.equal(plan.swaps[0]?.roleMatched, true);
  assert.deepEqual(plan.swaps[0]?.matchedRoles, ["mana_generation"]);
});

check("a swap is refused when it would trade away a more-played card", () => {
  // Sol Ring and Chrome Mox share a role, so role matching alone would take the
  // trade. Play rate is what says it is a loss.
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [
      cut("Sol Ring", { playRate: 0.92, specificRoles: ["mana_generation"] }),
      cut("Cultivate", { playRate: 0.04, specificRoles: ["land_ramp"] }),
    ],
    addCandidates: [add("Chrome Mox", { playRate: 0.3, specificRoles: ["mana_generation"] })],
  });
  assert.equal(plan.swaps.length, 1);
  assert.equal(plan.swaps[0]?.cut.name, "Cultivate", "Sol Ring must survive the pass");
  assert.equal(plan.swaps[0]?.roleMatched, false);
});

check("an unmeasured card is not refused as a downgrade", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [cut("No Data", { playRate: null })],
    addCandidates: [add("Rhystic Study", { playRate: 0.3 })],
  });
  assert.equal(plan.swaps.length, 1);
  assert.equal(plan.swaps[0]?.cut.name, "No Data");
});

check("each addition takes a different slot", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 4,
    measuredBracket: 2,
    currentGameChangerCount: 2,
    cutCandidates: [
      cut("Rock A", { playRate: 0.1, specificRoles: ["mana_generation"] }),
      cut("Rock B", { playRate: 0.2, specificRoles: ["mana_generation"] }),
    ],
    addCandidates: [
      add("Mana Vault", { specificRoles: ["mana_generation"], playRate: 0.6 }),
      add("Mox Diamond", { specificRoles: ["mana_generation"], playRate: 0.5 }),
    ],
  });
  assert.equal(plan.swaps.length, 2);
  assert.notEqual(plan.swaps[0]?.cut.oracleId, plan.swaps[1]?.cut.oracleId);
});

check("a non-role-matched swap is flagged so it can be surfaced or declined", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [cut("Filler")],
    addCandidates: [add("Unrelated", { playRate: 0.9 })],
  });
  assert.equal(plan.swaps[0]?.roleMatched, false);
  assert.ok(
    plan.notes.some((note) => note.includes("power change")),
    "an unmatched swap must be called out in the notes",
  );
});

check("non-Game-Changer additions are ignored, since they move no floor", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [cut("Filler")],
    addCandidates: [add("Just A Good Card", { isGameChanger: false, playRate: 0.9 })],
  });
  assert.deepEqual(plan.swaps, []);
  assert.equal(plan.incomplete, true);
});

check("an incomplete plan is reported rather than silently partial", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 4,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [cut("Only One")],
    addCandidates: [add("Only One GC")],
  });
  assert.equal(plan.shortfall, 4);
  assert.equal(plan.swaps.length, 1);
  assert.equal(plan.incomplete, true);
  assert.ok(plan.notes.some((note) => note.includes("only 1 legal swap")));
});

check("the incoming card inherits the cut card's architect requirement", () => {
  const plan = planBracketAttainmentV1({
    requestedBracket: 3,
    measuredBracket: 2,
    currentGameChangerCount: 0,
    cutCandidates: [cut("Filler", { primaryArchitectRequirement: "interaction" })],
    addCandidates: [add("Rhystic Study")],
  });
  assert.equal(plan.swaps[0]?.cut.primaryArchitectRequirement, "interaction");
});

check("a plan never proposes more Game Changers than the bracket allows", () => {
  for (const requested of [3, 4] as const) {
    const plan = planBracketAttainmentV1({
      requestedBracket: requested,
      measuredBracket: 2,
      currentGameChangerCount: 0,
      cutCandidates: Array.from({ length: 10 }, (_, i) => cut(`Cut ${i}`)),
      addCandidates: Array.from({ length: 10 }, (_, i) => add(`Add ${i}`)),
    });
    const resulting = plan.swaps.length;
    assert.equal(
      resulting,
      plan.targetGameChangerCount,
      `bracket ${requested} should stop at its target`,
    );
  }
});

console.log(`\nprofessor-sol-directed-bracket-attainment-v1 selftest passed (${n} checks)`);
