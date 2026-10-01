/**
 * What the simulator did with a Professor strategy.
 * A rejected claim has no played result. The claim is not the score.
 */
import type { PlanTrialV1 } from "./plan-checker-v1";
import type { ProfessorStrategyV1 } from "./professor-strategy-v1";
import type { StrategyVerificationV1 } from "./professor-strategy-verify-v1";

export const EXECUTION_REPORT_VERSION = "execution-report-1.0" as const;

export type ExecutionLineV1 = {
  count: number;
  turn: number;
  seed: number;
  line: string;
};

export type FailedSetupV1 = {
  count: number;
  reason: string;
  seed: number;
  detail: string;
};

export type ExecutionReportV1 = {
  schema: typeof EXECUTION_REPORT_VERSION;
  model: string | null;
  explanation: ProfessorStrategyV1["explanation"];
  claim: ProfessorStrategyV1["win"];
  accepted: boolean;
  gaps: string[];
  limits: string[];
  played: null | {
    speed: number | null;
    consistency: number;
    successes: number;
    trials: number;
    histogram: string;
    successfulLines: ExecutionLineV1[];
    failedSetups: FailedSetupV1[];
    decisions: string[];
  };
};

function histogram(trials: PlanTrialV1[]): string {
  const counts = new Map<string, number>();
  for (const trial of trials) {
    const key = trial.winTurn == null ? "miss" : String(trial.winTurn);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([turn, count]) => `${turn}:${count}`)
    .join(" ");
}

function actionLine(trial: PlanTrialV1): string {
  return trial.log.filter((line) => / cast | tutor | ramp | win /.test(line)).join(" → ");
}

function failReason(trial: PlanTrialV1, winType: string): string {
  if (trial.failureReason && trial.failureReason !== "cap") return trial.failureReason;
  if (!trial.log.some((line) => line.includes(" cast "))) return "no spells cast before the turn cap";
  if (winType === "poison-combat" && trial.poison <= 0) return "spells were cast and no poison was dealt";
  if (winType === "poison-combat") return `poison stopped at ${trial.poison} before the turn cap`;
  if (winType === "combat-damage") return `combat stopped at ${trial.combatDamage} life and ${trial.commanderDamage} commander damage`;
  return trial.assembled ? "pieces assembled and the win was not verified" : "required pieces never assembled";
}

function failDetail(trial: PlanTrialV1): string {
  const last = [...trial.log].reverse().find((line) => /poison|combat|cast|tutor|mulligans/.test(line));
  return last ?? "no actions recorded";
}

export function buildExecutionReport(args: {
  strategy: ProfessorStrategyV1;
  verified: StrategyVerificationV1;
  model?: string | null;
  trials?: PlanTrialV1[];
  speed?: number | null;
  consistency?: number;
  successes?: number;
}): ExecutionReportV1 {
  const base: ExecutionReportV1 = {
    schema: EXECUTION_REPORT_VERSION,
    model: args.model ?? null,
    explanation: args.strategy.explanation,
    claim: args.strategy.win,
    accepted: args.verified.accepted,
    gaps: args.verified.gaps,
    limits: args.verified.limits,
    played: null,
  };
  if (!args.verified.accepted || !args.trials) return base;
  const wins = args.trials.filter((trial) => trial.winTurn != null);
  const losses = args.trials.filter((trial) => trial.winTurn == null);
  const lines = new Map<string, ExecutionLineV1>();
  for (const trial of wins) {
    const line = actionLine(trial);
    const existing = lines.get(line);
    if (existing) existing.count += 1;
    else lines.set(line, { count: 1, turn: trial.winTurn ?? 0, seed: trial.seed, line });
  }
  const failed = new Map<string, FailedSetupV1>();
  for (const trial of losses) {
    const reason = failReason(trial, args.strategy.win.type);
    const existing = failed.get(reason);
    if (existing) existing.count += 1;
    else failed.set(reason, { count: 1, reason, seed: trial.seed, detail: failDetail(trial) });
  }
  const decisions = [...args.verified.limits];
  const usedPieces = (trial: PlanTrialV1) =>
    args.strategy.win.requiredCards.filter((name) =>
      trial.log.some((line) => line.includes(`cast ${name}`) || line.includes(`tutor ${name}`)),
    );
  const solo = wins.filter((trial) => usedPieces(trial).length <= 1).length;
  const withSeveral = wins.length - solo;
  if (wins.length) {
    decisions.push(
      `${withSeveral} wins cast or tutored more than one required card. ${solo} wins used only one required card, so the rest of the required list was not part of those wins.`,
    );
  }
  const tutorGames = args.trials.filter((trial) => trial.log.some((line) => line.includes(" tutor "))).length;
  if (args.strategy.win.tutors.length) {
    decisions.push(tutorGames ? `A named tutor resolved in ${tutorGames} of ${args.trials.length} games.` : "None of the named tutors resolved.");
  }
  const mulledOut = losses.filter((trial) => trial.mulligans >= 3).length;
  if (mulledOut) decisions.push(`${mulledOut} misses kept a hand after 3 mulligans and still did not win.`);
  return {
    ...base,
    played: {
      speed: args.speed ?? null,
      consistency: args.consistency ?? wins.length / Math.max(1, args.trials.length),
      successes: args.successes ?? wins.length,
      trials: args.trials.length,
      histogram: histogram(args.trials),
      successfulLines: [...lines.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      failedSetups: [...failed.values()].sort((a, b) => b.count - a.count).slice(0, 5),
      decisions,
    },
  };
}
