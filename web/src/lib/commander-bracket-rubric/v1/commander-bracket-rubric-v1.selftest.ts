import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { classifyCommanderBracketV1 } from "./classify";
import {
  countLoopableExtraTurns,
  detectMassLandDenial,
  detectUnrestrictedTutors,
  comboSummaryFromArchitecture,
} from "./detectors";
import type { BracketRubricCard, BracketRubricComboSummary } from "./types";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

function card(partial: Partial<BracketRubricCard> & { name: string }): BracketRubricCard {
  return {
    oracleId: partial.oracleId ?? `oracle:${partial.name.toLowerCase().replace(/\s+/g, "-")}`,
    name: partial.name,
    typeLine: partial.typeLine ?? "Sorcery",
    oracleText: partial.oracleText ?? "",
    quantity: partial.quantity ?? 1,
    isCommander: partial.isCommander ?? false,
  };
}

const COMMANDER = card({
  name: "Chatterfang, Squirrel General",
  typeLine: "Legendary Creature — Squirrel Ranger",
  oracleText: "If one or more tokens would be created under your control, those tokens plus that many Squirrel tokens are created instead.",
  isCommander: true,
});

/** A plain Core deck: no Game Changers, no combos, no extra turns, no denial. */
const VANILLA: BracketRubricCard[] = [
  COMMANDER,
  card({ name: "Llanowar Elves", typeLine: "Creature — Elf Druid", oracleText: "{T}: Add {G}." }),
  card({ name: "Cultivate", oracleText: "Search your library for up to two basic land cards." }),
  card({ name: "Putrefy", oracleText: "Destroy target artifact or creature." }),
];

const GC_IDS = new Set<string>(["oracle:demonic-tutor", "oracle:cyclonic-rift", "oracle:mana-crypt", "oracle:fierce-guardianship"]);

function classify(
  cards: BracketRubricCard[],
  combos?: BracketRubricComboSummary | null,
  declared?: 1 | 2 | 3 | 4 | 5 | null,
) {
  return classifyCommanderBracketV1({ cards, gameChangerOracleIds: GC_IDS, combos, declared });
}

console.log("commander-bracket-rubric-v1 selftest");

check("clean deck lands in Core with no determining signals", () => {
  const result = classify(VANILLA);
  assert.equal(result.assignedBracket, 2);
  assert.equal(result.assignedBracketName, "Core");
  assert.deepEqual(result.determiningSignals, []);
});

check("every deck receives a bracket, including an empty list", () => {
  const result = classify([]);
  assert.equal(result.assignedBracket, 2);
  assert.equal(result.signals.length, 6, "all six signals are always reported");
});

check("one Game Changer raises the deck to Upgraded", () => {
  const result = classify([
    ...VANILLA,
    card({ oracleId: "oracle:demonic-tutor", name: "Demonic Tutor", oracleText: "Search your library for a card and put it into your hand." }),
  ]);
  assert.equal(result.assignedBracket, 3);
  assert.equal(result.assignedBracketName, "Upgraded");
  assert.equal(result.determiningSignals.length, 1);
  assert.equal(result.determiningSignals[0]!.id, "game_changers");
  assert.deepEqual(
    result.determiningSignals[0]!.evidence.map((e) => e.name),
    ["Demonic Tutor"],
    "the triggering card is named as evidence",
  );
});

check("three Game Changers stay at Upgraded, a fourth pushes to Optimized", () => {
  const three = classify([
    ...VANILLA,
    card({ oracleId: "oracle:demonic-tutor", name: "Demonic Tutor" }),
    card({ oracleId: "oracle:cyclonic-rift", name: "Cyclonic Rift" }),
    card({ oracleId: "oracle:mana-crypt", name: "Mana Crypt" }),
  ]);
  assert.equal(three.assignedBracket, 3);

  const four = classify([
    ...VANILLA,
    card({ oracleId: "oracle:demonic-tutor", name: "Demonic Tutor" }),
    card({ oracleId: "oracle:cyclonic-rift", name: "Cyclonic Rift" }),
    card({ oracleId: "oracle:mana-crypt", name: "Mana Crypt" }),
    card({ oracleId: "oracle:fierce-guardianship", name: "Fierce Guardianship" }),
  ]);
  assert.equal(four.assignedBracket, 4);
  assert.equal(four.assignedBracketName, "Optimized");
});

check("mass land denial forces Optimized even in an otherwise clean deck", () => {
  const byName = classify([...VANILLA, card({ name: "Armageddon", oracleText: "Destroy all lands." })]);
  assert.equal(byName.assignedBracket, 4);

  const byText = classify([
    ...VANILLA,
    card({ name: "Homemade Wrath", oracleText: "Destroy all lands. They can't be regenerated." }),
  ]);
  assert.equal(byText.assignedBracket, 4, "text patterns catch cards outside the curated list");
});

check("land lockout is caught by text, using Winter Orb's real wording", () => {
  const renamed = detectMassLandDenial([
    card({
      name: "Not On The Curated List",
      typeLine: "Artifact",
      oracleText: "As long as this artifact is untapped, players can't untap more than one land during their untap steps.",
    }),
  ]);
  assert.equal(renamed.length, 1, "current Winter Orb templating must match on text alone");

  const legacyWording = detectMassLandDenial([
    card({ name: "Also Not Curated", oracleText: "Lands don't untap during their controllers' untap steps." }),
  ]);
  assert.equal(legacyWording.length, 1);
});

check("a few un-chained extra turns stay in Core (WotC Oct 2025)", () => {
  const result = classify([
    ...VANILLA,
    card({
      name: "Temporal Mastery",
      oracleText: "Take an extra turn after this one. Exile Temporal Mastery instead of putting it into your graveyard.",
    }),
  ]);
  assert.equal(result.assignedBracket, 2);
  assert.equal(
    countLoopableExtraTurns([
      card({
        name: "Temporal Mastery",
        oracleText: "Take an extra turn after this one. Exile Temporal Mastery instead of putting it into your graveyard.",
      }),
    ]),
    0,
    "a self-exiling extra turn is not counted as loopable",
  );
});

check("three loopable extra turns read as a turns chain and force Optimized", () => {
  const turns = ["Time Warp", "Temporal Manipulation", "Capture of Jingzhou"].map((name) =>
    card({ name, oracleText: "Take an extra turn after this one." }),
  );
  const result = classify([...VANILLA, ...turns]);
  assert.equal(result.assignedBracket, 4);
  assert.equal(result.determiningSignals.some((s) => s.id === "extra_turns"), true);
});

check("a Ruthless two-card combo forces Optimized", () => {
  const result = classify(VANILLA, {
    twoCardCombos: 1,
    totalCombos: 1,
    terminalRoutes: 1,
    resourceOnlyLoops: 0,
    minComboCardCount: 2,
    comboSets: [
      {
        cardCount: 2,
        cards: [
          { oracleId: "oracle:thassas-oracle", name: "Thassa's Oracle" },
          { oracleId: "oracle:demonic-consultation", name: "Demonic Consultation" },
        ],
        winsOnResolution: true,
        bracketTag: "R",
      },
    ],
  });
  assert.equal(result.assignedBracket, 4);
  assert.equal(result.determiningSignals.some((s) => s.id === "two_card_infinite"), true);
});

check("a Spicy two-card combo only reaches Upgraded", () => {
  const result = classify(VANILLA, {
    twoCardCombos: 1,
    totalCombos: 1,
    terminalRoutes: 0,
    resourceOnlyLoops: 1,
    minComboCardCount: 2,
    comboSets: [
      {
        cardCount: 2,
        cards: [
          { oracleId: "oracle:a", name: "Piece A" },
          { oracleId: "oracle:b", name: "Piece B" },
        ],
        winsOnResolution: false,
        bracketTag: "S",
      },
    ],
  });
  assert.equal(result.assignedBracket, 3);
});

check("a template-only combo does not raise the floor", () => {
  const result = classify(VANILLA, {
    twoCardCombos: 1,
    totalCombos: 1,
    terminalRoutes: 1,
    resourceOnlyLoops: 0,
    minComboCardCount: 2,
    comboSets: [
      {
        cardCount: 2,
        cards: [
          { oracleId: "oracle:a", name: "Piece A" },
          { oracleId: "oracle:b", name: "Piece B" },
        ],
        winsOnResolution: true,
        bracketTag: "R",
        requiresUnsatisfiedTemplate: true,
      },
    ],
  });
  assert.equal(result.assignedBracket, 2);
});

check("combo signals name their pieces when combo sets are supplied", () => {
  const result = classify(VANILLA, {
    twoCardCombos: 1,
    totalCombos: 2,
    terminalRoutes: 1,
    resourceOnlyLoops: 1,
    minComboCardCount: 2,
    comboSets: [
      {
        cardCount: 2,
        cards: [
          { oracleId: "oracle:thassas-oracle", name: "Thassa's Oracle" },
          { oracleId: "oracle:demonic-consultation", name: "Demonic Consultation" },
        ],
        winsOnResolution: true,
        bracketTag: "R",
      },
      {
        cardCount: 3,
        cards: [
          { oracleId: "oracle:basalt-monolith", name: "Basalt Monolith" },
          { oracleId: "oracle:rings-of-brighthearth", name: "Rings of Brighthearth" },
          { oracleId: "oracle:sol-ring", name: "Sol Ring" },
        ],
        winsOnResolution: false,
        bracketTag: "S",
      },
    ],
  });

  const twoCard = result.signals.find((s) => s.id === "two_card_infinite")!;
  assert.deepEqual(
    twoCard.evidence.map((e) => e.name),
    ["Demonic Consultation", "Thassa's Oracle"],
    "only the two-card combo's pieces are cited",
  );

  const anyCombo = result.signals.find((s) => s.id === "infinite_combo")!;
  assert.equal(anyCombo.evidence.length, 5, "all combo pieces are cited, deduplicated");
});

check("a three-card Spicy combo only reaches Upgraded", () => {
  const result = classify(VANILLA, {
    twoCardCombos: 0,
    totalCombos: 1,
    terminalRoutes: 1,
    resourceOnlyLoops: 0,
    minComboCardCount: 3,
    comboSets: [
      {
        cardCount: 3,
        cards: [
          { oracleId: "oracle:a", name: "A" },
          { oracleId: "oracle:b", name: "B" },
          { oracleId: "oracle:c", name: "C" },
        ],
        winsOnResolution: true,
        bracketTag: "S",
      },
    ],
  });
  assert.equal(result.assignedBracket, 3);
});

check("unrestricted tutors are counted but type-restricted searches are not", () => {
  const cards = [
    card({ name: "Demonic Tutor", oracleText: "Search your library for a card and put it into your hand." }),
    card({ name: "Worldly Tutor", oracleText: "Search your library for a creature card and reveal it." }),
    card({ name: "Rampant Growth", oracleText: "Search your library for a basic land card." }),
  ];
  const unrestricted = detectUnrestrictedTutors(cards);
  assert.deepEqual(unrestricted.map((c) => c.name), ["Demonic Tutor"]);
});

check("tutors no longer raise a bracket floor", () => {
  const tutors = ["Diabolic Tutor", "Beseech the Queen", "Grim Tutor"].map((name) =>
    card({ name, oracleText: "Search your library for a card and put it into your hand." }),
  );
  const result = classify([...VANILLA, ...tutors]);
  assert.equal(result.assignedBracket, 2);
  const tutor = result.signals.find((s) => s.id === "tutor_density")!;
  assert.equal(tutor.bracketFloor, null);
  assert.equal(tutor.count, 3);
});

check("the commander itself counts toward signals", () => {
  const result = classify([
    card({
      oracleId: "oracle:demonic-tutor",
      name: "Demonic Tutor",
      isCommander: true,
    }),
  ]);
  assert.equal(result.assignedBracket, 3, "a Game Changer commander still raises the floor");
});

check("Exhibition and cEDH are never inferred from cards", () => {
  const result = classify(VANILLA, {
    twoCardCombos: 9,
    totalCombos: 20,
    terminalRoutes: 12,
    resourceOnlyLoops: 8,
    minComboCardCount: 2,
    comboSets: [
      {
        cardCount: 2,
        cards: [
          { oracleId: "oracle:a", name: "A" },
          { oracleId: "oracle:b", name: "B" },
        ],
        winsOnResolution: true,
        bracketTag: "R",
      },
    ],
  });
  assert.equal(result.assignedBracket, 4, "the rubric caps at Optimized");
  assert.deepEqual(result.declaredOnlyBrackets.map((d) => d.bracket), [1, 5]);
});

check("Exhibition is assigned only when declared and the list is clean", () => {
  const clean = classify(VANILLA, null, 1);
  assert.equal(clean.assignedBracket, 1);
  const dirty = classify(
    [...VANILLA, card({ oracleId: "oracle:mana-crypt", name: "Mana Crypt" })],
    null,
    1,
  );
  assert.equal(dirty.assignedBracket, 3);
});

check("cEDH is assigned only when declared and the list already measures Optimized", () => {
  const core = classify(VANILLA, null, 5);
  assert.equal(core.assignedBracket, 2, "a Core list cannot become cEDH by declaration");
  const optimized = classify(
    [...VANILLA, card({ name: "Armageddon", oracleText: "Destroy all lands." })],
    null,
    5,
  );
  assert.equal(optimized.assignedBracket, 5);
});

check("the 2026-08-11 Game Changer snapshot is 53 cards including Farewell and Biorhythm", () => {
  const snapshot = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "data/milestones/commander-strategy/commander-game-changers-snapshot-2026-08-11-v1.json",
      ),
      "utf8",
    ),
  ) as { officialCardNames: string[] };
  assert.equal(snapshot.officialCardNames.length, 53);
  assert.ok(snapshot.officialCardNames.includes("Farewell"));
  assert.ok(snapshot.officialCardNames.includes("Biorhythm"));
  assert.equal(snapshot.officialCardNames.includes("Mana Crypt"), false);
  assert.equal(snapshot.officialCardNames.includes("Dockside Extortionist"), false);
  assert.equal(snapshot.officialCardNames.includes("Jeweled Lotus"), false);
});

check("the same deck always produces the same result", () => {
  const deck = [...VANILLA, card({ oracleId: "oracle:mana-crypt", name: "Mana Crypt" })];
  const a = classify(deck);
  const b = classify([...deck].reverse());
  assert.equal(a.assignedBracket, b.assignedBracket);
  assert.deepEqual(a.signals, b.signals, "signal output is independent of card order");
});

check("next-bracket triggers are stated for every non-capped bracket", () => {
  assert.ok(classify(VANILLA).nextBracketTriggers.length > 0, "Core explains what reaches Upgraded");
  const upgraded = classify([...VANILLA, card({ oracleId: "oracle:mana-crypt", name: "Mana Crypt" })]);
  assert.ok(upgraded.nextBracketTriggers.length > 0, "Upgraded explains what reaches Optimized");
  const optimized = classify([...VANILLA, card({ name: "Armageddon", oracleText: "Destroy all lands." })]);
  assert.deepEqual(optimized.nextBracketTriggers, [], "Optimized is the ceiling the rubric will infer");
});

check("architecture fingerprints adapt into a combo summary", () => {
  const summary = comboSummaryFromArchitecture({
    nTwoCard: 2,
    nNormalizedCombos: 5,
    nTerminalRoutes: 3,
    nResourceOnlyLoops: 1,
    minComboCardCount: 2,
  });
  assert.deepEqual(summary, {
    twoCardCombos: 2,
    totalCombos: 5,
    terminalRoutes: 3,
    resourceOnlyLoops: 1,
    minComboCardCount: 2,
  });
});

console.log(`\ncommander-bracket-rubric-v1 selftest passed (${n} checks)`);
