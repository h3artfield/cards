/**
 * A Fynn, the Fangbearer report showed "Redundancy 0th percentile" and "Win
 * architecture 5th percentile" beside a Head Professor grade of A- whose prose
 * said the plan "has real redundancy", and then told the player their biggest
 * opportunity was Redundancy.
 *
 * Both axes are derived entirely from verified CommanderSpellbook lines:
 * win_architecture is 0 without a complete line, and redundancy is
 * sharedPieceConcentration, the share of combo sets holding the most reused
 * card. With no combos both are structural zeros, so every comboless deck
 * lands at the same floor regardless of construction. COS already refuses to
 * publish Competitive Strength from a missing intercept; these tests hold the
 * profile axes to that same rule.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { scoreFromHeadlineVector } from "./score";
import { buildCosV1PlayerReport } from "./player-report";
import { COS_V1_COMBO_DERIVED_AXES, COS_V1_PROFILE_META } from "./profile-scalars";
import { cosGradeDivergenceNoteV1 } from "./grade-divergence-v1";
import type { CosV1AccessFeatures, CosV1ArchitectureFingerprint, CosV1Model, CosV1Reference } from "./types";

let n = 0;
function check(label: string, fn: () => void): void {
  fn();
  n += 1;
  console.log(`  ok  ${label}`);
}

const COS = resolve(
  process.cwd(),
  "data/milestones/mechanical-space/commander-optimization-score-v1",
);
const model = JSON.parse(readFileSync(resolve(COS, "MODEL.json"), "utf8")) as CosV1Model;
const reference = JSON.parse(readFileSync(resolve(COS, "REFERENCE.json"), "utf8")) as CosV1Reference;
const fixtures = JSON.parse(readFileSync(resolve(COS, "GOLDEN_FIXTURES.json"), "utf8")) as {
  decks: Array<{ x: number[]; commanderIdentity: string }>;
};
function sha(name: string): string {
  return createHash("sha256").update(readFileSync(resolve(COS, name))).digest("hex");
}
const hashes = {
  formula: sha("FORMULA.json"),
  schema: sha("SCHEMA.json"),
  model: sha("MODEL.json"),
  reference: sha("REFERENCE.json"),
};

const access: CosV1AccessFeatures = {
  nonlandCount: 64,
  landCount: 35,
  meanMvNonland: 2.6,
  fracMvLe2: 0.45,
  tutorFrac: 0.06,
  drawFrac: 0.12,
  rampFrac: 0.15,
  interactFrac: 0.12,
  protectFrac: 0.08,
  recurFrac: 0.06,
  roleCompressFrac: 0.1,
  clusterEntropy: 1.2,
  sharedConc: 0,
};

const comboless: CosV1ArchitectureFingerprint = {
  nNormalizedCombos: 0,
  nTwoCard: 0,
  nThreeCard: 0,
  nFourPlusCard: 0,
  fractionCommanderInvolved: 0,
  nCommanderInvolved: 0,
  nTerminalRoutes: 0,
  nResourceOnlyLoops: 0,
  nCardsInMultipleComboSets: 0,
  sharedPieceConcentration: 0,
  minComboCardCount: 0,
  commanderDependence: "NONE",
  terminalBuckets: [],
  enablingBuckets: [],
  nCombosWithPrereqOrTemplate: 0,
  nCombosWithManaNeeded: 0,
  zoneProfile: {},
  hasTerminal: false,
} as unknown as CosV1ArchitectureFingerprint;

const withCombos: CosV1ArchitectureFingerprint = {
  ...comboless,
  nNormalizedCombos: 3,
  nTwoCard: 1,
  nTerminalRoutes: 2,
  nCardsInMultipleComboSets: 1,
  sharedPieceConcentration: 0.5,
  minComboCardCount: 2,
  hasTerminal: true,
  terminalBuckets: ["WIN_THE_GAME"],
} as unknown as CosV1ArchitectureFingerprint;

function score(architecture: CosV1ArchitectureFingerprint, commanderIdentity: string) {
  return scoreFromHeadlineVector({
    x: fixtures.decks[0]!.x,
    commanderIdentity,
    model,
    reference,
    access: { ...access, sharedConc: Number(architecture.sharedPieceConcentration || 0) },
    architecture,
    hashes,
  });
}

const KNOWN = fixtures.decks[0]!.commanderIdentity;
const UNKNOWN = "unseen-commander-identity-not-in-model";

console.log("profile axis measurability");

check("combo-derived axes are the two that need a verified line", () => {
  assert.deepEqual([...COS_V1_COMBO_DERIVED_AXES].sort(), ["redundancy", "win_architecture"]);
});

check("a deck with no verified combo line marks those two unmeasurable", () => {
  const scored = score(comboless, UNKNOWN);
  assert.equal(scored.zeroCombo, true);
  for (const axis of scored.profile) {
    const expected = !COS_V1_COMBO_DERIVED_AXES.has(axis.id);
    assert.equal(axis.measurable, expected, `${axis.id} measurable`);
    if (!expected) assert.equal(axis.unmeasurableReason, "NO_VERIFIED_COMBO_LINE");
  }
});

check("the other eight axes stay measurable — they are text-derived", () => {
  const scored = score(comboless, UNKNOWN);
  const measurable = scored.profile.filter((a) => a.measurable).map((a) => a.id);
  assert.equal(measurable.length, 8);
  assert.ok(measurable.includes("interaction"));
  assert.ok(measurable.includes("mana_efficiency"));
  assert.ok(measurable.includes("resilience"));
});

check("a deck with verified lines keeps all ten measurable", () => {
  const scored = score(withCombos, KNOWN);
  assert.equal(scored.profile.length, 10);
  assert.deepEqual(
    scored.profile.filter((a) => !a.measurable),
    [],
  );
});

check("the frozen percentile is still emitted, so the math is unchanged", () => {
  // Presentation withholds the number; the model does not stop computing it.
  const scored = score(comboless, UNKNOWN);
  for (const axis of scored.profile) {
    assert.equal(typeof axis.percentile, "number");
    assert.ok(Number.isFinite(axis.percentile), `${axis.id} percentile finite`);
  }
  assert.equal(scored.COS_V1_MATH_CHANGED, false);
  assert.equal(scored.PROFILE_AVERAGED_INTO_HEADLINE, false);
});

console.log("\nplayer report wording and advice");

function report(architecture: CosV1ArchitectureFingerprint, commanderIdentity: string) {
  const scored = score(architecture, commanderIdentity);
  return {
    scored,
    report: buildCosV1PlayerReport({
      score: scored,
      architecture,
      hits: [],
      comboIndex: new Map(),
      names: new Map(),
    }),
  };
}

check("an unmeasurable axis says so instead of claiming the deck is below par", () => {
  const { report: built } = report(comboless, UNKNOWN);
  const redundancy = built.profile.find((a) => a.id === "redundancy")!;
  assert.equal(redundancy.measurable, false);
  assert.match(redundancy.explanation, /not measurable/i);
  assert.doesNotMatch(
    redundancy.explanation,
    /below typical/i,
    "the old wording asserted the deck was below typical on a metric it was never measured on",
  );
});

check("headroom advice never points at an axis no card change can move", () => {
  const { report: built } = report(comboless, UNKNOWN);
  const headroom = built.optimizationHeadroom.join(" ");
  assert.doesNotMatch(headroom, /most room on the profile is Redundancy/i);
  // The real reason is still reported, just not as a profile weakness.
  assert.match(headroom, /no verified Spellbook terminal/i);
});

check("unmeasurable axes are not cited as low strength drivers", () => {
  const { report: built } = report(comboless, UNKNOWN);
  const why = built.whyTheScore.join(" ");
  assert.doesNotMatch(why, /Win architecture \(/i);
});

check("a measurable weak axis is still reported as headroom", () => {
  // Guard against over-suppression: only combo-derived axes are withheld.
  const weakAccess: CosV1AccessFeatures = { ...access, interactFrac: 0, sharedConc: 0 };
  const scored = scoreFromHeadlineVector({
    x: fixtures.decks[0]!.x,
    commanderIdentity: UNKNOWN,
    model,
    reference,
    access: weakAccess,
    architecture: comboless,
    hashes,
  });
  const built = buildCosV1PlayerReport({
    score: scored,
    architecture: comboless,
    hits: [],
    comboIndex: new Map(),
    names: new Map(),
  });
  const interaction = built.profile.find((a) => a.id === "interaction")!;
  assert.equal(interaction.measurable, true);
  assert.doesNotMatch(interaction.explanation, /not measurable/i);
});

console.log("\naxis labels state what they measure");

check("every axis carries a measurement description", () => {
  for (const meta of COS_V1_PROFILE_META) {
    assert.ok(meta.measures && meta.measures.length > 20, `${meta.id} needs a measures line`);
    assert.match(meta.measures, /\.$/, `${meta.id} measures should read as a sentence`);
  }
});

check("the three labels that mislead say what they actually count", () => {
  const by = (id: string) => COS_V1_PROFILE_META.find((m) => m.id === id)!.measures;
  // Redundancy reads as "backup plans" but is combo-piece reuse.
  assert.match(by("redundancy"), /combo lines/i);
  assert.match(by("redundancy"), /not backup game plans/i);
  // Resilience reads as "survives removal" but is graveyard recursion only.
  assert.match(by("resilience"), /graveyard/i);
  assert.match(by("resilience"), /not protection/i);
  // Coherence reads as "focused strategy" but is cluster concentration, and
  // measuring per copy means 20 basics are worth ~15 percentile points.
  assert.match(by("coherence"), /clusters/i);
  assert.match(by("coherence"), /basic-land/i);
});

check("the report carries the measurement through to the player", () => {
  const { report: built } = report(comboless, UNKNOWN);
  assert.equal(built.profile.length, 10);
  for (const axis of built.profile) {
    assert.ok(axis.measures && axis.measures.length > 20, `${axis.id} measures missing in report`);
  }
});

console.log("\naxis banding reflects measured contribution");

check("coherence is descriptive, not a strength driver", () => {
  // LOO_coherence held-out drop is 0.000385 logloss and ADD_coherence has a
  // negative mean per-event delta, so it cannot be billed as driving strength.
  const coherence = COS_V1_PROFILE_META.find((m) => m.id === "coherence")!;
  assert.equal(coherence.role, "descriptive_only");
});

check("the axes with real model credit stay load-bearing", () => {
  const loadBearing = COS_V1_PROFILE_META.filter((m) => m.role === "load_bearing").map((m) => m.id);
  assert.deepEqual(loadBearing.sort(), [
    "card_advantage",
    "interaction",
    "mana_efficiency",
    "protection",
    "win_architecture",
  ]);
});

check("coherence is banded and explained as a characteristic", () => {
  const { report: built } = report(comboless, UNKNOWN);
  const coherence = built.profile.find((a) => a.id === "coherence")!;
  assert.equal(coherence.band, "Deck characteristics");
  assert.match(coherence.explanation, /not averaged into Competitive Strength/i);
});

console.log("\ngrade vs build-optimization divergence");

check("the Fynn case gets a note: A- above a 1st-percentile build score", () => {
  const note = cosGradeDivergenceNoteV1({ displayLetter: "A-", buildOptimization: 1 });
  assert.ok(note, "A- over 1st percentile is exactly the pairing that looks self-contradictory");
  assert.match(note!, /not in conflict/i);
  assert.match(note!, /different questions/i);
});

check("a low grade over a high build score gets the mirror note", () => {
  const note = cosGradeDivergenceNoteV1({ displayLetter: "D+", buildOptimization: 91 });
  assert.ok(note);
  assert.match(note!, /not the deck the Professor would recommend/i);
});

check("agreeing signals get no note", () => {
  assert.equal(cosGradeDivergenceNoteV1({ displayLetter: "A-", buildOptimization: 88 }), null);
  assert.equal(cosGradeDivergenceNoteV1({ displayLetter: "D", buildOptimization: 4 }), null);
  assert.equal(cosGradeDivergenceNoteV1({ displayLetter: "C+", buildOptimization: 50 }), null);
});

check("missing or unscored inputs get no note", () => {
  assert.equal(cosGradeDivergenceNoteV1({ displayLetter: "—", buildOptimization: 1 }), null);
  assert.equal(cosGradeDivergenceNoteV1({ displayLetter: "A-", buildOptimization: null }), null);
  assert.equal(cosGradeDivergenceNoteV1({ displayLetter: null, buildOptimization: 1 }), null);
  assert.equal(cosGradeDivergenceNoteV1({ displayLetter: "A-", buildOptimization: Number.NaN }), null);
});

console.log(`\n${n} checks passed`);
