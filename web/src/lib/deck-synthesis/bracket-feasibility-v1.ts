/**
 * Bracket feasibility — separate from commanderArchetypeSupport.
 */
import type { CommanderBracket } from "../bracket-policy/bracket-policy-v1";
import { getBracketPolicy } from "../bracket-policy/bracket-policy-v1";
import type { BracketFeasibilityAssessment, EnginePatternDef } from "./archetype-discovery-types-v1";

const BRACKET_COMBO_THRESHOLDS: Record<CommanderBracket, number> = {
  1: 0.25,
  2: 0.35,
  3: 0.55,
  4: 0.75,
  5: 1,
};

const BRACKET_EXTRA_TURN_THRESHOLDS: Record<CommanderBracket, number> = {
  1: 0.1,
  2: 0.15,
  3: 0.35,
  4: 0.55,
  5: 1,
};

const BRACKET_MLD_THRESHOLDS: Record<CommanderBracket, number> = {
  1: 0.1,
  2: 0.15,
  3: 0.3,
  4: 0.5,
  5: 1,
};

export function assessBracketFeasibility(input: {
  pattern: EnginePatternDef;
  bracket: CommanderBracket;
}): BracketFeasibilityAssessment {
  const policy = getBracketPolicy(input.bracket);
  const signals = input.pattern.bracketIntentSignals;
  const limitingBarometers: string[] = [];
  const hardIncompatibilityReasons: string[] = [];

  if (signals.comboDensity > BRACKET_COMBO_THRESHOLDS[input.bracket]) {
    limitingBarometers.push("combo_density");
  }
  if (signals.extraTurnDensity > BRACKET_EXTRA_TURN_THRESHOLDS[input.bracket]) {
    limitingBarometers.push("extra_turn_density");
  }
  if (signals.mldDensity > BRACKET_MLD_THRESHOLDS[input.bracket]) {
    limitingBarometers.push("mass_land_denial");
  }

  let hardFeasibility = true;
  if (
    input.pattern.patternId === "combo_tutor_engine" &&
    input.bracket <= 2 &&
    signals.comboDensity >= 0.7
  ) {
    hardFeasibility = false;
    hardIncompatibilityReasons.push(
      `Combo assembly engine exceeds Bracket ${input.bracket} hard construction feasibility.`,
    );
  }

  let intentFitAssessment: BracketFeasibilityAssessment["intentFitAssessment"] = "HIGH";
  if (limitingBarometers.length >= 2) intentFitAssessment = "LOW";
  else if (limitingBarometers.length === 1) intentFitAssessment = "MEDIUM";
  if (!hardFeasibility) intentFitAssessment = "INCOMPATIBLE";

  return {
    bracket: input.bracket,
    hardFeasibility,
    hardIncompatibilityReasons,
    intentFitAssessment,
    limitingBarometers,
    note: "HEURISTIC — not official bracket determination",
  };
}
