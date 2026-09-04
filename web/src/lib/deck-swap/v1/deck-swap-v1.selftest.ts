import assert from "node:assert/strict";
import { filterSwapCandidates, sharedRoles } from "./filter-candidates";
import { describeVerdict, swapVerdict } from "./verdict";
import type { SwapCandidate, SwapStock } from "./types";
import type { BracketRubricCard } from "@/lib/commander-bracket-rubric/v1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

function deckCard(name: string, oracleId: string): BracketRubricCard {
  return { oracleId, name, typeLine: "Creature", oracleText: "", quantity: 1, isCommander: false };
}

function candidate(partial: Partial<SwapCandidate> & { name: string; oracleId: string }): SwapCandidate {
  return {
    colorIdentity: partial.colorIdentity ?? ["G"],
    manaValue: partial.manaValue ?? 3,
    typeLine: partial.typeLine ?? "Creature",
    derivedRoles: partial.derivedRoles ?? ["ramp"],
    primaryType: partial.primaryType ?? "Creature",
    isLand: partial.isLand ?? false,
    source: partial.source ?? "semantic_neighbor",
    semanticDistance: partial.semanticDistance ?? 0.3,
    ...partial,
  };
}

const DECK: BracketRubricCard[] = [
  deckCard("Llanowar Elves", "oracle:llanowar"),
  deckCard("Cultivate", "oracle:cultivate"),
];

const GOLGARI = { commanderColorIdentity: ["B", "G"] };

console.log("deck-swap-v1 selftest");

check("off-color candidates are rejected with the reason", () => {
  const { kept, rejected } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [candidate({ name: "Birds of Paradise", oracleId: "oracle:birds", colorIdentity: ["G"] }), candidate({ name: "Sea Gate Loremaster", oracleId: "oracle:seagate", colorIdentity: ["U"] })],
    constraints: GOLGARI,
  });
  assert.deepEqual(kept.map((c) => c.name), ["Birds of Paradise"]);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0]!.code, "OFF_COLOR");
  assert.match(rejected[0]!.detail, /outside the commander's BG/);
});

check("colorless candidates are legal in any identity", () => {
  const { kept } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [candidate({ name: "Sol Ring", oracleId: "oracle:solring", colorIdentity: [] })],
    constraints: GOLGARI,
  });
  assert.deepEqual(kept.map((c) => c.name), ["Sol Ring"]);
});

check("cards already in the deck are rejected for singleton", () => {
  const { kept, rejected } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [candidate({ name: "Cultivate", oracleId: "oracle:cultivate" })],
    constraints: GOLGARI,
  });
  assert.equal(kept.length, 0);
  assert.equal(rejected[0]!.code, "ALREADY_IN_DECK");
});

check("the outgoing card is never suggested as its own replacement", () => {
  const { rejected } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [candidate({ name: "Llanowar Elves", oracleId: "oracle:llanowar" })],
    constraints: GOLGARI,
  });
  assert.equal(rejected[0]!.code, "SAME_CARD");
});

check("requireInStock drops cards the store does not have", () => {
  const stock = new Map<string, SwapStock>([["oracle:birds", { quantity: 2, priceUsd: 8.5 }]]);
  const { kept, rejected } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [
      candidate({ name: "Birds of Paradise", oracleId: "oracle:birds" }),
      candidate({ name: "Elvish Mystic", oracleId: "oracle:mystic" }),
    ],
    constraints: { ...GOLGARI, requireInStock: true },
    stockByOracleId: stock,
  });
  assert.deepEqual(kept.map((c) => c.name), ["Birds of Paradise"]);
  assert.equal(rejected[0]!.code, "OUT_OF_STOCK");
});

check("zero-quantity stock counts as out of stock", () => {
  const stock = new Map<string, SwapStock>([["oracle:birds", { quantity: 0, priceUsd: 8.5 }]]);
  const { kept } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [candidate({ name: "Birds of Paradise", oracleId: "oracle:birds" })],
    constraints: { ...GOLGARI, requireInStock: true },
    stockByOracleId: stock,
  });
  assert.equal(kept.length, 0);
});

check("budget filters on the cheapest listed copy", () => {
  const stock = new Map<string, SwapStock>([
    ["oracle:birds", { quantity: 1, priceUsd: 12 }],
    ["oracle:mystic", { quantity: 1, priceUsd: 1.5 }],
  ]);
  const { kept, rejected } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [
      candidate({ name: "Birds of Paradise", oracleId: "oracle:birds" }),
      candidate({ name: "Elvish Mystic", oracleId: "oracle:mystic" }),
    ],
    constraints: { ...GOLGARI, maxPriceUsd: 5 },
    stockByOracleId: stock,
  });
  assert.deepEqual(kept.map((c) => c.name), ["Elvish Mystic"]);
  assert.equal(rejected[0]!.code, "OVER_BUDGET");
});

check("an unpriced card is not dropped by a budget", () => {
  const stock = new Map<string, SwapStock>([["oracle:mystic", { quantity: 1, priceUsd: null }]]);
  const { kept } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [candidate({ name: "Elvish Mystic", oracleId: "oracle:mystic" })],
    constraints: { ...GOLGARI, maxPriceUsd: 5 },
    stockByOracleId: stock,
  });
  assert.equal(kept.length, 1, "no price is not the same as too expensive");
});

check("survivors are ordered by semantic closeness", () => {
  const { kept } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [
      candidate({ name: "Far Cousin", oracleId: "oracle:far", semanticDistance: 0.7 }),
      candidate({ name: "Near Twin", oracleId: "oracle:near", semanticDistance: 0.05 }),
      candidate({ name: "Middle Kin", oracleId: "oracle:mid", semanticDistance: 0.4 }),
    ],
    constraints: GOLGARI,
  });
  assert.deepEqual(kept.map((c) => c.name), ["Near Twin", "Middle Kin", "Far Cousin"]);
});

check("shared roles report the job a swap preserves", () => {
  assert.deepEqual(sharedRoles(["ramp", "mana_generation", "tutor"], ["mana_generation", "ramp"]), [
    "mana_generation",
    "ramp",
  ]);
  assert.deepEqual(sharedRoles(["ramp"], ["removal"]), []);
});

check("a spell is never offered as a replacement for a land", () => {
  const { kept, rejected } = filterSwapCandidates({
    outgoingOracleId: "oracle:forest",
    outgoingIsLand: true,
    deck: DECK,
    candidates: [
      candidate({ name: "Bayou", oracleId: "oracle:bayou", isLand: true, primaryType: "Land" }),
      candidate({ name: "Cabal Ritual", oracleId: "oracle:ritual", isLand: false }),
    ],
    constraints: GOLGARI,
  });
  assert.deepEqual(kept.map((c) => c.name), ["Bayou"]);
  assert.equal(rejected[0]!.code, "TYPE_MISMATCH");
  assert.match(rejected[0]!.detail, /shrink the mana base/);
});

check("a land is never offered as a replacement for a spell", () => {
  const { kept, rejected } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    outgoingIsLand: false,
    deck: DECK,
    candidates: [candidate({ name: "Ancient Tomb", oracleId: "oracle:tomb", isLand: true, primaryType: "Land" })],
    constraints: GOLGARI,
  });
  assert.equal(kept.length, 0, "Putrefy must not be swapped for a land");
  assert.equal(rejected[0]!.code, "TYPE_MISMATCH");
});

check("the type rule is skipped when the outgoing type is unknown", () => {
  const { kept } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [candidate({ name: "Ancient Tomb", oracleId: "oracle:tomb", isLand: true })],
    constraints: GOLGARI,
  });
  assert.equal(kept.length, 1);
});

check("a much more played card is an upgrade", () => {
  const { verdict, lift } = swapVerdict({ outgoingRate: 0.05, incomingRate: 0.9 });
  assert.equal(verdict, "UPGRADE");
  assert.equal(lift, 18);
  assert.match(
    describeVerdict({ verdict, lift, incomingRate: 0.9 }),
    /Played 18\.0x more often.*90% of eligible decks/,
  );
});

check("a comparably played card is a sidegrade", () => {
  assert.equal(swapVerdict({ outgoingRate: 0.4, incomingRate: 0.5 }).verdict, "SIDEGRADE");
  assert.equal(swapVerdict({ outgoingRate: 0.4, incomingRate: 0.4 }).verdict, "SIDEGRADE");
});

check("a much less played card is a downgrade", () => {
  const { verdict, lift } = swapVerdict({ outgoingRate: 0.8, incomingRate: 0.1 });
  assert.equal(verdict, "DOWNGRADE");
  assert.match(describeVerdict({ verdict, lift, incomingRate: 0.1 }), /8\.0x less often/);
});

check("missing play data is reported as unknown, not as a sidegrade", () => {
  assert.equal(swapVerdict({ outgoingRate: null, incomingRate: 0.5 }).verdict, "UNKNOWN");
  assert.equal(swapVerdict({ outgoingRate: 0.5, incomingRate: null }).verdict, "UNKNOWN");
  assert.equal(swapVerdict({ outgoingRate: 0, incomingRate: 0.5 }).verdict, "UNKNOWN");
  assert.equal(swapVerdict({ outgoingRate: 0.5, incomingRate: null }).lift, null);
});

check("candidates with no measured distance sort last, not first", () => {
  const { kept } = filterSwapCandidates({
    outgoingOracleId: "oracle:llanowar",
    deck: DECK,
    candidates: [
      candidate({ name: "Role Match", oracleId: "oracle:role", semanticDistance: null }),
      candidate({ name: "Close Neighbor", oracleId: "oracle:near", semanticDistance: 0.2 }),
    ],
    constraints: GOLGARI,
  });
  assert.deepEqual(kept.map((c) => c.name), ["Close Neighbor", "Role Match"]);
});

console.log(`\ndeck-swap-v1 selftest passed (${n} checks)`);
