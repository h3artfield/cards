/**
 * Bracket gap analysis v4.10 — power-plan accountability at checkpoints.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckSnapshotV46 } from "./professor-council-assembly-v4-6-v1";
import type { BracketBuildPlanV49 } from "./professor-bracket-build-plan-v4-9-v1";
import type { BracketPowerPlanV410, PowerLeverKeyV410 } from "./professor-bracket-power-plan-v4-10-v1";
import { isHighPriority, powerLeverLabel } from "./professor-bracket-power-plan-v4-10-v1";
import { analyzeBracketGapV49, type BracketGapAnalysisV49 } from "./professor-bracket-gap-analysis-v4-9-v1";

export const PROFESSOR_BRACKET_GAP_ANALYSIS_V4_10_V1_VERSION = "professor-bracket-gap-analysis-v4-10-v1";

export type LeverStatusV410 = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export type BracketGapAnalysisV410 = BracketGapAnalysisV49 & {
  analysisVersion: typeof PROFESSOR_BRACKET_GAP_ANALYSIS_V4_10_V1_VERSION;
  requestedBracket: CommanderBracket;
  predictedBracket: CommanderBracket;
  analysisStatus: "OK" | "BRACKET_ANALYSIS_DEGRADED";
  accelerationStatus: LeverStatusV410;
  tutorStatus: LeverStatusV410;
  cardVelocityStatus: LeverStatusV410;
  interactionStatus: LeverStatusV410;
  protectionStatus: LeverStatusV410;
  manaQualityStatus: LeverStatusV410;
  winSpeedStatus: LeverStatusV410;
  compactnessStatus: LeverStatusV410;
  gameChangerUsage: number;
  currentPowerStrengths: string[];
  currentPowerDeficits: string[];
  unresolvedHighDeficits: string[];
  holdCourseForbidden: boolean;
  checkpointMessage: string;
};

function countTutors(selectedNames: string[]): number {
  return selectedNames.filter((n) =>
    /tutor|diabolic|demonic|vampiric|imperial seal|gamble|worldly|enlightened|mystical|personal tutor|recruiter|survival of the fittest|finale of devastation|fabricate|merchant scroll|wishclaw|spellseeker|tribute mage|isochron scepter|diabolic intent|grim tutor|diabolic tutor|vampiric tutor|enlightened tutor|worldly tutor|mystical tutor|gamble|imperial seal|diabolic tutor|vampiric tutor|enlightened tutor|worldly tutor|mystical tutor|gamble|imperial seal|diabolic tutor|vampiric tutor|enlightened tutor|worldly tutor|mystical tutor|gamble|imperial seal/i.test(
      n,
    ),
  ).length;
}

function leverStatus(actual: number, target: number): LeverStatusV410 {
  if (target <= 0) return actual > 0 ? "HIGH" : "NONE";
  if (actual >= target) return "HIGH";
  if (actual >= target * 0.6) return "MEDIUM";
  if (actual > 0) return "LOW";
  return "NONE";
}

function plannedTarget(priority: string, bracket: CommanderBracket): number {
  if (priority === "NONE") return 0;
  if (priority === "LOW") return bracket >= 4 ? 2 : 1;
  if (priority === "MEDIUM") return bracket >= 4 ? 4 : 2;
  if (priority === "MEDIUM_HIGH") return bracket >= 4 ? 3 : 2;
  if (priority === "HIGH" || priority === "STRATEGY_DEPENDENT") return bracket >= 4 ? 5 : 3;
  return 2;
}

export function analyzeBracketGapV410(args: {
  plan: BracketBuildPlanV49 | null;
  powerPlan: BracketPowerPlanV410 | null;
  snapshot: DeckSnapshotV46;
  gameChangerCount?: number;
  tutorCount?: number;
  finisherCount?: number;
}): BracketGapAnalysisV410 {
  if (!args.plan || !args.powerPlan) {
    const degraded = analyzeBracketGapV49({ plan: args.plan, snapshot: args.snapshot, gameChangerCount: args.gameChangerCount ?? 0 });
    return {
      ...degraded,
      analysisVersion: PROFESSOR_BRACKET_GAP_ANALYSIS_V4_10_V1_VERSION,
      requestedBracket: degraded.targetBracket,
      predictedBracket: degraded.currentlyEstimatedBracket,
      analysisStatus: "BRACKET_ANALYSIS_DEGRADED",
      accelerationStatus: "NONE",
      tutorStatus: "NONE",
      cardVelocityStatus: "NONE",
      interactionStatus: "NONE",
      protectionStatus: "NONE",
      manaQualityStatus: "NONE",
      winSpeedStatus: "NONE",
      compactnessStatus: "NONE",
      gameChangerUsage: args.gameChangerCount ?? 0,
      currentPowerStrengths: [],
      currentPowerDeficits: ["Bracket power plan missing — gap analysis degraded"],
      recommendedPowerLevers: degraded.recommendedPowerLevers,
      unresolvedHighDeficits: ["BRACKET_POWER_PLAN_MISSING"],
      holdCourseForbidden: true,
      checkpointMessage: "BRACKET_ANALYSIS_DEGRADED — power plan absent; cannot verify B-target trajectory.",
    };
  }

  const base = analyzeBracketGapV49({
    plan: args.plan,
    snapshot: args.snapshot,
    gameChangerCount: args.gameChangerCount ?? 0,
  });
  const s = args.snapshot;
  const tutors = args.tutorCount ?? 0;
  const finishers = args.finisherCount ?? (s.roleCoverage["finisher"] ?? 0);
  const gc = args.gameChangerCount ?? 0;
  const target = args.powerPlan.targetBracket;

  const accelActual = s.rampCoverage ?? 0;
  const tutorTarget = plannedTarget(args.powerPlan.powerLevers.tutors, target);
  const accelTarget = plannedTarget(args.powerPlan.powerLevers.acceleration, target);
  const interactionTarget = plannedTarget(args.powerPlan.powerLevers.efficientInteraction, target);
  const protectionTarget = plannedTarget(args.powerPlan.powerLevers.protection, target);
  const velocityTarget = plannedTarget(args.powerPlan.powerLevers.repeatableCardAdvantage, target);
  const finisherTarget = plannedTarget(args.powerPlan.powerLevers.compactFinishers, target);

  const accelerationStatus = leverStatus(accelActual, accelTarget);
  const tutorStatus = leverStatus(tutors, tutorTarget);
  const cardVelocityStatus = leverStatus(s.cardAdvantageCoverage ?? 0, velocityTarget);
  const interactionStatus = leverStatus(s.interactionCoverage ?? 0, interactionTarget);
  const protectionStatus = leverStatus(s.protectionCoverage ?? 0, protectionTarget);
  const manaQualityStatus = leverStatus(s.landCount ?? 0, target >= 4 ? 34 : 32);
  const winSpeedStatus = leverStatus(accelActual + Math.min(interactionStatus === "HIGH" ? 2 : 0, 2), target >= 4 ? 6 : 4);
  const compactnessStatus = finishers >= finisherTarget + 3 ? "VERY_HIGH" : leverStatus(finishers, finisherTarget);

  const strengths: string[] = [];
  const deficits: string[] = [];
  const unresolvedHigh: string[] = [];

  const checkLever = (key: PowerLeverKeyV410, status: LeverStatusV410, actual: number, planned: number) => {
    const pri = args.powerPlan!.powerLevers[key];
    if (!isHighPriority(pri)) return;
    if (status === "NONE" || status === "LOW") {
      deficits.push(`${powerLeverLabel(key)}: planned ${pri}, actual ${actual} (need ~${planned})`);
      unresolvedHigh.push(key);
    } else if (status === "HIGH" || status === "VERY_HIGH") {
      strengths.push(`${powerLeverLabel(key)} on track (${actual})`);
    }
  };

  checkLever("acceleration", accelerationStatus, accelActual, accelTarget);
  checkLever("tutors", tutorStatus, tutors, tutorTarget);
  checkLever("efficientInteraction", interactionStatus, s.interactionCoverage ?? 0, interactionTarget);
  checkLever("protection", protectionStatus, s.protectionCoverage ?? 0, protectionTarget);
  checkLever("repeatableCardAdvantage", cardVelocityStatus, s.cardAdvantageCoverage ?? 0, velocityTarget);

  if (compactnessStatus === "VERY_HIGH" && (tutorStatus === "NONE" || accelerationStatus === "LOW")) {
    deficits.push("Over-invested in finishers while acceleration/tutor access is still thin for B4");
    unresolvedHigh.push("compactFinishers");
  }

  if (target >= 4 && gc === 0 && isHighPriority(args.powerPlan.powerLevers.gameChangers)) {
    deficits.push("No Game Changers selected yet — Research must document considered/rejected options");
  }

  const holdCourseForbidden = unresolvedHigh.length > 0 || base.currentlyEstimatedBracket < target;

  let checkpointMessage = `Target B${target}, currently estimated B${base.currentlyEstimatedBracket}.`;
  if (unresolvedHigh.length > 0) {
    checkpointMessage += ` UNRESOLVED: ${deficits[0] ?? unresolvedHigh.join(", ")}. HOLD_COURSE forbidden.`;
  } else if (base.currentlyEstimatedBracket < target) {
    checkpointMessage += ` We're targeting B${target}, but this still develops like B${base.currentlyEstimatedBracket}. Shift next picks toward ${base.recommendedPowerLevers[0] ?? "power levers"}.`;
  } else {
    checkpointMessage += ` Trajectory acceptable for B${target}.`;
  }

  return {
    ...base,
    analysisVersion: PROFESSOR_BRACKET_GAP_ANALYSIS_V4_10_V1_VERSION,
    requestedBracket: target,
    predictedBracket: base.currentlyEstimatedBracket,
    analysisStatus: "OK",
    accelerationStatus,
    tutorStatus,
    cardVelocityStatus,
    interactionStatus,
    protectionStatus,
    manaQualityStatus,
    winSpeedStatus,
    compactnessStatus,
    gameChangerUsage: gc,
    currentPowerStrengths: strengths,
    currentPowerDeficits: deficits.length ? deficits : base.reasonsCurrentDeckLooksLower,
    recommendedPowerLevers: [...new Set([...base.recommendedPowerLevers, ...deficits.map((d) => d.split(":")[0] ?? d)])].slice(0, 8),
    unresolvedHighDeficits: unresolvedHigh,
    holdCourseForbidden,
    checkpointQuestion: checkpointMessage,
    checkpointMessage,
  };
}
