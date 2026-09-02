/**
 * Bracket Readiness v4.16 — gate finalization until predicted bracket ≈ requested.
 * v4.16.1: legality, utilization floors, and win readiness are hard gates.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import type { BracketGapAnalysisV410 } from "./professor-bracket-gap-analysis-v4-10-v1";
import type { ManaPlanV416 } from "./professor-mana-plan-v4-16-v1";
import type { CanonicalLegalityAssessmentV4161 } from "./professor-canonical-legality-v4-16-1-v1";
import type { BracketPowerUtilizationV4161 } from "./professor-bracket-power-utilization-v4-16-1-v1";
import type { B4WinReadinessV4161 } from "./professor-b4-win-readiness-v4-16-1-v1";
import type { BracketReadinessQualityV4162 } from "./professor-bracket-readiness-quality-v4-16-2-v1";
import type { PreFinalQualityCriticReportV4162 } from "./professor-pre-final-quality-critic-v4-16-2-v1";
import type { BracketPowerAssessmentV4163 } from "./professor-bracket-power-assessment-v4-16-3-v1";
import type { DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";

export const PROFESSOR_BRACKET_READINESS_V4_16_V1_VERSION = "professor-bracket-readiness-v4-16-v1";

export type BracketReadinessStatusV416 =
  | "READY"
  | "NEEDS_BUILD"
  | "NEEDS_RESEARCH"
  | "BUILD_BRACKET_TARGET_UNRESOLVED"
  | "NOT_EVALUATED";

export type BracketReadinessV416 = {
  version: typeof PROFESSOR_BRACKET_READINESS_V4_16_V1_VERSION;
  requestedBracket: CommanderBracket;
  currentPredictedBracket: CommanderBracket;
  criticalDeficits: string[];
  readiness: BracketReadinessStatusV416;
  canEnterFinalization: boolean;
  bracketPowerUtilization: BracketPowerPortfolioV416["bracketPowerUtilization"];
  manaPlanValid: boolean;
  message: string;
  carryForwardFlag: "BUILD_BRACKET_TARGET_UNRESOLVED" | null;
  quality?: BracketReadinessQualityV4162 | null;
  preFinalCritic?: PreFinalQualityCriticReportV4162 | null;
};

export function assessBracketReadinessV416(args: {
  requestedBracket: CommanderBracket;
  portfolio: BracketPowerPortfolioV416 | null;
  gap: BracketGapAnalysisV410 | null;
  manaPlan: ManaPlanV416 | null;
  selectedNonLandCount: number;
  discoveryExhausted?: boolean;
  legality?: CanonicalLegalityAssessmentV4161 | null;
  utilization?: BracketPowerUtilizationV4161 | null;
  winReadiness?: B4WinReadinessV4161 | null;
  quality?: BracketReadinessQualityV4162 | null;
  preFinalCritic?: PreFinalQualityCriticReportV4162 | null;
  powerAssessment?: BracketPowerAssessmentV4163 | null;
  slotBudget?: DeckSlotBudgetV4163 | null;
}): BracketReadinessV416 {
  if (args.legality && !args.legality.effectiveBracketEvaluable) {
    return {
      version: PROFESSOR_BRACKET_READINESS_V4_16_V1_VERSION,
      requestedBracket: args.requestedBracket,
      currentPredictedBracket: args.requestedBracket,
      criticalDeficits: args.legality.failures,
      readiness: "NOT_EVALUATED",
      canEnterFinalization: false,
      bracketPowerUtilization: "LOW",
      manaPlanValid: false,
      message: `Effective bracket NOT_EVALUATED — ${args.legality.failures[0] ?? "illegal deck state"}`,
      carryForwardFlag: null,
    };
  }

  const predicted =
    args.powerAssessment?.realizedEffectiveBracket ??
    args.gap?.predictedBracket ??
    args.gap?.currentlyEstimatedBracket ??
    args.requestedBracket;
  const critical = [
    ...(args.portfolio?.criticalDeficits.map((d) => `${d}: CRITICAL`) ?? []),
    ...(args.gap?.unresolvedHighDeficits ?? []),
  ];
  const manaPlanValid =
    !args.manaPlan ||
    (args.selectedNonLandCount <= args.manaPlan.structuralNonLandTarget + 2 &&
      (!args.slotBudget || args.slotBudget.status !== "BUILD_STRUCTURALLY_INCOMPLETE"));

  let readiness: BracketReadinessStatusV416 = "READY";
  let canEnterFinalization = true;
  let carryForwardFlag: BracketReadinessV416["carryForwardFlag"] = null;

  if (args.slotBudget?.status === "BUILD_STRUCTURALLY_INCOMPLETE") {
    readiness = "NEEDS_BUILD";
    canEnterFinalization = false;
    critical.push(`Structural: ${args.slotBudget.remainingNonlandSlots} nonland slots remain`);
  } else if (args.portfolio?.criticalDeficits.length) {
    readiness = "NEEDS_RESEARCH";
    canEnterFinalization = false;
  } else if (predicted < args.requestedBracket - 1) {
    readiness = "NEEDS_BUILD";
    canEnterFinalization = false;
  } else if (predicted > args.requestedBracket) {
    readiness = "NEEDS_BUILD";
    canEnterFinalization = false;
  } else if (!manaPlanValid) {
    readiness = "NEEDS_BUILD";
    canEnterFinalization = false;
  } else if (args.portfolio?.highDeficits.length && args.portfolio.highDeficits.length >= 3) {
    readiness = "NEEDS_RESEARCH";
    canEnterFinalization = false;
  } else if (args.utilization && !args.utilization.bracketReady) {
    readiness = "NEEDS_RESEARCH";
    canEnterFinalization = false;
    critical.push(...args.utilization.belowTargetDimensions.map((d) => `${d}: BELOW_TARGET`));
  } else if (args.winReadiness && args.requestedBracket >= 4 && !args.winReadiness.ready) {
    readiness = "NEEDS_BUILD";
    canEnterFinalization = false;
    critical.push(`Win architecture: ${args.winReadiness.summary}`);
  } else if (args.winReadiness && args.requestedBracket >= 4 && args.winReadiness.concreteLineReady === false) {
    readiness = "NEEDS_RESEARCH";
    canEnterFinalization = false;
    critical.push("Win architecture lacks concrete B4 line");
  } else if (args.quality && !args.quality.qualityReady) {
    readiness = "NEEDS_RESEARCH";
    canEnterFinalization = false;
    critical.push(`Quality: ${args.quality.failingDimensions.slice(0, 3).join(", ")}`);
  }

  if (!canEnterFinalization && args.discoveryExhausted) {
    readiness = "BUILD_BRACKET_TARGET_UNRESOLVED";
    canEnterFinalization = true;
    carryForwardFlag = "BUILD_BRACKET_TARGET_UNRESOLVED";
  }

  const utilization = args.portfolio?.bracketPowerUtilization ?? "MEDIUM";
  const message = canEnterFinalization
    ? carryForwardFlag
      ? `Proceeding with ${carryForwardFlag} — discovery exhausted at B${predicted} vs B${args.requestedBracket} target`
      : `Bracket readiness OK — predicted B${predicted}, target B${args.requestedBracket}, utilization ${utilization}`
    : `Not ready for finalization: requested B${args.requestedBracket}, predicted B${predicted}. ${critical[0] ?? "Return to build/research"}`;

  return {
    version: PROFESSOR_BRACKET_READINESS_V4_16_V1_VERSION,
    requestedBracket: args.requestedBracket,
    currentPredictedBracket: predicted,
    criticalDeficits: critical,
    readiness,
    canEnterFinalization,
    bracketPowerUtilization: utilization,
    manaPlanValid,
    message,
    carryForwardFlag,
    quality: args.quality ?? null,
    preFinalCritic: args.preFinalCritic ?? null,
  };
}
