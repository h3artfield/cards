/**
 * Professor v4.16.3 — pre-final critic using structural signals, not tag resemblance.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { AccessArchitectureV4163 } from "./professor-access-architecture-v4-16-3-v1";
import type { BracketPowerAssessmentV4163 } from "./professor-bracket-power-assessment-v4-16-3-v1";
import type { B4WinReadinessV4161 } from "./professor-b4-win-readiness-v4-16-1-v1";
import type { DeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import type { OpportunityCostReportV4163 } from "./professor-opportunity-cost-v4-16-3-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";

export const PROFESSOR_PRE_FINAL_QUALITY_CRITIC_V4_16_3_V1_VERSION =
  "professor-pre-final-quality-critic-v4-16-3-v1";

export type PreFinalQualityCriticReportV4163 = {
  version: typeof PROFESSOR_PRE_FINAL_QUALITY_CRITIC_V4_16_3_V1_VERSION;
  resemblesTargetBracket: boolean;
  obviousWeakImplementations: string[];
  disconnectedPackages: boolean;
  falseTagCountConfidence: boolean;
  structuralFailures: string[];
  qualityFailures: string[];
  exactResearchMissions: string[];
  replacementCandidates: Array<{ cut: string; reason: string }>;
  summary: string;
};

const DISCONNECTED_RE =
  /doorman|heal|spider-ham|sunbeam spellbomb|disposal mummy|vault guardsman|gingerbrute|thopter assembly|airdrop aeronauts/i;

export function runPreFinalQualityCriticV4163(args: {
  commanderName: string;
  charter: DeckCharterV45 | null;
  selectedCards: CouncilCardV46[];
  requestedBracket: CommanderBracket;
  slotBudget: DeckSlotBudgetV4163 | null;
  accessArchitecture: AccessArchitectureV4163 | null;
  winReadiness: B4WinReadinessV4161 | null;
  powerAssessment: BracketPowerAssessmentV4163 | null;
  opportunityCost: OpportunityCostReportV4163 | null;
}): PreFinalQualityCriticReportV4163 {
  const nonlands = args.selectedCards.filter((c) => c.category !== "land");
  const weak = nonlands.filter((c) => DISCONNECTED_RE.test(c.name)).map((c) => c.name);
  const structuralFailures: string[] = [];
  const qualityFailures: string[] = [];
  const exactResearchMissions: string[] = [];

  if (args.slotBudget && !args.slotBudget.structurallyComplete) {
    structuralFailures.push(args.slotBudget.summary);
    exactResearchMissions.push("BUILD_STRUCTURAL_NONLANDS");
  }
  if (args.slotBudget?.landOversubscribed) {
    structuralFailures.push(`Land count ${args.slotBudget.selectedLands} exceeds plan ${args.slotBudget.expectedLands}`);
    exactResearchMissions.push("MANA_STRUCTURE");
  }
  if (args.accessArchitecture?.criticalAccessFailure) {
    structuralFailures.push(args.accessArchitecture.summary);
    exactResearchMissions.push("FIND_ACCESS");
  }
  if (args.winReadiness && args.requestedBracket >= 4 && !args.winReadiness.concreteLineReady) {
    structuralFailures.push(args.winReadiness.summary);
    exactResearchMissions.push("WIN_ARCHITECTURE");
  }
  if (args.powerAssessment && args.powerAssessment.rawPowerCeiling > args.powerAssessment.realizedEffectiveBracket + 1) {
    qualityFailures.push(
      `Raw ceiling B${args.powerAssessment.rawPowerCeiling} not realized — ${args.powerAssessment.unrealizedPowerReasons.slice(0, 2).join("; ")}`,
    );
  }

  const taggedInteraction = nonlands.filter((c) => c.roles.includes("interaction")).length;
  const efficientInteraction = nonlands.filter((c) =>
    /path to exile|swords to plowshares|counterspell|cyclonic rift|beast within|generous gift|all is dust|force of will/i.test(
      c.name,
    ),
  ).length;
  const falseTagCountConfidence = taggedInteraction >= 6 && efficientInteraction < 2;
  if (falseTagCountConfidence) {
    qualityFailures.push("Interaction tags overstate functional quality");
    exactResearchMissions.push("INTERACTION_QUALITY");
  }

  const replacementCandidates =
    args.opportunityCost?.bottomSlots
      .filter((s) => s.recommendation === "REPLACE")
      .slice(0, 5)
      .map((s) => ({ cut: s.currentCard, reason: s.reason })) ?? [];

  const resemblesTargetBracket =
    structuralFailures.length === 0 &&
    qualityFailures.length === 0 &&
    weak.length <= 2 &&
    !falseTagCountConfidence &&
    (args.powerAssessment?.realizedEffectiveBracket ?? 0) >= args.requestedBracket - 1;

  return {
    version: PROFESSOR_PRE_FINAL_QUALITY_CRITIC_V4_16_3_V1_VERSION,
    resemblesTargetBracket,
    obviousWeakImplementations: weak.slice(0, 8),
    disconnectedPackages: weak.length >= 3,
    falseTagCountConfidence,
    structuralFailures,
    qualityFailures,
    exactResearchMissions,
    replacementCandidates,
    summary:
      structuralFailures.length > 0
        ? structuralFailures[0]!
        : qualityFailures.length > 0
          ? qualityFailures[0]!
          : resemblesTargetBracket
            ? "Provisional deck resembles target bracket on structural signals"
            : "Some quality gaps remain before finalization",
  };
}
