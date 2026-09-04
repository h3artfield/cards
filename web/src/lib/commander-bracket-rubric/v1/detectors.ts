/**
 * Card-level detectors for the Commander Bracket Rubric.
 *
 * Every detector is text- or name-driven so a player can audit any call by
 * reading the card. Curated name lists cover effects whose templating is too
 * varied to pattern-match reliably; they are meant to be edited as the format
 * changes.
 */
import type { BracketRubricCard, BracketRubricComboSummary } from "./types";

/** "Take an extra turn after this one", including the two- and three-turn variants. */
const RX_EXTRA_TURN = /tak(?:e|es) (?:an|one|two|three|\d+) extra turns?/i;

/**
 * Extra-turn cards that exile themselves cannot be looped by simple recursion,
 * so they are weaker evidence of a turns chain.
 */
const RX_SELF_EXILING = /exile (?:it|this card|[A-Z][\w' ,-]+) instead of putting it into your graveyard/i;

const MASS_LAND_DENIAL_PATTERNS: RegExp[] = [
  /destroy all lands/i,
  /destroy all nonbasic lands/i,
  /sacrifices? all lands/i,
  /each player sacrifices (?:a|one|two|three|X|\d+) lands?/i,
  /return all lands to (?:their owners'|its owner's) hands?/i,
  /lands? don't untap during (?:their|its) controllers?' untap steps?/i,
  /can't untap more than (?:one|two|three|\d+) lands?/i,
  /players can't play lands/i,
];

/**
 * Well-known mass land denial that the patterns above miss, usually because the
 * card denies use of lands rather than destroying them.
 */
const MASS_LAND_DENIAL_NAMES = new Set(
  [
    "Armageddon",
    "Ravages of War",
    "Catastrophe",
    "Jokulhaups",
    "Obliterate",
    "Devastation",
    "Decree of Annihilation",
    "Wildfire",
    "Burning of Xinye",
    "Impending Disaster",
    "Global Ruin",
    "Death Cloud",
    "Epicenter",
    "Winter Orb",
    "Static Orb",
    "Rising Waters",
    "Stasis",
    "Hokori, Dust Drinker",
    "Back to Basics",
    "Blood Moon",
    "Magus of the Moon",
  ].map(normalizeName),
);

/** Tutors that can fetch any card, which is what bracket guidance cares about. */
const RX_UNRESTRICTED_TUTOR =
  /search your library for (?:a|an|any|up to (?:one|two|three|X)) cards?(?![\w ]*\b(?:land|creature|artifact|enchantment|instant|sorcery|planeswalker|basic)\b)/i;

/** Any library search at all, used as the wider tutor-density reading. */
const RX_ANY_TUTOR = /search your library/i;

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function nonCommanderCards(cards: BracketRubricCard[]): BracketRubricCard[] {
  return cards.filter((card) => !card.isCommander);
}

/** Commanders count toward every rubric signal; they are always available. */
function allCards(cards: BracketRubricCard[]): BracketRubricCard[] {
  return cards;
}

export function detectGameChangers(
  cards: BracketRubricCard[],
  gameChangerOracleIds: ReadonlySet<string>,
): BracketRubricCard[] {
  return allCards(cards).filter((card) => gameChangerOracleIds.has(card.oracleId));
}

export function detectExtraTurnCards(cards: BracketRubricCard[]): BracketRubricCard[] {
  return allCards(cards).filter((card) => RX_EXTRA_TURN.test(card.oracleText));
}

/**
 * Extra turns only push a deck up when they can plausibly chain. A single
 * self-exiling Time Warp is a value card; three loopable ones are a game plan.
 */
export function detectLoopableExtraTurnCards(cards: BracketRubricCard[]): BracketRubricCard[] {
  return detectExtraTurnCards(cards).filter((card) => !RX_SELF_EXILING.test(card.oracleText));
}

export function countLoopableExtraTurns(cards: BracketRubricCard[]): number {
  return detectLoopableExtraTurnCards(cards).length;
}

export function detectMassLandDenial(cards: BracketRubricCard[]): BracketRubricCard[] {
  return allCards(cards).filter((card) => {
    if (MASS_LAND_DENIAL_NAMES.has(normalizeName(card.name))) return true;
    return MASS_LAND_DENIAL_PATTERNS.some((pattern) => pattern.test(card.oracleText));
  });
}

export function detectUnrestrictedTutors(cards: BracketRubricCard[]): BracketRubricCard[] {
  return nonCommanderCards(cards).filter((card) => RX_UNRESTRICTED_TUTOR.test(card.oracleText));
}

export function detectAnyTutors(cards: BracketRubricCard[]): BracketRubricCard[] {
  return nonCommanderCards(cards).filter((card) => RX_ANY_TUTOR.test(card.oracleText));
}

/** Shape of the COS architecture fingerprint fields this rubric consumes. */
type ArchitectureFingerprintSubset = {
  nTwoCard: number;
  nNormalizedCombos: number;
  nTerminalRoutes: number;
  nResourceOnlyLoops: number;
  minComboCardCount: number | null;
};

/**
 * Adapts the CommanderSpellbook detector output so the rubric can reuse the
 * compiled combo table without depending on COS scoring or its frozen model.
 */
export function comboSummaryFromArchitecture(
  fingerprint: ArchitectureFingerprintSubset,
): BracketRubricComboSummary {
  return {
    twoCardCombos: fingerprint.nTwoCard,
    totalCombos: fingerprint.nNormalizedCombos,
    terminalRoutes: fingerprint.nTerminalRoutes,
    resourceOnlyLoops: fingerprint.nResourceOnlyLoops,
    minComboCardCount: fingerprint.minComboCardCount,
  };
}

export const EMPTY_COMBO_SUMMARY: BracketRubricComboSummary = {
  twoCardCombos: 0,
  totalCombos: 0,
  terminalRoutes: 0,
  resourceOnlyLoops: 0,
  minComboCardCount: null,
};
