/**
 * Live UI finalization budget — caps Sol calls so Professor brew room completes in reasonable time.
 * Acceptance scripts / fixtures use full pipeline (liveUiMode=false).
 */
import { MAX_BRACKET_UPGRADE_ITERATIONS_V413 } from "./professor-bracket-upgrade-mission-v4-13-v1";

export const PROFESSOR_LIVE_FINALIZATION_BUDGET_V4_15_1_V1_VERSION =
  "professor-live-finalization-budget-v4-15-1-v1";

export type LiveFinalizationBudgetV4151 = {
  maxBracketIterations: number;
  skipArchitectureAnalysis: boolean;
  skipPackageRefinement: boolean;
  skipArchitectureTransformation: boolean;
  skipSolDeepRefinement: boolean;
  skipWinArchitectureAnalysis: boolean;
};

function envFlag(name: string, defaultWhenUnset: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultWhenUnset;
  return raw === "1" || raw === "true" || raw === "yes";
}

export function resolveLiveFinalizationBudget(liveUiMode: boolean): LiveFinalizationBudgetV4151 {
  const full: LiveFinalizationBudgetV4151 = {
    maxBracketIterations: MAX_BRACKET_UPGRADE_ITERATIONS_V413,
    skipArchitectureAnalysis: false,
    skipPackageRefinement: false,
    skipArchitectureTransformation: false,
    skipSolDeepRefinement: false,
    skipWinArchitectureAnalysis: false,
  };

  if (!liveUiMode) return full;

  const fast = envFlag("PROFESSOR_BREW_LIVE_FAST_FINALIZATION", true);
  if (!fast) {
    const maxRaw = process.env.PROFESSOR_BREW_LIVE_MAX_BRACKET_ITERATIONS?.trim();
    const maxParsed = maxRaw ? parseInt(maxRaw, 10) : NaN;
    return {
      ...full,
      maxBracketIterations:
        Number.isFinite(maxParsed) && maxParsed > 0
          ? Math.min(maxParsed, MAX_BRACKET_UPGRADE_ITERATIONS_V413)
          : 1,
    };
  }

  const maxRaw = process.env.PROFESSOR_BREW_LIVE_MAX_BRACKET_ITERATIONS?.trim();
  const maxParsed = maxRaw ? parseInt(maxRaw, 10) : 1;

  return {
    maxBracketIterations: Number.isFinite(maxParsed) && maxParsed > 0 ? maxParsed : 1,
    skipArchitectureAnalysis: true,
    skipPackageRefinement: true,
    skipArchitectureTransformation: true,
    skipSolDeepRefinement: true,
    skipWinArchitectureAnalysis: true,
  };
}
