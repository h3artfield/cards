import assert from "node:assert/strict";
import { median, runPlanChecker, scoreSynergy } from "./plan-checker-v1";
import { brokenFixture, fynnFixture, hastyFixture } from "./plan-checker-fixtures-v1";
import { planFromBuiltDeck } from "./plan-from-built-deck-v1";
import type { PlanCardV1 } from "./plan-schema-v1";

function same(a: unknown, b: unknown) {
  assert.deepEqual(a, b);
}

const fynn = runPlanChecker({
  cards: fynnFixture.cards,
  commanders: fynnFixture.commanders,
  plan: fynnFixture.plan,
});
const fynnAgain = runPlanChecker({
  cards: fynnFixture.cards.slice().reverse(),
  commanders: fynnFixture.commanders,
  plan: fynnFixture.plan,
});

assert.equal(fynn.checker, "plan-checker-1.0.0");
assert.equal(fynn.seedSet, "canonical-100-v1");
assert.equal(fynn.trials, 100);
same(fynn, fynnAgain);
assert.ok(fynn.successes >= 10, `expected Fynn to win at least 10 trials, got ${fynn.successes}`);
assert.ok(fynn.speed != null && fynn.speed >= 1 && fynn.speed <= 15);
assert.equal(fynn.speed, median(fynn.trialsDetail.flatMap((t) => (t.winTurn == null ? [] : [t.winTurn]))));
assert.ok(fynn.consistency > 0 && fynn.consistency <= 1);
assert.ok(fynn.synergy.score > 0 && fynn.synergy.reason == null);

const broken = runPlanChecker({
  cards: brokenFixture.cards,
  commanders: brokenFixture.commanders,
  plan: brokenFixture.plan,
});
assert.equal(broken.synergy.score, 0);
assert.equal(broken.synergy.reason, "missing-required");
assert.equal(broken.speed, null);
assert.equal(broken.successes, 0);
assert.ok(broken.trialsDetail.every((t) => t.failureReason === "missing-required"));

const hasty = runPlanChecker({
  cards: hastyFixture.cards,
  commanders: hastyFixture.commanders,
  plan: hastyFixture.plan,
  comboMatches: () => false,
  comboDb: "fixture-denied",
});
const hastyVerified = scoreSynergy({
  cards: hastyFixture.cards,
  commanders: hastyFixture.commanders,
  plan: hastyFixture.plan,
  comboMatches: hastyFixture.comboMatches!,
});
assert.equal(hastyVerified.verifiedCombo, 1);
assert.equal(hasty.synergy.verifiedCombo, 0);

const tight = planFromBuiltDeck({
  commander: fynnFixture.commanders[0]!,
  cards: [
    { oracleId: "undercity", name: "Undercity", cmc: 0, power: 0, typeLine: "Dungeon — Undercity", text: "Search your library for a basic land card", quantity: 1 },
    { oracleId: "rampant", name: "Rampant Growth", cmc: 2, power: 0, typeLine: "Sorcery", text: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.", quantity: 1 },
    { oracleId: "worldly", name: "Worldly Tutor", cmc: 1, power: 0, typeLine: "Instant", text: "Search your library for a card, then shuffle and put that card on top.", quantity: 1 },
    { oracleId: "ohran", name: "Ohran Frostfang", cmc: 5, power: 6, typeLine: "Snow Creature — Snake", text: "Attacking creatures you control have deathtouch.", quantity: 1 },
    { oracleId: "moss", name: "Moss Viper", cmc: 1, power: 1, typeLine: "Creature — Snake", text: "Deathtouch", quantity: 1 },
    { oracleId: "glistener", name: "Glistener Elf", cmc: 1, power: 0, typeLine: "Creature — Phyrexian Elf", text: "Infect", quantity: 1 },
    { oracleId: "mystic", name: "Elvish Mystic", cmc: 1, power: 1, typeLine: "Creature — Elf Druid", text: "{T}: Add {G}.", quantity: 1 },
  ],
});
assert.equal(tight.reason, null);
assert.deepEqual(tight.plan?.primary.requiredCards, ["fynn"]);
assert.deepEqual(tight.plan?.primary.tutors, ["worldly"]);
assert.ok(tight.plan?.primary.enablers.includes("rampant"));
assert.ok(tight.plan?.primary.enablers.includes("mystic"));
assert.equal(tight.plan?.primary.enablers.includes("undercity"), false);
assert.equal(tight.plan?.primary.tutors.includes("ohran"), false);

const snakes: PlanCardV1[] = ["Moss Viper", "Fang of Shigeki", "Narnam Renegade", "Ankle Biter", "Sedge Scorpion"].map((name, index) => ({
  oracleId: `snake-${index}`,
  name,
  cmc: 1,
  power: 1,
  typeLine: "Creature — Snake",
  text: "Deathtouch",
  quantity: 1,
}));
const crowded = runPlanChecker({
  cards: [
    { oracleId: "forest", name: "Forest", cmc: 0, power: 0, typeLine: "Basic Land — Forest", text: "{T}: Add {G}.", quantity: 30 },
    ...snakes,
    fynnFixture.cards[2]!,
  ],
  commanders: fynnFixture.commanders,
  plan: {
    schema: "plan-schema-1.0",
    primary: {
      type: "poison-combat",
      requiredCards: ["fynn", ...snakes.map((card) => card.oracleId)],
      tutors: [],
      enablers: ["elvish-mystic"],
      outletCards: [],
      hasteSources: [],
    },
    secondary: null,
    recovery: [],
  },
});
const crowdedCasts = snakes.filter((card) => crowded.trialsDetail[0]!.log.some((line) => line.includes(`cast ${card.name}`)));
assert.ok(crowded.successes >= 10, `crowded poison deck won ${crowded.successes}`);
assert.ok(crowdedCasts.length <= 2, `pilot cast ${crowdedCasts.map((card) => card.name).join(", ")} before it needed to`);

const zeroPower = runPlanChecker({
  cards: [
    { oracleId: "forest", name: "Forest", cmc: 0, power: 0, typeLine: "Basic Land — Forest", text: "{T}: Add {G}.", quantity: 30 },
    { oracleId: "moss-viper", name: "Moss Viper", cmc: 1, power: 0, typeLine: "Creature — Snake", text: "Deathtouch", quantity: 8 },
    fynnFixture.cards[2]!,
  ],
  commanders: [{ ...fynnFixture.commanders[0]!, power: 0 }],
  plan: fynnFixture.plan,
});
assert.equal(zeroPower.synergy.reason, null);
assert.equal(zeroPower.successes, 0, "a 0-power deathtoucher does not deal combat damage");

const few = [3, 3, 3];
assert.equal(median(few), 3);
assert.equal(median([3, 4]), 3.5);
assert.equal(median([]), null);

console.log(
  JSON.stringify(
    {
      fynn: { speed: fynn.speed, consistency: fynn.consistency, synergy: fynn.synergy.score, legacyRmst15: fynn.legacyRmst15, successes: fynn.successes, pilot: fynn.pilot },
      crowded: { speed: crowded.speed, successes: crowded.successes, casts: crowdedCasts.length },
      broken: { speed: broken.speed, reason: broken.synergy.reason },
      hastyUnverified: { successes: hasty.successes, verified: hasty.synergy.verifiedCombo },
    },
    null,
    2,
  ),
);
console.log("plan-checker-v1 selftest passed");
