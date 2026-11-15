/**
 * Deterministic Commander bracket assignment (v1.1 — WotC Oct 2025 / Feb 2026).
 *
 * The assigned bracket is the lowest bracket whose rules the deck does not
 * break. Each signal contributes a floor; the deck lands at the highest floor
 * any signal produces. There is no reference population, no fitted weight, and
 * no averaging, so the same 99 always yields the same bracket and a player can
 * re-derive the answer from the evidence lists.
 *
 * Tutors no longer raise a floor (WotC removed tutor restrictions in Oct 2025).
 * A few un-chained extra turns are legal in Core and Upgraded. Two-card combos
 * use CommanderSpellbook bracket tags instead of "any two-card → Optimized".
 */
import { COMMANDER_BRACKET_META_V1 } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import {
  detectAnyTutors,
  detectExtraTurnCards,
  detectGameChangers,
  detectMassLandDenial,
  detectUnrestrictedTutors,
  countLoopableExtraTurns,
  EMPTY_COMBO_SUMMARY,
} from "./detectors";
import { maxSpellbookFloorV1 } from "./spellbook-tag-floor";
import {
  COMMANDER_BRACKET_RUBRIC_V1_VERSION,
  type BracketRubricCard,
  type BracketRubricComboSet,
  type BracketRubricComboSummary,
  type BracketRubricEvidence,
  type BracketRubricSignal,
  type CommanderBracket,
  type CommanderBracketRubricResult,
  type SpellbookBracketTagV1,
} from "./types";

export const BASE_BRACKET: CommanderBracket = 2;
export const MAX_INFERABLE_BRACKET: CommanderBracket = 4;
/** Kept for display / ceiling helpers. Tutors do not raise a floor. */
export const TUTOR_DENSITY_THRESHOLD = 3;
export const EXTRA_TURN_CHAIN_THRESHOLD = 3;
export const UPGRADED_GAME_CHANGER_MAX = 3;

function toEvidence(cards: BracketRubricCard[]): BracketRubricEvidence[] {
  return cards
    .map((card) => ({ oracleId: card.oracleId, name: card.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function scoredComboSets(combos: BracketRubricComboSummary): BracketRubricComboSet[] {
  return (combos.comboSets ?? []).filter((set) => !set.requiresUnsatisfiedTemplate);
}

function comboEvidence(
  sets: BracketRubricComboSet[],
  predicate: (set: BracketRubricComboSet) => boolean,
): BracketRubricEvidence[] {
  const byOracleId = new Map<string, BracketRubricEvidence>();
  for (const set of sets) {
    if (!predicate(set)) continue;
    for (const piece of set.cards) byOracleId.set(piece.oracleId, piece);
  }
  return [...byOracleId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function highestFloor(signals: BracketRubricSignal[]): CommanderBracket {
  let floor: CommanderBracket = BASE_BRACKET;
  for (const signal of signals) {
    if (signal.bracketFloor !== null && signal.bracketFloor > floor) {
      floor = signal.bracketFloor;
    }
  }
  return floor > MAX_INFERABLE_BRACKET ? MAX_INFERABLE_BRACKET : floor;
}

function nextBracketTriggers(bracket: CommanderBracket, gameChangerCount: number): string[] {
  if (bracket === 2) {
    return [
      "Adding any card from the Game Changers list moves this deck to Upgraded.",
      "A Spellbook combo tagged Spicy or Powerful moves this deck to Upgraded.",
      "Chaining or looping extra turns moves this deck to Optimized.",
      "Mass land denial moves this deck to Optimized.",
    ];
  }
  if (bracket === 3) {
    const remaining = UPGRADED_GAME_CHANGER_MAX - gameChangerCount;
    return [
      remaining > 0
        ? `${remaining} more Game Changer${remaining === 1 ? "" : "s"} would exceed the Upgraded limit of ${UPGRADED_GAME_CHANGER_MAX} and move it to Optimized.`
        : `This deck is at the Upgraded limit of ${UPGRADED_GAME_CHANGER_MAX} Game Changers. One more moves it to Optimized.`,
      "Adding mass land denial moves this deck to Optimized.",
      "A Spellbook combo tagged Ruthless moves this deck to Optimized.",
      `Reaching ${EXTRA_TURN_CHAIN_THRESHOLD} loopable extra-turn cards moves this deck to Optimized.`,
    ];
  }
  return [];
}

/**
 * Exhibition is declared, not inferred. The list must still look like a
 * theme-first deck: no Game Changers, no mass land denial, no extra turns,
 * and no Spellbook combo tagged Core or hotter.
 */
export function isExhibitionEligibleV1(args: {
  gameChangerCount: number;
  massLandDenialCount: number;
  extraTurnCount: number;
  comboTags: Array<SpellbookBracketTagV1 | null | undefined>;
}): boolean {
  if (args.gameChangerCount > 0) return false;
  if (args.massLandDenialCount > 0) return false;
  if (args.extraTurnCount > 0) return false;
  const comboFloor = maxSpellbookFloorV1(args.comboTags);
  return comboFloor == null;
}

export function classifyCommanderBracketV1(input: {
  cards: BracketRubricCard[];
  gameChangerOracleIds: ReadonlySet<string>;
  combos?: BracketRubricComboSummary | null;
  /** Player-declared target. Only 1 and 5 can override the measured floor. */
  declared?: CommanderBracket | null;
}): CommanderBracketRubricResult {
  const combosSupplied = input.combos != null;
  const combos = input.combos ?? EMPTY_COMBO_SUMMARY;
  const liveSets = scoredComboSets(combos);
  const comboTags = liveSets.map((set) => set.bracketTag);

  const gameChangers = detectGameChangers(input.cards, input.gameChangerOracleIds);
  const gameChangerCount = gameChangers.length;
  const gameChangerFloor: CommanderBracket | null =
    gameChangerCount === 0 ? null : gameChangerCount > UPGRADED_GAME_CHANGER_MAX ? 4 : 3;

  const massLandDenial = detectMassLandDenial(input.cards);
  const extraTurnCards = detectExtraTurnCards(input.cards);
  const loopableExtraTurns = countLoopableExtraTurns(input.cards);
  const unrestrictedTutors = detectUnrestrictedTutors(input.cards);
  const anyTutors = detectAnyTutors(input.cards);

  const chainedExtraTurns = loopableExtraTurns >= EXTRA_TURN_CHAIN_THRESHOLD;
  const extraTurnFloor: CommanderBracket | null = chainedExtraTurns ? 4 : null;

  const twoCardSets = liveSets.filter((set) => set.cardCount === 2);
  const twoCardFloor = maxSpellbookFloorV1(twoCardSets.map((set) => set.bracketTag));
  const anyComboFloor = maxSpellbookFloorV1(comboTags);

  const signals: BracketRubricSignal[] = [
    {
      id: "game_changers",
      label: "Game Changers",
      count: gameChangerCount,
      bracketFloor: gameChangerFloor,
      evidence: toEvidence(gameChangers),
      detail:
        gameChangerCount === 0
          ? "No cards from the Game Changers list."
          : `${gameChangerCount} Game Changer${gameChangerCount === 1 ? "" : "s"}. Upgraded allows up to ${UPGRADED_GAME_CHANGER_MAX}; Optimized has no limit.`,
    },
    {
      id: "mass_land_denial",
      label: "Mass land denial",
      count: massLandDenial.length,
      bracketFloor: massLandDenial.length > 0 ? 4 : null,
      evidence: toEvidence(massLandDenial),
      detail:
        massLandDenial.length === 0
          ? "No mass land destruction or land lockout effects."
          : `${massLandDenial.length} mass land denial effect${massLandDenial.length === 1 ? "" : "s"}. These are expected only at Optimized and above.`,
    },
    {
      id: "extra_turns",
      label: "Extra turns",
      count: extraTurnCards.length,
      bracketFloor: extraTurnFloor,
      evidence: toEvidence(extraTurnCards),
      detail:
        extraTurnCards.length === 0
          ? "No extra-turn effects."
          : chainedExtraTurns
            ? `${extraTurnCards.length} extra-turn card${extraTurnCards.length === 1 ? "" : "s"}, ${loopableExtraTurns} loopable. A turns chain is Optimized.`
            : `${extraTurnCards.length} extra-turn card${extraTurnCards.length === 1 ? "" : "s"}, ${loopableExtraTurns} loopable. A few un-chained extra turns are fine in Core and Upgraded (WotC, Oct 2025).`,
    },
    {
      id: "two_card_infinite",
      label: "Two-card infinite combos",
      count: twoCardSets.length,
      bracketFloor: twoCardFloor,
      evidence: comboEvidence(twoCardSets, () => true),
      detail:
        twoCardSets.length === 0
          ? "No two-card infinite combos detected."
          : `${twoCardSets.length} two-card combo${twoCardSets.length === 1 ? "" : "s"}. Floor comes from the Spellbook tag (Ruthless → Optimized; Spicy/Powerful → Upgraded).`,
    },
    {
      id: "infinite_combo",
      label: "Infinite combos",
      count: liveSets.length,
      bracketFloor: anyComboFloor,
      evidence: comboEvidence(liveSets, () => true),
      detail:
        liveSets.length === 0
          ? "No complete infinite combos detected."
          : `${liveSets.length} complete combo${liveSets.length === 1 ? "" : "s"} after dropping template-only variants. Floor is the hottest Spellbook tag present.`,
    },
    {
      id: "tutor_density",
      label: "Tutors",
      count: unrestrictedTutors.length,
      bracketFloor: null,
      evidence: toEvidence(unrestrictedTutors),
      detail:
        `${unrestrictedTutors.length} unrestricted tutor${unrestrictedTutors.length === 1 ? "" : "s"} out of ${anyTutors.length} library search${anyTutors.length === 1 ? "" : "es"}. ` +
        `Tutors no longer affect brackets (WotC, Oct 2025). Count is consistency information only.`,
    },
  ];

  const measured = highestFloor(signals);
  let assignedBracket = measured;
  const exhibitionOk = isExhibitionEligibleV1({
    gameChangerCount,
    massLandDenialCount: massLandDenial.length,
    extraTurnCount: extraTurnCards.length,
    comboTags,
  });
  if (input.declared === 1 && measured === 2 && exhibitionOk) assignedBracket = 1;
  if (input.declared === 5 && measured === 4) assignedBracket = 5;

  const determiningSignals =
    assignedBracket === BASE_BRACKET || assignedBracket === 1
      ? []
      : signals.filter((signal) => signal.bracketFloor === measured);

  const notes: string[] = [
    "Bracket is assigned by rule, not by comparison against other decks, so every deck receives one.",
    "Tutors no longer affect brackets (WotC, Oct 2025).",
  ];
  if (!combosSupplied) {
    notes.push("Combo detection was not supplied for this run; combo-driven signals read as zero.");
  }
  if (input.declared === 1 && assignedBracket !== 1) {
    notes.push("Exhibition was requested but the list still trips a measured floor, so it stays at the measured bracket.");
  }
  if (input.declared === 5 && assignedBracket === 5) {
    notes.push("cEDH was declared. The list measures Optimized; Bracket 5 is the player's metagame statement.");
  }

  return {
    version: COMMANDER_BRACKET_RUBRIC_V1_VERSION,
    assignedBracket,
    assignedBracketName: COMMANDER_BRACKET_META_V1[assignedBracket].name,
    determiningSignals,
    signals,
    nextBracketTriggers: nextBracketTriggers(measured, gameChangerCount),
    declaredOnlyBrackets: [
      {
        bracket: 1,
        reason:
          "Exhibition is a statement of intent. The rubric assigns it only when the player declares it and the list has no Game Changers, extra turns, mass land denial, or tagged combos.",
      },
      {
        bracket: 5,
        reason:
          "cEDH is a metagame, not a card list. The rubric assigns it only when the player declares it and the list already measures Optimized.",
      },
    ],
    notes,
  };
}
