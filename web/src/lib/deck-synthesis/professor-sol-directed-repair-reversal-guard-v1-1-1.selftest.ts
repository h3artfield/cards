/**
 * Tests the guard that stops one repair pass undoing another.
 *
 * Drawn from a live Mikaeus build (5cdc0d1e): repair pass 1 cut Triskelion and
 * Walking Ballista, and pass 2 added them straight back. Two model calls and
 * about two minutes produced no net change, and the deck briefly lost the
 * commander's combo pieces in between. Each pass grades from scratch, so
 * nothing but this guard prevents the reversal.
 */
import assert from "node:assert/strict";
import { applySolDirectedCriticSwapsV111 } from "./professor-sol-directed-critic-v1-1-1";
import { shouldKeepEarlierGradedDeckV111 } from "./professor-sol-directed-deck-grade-v1-1-1";
import type { CanonicalCardFactsV11, SolDirectedConstructedDeckV11 } from "./professor-sol-directed-types-v1-1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

function facts(name: string, oracleId: string): CanonicalCardFactsV11 {
  return {
    oracleId,
    name,
    manaValue: 3,
    typeLine: "Creature — Horror",
    colorIdentity: ["B"],
    oracleText: "",
    semanticFunctions: [],
    semanticOracle: null,
    commanderLegal: true,
    isLand: false,
  };
}

function nonland(name: string, oracleId: string) {
  return {
    oracleId,
    name,
    typeLine: "Creature — Horror",
    primaryArchitectRequirement: "death_trigger_payoffs",
    primaryRole: "payoff",
    secondaryRoles: [],
    packageMembership: ["aristocrats"],
    whyInThisDeck: "combo piece",
    structuralNecessity: "FLEX" as const,
  };
}

function deckWith(names: Array<[string, string]>): SolDirectedConstructedDeckV11 {
  return {
    commander: { name: "Mikaeus, the Unhallowed" } as SolDirectedConstructedDeckV11["commander"],
    landCount: 1,
    lands: [{ name: "Swamp", copies: 1 }],
    nonlands: names.map(([name, id]) => nonland(name, id)),
    primaryWinPaths: ["Mikaeus + Triskelion"],
    secondaryWinPaths: [],
    expectedPlayPattern: "",
    structuralNecessities: [],
    replaceableFlex: [],
  };
}

const dictionary: Record<string, CanonicalCardFactsV11> = {
  tri: facts("Triskelion", "tri"),
  ballista: facts("Walking Ballista", "ballista"),
  altar: facts("Altar of the Brood", "altar"),
  kokusho: facts("Kokusho, the Evening Star", "kokusho"),
};

console.log("repair reversal guard");

check("re-adding a card an earlier pass cut is rejected", () => {
  // Pass 1 cut Triskelion for Altar of the Brood. Pass 2 tries to undo it.
  const deck = deckWith([["Altar of the Brood", "altar"]]);
  const result = applySolDirectedCriticSwapsV111({
    deck,
    swaps: [{ cut: "Altar of the Brood", add: "Triskelion", reason: "restore combo" }],
    candidateDictionary: dictionary,
    blockedAddNames: ["Triskelion"],
    protectedCutNames: ["Altar of the Brood"],
  });

  assert.equal(result.appliedSwaps.length, 0, "reversal must not apply");
  assert.equal(result.rejectedSwaps.length, 1);
  assert.match(result.rejectedSwaps[0]!.reason, /^ADD_REVERSES_EARLIER_CUT:Triskelion$/);
  assert.deepEqual(
    result.deck.nonlands.map((c) => c.name),
    ["Altar of the Brood"],
    "deck must be unchanged",
  );
});

check("cutting a card an earlier pass added is rejected", () => {
  const deck = deckWith([["Kokusho, the Evening Star", "kokusho"]]);
  const result = applySolDirectedCriticSwapsV111({
    deck,
    swaps: [{ cut: "Kokusho, the Evening Star", add: "Triskelion", reason: "prefer combo" }],
    candidateDictionary: dictionary,
    protectedCutNames: ["Kokusho, the Evening Star"],
  });

  assert.equal(result.appliedSwaps.length, 0);
  assert.match(result.rejectedSwaps[0]!.reason, /^CUT_REVERSES_EARLIER_ADD:/);
});

check("name matching ignores case and punctuation differences", () => {
  const deck = deckWith([["Altar of the Brood", "altar"]]);
  const result = applySolDirectedCriticSwapsV111({
    deck,
    swaps: [{ cut: "Altar of the Brood", add: "triskelion", reason: "restore combo" }],
    candidateDictionary: dictionary,
    blockedAddNames: ["TRISKELION"],
  });

  assert.equal(result.appliedSwaps.length, 0, "guard must not be defeated by casing");
});

check("swaps unrelated to earlier passes still apply", () => {
  // The guard must not freeze the deck: a genuinely new swap has to land.
  const deck = deckWith([["Kokusho, the Evening Star", "kokusho"]]);
  const result = applySolDirectedCriticSwapsV111({
    deck,
    swaps: [{ cut: "Kokusho, the Evening Star", add: "Walking Ballista", reason: "scalable payoff" }],
    candidateDictionary: dictionary,
    blockedAddNames: ["Triskelion"],
    protectedCutNames: ["Altar of the Brood"],
  });

  assert.equal(result.appliedSwaps.length, 1, "unrelated swap must apply");
  assert.deepEqual(
    result.deck.nonlands.map((c) => c.name),
    ["Walking Ballista"],
  );
});

check("no history means no restriction", () => {
  const deck = deckWith([["Triskelion", "tri"]]);
  const result = applySolDirectedCriticSwapsV111({
    deck,
    swaps: [{ cut: "Triskelion", add: "Altar of the Brood", reason: "first pass cut" }],
    candidateDictionary: dictionary,
  });

  assert.equal(result.appliedSwaps.length, 1, "first pass must be free to act");
});

console.log("\nkeep the best-graded deck");

check("the real Mikaeus sequence keeps C+ over the C- that shipped", () => {
  // Build 5cdc0d1e graded C+ before repair, then D+, then C-, and shipped C-.
  assert.equal(shouldKeepEarlierGradedDeckV111({ currentGrade: "D+", earlierGrade: "C+" }), true);
  assert.equal(shouldKeepEarlierGradedDeckV111({ currentGrade: "C-", earlierGrade: "C+" }), true);
});

check("an improved grade is kept, not reverted", () => {
  assert.equal(shouldKeepEarlierGradedDeckV111({ currentGrade: "B", earlierGrade: "C+" }), false);
});

check("an equal grade prefers the later deck, which has the fixes applied", () => {
  assert.equal(shouldKeepEarlierGradedDeckV111({ currentGrade: "C+", earlierGrade: "C+" }), false);
});

check("dual grades compare on the as-submitted letter", () => {
  const current = "D as submitted; approximately B+/A- after correction";
  const earlier = "C+ as submitted; approximately A- after correction";
  assert.equal(shouldKeepEarlierGradedDeckV111({ currentGrade: current, earlierGrade: earlier }), true);
});

check("an ungradeable current verdict falls back to the earlier deck", () => {
  assert.equal(shouldKeepEarlierGradedDeckV111({ currentGrade: "unclear", earlierGrade: "C" }), true);
});

check("an ungradeable earlier verdict is never restored", () => {
  assert.equal(shouldKeepEarlierGradedDeckV111({ currentGrade: "C", earlierGrade: "unclear" }), false);
});

console.log(`\n${n} checks passed`);
