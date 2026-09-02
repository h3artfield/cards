/**
 * Professor v4.17 — family-specific bracket contracts (no universal B4 score).
 */
import type { RequirementBracketContractV417, RequirementFamilyV417 } from "./professor-brew-blueprint-v4-17-v1";

export const PROFESSOR_REQUIREMENT_BRACKET_V4_17_V1_VERSION = "professor-requirement-bracket-v4-17-v1";

const FAMILY_DIMENSIONS: Record<RequirementFamilyV417, Record<string, "low" | "medium" | "high">> = {
  INTERACTION: { efficiency: "high", timing: "high", breadth: "medium", reliability: "high" },
  ACCELERATION: { deploymentSpeed: "high", netMana: "high", fixing: "medium", opportunityCost: "high" },
  CARD_VELOCITY: { cardAdvantage: "high", selection: "medium", repeatability: "medium", tempo: "high" },
  PROTECTION: { coverage: "medium", timing: "high", redundancy: "medium", resilience: "high" },
  ENGINE_ENABLER: { repeatability: "high", impact: "medium", resilience: "medium", independence: "medium" },
  ENGINE_PAYOFF: { repeatability: "high", impact: "high", resilience: "medium", independence: "high" },
  RESOURCE_PRODUCTION: { rate: "high", reliability: "high", scalability: "medium", independence: "medium" },
  RESOURCE_CONSUMER: { efficiency: "high", outletQuality: "high", synergy: "medium", independence: "medium" },
  ACCESS: { reachableTargets: "high", cost: "high", destination: "high", reliability: "high" },
  RECOVERY: { speed: "high", breadth: "medium", resilience: "high", independence: "medium" },
  WIN_COMPONENT: { compactness: "high", speed: "high", reliability: "high", independence: "medium" },
  RETURN_FROM_GRAVEYARD: { efficiency: "high", repeatability: "high", targetQuality: "high", independence: "high" },
  GRAVEYARD_ENABLER: { rate: "medium", repeatability: "high", synergy: "medium", independence: "medium" },
  FLEX: { efficiency: "medium", flexibility: "high", compression: "high", independence: "high" },
};

export function requirementBracketContractV417(
  family: RequirementFamilyV417,
  requestedBracket: number,
): RequirementBracketContractV417 {
  const base = FAMILY_DIMENSIONS[family] ?? FAMILY_DIMENSIONS.FLEX;
  if (requestedBracket <= 2) {
    return {
      family,
      requestedBracket,
      dimensions: Object.fromEntries(Object.entries(base).map(([k]) => [k, "low" as const])),
    };
  }
  if (requestedBracket === 3) {
    return {
      family,
      requestedBracket,
      dimensions: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, v === "high" ? "medium" : v])),
    };
  }
  return { family, requestedBracket, dimensions: { ...base } };
}

export function scoreBracketDimension(actual: number, target: "low" | "medium" | "high"): number {
  const thresholds = { low: [50, 70], medium: [65, 85], high: [75, 95] } as const;
  const [min, max] = thresholds[target];
  if (actual >= max) return 95;
  if (actual >= min) return 75;
  return 45;
}

export function familyBracketQualityScore(args: {
  contract: RequirementBracketContractV417;
  manaEfficiency: number;
  reliability: number;
  missionFit: number;
}): number {
  const dims = args.contract.dimensions;
  const scores: number[] = [];
  if (dims.efficiency) scores.push(scoreBracketDimension(args.manaEfficiency, dims.efficiency));
  if (dims.timing) scores.push(scoreBracketDimension(args.reliability, dims.timing));
  if (dims.reliability) scores.push(scoreBracketDimension(args.reliability, dims.reliability));
  if (dims.netMana) scores.push(scoreBracketDimension(args.manaEfficiency, dims.netMana));
  if (dims.deploymentSpeed) scores.push(scoreBracketDimension(args.manaEfficiency, dims.deploymentSpeed));
  if (dims.cardAdvantage) scores.push(scoreBracketDimension(args.missionFit, dims.cardAdvantage));
  if (dims.impact) scores.push(scoreBracketDimension(args.missionFit, dims.impact));
  if (dims.repeatability) scores.push(scoreBracketDimension(args.reliability, dims.repeatability));
  if (dims.reachableTargets) scores.push(scoreBracketDimension(args.missionFit, dims.reachableTargets));
  if (scores.length === 0) scores.push(scoreBracketDimension(args.manaEfficiency, "medium"));
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export function familyScoreWeights(family: RequirementFamilyV417): {
  missionFit: number;
  manaEfficiency: number;
  reliability: number;
  bracketQuality: number;
} {
  switch (family) {
    case "INTERACTION":
      return { missionFit: 0.3, manaEfficiency: 0.25, reliability: 0.2, bracketQuality: 0.25 };
    case "ACCELERATION":
      return { missionFit: 0.2, manaEfficiency: 0.35, reliability: 0.15, bracketQuality: 0.3 };
    case "CARD_VELOCITY":
      return { missionFit: 0.35, manaEfficiency: 0.2, reliability: 0.2, bracketQuality: 0.25 };
    case "ACCESS":
      return { missionFit: 0.35, manaEfficiency: 0.15, reliability: 0.25, bracketQuality: 0.25 };
    case "WIN_COMPONENT":
      return { missionFit: 0.4, manaEfficiency: 0.15, reliability: 0.2, bracketQuality: 0.25 };
    default:
      return { missionFit: 0.35, manaEfficiency: 0.25, reliability: 0.15, bracketQuality: 0.25 };
  }
}
