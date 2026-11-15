import assert from "node:assert/strict";
import { verifyProfessorStrategy } from "./professor-strategy-verify-v1";
import type { PlanCardV1 } from "./plan-schema-v1";
import type { ProfessorStrategyV1 } from "./professor-strategy-v1";

const fynn: PlanCardV1 = {
  oracleId: "fynn",
  name: "Fynn, the Fangbearer",
  cmc: 2,
  power: 1,
  typeLine: "Legendary Creature — Human Warrior",
  text: "Deathtouch. Whenever a creature you control with deathtouch deals combat damage to a player, that player gets two poison counters.",
  quantity: 1,
};
const viper: PlanCardV1 = {
  oracleId: "viper",
  name: "Moss Viper",
  cmc: 1,
  power: 1,
  typeLine: "Creature — Snake",
  text: "Deathtouch",
  quantity: 1,
};
const bear: PlanCardV1 = {
  oracleId: "bear",
  name: "Grizzly Bears",
  cmc: 2,
  power: 2,
  typeLine: "Creature — Bear",
  text: "",
  quantity: 1,
};

function strategy(win: Partial<ProfessorStrategyV1["win"]>): ProfessorStrategyV1 {
  return {
    schema: "professor-strategy-1.0",
    explanation: { mulligans: "Keep a land and a creature.", earlySetup: "Elf, then Fynn.", sequencing: "Attack.", interactions: "Deathtouch poison.", recovery: "Regrowth." },
    win: {
      type: "poison-combat",
      summary: "Poison",
      howTheyWorkTogether: "Fynn plus a deathtoucher.",
      howTheyWin: "Poison counters.",
      requiredCards: ["Moss Viper"],
      tutors: [],
      enablers: [],
      ...win,
    },
  };
}

const accepted = verifyProfessorStrategy({ strategy: strategy({}), commander: fynn, cards: [viper] });
assert.equal(accepted.accepted, true);
assert.ok(accepted.plan?.primary.requiredCards.includes("viper"));

const missing = verifyProfessorStrategy({ strategy: strategy({ requiredCards: ["Black Lotus"] }), commander: fynn, cards: [viper] });
assert.equal(missing.accepted, false);
assert.equal(missing.plan, null);
assert.ok(missing.gaps.some((gap) => gap.includes("Black Lotus")));

const bearWin = verifyProfessorStrategy({
  strategy: strategy({ type: "poison-combat", requiredCards: ["Grizzly Bears"], summary: "The bear poisons them." }),
  commander: { ...fynn, text: "Vigilance.", name: "Some Legend" },
  cards: [bear],
});
assert.equal(bearWin.accepted, false);
assert.ok(bearWin.gaps.some((gap) => gap.includes("poison")));

const prologue: PlanCardV1 = {
  oracleId: "prologue",
  name: "Prologue to Phyresis",
  cmc: 1,
  power: 0,
  typeLine: "Instant",
  text: "Each opponent gets a poison counter.",
  quantity: 1,
};
const unsupported = verifyProfessorStrategy({
  strategy: strategy({ requiredCards: ["Prologue to Phyresis", "Moss Viper"] }),
  commander: fynn,
  cards: [viper, prologue],
});
assert.equal(unsupported.accepted, false);
assert.ok(unsupported.gaps.some((gap) => gap.includes("Prologue to Phyresis")));

const combo = verifyProfessorStrategy({
  strategy: strategy({ type: "hasty-creatures", requiredCards: ["Moss Viper"] }),
  commander: fynn,
  cards: [viper],
});
assert.equal(combo.accepted, false);
assert.ok(combo.gaps.some((gap) => gap.includes("combo")));

console.log("professor strategy verify selftest passed");
