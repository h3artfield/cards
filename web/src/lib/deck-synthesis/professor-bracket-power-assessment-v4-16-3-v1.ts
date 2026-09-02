/**
 * Professor v4.16.3 — separate raw power ceiling from realized effective bracket.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import type { BracketReadinessQualityV4162 } from "./professor-bracket-readiness-quality-v4-16-2-v1";
import type { B4WinReadinessV4161 } from "./professor-b4-win-readiness-v4-16-1-v1";
import type { AccessArchitectureV4163 } from "./professor-access-architecture-v4-16-3-v1";
import type { DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";

type CouncilCardLike = { name: string; category?: string; roles?: string[] };

export const PROFESSOR_BRACKET_POWER_ASSESSMENT_V4_16_3_V1_VERSION =
  "professor-bracket-power-assessment-v4-16-3-v1";

export type BracketPowerAssessmentV4163 = {
  version: typeof PROFESSOR_BRACKET_POWER_ASSESSMENT_V4_16_3_V1_VERSION;
  requestedBracket: CommanderBracket;
  rawPowerCeiling: CommanderBracket;
  realizedEffectiveBracket: CommanderBracket;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  rawPowerSignals: string[];
  realizedPowerEvidence: string[];
  unrealizedPowerReasons: string[];
  /** Alias for UI — always realized, never raw ceiling. */
  predictedEffectiveBracket: CommanderBracket;
};

const FAST_MANA_RE =
  /sol ring|mana crypt|dockside|chrome mox|mox diamond|jeweled lotus|lotus petal|grim monolith|mana vault|ancient tomb/i;
const TUTOR_RE =
  /tutor|diabolic|vampiric|imperial seal|gamble|worldly|enlightened|mystical|personal tutor|recruiter|fabricate|merchant scroll|wishclaw|inventors' fair|mystic forge|kuldotha forgemaster|urza's saga/i;

function rawCeilingFromSignals(args: {
  requestedBracket: CommanderBracket;
  gameChangerCount: number;
  fastManaCount: number;
  tutorCount: number;
  rampCount: number;
}): CommanderBracket {
  let score = 1;
  if (args.gameChangerCount >= 5) score += 2;
  else if (args.gameChangerCount >= 3) score += 1.5;
  else if (args.gameChangerCount >= 1) score += 0.5;
  if (args.fastManaCount >= 6) score += 1;
  else if (args.fastManaCount >= 3) score += 0.5;
  if (args.tutorCount >= 4) score += 1;
  else if (args.tutorCount >= 2) score += 0.5;
  if (args.rampCount >= 12) score += 0.5;
  const bracket = Math.min(5, Math.max(1, Math.round(score))) as CommanderBracket;
  return Math.max(bracket, args.requestedBracket >= 4 ? 3 : 1) as CommanderBracket;
}

function qualityFails(quality: BracketReadinessQualityV4162 | null | undefined, dim: string): boolean {
  return quality?.failingDimensions.includes(dim as never) ?? false;
}

export function assessBracketPowerAssessmentV4163(args: {
  requestedBracket: CommanderBracket;
  portfolio: BracketPowerPortfolioV416 | null;
  quality: BracketReadinessQualityV4162 | null;
  winReadiness: B4WinReadinessV4161 | null;
  accessArchitecture: AccessArchitectureV4163 | null;
  slotBudget: DeckSlotBudgetV4163 | null;
  selectedNonlands: CouncilCardLike[];
  gameChangerCount: number;
}): BracketPowerAssessmentV4163 {
  const nonlands = args.selectedNonlands.filter((c) => c.category !== "land");
  const fastManaCount = nonlands.filter((c) => FAST_MANA_RE.test(c.name)).length;
  const tutorCount = nonlands.filter((c) => TUTOR_RE.test(c.name)).length;
  const rampCount = nonlands.filter((c) => c.roles?.includes("ramp")).length;

  const rawPowerSignals: string[] = [];
  if (args.gameChangerCount > 0) rawPowerSignals.push(`Game Changers: ${args.gameChangerCount}`);
  if (fastManaCount > 0) rawPowerSignals.push(`Premium fast mana: ${fastManaCount}`);
  if (tutorCount > 0) rawPowerSignals.push(`Tutor/access tagged: ${tutorCount}`);
  if (rampCount > 0) rawPowerSignals.push(`Ramp pieces: ${rampCount}`);

  const rawPowerCeiling = rawCeilingFromSignals({
    requestedBracket: args.requestedBracket,
    gameChangerCount: args.gameChangerCount,
    fastManaCount,
    tutorCount,
    rampCount,
  });

  let realized = rawPowerCeiling;
  const unrealizedPowerReasons: string[] = [];
  const realizedPowerEvidence: string[] = [];

  if (args.slotBudget && !args.slotBudget.structurallyComplete) {
    unrealizedPowerReasons.push(
      `Structural deck incomplete — ${args.slotBudget.selectedNonlands}/${args.slotBudget.expectedNonlands} nonlands`,
    );
    realized = Math.min(realized, 2) as CommanderBracket;
  }
  if (args.slotBudget?.landOversubscribed) {
    unrealizedPowerReasons.push(
      `Land budget oversubscribed — ${args.slotBudget.selectedLands}/${args.slotBudget.expectedLands} lands`,
    );
    realized = Math.min(realized, 3) as CommanderBracket;
  }
  if (qualityFails(args.quality, "accessQuality") || (args.accessArchitecture && args.accessArchitecture.criticalAccessFailure)) {
    unrealizedPowerReasons.push("Access architecture cannot reliably reach key pieces");
    realized = Math.min(realized, 3) as CommanderBracket;
  }
  if (qualityFails(args.quality, "interactionQuality")) {
    unrealizedPowerReasons.push("Interaction quality below bracket target");
    realized = Math.min(realized, 3) as CommanderBracket;
  }
  if (
    args.winReadiness &&
    args.requestedBracket >= 4 &&
    (args.winReadiness.concreteLineReady === false || !args.winReadiness.ready)
  ) {
    unrealizedPowerReasons.push("No verified concrete win architecture for requested bracket");
    realized = Math.min(realized, 3) as CommanderBracket;
  }
  if (qualityFails(args.quality, "winArchitectureQuality")) {
    unrealizedPowerReasons.push("Win architecture quality gate failed");
    realized = Math.min(realized, 3) as CommanderBracket;
  }
  if (qualityFails(args.quality, "manaQuality")) {
    unrealizedPowerReasons.push("Mana structure quality below target");
    realized = Math.min(realized, 3) as CommanderBracket;
  }

  if (args.accessArchitecture && args.accessArchitecture.engineAccess >= 2) {
    realizedPowerEvidence.push(`Engine access routes: ${args.accessArchitecture.engineAccess}`);
  }
  if (args.winReadiness?.concreteLineReady) {
    realizedPowerEvidence.push("Concrete win line verified");
  }
  if (args.slotBudget?.structurallyComplete) {
    realizedPowerEvidence.push("Structural slot budget satisfied");
  }

  realized = Math.min(realized, args.requestedBracket + 1) as CommanderBracket;
  if (unrealizedPowerReasons.length >= 3) {
    realized = Math.min(realized, Math.max(1, args.requestedBracket - 1)) as CommanderBracket;
  }

  const confidence: BracketPowerAssessmentV4163["confidence"] =
    unrealizedPowerReasons.length === 0 ? "HIGH" : unrealizedPowerReasons.length <= 2 ? "MEDIUM" : "LOW";

  return {
    version: PROFESSOR_BRACKET_POWER_ASSESSMENT_V4_16_3_V1_VERSION,
    requestedBracket: args.requestedBracket,
    rawPowerCeiling,
    realizedEffectiveBracket: realized,
    confidence,
    rawPowerSignals,
    realizedPowerEvidence,
    unrealizedPowerReasons,
    predictedEffectiveBracket: realized,
  };
}
