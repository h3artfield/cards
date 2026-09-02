/**
 * Live brew wall-clock budget v4.16 — Professor Brew Room must finish in ~5 minutes.
 * Construction quality comes from v4.16 bracket-native build; finalization stays bounded.
 */
import { MAX_BRACKET_UPGRADE_ITERATIONS_V413 } from "./professor-bracket-upgrade-mission-v4-13-v1";
import type { LiveFinalizationBudgetV4151 } from "./professor-live-finalization-budget-v4-15-1-v1";

export const PROFESSOR_LIVE_BREW_TARGET_WALL_CLOCK_MS_V416 = 5 * 60 * 1000;

function envFlag(name: string, defaultWhenUnset: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultWhenUnset;
  return raw === "1" || raw === "true" || raw === "yes";
}

const FULL_LIVE_BUDGET: LiveFinalizationBudgetV4151 = {
  maxBracketIterations: MAX_BRACKET_UPGRADE_ITERATIONS_V413,
  skipArchitectureAnalysis: false,
  skipPackageRefinement: false,
  skipArchitectureTransformation: false,
  skipSolDeepRefinement: false,
  skipWinArchitectureAnalysis: false,
};

const BOUNDED_LIVE_BUDGET: LiveFinalizationBudgetV4151 = {
  maxBracketIterations: 1,
  skipArchitectureAnalysis: true,
  skipPackageRefinement: true,
  skipArchitectureTransformation: true,
  skipSolDeepRefinement: true,
  skipWinArchitectureAnalysis: true,
};

/**
 * Live UI default: bounded finalization (~5 min total with v4.16 construction).
 * Set PROFESSOR_BREW_LIVE_FULL_FINALIZATION=true for the full acceptance pipeline in the UI.
 */
export function resolveLiveProfessorBrewBudgetV416(liveUiMode: boolean): LiveFinalizationBudgetV4151 {
  if (!liveUiMode) return FULL_LIVE_BUDGET;
  if (envFlag("PROFESSOR_BREW_LIVE_FULL_FINALIZATION", false)) return FULL_LIVE_BUDGET;
  return BOUNDED_LIVE_BUDGET;
}
