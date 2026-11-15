/**
 * Four-digit deck score.
 * The thousands digit is the bracket rubric. The last three digits are the
 * log-odds of how often the Professor's named line reaches a rules win.
 * 500 is a line that resolves on 25% of seeds. An unverified claim has no W.
 */
import type { PlanTrialV1 } from "./plan-checker-v1";

export const PLAN_SCORE_VERSION = "plan-score-1.0" as const;

export type DeckScoreV1 = {
  schema: typeof PLAN_SCORE_VERSION;
  bracket: 1 | 2 | 3 | 4 | 5;
  w: number | null;
  display: string;
  planRate: number | null;
  namedLineWins: number | null;
  trials: number | null;
  reason: string | null;
};

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Seeds where the rules win happened and a named piece besides the commander was cast or tutored. */
export function namedLineWins(args: {
  trials: PlanTrialV1[];
  requiredNames: string[];
  commanderName: string;
}): number {
  const commander = normalize(args.commanderName);
  const others = args.requiredNames.filter((name) => normalize(name) !== commander);
  let wins = 0;
  for (const trial of args.trials) {
    if (trial.winTurn == null) continue;
    if (!others.length) {
      wins += 1;
      continue;
    }
    const used = others.some((name) =>
      trial.log.some((line) => line.includes(`cast ${name}`) || line.includes(`tutor ${name}`)),
    );
    if (used) wins += 1;
  }
  return wins;
}

/** Locked scale: 500 at 25%, about +120 when the odds double, clipped to 000–999. */
export function wFromPlanRate(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 999;
  const ref = 0.25 / 0.75;
  const odds = p / (1 - p);
  return Math.max(0, Math.min(999, Math.round(500 + 400 * Math.log10(odds / ref))));
}

export function deckScoreFromPlan(args: {
  bracket: 1 | 2 | 3 | 4 | 5;
  accepted: boolean;
  trials?: PlanTrialV1[];
  requiredNames?: string[];
  commanderName?: string;
  gap?: string | null;
}): DeckScoreV1 {
  if (!args.accepted || !args.trials || !args.commanderName) {
    return {
      schema: PLAN_SCORE_VERSION,
      bracket: args.bracket,
      w: null,
      display: String(args.bracket),
      planRate: null,
      namedLineWins: null,
      trials: args.trials?.length ?? null,
      reason: args.gap ?? "The claim was not verified, so this deck has no last three digits.",
    };
  }
  const wins = namedLineWins({
    trials: args.trials,
    requiredNames: args.requiredNames ?? [],
    commanderName: args.commanderName,
  });
  const rate = wins / Math.max(1, args.trials.length);
  const w = wFromPlanRate(rate);
  return {
    schema: PLAN_SCORE_VERSION,
    bracket: args.bracket,
    w,
    display: String(1000 * args.bracket + w),
    planRate: rate,
    namedLineWins: wins,
    trials: args.trials.length,
    reason:
      "The last three digits are how often the named line reaches a rules win on one silent seat. 500 is a line that resolves on 25% of seeds.",
  };
}
