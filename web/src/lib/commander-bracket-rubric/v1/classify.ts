/**
 * Deterministic Commander bracket assignment.
 *
 * The assigned bracket is the lowest bracket whose rules the deck does not
 * break. Each signal contributes a floor; the deck lands at the highest floor
 * any signal produces. There is no reference population, no fitted weight, and
 * no averaging, so the same 99 always yields the same bracket and a player can
 * re-derive the answer from the evidence lists.
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
import {
  COMMANDER_BRACKET_RUBRIC_V1_VERSION,
  type BracketRubricCard,
  type BracketRubricComboSet,
  type BracketRubricComboSummary,
  type BracketRubricEvidence,
  type BracketRubricSignal,
  type CommanderBracket,
  type CommanderBracketRubricResult,
} from "./types";

/**
 * A deck with no escalating signals sits in Core. Exhibition is below this and
 * is an intent declaration rather than something a card list can demonstrate.
 */
export const BASE_BRACKET: CommanderBracket = 2;

/**
 * The rubric never assigns cEDH. Bracket 5 is defined by playing a tuned list
 * into a competitive metagame, which is indistinguishable from Optimized by
 * inspecting cards alone.
 */
export const MAX_INFERABLE_BRACKET: CommanderBracket = 4;

/** Unrestricted tutors tolerated before the deck reads as Upgraded. */
export const TUTOR_DENSITY_THRESHOLD = 3;

/** Loopable extra-turn cards tolerated before the deck reads as Optimized. */
export const EXTRA_TURN_CHAIN_THRESHOLD = 3;

/** Game Changers permitted in Upgraded, per the published bracket rules. */
export const UPGRADED_GAME_CHANGER_MAX = 3;

function toEvidence(cards: BracketRubricCard[]): BracketRubricEvidence[] {
  return cards
    .map((card) => ({ oracleId: card.oracleId, name: card.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Flattens the pieces of matching combos into a deduplicated evidence list. */
function comboEvidence(
  combos: BracketRubricComboSummary,
  predicate: (set: BracketRubricComboSet) => boolean,
): BracketRubricEvidence[] {
  const byOracleId = new Map<string, BracketRubricEvidence>();
  for (const set of combos.comboSets ?? []) {
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
      "Adding a card that takes an extra turn moves this deck to Upgraded.",
      `Reaching ${TUTOR_DENSITY_THRESHOLD} unrestricted tutors moves this deck to Upgraded.`,
      "Completing any infinite combo moves this deck to Upgraded.",
    ];
  }
  if (bracket === 3) {
    const remaining = UPGRADED_GAME_CHANGER_MAX - gameChangerCount;
    return [
      remaining > 0
        ? `${remaining} more Game Changer${remaining === 1 ? "" : "s"} would exceed the Upgraded limit of ${UPGRADED_GAME_CHANGER_MAX} and move this deck to Optimized.`
        : `This deck is at the Upgraded limit of ${UPGRADED_GAME_CHANGER_MAX} Game Changers. One more moves it to Optimized.`,
      "Adding mass land denial moves this deck to Optimized.",
      "Completing a two-card infinite combo moves this deck to Optimized.",
      `Reaching ${EXTRA_TURN_CHAIN_THRESHOLD} loopable extra-turn cards moves this deck to Optimized.`,
    ];
  }
  return [];
}

export function classifyCommanderBracketV1(input: {
  cards: BracketRubricCard[];
  gameChangerOracleIds: ReadonlySet<string>;
  combos?: BracketRubricComboSummary | null;
}): CommanderBracketRubricResult {
  const combosSupplied = input.combos != null;
  const combos = input.combos ?? EMPTY_COMBO_SUMMARY;

  const gameChangers = detectGameChangers(input.cards, input.gameChangerOracleIds);
  const gameChangerCount = gameChangers.length;
  const gameChangerFloor: CommanderBracket | null =
    gameChangerCount === 0 ? null : gameChangerCount > UPGRADED_GAME_CHANGER_MAX ? 4 : 3;

  const massLandDenial = detectMassLandDenial(input.cards);
  const extraTurnCards = detectExtraTurnCards(input.cards);
  const loopableExtraTurns = countLoopableExtraTurns(input.cards);
  const unrestrictedTutors = detectUnrestrictedTutors(input.cards);
  const anyTutors = detectAnyTutors(input.cards);

  const extraTurnFloor: CommanderBracket | null =
    extraTurnCards.length === 0 ? null : loopableExtraTurns >= EXTRA_TURN_CHAIN_THRESHOLD ? 4 : 3;

  const infiniteComboCount = combos.terminalRoutes + combos.resourceOnlyLoops;

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
          : `${extraTurnCards.length} extra-turn card${extraTurnCards.length === 1 ? "" : "s"}, ${loopableExtraTurns} of which can be looped. Chaining turns is expected only at Optimized and above.`,
    },
    {
      id: "two_card_infinite",
      label: "Two-card infinite combos",
      count: combos.twoCardCombos,
      bracketFloor: combos.twoCardCombos > 0 ? 4 : null,
      evidence: comboEvidence(combos, (set) => set.cardCount === 2),
      detail:
        combos.twoCardCombos === 0
          ? "No two-card infinite combos detected."
          : `${combos.twoCardCombos} two-card infinite combo${combos.twoCardCombos === 1 ? "" : "s"} assembled from cards in this deck.`,
    },
    {
      id: "infinite_combo",
      label: "Infinite combos",
      count: infiniteComboCount,
      bracketFloor: infiniteComboCount > 0 ? 3 : null,
      evidence: comboEvidence(combos, () => true),
      detail:
        infiniteComboCount === 0
          ? "No complete infinite combos detected."
          : `${combos.terminalRoutes} combo${combos.terminalRoutes === 1 ? "" : "s"} that win on the spot and ${combos.resourceOnlyLoops} that generate unbounded resources.`,
    },
    {
      id: "tutor_density",
      label: "Tutors",
      count: unrestrictedTutors.length,
      bracketFloor: unrestrictedTutors.length >= TUTOR_DENSITY_THRESHOLD ? 3 : null,
      evidence: toEvidence(unrestrictedTutors),
      detail:
        `${unrestrictedTutors.length} unrestricted tutor${unrestrictedTutors.length === 1 ? "" : "s"} out of ${anyTutors.length} library search effect${anyTutors.length === 1 ? "" : "s"}. ` +
        `Core decks are expected to run fewer than ${TUTOR_DENSITY_THRESHOLD} unrestricted tutors.`,
    },
  ];

  const assignedBracket = highestFloor(signals);
  const determiningSignals =
    assignedBracket === BASE_BRACKET
      ? []
      : signals.filter((signal) => signal.bracketFloor === assignedBracket);

  const notes: string[] = [
    "Bracket is assigned by rule, not by comparison against other decks, so every deck receives one.",
  ];
  if (!combosSupplied) {
    notes.push("Combo detection was not supplied for this run; combo-driven signals read as zero.");
  }

  return {
    version: COMMANDER_BRACKET_RUBRIC_V1_VERSION,
    assignedBracket,
    assignedBracketName: COMMANDER_BRACKET_META_V1[assignedBracket].name,
    determiningSignals,
    signals,
    nextBracketTriggers: nextBracketTriggers(assignedBracket, gameChangerCount),
    declaredOnlyBrackets: [
      {
        bracket: 1,
        reason:
          "Exhibition is a statement of intent about theme and restraint. A card list cannot demonstrate it, so the rubric never assigns it.",
      },
      {
        bracket: 5,
        reason:
          "cEDH is defined by playing a tuned list into a competitive metagame. It is not distinguishable from Optimized by inspecting cards.",
      },
    ],
    notes,
  };
}
