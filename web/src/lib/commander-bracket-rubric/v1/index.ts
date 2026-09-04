export {
  BASE_BRACKET,
  EXTRA_TURN_CHAIN_THRESHOLD,
  MAX_INFERABLE_BRACKET,
  TUTOR_DENSITY_THRESHOLD,
  UPGRADED_GAME_CHANGER_MAX,
  classifyCommanderBracketV1,
} from "./classify";
export {
  comboSummaryFromArchitecture,
  countLoopableExtraTurns,
  detectAnyTutors,
  detectExtraTurnCards,
  detectGameChangers,
  detectMassLandDenial,
  detectUnrestrictedTutors,
  EMPTY_COMBO_SUMMARY,
} from "./detectors";
export {
  COMMANDER_BRACKET_RUBRIC_V1_VERSION,
  type BracketRubricCard,
  type BracketRubricComboSummary,
  type BracketRubricEvidence,
  type BracketRubricSignal,
  type BracketRubricSignalId,
  type CommanderBracket,
  type CommanderBracketRubricResult,
} from "./types";
