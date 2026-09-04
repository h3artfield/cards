/**
 * Commander Bracket Rubric v1 — deterministic, rubric-based bracket assignment.
 *
 * Unlike COS, this produces a score for every deck with no reference population.
 * A deck's bracket is the lowest bracket whose rules it does not break, so the
 * result is a function of the 99 alone and is reproducible by hand from the
 * evidence attached to each signal.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";

export const COMMANDER_BRACKET_RUBRIC_V1_VERSION = "commander-bracket-rubric-v1";

export type { CommanderBracket };

/** Minimal card shape the rubric needs. Keeps the core pure and testable. */
export type BracketRubricCard = {
  oracleId: string;
  name: string;
  typeLine: string;
  oracleText: string;
  quantity: number;
  isCommander: boolean;
};

export type BracketRubricEvidence = {
  oracleId: string;
  name: string;
};

export type BracketRubricSignalId =
  | "game_changers"
  | "mass_land_denial"
  | "extra_turns"
  | "two_card_infinite"
  | "infinite_combo"
  | "tutor_density";

export type BracketRubricSignal = {
  id: BracketRubricSignalId;
  label: string;
  /** Measured count of qualifying cards or combos. */
  count: number;
  /**
   * Lowest bracket a deck carrying this measurement may occupy. `null` when the
   * measurement is present but does not by itself raise the floor.
   */
  bracketFloor: CommanderBracket | null;
  /** Cards responsible for the measurement, so a player can check the call. */
  evidence: BracketRubricEvidence[];
  /** One-line plain reading of what was measured and why it matters. */
  detail: string;
};

export type BracketRubricComboSet = {
  cardCount: number;
  /** Cards forming the combo, so the call can be checked against the deck. */
  cards: BracketRubricEvidence[];
  /** True when the combo ends the game rather than only making a resource. */
  winsOnResolution: boolean;
};

/**
 * Combo facts sourced from the CommanderSpellbook detector. Supplied by the
 * caller so this module stays free of artifact I/O.
 */
export type BracketRubricComboSummary = {
  /** Complete combos requiring exactly two cards. */
  twoCardCombos: number;
  totalCombos: number;
  /** Combos that win on resolution rather than only generating a resource. */
  terminalRoutes: number;
  /** Infinite mana / draw / token loops that do not themselves win. */
  resourceOnlyLoops: number;
  minComboCardCount: number | null;
  /** Populated when the caller can resolve combo pieces to names. */
  comboSets?: BracketRubricComboSet[];
};

export type CommanderBracketRubricResult = {
  version: typeof COMMANDER_BRACKET_RUBRIC_V1_VERSION;
  assignedBracket: CommanderBracket;
  assignedBracketName: string;
  /** Signals that actually set the floor, i.e. the reason for the bracket. */
  determiningSignals: BracketRubricSignal[];
  /** Every signal measured, including those that came back clean. */
  signals: BracketRubricSignal[];
  /** What a player would have to add to be pushed into the next bracket up. */
  nextBracketTriggers: string[];
  /**
   * Brackets a decklist cannot prove on its own. Exhibition and cEDH are
   * statements of intent, so the rubric refuses to infer them from cards.
   */
  declaredOnlyBrackets: Array<{ bracket: CommanderBracket; reason: string }>;
  notes: string[];
};
