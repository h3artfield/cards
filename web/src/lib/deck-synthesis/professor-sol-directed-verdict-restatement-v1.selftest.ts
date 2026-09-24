/**
 * Built from a real staging build, be6b1974, which shipped grade B+ with a
 * review praising The Great Henge in bracketFit and Utopia Sprawl in
 * manaAssessment. The bracket attainment pass had swapped both out after the
 * review was written:
 *
 *   Fyndhorn Elves -> Mox Diamond; Utopia Sprawl -> Mana Vault;
 *   The Great Henge -> Chrome Mox
 *
 * So the shipped report described two cards the shipped deck did not contain.
 */
import assert from "node:assert/strict";
import {
  describeUnresolvedStaleReviewV1,
  mergeRestatementV1,
  restateVerdictForFinalDeckV1,
  shouldKeepRestatementV1,
  staleFieldsForRestatementV1,
} from "./professor-sol-directed-verdict-restatement-v1";
import { checkVerdictCardGroundingV1 } from "./professor-sol-directed-verdict-card-grounding-v1";
import { normalizeOracleName } from "../deck-builder/golden-catalog/normalize-name";
import type { SolDirectedHeadProfessorWholeDeckVerdictV111 } from "./professor-sol-directed-head-professor-v1-1-1";

let n = 0;
function check(label: string, fn: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(fn()).then(() => {
    n += 1;
    console.log(`  ok  ${label}`);
  });
}

// The cards that actually shipped, plus the two the pass removed so the
// resolver still recognises them as real Magic cards.
const FINAL_DECK = [
  "Fynn, the Fangbearer",
  "Mox Diamond",
  "Mana Vault",
  "Chrome Mox",
  "Nature's Lore",
  "Hornet Nest",
  "Cankerbloom",
  "Forest",
];
const REAL_CARDS = new Set([...FINAL_DECK, "The Great Henge", "Utopia Sprawl", "Fyndhorn Elves"]);

// Must be the catalog's own normalizer: the module under test resolves names
// through normalizeOracleName, so a lookalike here would silently match nothing.
const realNames = new Set([...REAL_CARDS].map(normalizeOracleName));
const isRealCardName = (name: string) => realNames.has(normalizeOracleName(name));

const STALE_VERDICT = {
  classification: "OPTIONAL_REFINEMENT",
  grade: "B+",
  bracketFit:
    "This is a reasonable upper-Bracket-4 construction. Efficient tutors, strong protection, and The Great Henge push the deck toward the stronger end of the bracket.",
  manaAssessment:
    "The deck has eight acceleration cards with six turn-one mana sources plus Nature's Lore and Utopia Sprawl.",
  strategyCoherence: "The central strategy is coherent: a low-curve mono-green creature deck.",
  earlyMidLateGameAssessment: "The early game is strong because the deck has many one- and two-mana creatures.",
  winConditionAssessment: "The primary Fynn win condition is real and supported.",
  interactionAssessment: "Cankerbloom is an excellent supplemental interaction card.",
  resilienceAssessment: "Resilience is above average for a combat-based Fynn deck.",
  reasoningSummary: "The construction successfully realizes the requested strategy.",
  selfBuildQuestionAnswer: "Yes, substantially.",
  offPlanCards: ["Hornet Nest"],
  requiredChanges: [],
  optionalChanges: ["Replace Hornet Nest with a genuine low-cost deathtouch attacker."],
} as unknown as SolDirectedHeadProfessorWholeDeckVerdictV111;

const SWAPS = [
  "Fyndhorn Elves -> Mox Diamond",
  "Utopia Sprawl -> Mana Vault",
  "The Great Henge -> Chrome Mox",
];

const catalog = { byNormalizedName: { has: (k: string) => realNames.has(k) } } as never;
const finalDeck = {
  commander: { name: "Fynn, the Fangbearer" },
  nonlands: FINAL_DECK.slice(1, 7).map((name) => ({ name })),
  lands: [{ name: "Forest", copies: 25 }],
  landCount: 25,
} as never;

function groundingOf(verdict: unknown) {
  return checkVerdictCardGroundingV1({
    verdict: verdict as Record<string, unknown>,
    deckCardNames: FINAL_DECK,
    isRealCardName,
  });
}

async function main(): Promise<void> {
  console.log("detecting the stale review");

  await check("the live Fynn verdict is caught against its own final deck", () => {
    const g = groundingOf(STALE_VERDICT);
    assert.equal(g.grounded, false);
    const cited = [...new Set(g.descriptiveViolations.map((v) => v.cited))].sort();
    assert.deepEqual(cited, ["The Great Henge", "Utopia Sprawl"]);
  });

  await check("only the two stale fields are selected for restatement", () => {
    const fields = staleFieldsForRestatementV1(groundingOf(STALE_VERDICT));
    assert.deepEqual(fields.sort(), ["bracketFit", "manaAssessment"]);
  });

  console.log("\nrestating");

  await check("a grounded review costs no model call", async () => {
    let called = false;
    const grounded = { ...STALE_VERDICT, bracketFit: "Fine.", manaAssessment: "Fine." };
    const out = await restateVerdictForFinalDeckV1({
      verdict: grounded as SolDirectedHeadProfessorWholeDeckVerdictV111,
      finalDeck,
      swaps: SWAPS,
      catalog,
      callModel: async () => {
        called = true;
        return { parsed: {} };
      },
    });
    assert.equal(out, null);
    assert.equal(called, false, "nothing was stale, so no restatement should be requested");
  });

  await check("a stale review is corrected and the grade is preserved", async () => {
    const out = await restateVerdictForFinalDeckV1({
      verdict: STALE_VERDICT,
      finalDeck,
      swaps: SWAPS,
      catalog,
      callModel: async (input) => {
        // Grade must not even be offered to the model.
        assert.ok(!("grade" in (input.jsonSchema.properties as object)));
        assert.ok(!("classification" in (input.jsonSchema.properties as object)));
        return {
          parsed: {
            bracketFit: "This is a reasonable upper-Bracket-4 construction, with Chrome Mox adding speed.",
            manaAssessment: "The deck has eight acceleration cards plus Nature's Lore and Mana Vault.",
          },
        };
      },
    });
    assert.ok(out, "a stale review should be restated");
    assert.equal(out!.grounding.grounded, true);
    assert.equal(out!.verdict.grade, "B+", "a restatement must not regrade");
    assert.equal(out!.verdict.classification, "OPTIONAL_REFINEMENT");
    assert.deepEqual(out!.staleCards.sort(), ["The Great Henge", "Utopia Sprawl"]);
    assert.doesNotMatch(out!.verdict.bracketFit, /Great Henge/);
    assert.doesNotMatch(out!.verdict.manaAssessment, /Utopia Sprawl/);
  });

  await check("untouched fields keep their original wording", async () => {
    const out = await restateVerdictForFinalDeckV1({
      verdict: STALE_VERDICT,
      finalDeck,
      swaps: SWAPS,
      catalog,
      callModel: async () => ({
        parsed: { bracketFit: "Upper Bracket 4.", manaAssessment: "Eight accelerants." },
      }),
    });
    assert.ok(out);
    assert.equal(out!.verdict.strategyCoherence, STALE_VERDICT.strategyCoherence);
    assert.equal(out!.verdict.winConditionAssessment, STALE_VERDICT.winConditionAssessment);
    assert.deepEqual(out!.verdict.optionalChanges, STALE_VERDICT.optionalChanges);
  });

  await check("a restatement that names another absent card is rejected", async () => {
    const out = await restateVerdictForFinalDeckV1({
      verdict: STALE_VERDICT,
      finalDeck,
      swaps: SWAPS,
      catalog,
      callModel: async () => ({
        parsed: {
          bracketFit: "Fyndhorn Elves pushes this toward the stronger end.",
          manaAssessment: "Utopia Sprawl still anchors the ramp.",
        },
      }),
    });
    assert.equal(out, null, "swapping one wrong card for another is not an improvement");
  });

  await check("a model failure leaves the original verdict in place", async () => {
    const out = await restateVerdictForFinalDeckV1({
      verdict: STALE_VERDICT,
      finalDeck,
      swaps: SWAPS,
      catalog,
      callModel: async () => {
        throw new Error("model unavailable");
      },
    });
    assert.equal(out, null, "a failed restatement must not fail the build");
  });

  console.log("\nhelpers");

  await check("merge never writes grade or classification", () => {
    const revised = mergeRestatementV1({
      verdict: STALE_VERDICT,
      parsed: { grade: "A+", classification: "CONSTRUCTION_SUCCESS", bracketFit: "Restated." },
      fields: ["bracketFit"],
    });
    assert.equal(revised.grade, "B+");
    assert.equal(revised.classification, "OPTIONAL_REFINEMENT");
    assert.equal(revised.bracketFit, "Restated.");
  });

  await check("keep-decision requires a strict improvement", () => {
    const two = { descriptiveViolations: [{}, {}] } as never;
    const one = { descriptiveViolations: [{}] } as never;
    assert.equal(shouldKeepRestatementV1({ before: two, after: one }), true);
    assert.equal(shouldKeepRestatementV1({ before: two, after: two }), false);
    assert.equal(shouldKeepRestatementV1({ before: one, after: two }), false);
  });

  await check("the unresolved-mismatch notice names the stale cards", () => {
    const msg = describeUnresolvedStaleReviewV1(["The Great Henge", "Utopia Sprawl"]);
    assert.match(msg, /The Great Henge/);
    assert.match(msg, /out of date/i);
  });

  console.log(`\n${n} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
