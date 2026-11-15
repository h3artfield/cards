import type { PlanCardV1, WinPlanV1 } from "./plan-schema-v1";

export type PlanFixtureV1 = {
  id: string;
  title: string;
  note: string;
  cards: PlanCardV1[];
  commanders: PlanCardV1[];
  plan: WinPlanV1;
  comboMatches?: (requiredOracleIds: string[]) => boolean;
  comboDb?: string;
};

const forest = (n: number): PlanCardV1 => ({
  oracleId: "forest",
  name: "Forest",
  cmc: 0,
  power: 0,
  typeLine: "Basic Land — Forest",
  text: "{T}: Add {G}.",
  quantity: n,
});

export const fynnFixture: PlanFixtureV1 = {
  id: "fynn",
  title: "Fynn poison",
  note: "Primary plan is poison combat. Fynn makes each connecting deathtoucher deal 2 poison. Ten poison wins. Recovery is not part of the plan.",
  commanders: [
    {
      oracleId: "fynn",
      name: "Fynn, the Fangbearer",
      cmc: 2,
      power: 1,
      typeLine: "Legendary Creature",
      text: "Deathtouch. Whenever a creature you control with deathtouch deals combat damage to a player, that player gets two poison counters.",
      quantity: 1,
    },
  ],
  cards: [
    forest(24),
    {
      oracleId: "moss-viper",
      name: "Moss Viper",
      cmc: 1,
      power: 1,
      typeLine: "Creature — Snake",
      text: "Deathtouch",
      quantity: 10,
    },
    {
      oracleId: "elvish-mystic",
      name: "Elvish Mystic",
      cmc: 1,
      power: 1,
      typeLine: "Creature — Elf Druid",
      text: "{T}: Add {G}.",
      quantity: 4,
    },
  ],
  plan: {
    schema: "plan-schema-1.0",
    primary: {
      type: "poison-combat",
      requiredCards: ["fynn", "moss-viper"],
      tutors: [],
      enablers: ["elvish-mystic"],
      outletCards: [],
      hasteSources: [],
    },
    secondary: null,
    recovery: ["regrowth"],
  },
};

export const combatFixture: PlanFixtureV1 = {
  id: "combat",
  title: "Combat damage",
  note: "Declared attackers connect. The checker wins at 40 life or 21 commander damage. This list has no poison and no combo.",
  commanders: [
    {
      oracleId: "goreclaw",
      name: "Goreclaw, Terror of Qal Sisma",
      cmc: 3,
      power: 4,
      typeLine: "Legendary Creature — Bear",
      text: "",
      quantity: 1,
    },
  ],
  cards: [
    forest(22),
    {
      oracleId: "yavimaya-wurm",
      name: "Yavimaya Wurm",
      cmc: 6,
      power: 6,
      typeLine: "Creature — Wurm",
      text: "Trample",
      quantity: 8,
    },
  ],
  plan: {
    schema: "plan-schema-1.0",
    primary: {
      type: "combat-damage",
      requiredCards: ["goreclaw", "yavimaya-wurm"],
      tutors: [],
      enablers: [],
      outletCards: [],
      hasteSources: [],
    },
    secondary: null,
    recovery: [],
  },
};

export const hastyFixture: PlanFixtureV1 = {
  id: "hasty",
  title: "Hasty creatures",
  note: "A verified loop plus a haste source. The combo database here is the fixture matcher, stamped combo-db: fixture.",
  commanders: [
    {
      oracleId: "etali",
      name: "Etali, Primal Conqueror",
      cmc: 7,
      power: 7,
      typeLine: "Legendary Creature",
      text: "",
      quantity: 1,
    },
  ],
  cards: [
    {
      oracleId: "mountain",
      name: "Mountain",
      cmc: 0,
      power: 0,
      typeLine: "Basic Land — Mountain",
      text: "{T}: Add {R}.",
      quantity: 20,
    },
    {
      oracleId: "sol-ring",
      name: "Sol Ring",
      cmc: 1,
      power: 0,
      typeLine: "Artifact",
      text: "{T}: Add {2}.",
      quantity: 1,
    },
    {
      oracleId: "dualcaster",
      name: "Dualcaster Mage",
      cmc: 3,
      power: 2,
      typeLine: "Creature — Human Wizard",
      text: "Flash. Haste.",
      quantity: 1,
    },
    {
      oracleId: "twinflame",
      name: "Twinflame",
      cmc: 2,
      power: 0,
      typeLine: "Sorcery",
      text: "Strive. Create a token copy with haste.",
      quantity: 1,
    },
    {
      oracleId: "anger",
      name: "Anger",
      cmc: 4,
      power: 2,
      typeLine: "Creature — Incarnation",
      text: "Haste. Creatures you control have haste.",
      quantity: 1,
    },
  ],
  plan: {
    schema: "plan-schema-1.0",
    primary: {
      type: "hasty-creatures",
      requiredCards: ["dualcaster", "twinflame"],
      tutors: [],
      enablers: ["sol-ring"],
      outletCards: [],
      hasteSources: ["anger"],
      produces: "enters",
      converts: "damage",
    },
    secondary: null,
    recovery: [],
  },
  comboMatches: (ids) => ids.includes("dualcaster") && ids.includes("twinflame"),
  comboDb: "fixture",
};

export const brokenFixture: PlanFixtureV1 = {
  id: "broken",
  title: "Missing piece",
  note: "The plan requires a card that is not in the deck. Synergy is 0 and every trial fails before a game is played.",
  commanders: fynnFixture.commanders,
  cards: [forest(30)],
  plan: fynnFixture.plan,
};

export const PLAN_FIXTURES: PlanFixtureV1[] = [fynnFixture, combatFixture, hastyFixture, brokenFixture];
