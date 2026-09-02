/**
 * Professor v4.16.1 — B4 win architecture readiness (non-combo closure quality).
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { CanonicalLegalityAssessmentV4161 } from "./professor-canonical-legality-v4-16-1-v1";

export const PROFESSOR_B4_WIN_READINESS_V4_16_1_V1_VERSION = "professor-b4-win-readiness-v4-16-1-v1";

export type B4WinReadinessV4161 = {
  version: typeof PROFESSOR_B4_WIN_READINESS_V4_16_1_V1_VERSION;
  requestedBracket: CommanderBracket;
  ready: boolean;
  concreteLineReady?: boolean;
  threatWindow: "FAST" | "MEDIUM" | "SLOW";
  decisiveness: "HIGH" | "MEDIUM" | "LOW";
  tutorTargetsCompact: boolean;
  primaryWinPattern: string;
  concreteLineCards?: string[];
  summary: string;
  score: number;
};

const FINISHER_RE = /torment of hailfire|craterhoof|triumph of the hordes|insurrection|thassa's oracle|laboratory manic|finale of devastation|combat damage|extra combat|haste lord/i;
const GRIND_RE = /grind|attrition|slow|eventually|drain everyone|incremental/i;
const GENERIC_COMBAT_WIN_RE =
  /overwhelm opponents with a large board|buffed legendary creatures|combat tricks and buffs|large board of buffed/i;
const TUTOR_RE = /tutor|demonic|vampiric|imperial seal|gamble|wishclaw|diabolic intent/i;

export function assessB4WinReadinessV4161(args: {
  requestedBracket: CommanderBracket;
  selectedCards: CouncilCardV46[];
  charter: DeckCharterV45 | null;
  legality: CanonicalLegalityAssessmentV4161 | null;
}): B4WinReadinessV4161 {
  if (args.requestedBracket < 4) {
    return {
      version: PROFESSOR_B4_WIN_READINESS_V4_16_1_V1_VERSION,
      requestedBracket: args.requestedBracket,
      ready: true,
      threatWindow: "MEDIUM",
      decisiveness: "MEDIUM",
      tutorTargetsCompact: true,
      primaryWinPattern: "Not B4 target",
      summary: "Win readiness N/A below B4",
      score: 100,
    };
  }

  if (args.legality && !args.legality.effectiveBracketEvaluable) {
    return {
      version: PROFESSOR_B4_WIN_READINESS_V4_16_1_V1_VERSION,
      requestedBracket: args.requestedBracket,
      ready: false,
      threatWindow: "SLOW",
      decisiveness: "LOW",
      tutorTargetsCompact: false,
      primaryWinPattern: "NOT_EVALUATED",
      summary: "Win readiness blocked — illegal deck state",
      score: 0,
    };
  }

  const nonlands = args.selectedCards.filter((c) => c.category !== "land");
  const finishers = nonlands.filter((c) => FINISHER_RE.test(c.name) || c.roles.includes("finisher")).length;
  const tutors = nonlands.filter((c) => TUTOR_RE.test(c.name)).length;
  const winPaths = args.charter?.intendedWinPaths ?? [];
  const primaryWin = winPaths[0] ?? "unspecified";
  const grindPrimary = GRIND_RE.test(primaryWin) || GRIND_RE.test(winPaths.join(" "));
  const genericCombatOnly = GENERIC_COMBAT_WIN_RE.test(primaryWin) && finishers < 2;
  const concreteLineCards = nonlands
    .filter(
      (c) =>
        FINISHER_RE.test(c.name) ||
        (c.roles.includes("finisher") && !/doorman|heal|spider-ham|summit apes|zendikar farguide/i.test(c.name)),
    )
    .slice(0, 5)
    .map((c) => c.name);
  const concreteLineReady = concreteLineCards.length >= 2 && tutors >= 1 && !genericCombatOnly;

  let score = 50;
  if (finishers >= 2) score += 25;
  else if (finishers >= 1) score += 15;
  if (tutors >= 2 && finishers >= 1) score += 15;
  if (grindPrimary && finishers < 2) score -= 25;
  if (tutors >= 3 && finishers === 0) score -= 20;

  const threatWindow: B4WinReadinessV4161["threatWindow"] =
    finishers >= 2 && tutors >= 2 ? "FAST" : finishers >= 1 ? "MEDIUM" : "SLOW";
  const decisiveness: B4WinReadinessV4161["decisiveness"] =
    score >= 75 ? "HIGH" : score >= 55 ? "MEDIUM" : "LOW";
  const tutorTargetsCompact = finishers >= 1 || !grindPrimary;
  const ready = score >= 65 && concreteLineReady && !(grindPrimary && finishers < 1 && decisiveness === "LOW");

  return {
    version: PROFESSOR_B4_WIN_READINESS_V4_16_1_V1_VERSION,
    requestedBracket: args.requestedBracket,
    ready,
    concreteLineReady,
    threatWindow,
    decisiveness,
    tutorTargetsCompact,
    primaryWinPattern: primaryWin,
    concreteLineCards,
    summary: ready
      ? `B4 win architecture ready (${threatWindow} threat window)`
      : genericCombatOnly
        ? "Generic combat overwhelm without concrete finisher package — not B4-ready"
        : grindPrimary
          ? "Gradual attrition without compact payoff — not B4-ready"
          : "Win architecture lacks decisive closure for B4",
    score: Math.max(0, Math.min(100, score)),
  };
}
