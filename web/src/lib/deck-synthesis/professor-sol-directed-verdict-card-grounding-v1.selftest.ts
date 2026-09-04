/**
 * Tests verdict card grounding against the real Fynn, the Fangbearer review,
 * which was graded A- while describing The Great Henge, Bow of Nylea, and
 * Inkmoth Nexus — none of which were in the list.
 *
 * The prose below is verbatim from that review.
 */
import assert from "node:assert/strict";
import {
  buildGroundingCorrectionNoticeV1,
  checkVerdictCardGroundingV1,
  findCardNamesInTextV1,
} from "./professor-sol-directed-verdict-card-grounding-v1";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

/** The Fynn decklist as shipped. */
const FYNN_DECK = [
  "Fynn, the Fangbearer",
  "Ambush Viper", "Arbor Elf", "Beast Whisperer", "Birds of Paradise", "Deadly Recluse",
  "Elvish Mystic", "Eternal Witness", "Evolution Sage", "Fang of Shigeki", "Fyndhorn Elves",
  "Haywire Mite", "Llanowar Elves", "Mirkwood Spider", "Moss Viper", "Narnam Cobra",
  "Narnam Renegade", "Ohran Frostfang", "Ohran Viper", "Questing Beast", "Sedge Scorpion",
  "Skullwinder", "Tajuru Blightblade", "Thornweald Archer", "Timeless Witness",
  "Toski, Bearer of Secrets", "Toxic Scorpion", "Wasteland Viper",
  "Beast Within", "Chord of Calling", "Force of Vigor", "Heroic Intervention", "Krosan Grip",
  "Nature's Claim", "Return of the Wildspeaker", "Return to Nature", "Snakeskin Veil",
  "Tamiyo's Safekeeping", "Tyvar's Stand", "Veil of Summer", "Worldly Tutor",
  "Cultivate", "Finale of Devastation", "Green Sun's Zenith", "Nature's Lore",
  "Overwhelming Stampede", "Regrowth", "Three Visits", "Triumph of the Hordes",
  "Chrome Mox", "Grafted Exoskeleton", "Key to the City", "Skullclamp",
  "Trailblazer's Boots", "Whispersilk Cloak",
  "Beastmaster Ascension", "Canopy Cover", "Garruk's Uprising", "Guardian Project",
  "Kenrith's Transformation", "Rancor", "Song of the Dryads", "Sylvan Library",
  "Utopia Sprawl", "Wild Growth",
  "Ancient Tomb", "Boseiju, Who Endures", "Dryad Arbor", "Fabled Passage", "Forest",
  "Gaea's Cradle", "Karn's Bastion", "Misty Rainforest", "Nykthos, Shrine to Nyx",
  "Pendelhaven", "Prismatic Vista", "Rogue's Passage", "Verdant Catacombs",
  "Windswept Heath", "Wooded Foothills", "Yavimaya, Cradle of Growth",
];

/**
 * Real cards the reviewer might name. Stands in for the catalog: the deck plus
 * the three it hallucinated plus a few plausible suggestions.
 */
const REAL_CARDS = new Set(
  [
    ...FYNN_DECK,
    "The Great Henge",
    "Bow of Nylea",
    "Inkmoth Nexus",
    "Ram Through",
    "Tail Swipe",
    "Bojuka Bog",
    "Swamp",
    "Fear",
  ].map(normalize),
);

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const isRealCardName = (name: string): boolean => REAL_CARDS.has(normalize(name));

/** Verbatim fields from the A- Fynn review. */
const FYNN_VERDICT: Record<string, unknown> = {
  classification: "OPTIONAL_REFINEMENT",
  grade: "A-",
  bracketFit:
    "This is an appropriate upper-Bracket-4 construction. It uses efficient ramp, four reasonable tutors, strong interaction, protection, and several finite combat-based win routes without deterministic combos, infinite proliferate, or mass land destruction. Gaea's Cradle, Ancient Tomb, and the tutor package increase ceiling but are being used to support a fair creature-combat strategy rather than a dedicated fast-combo shell.",
  strategyCoherence:
    "The deck is highly coherent. The secondary plans—Triumph of the Hordes, Evolution Sage, Grafted Exoskeleton, and conventional overrun effects—overlap productively with the primary combat plan rather than pulling the deck in a different direction.",
  manaAssessment:
    "Mana is well constructed. The deck has 35 lands, 20 Forests, six fetch/shuffle lands plus Dryad Arbor, abundant reliable green sources, ten acceleration cards, and several scalable utility lands. Gaea's Cradle, Nykthos, Ancient Tomb, and the other utility lands are acceptable at this bracket. Cultivate is slower than the rest of the ramp package but improves post-sweeper recovery.",
  earlyMidLateGameAssessment:
    "The late game is also credible through Beastmaster Ascension, Overwhelming Stampede, Triumph of the Hordes, Finale of Devastation, The Great Henge, recursion, and scalable mana lands. The list is somewhat more top-heavy than the ideal low-curve Fynn deck because of The Great Henge, Ohran Frostfang, Return of the Wildspeaker, and several five-mana effects.",
  winConditionAssessment:
    "Fynn, the Fangbearer plus multiple deathtouch creatures, with Rancor, Canopy Cover, Trailblazer's Boots, Whispersilk Cloak, Bow of Nylea, removal, or protection enabling repeated connections and lethal poison. Use proliferate, Inkmoth Nexus, or equipment-based infect as alternate closing tools when Fynn is repeatedly removed.",
  interactionAssessment:
    "Beast Within and Song of the Dryads answer problematic permanents, Kenrith's Transformation neutralizes creatures while drawing a card, and Nature's Claim, Krosan Grip, Force of Vigor, Return to Nature, and Haywire Mite handle artifacts, enchantments, and graveyards.",
  resilienceAssessment:
    "Heroic Intervention, Tamiyo's Safekeeping, Veil of Summer, Snakeskin Veil, and Tyvar's Stand protect key turns; Sylvan Library, Guardian Project, Beast Whisperer, Toski, The Great Henge, and Skullclamp provide sustained recovery.",
  reasoningSummary:
    "All ten architect packages are represented at their requested counts, the deck contains exactly 35 lands, and the nonland slots are almost entirely strategically justified.",
  selfBuildQuestionAnswer:
    "Yes. Given this Commander, Bracket 4, and the stated balanced/flexible intent, this is substantially the deck the Professor would recommend.",
  offPlanCards: [],
  requiredChanges: [],
  optionalChanges: [
    "Consider converting one of the more redundant artifact/enchantment answers—especially Force of Vigor, Krosan Grip, or Return to Nature—into a more direct creature-removal option such as Ram Through, Tail Swipe, or another flexible answer.",
  ],
};

console.log("verdict card grounding");

const grounding = checkVerdictCardGroundingV1({
  verdict: FYNN_VERDICT,
  deckCardNames: FYNN_DECK,
  isRealCardName,
});

check("the three hallucinated cards are all caught", () => {
  const names = new Set(grounding.descriptiveViolations.map((v) => v.cited));
  assert.ok(names.has("The Great Henge"), `missing The Great Henge; got ${[...names].join(", ")}`);
  assert.ok(names.has("Bow of Nylea"), `missing Bow of Nylea; got ${[...names].join(", ")}`);
  assert.ok(names.has("Inkmoth Nexus"), `missing Inkmoth Nexus; got ${[...names].join(", ")}`);
  assert.equal(grounding.grounded, false);
});

check("nothing in the deck is reported as off-deck", () => {
  const offenders = grounding.descriptiveViolations
    .map((v) => v.cited)
    .filter((name) => !["The Great Henge", "Bow of Nylea", "Inkmoth Nexus"].includes(name));
  assert.deepEqual(offenders, [], `false positives: ${offenders.join(", ")}`);
});

check("a leading 'The' in a card name is captured, not dropped", () => {
  // "The Great Henge" begins with a word that also begins sentences.
  const found = findCardNamesInTextV1({
    text: "The Great Henge is powerful but is the largest curve outlier.",
    isRealCardName,
  });
  assert.ok(found.includes("The Great Henge"));
});

check("comma-separated lists do not merge into one unmatched span", () => {
  const found = findCardNamesInTextV1({
    text: "Sylvan Library, Guardian Project, Beast Whisperer, Toski, The Great Henge, and Skullclamp provide recovery.",
    isRealCardName,
  });
  assert.ok(found.includes("Sylvan Library"));
  assert.ok(found.includes("Guardian Project"));
  assert.ok(found.includes("The Great Henge"));
  assert.ok(found.includes("Skullclamp"));
});

check("a name containing 'of' is matched in full, not truncated", () => {
  const found = findCardNamesInTextV1({ text: "with Bow of Nylea, removal, or protection", isRealCardName });
  assert.ok(found.includes("Bow of Nylea"), `got ${found.join(", ")}`);
});

check("possessives and embedded commas resolve", () => {
  // Matching is normalisation-based, so the reported span may omit the comma
  // in "Nykthos, Shrine to Nyx" — it still resolves to the same card.
  const found = findCardNamesInTextV1({
    text: "Gaea's Cradle, Nykthos, Shrine to Nyx, and Toski, Bearer of Secrets are present.",
    isRealCardName,
  }).map(normalize);
  assert.ok(found.includes(normalize("Gaea's Cradle")));
  assert.ok(found.includes(normalize("Nykthos, Shrine to Nyx")), `got ${found.join(", ")}`);
  assert.ok(found.includes(normalize("Toski, Bearer of Secrets")), `got ${found.join(", ")}`);
});

check("suggestions may name cards the deck lacks", () => {
  // Ram Through and Tail Swipe are recommendations, not false claims.
  const suggestionNames = grounding.citations
    .filter((c) => c.kind === "SUGGESTION")
    .map((c) => c.cited);
  assert.ok(suggestionNames.includes("Ram Through"));
  assert.ok(suggestionNames.includes("Tail Swipe"));
  const descriptive = grounding.descriptiveViolations.map((c) => c.cited);
  assert.ok(!descriptive.includes("Ram Through"), "a suggestion must not count as a false claim");
});

check("offPlanCards must name cards that are actually in the deck", () => {
  const result = checkVerdictCardGroundingV1({
    verdict: { ...FYNN_VERDICT, offPlanCards: ["Bojuka Bog", "Rancor"] },
    deckCardNames: FYNN_DECK,
    isRealCardName,
  });
  const names = result.descriptiveViolations.filter((v) => v.field === "offPlanCards").map((v) => v.cited);
  assert.deepEqual(names, ["Bojuka Bog"], "Rancor is in the deck; Bojuka Bog is not");
});

check("generic capitalised prose is not mistaken for a card", () => {
  const found = findCardNamesInTextV1({
    text: "Mana is well constructed. Protection is strong. Resilience is very good. Commander and Bracket 4 apply. Forest counts are fine.",
    isRealCardName,
  });
  assert.deepEqual(found, [], `false positives: ${found.join(", ")}`);
});

check("a clean review is reported as grounded", () => {
  const result = checkVerdictCardGroundingV1({
    verdict: {
      manaAssessment: "The deck has 20 Forests, Gaea's Cradle, and Ancient Tomb.",
      offPlanCards: [],
      requiredChanges: [],
      optionalChanges: [],
    },
    deckCardNames: FYNN_DECK,
    isRealCardName,
  });
  assert.equal(result.grounded, true);
  assert.deepEqual(result.descriptiveViolations, []);
});

check("the correction notice names each card and where it appeared", () => {
  const notice = buildGroundingCorrectionNoticeV1(grounding);
  assert.match(notice, /GROUNDING_CORRECTION_REQUIRED/);
  assert.match(notice, /The Great Henge/);
  assert.match(notice, /Bow of Nylea/);
  assert.match(notice, /Inkmoth Nexus/);
  assert.match(notice, /earlyMidLateGameAssessment/);
  // It must not tell the model to stop making suggestions.
  assert.match(notice, /may still recommend/);
});

console.log(`\n${n} checks passed`);
