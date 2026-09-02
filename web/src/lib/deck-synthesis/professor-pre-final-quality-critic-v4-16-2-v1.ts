/**
 * Professor v4.16.2 — cheap pre-final construction critic (not Head Professor).
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import { rankB4OpportunityCostCandidatesV4162 } from "./professor-b4-opportunity-cost-v4-16-2-v1";

export const PROFESSOR_PRE_FINAL_QUALITY_CRITIC_V4_16_2_V1_VERSION =
  "professor-pre-final-quality-critic-v4-16-2-v1";

export type PreFinalQualityCriticReportV4162 = {
  version: typeof PROFESSOR_PRE_FINAL_QUALITY_CRITIC_V4_16_2_V1_VERSION;
  resemblesTargetBracket: boolean;
  obviousWeakImplementations: string[];
  disconnectedPackages: boolean;
  falseTagCountConfidence: boolean;
  replacementCandidates: Array<{ cut: string; reason: string }>;
  summary: string;
};

const DISCONNECTED_RE =
  /doorman|heal|spider-ham|sunbeam spellbomb|disposal mummy|vault guardsman|gingerbrute|thopter assembly|airdrop aeronauts/i;

export function runPreFinalQualityCriticV4162(args: {
  commanderName: string;
  charter: DeckCharterV45 | null;
  selectedCards: CouncilCardV46[];
  requestedBracket: CommanderBracket;
  portfolio: BracketPowerPortfolioV416 | null;
}): PreFinalQualityCriticReportV4162 {
  const nonlands = args.selectedCards.filter((c) => c.category !== "land");
  const weak = nonlands.filter((c) => DISCONNECTED_RE.test(c.name)).map((c) => c.name);
  const opp = rankB4OpportunityCostCandidatesV4162({
    selectedCards: args.selectedCards,
    charter: args.charter,
    requestedBracket: args.requestedBracket,
  });

  const taggedInteraction = nonlands.filter((c) => c.roles.includes("interaction")).length;
  const efficientInteraction = nonlands.filter((c) =>
    /path to exile|swords to plowshares|counterspell|cyclonic rift|beast within|generous gift|terminat|force of will|deadly rollick/i.test(
      c.name,
    ),
  ).length;
  const falseTagCountConfidence = taggedInteraction >= 6 && efficientInteraction < 2;

  const predictedOk = (args.portfolio?.criticalDeficits.length ?? 0) === 0;
  const resemblesTargetBracket = predictedOk && weak.length <= 2 && !falseTagCountConfidence;

  return {
    version: PROFESSOR_PRE_FINAL_QUALITY_CRITIC_V4_16_2_V1_VERSION,
    resemblesTargetBracket,
    obviousWeakImplementations: weak.slice(0, 8),
    disconnectedPackages: weak.length >= 3,
    falseTagCountConfidence,
    replacementCandidates: opp.bottomSlots.slice(0, 5).map((s) => ({ cut: s.name, reason: s.reason })),
    summary:
      weak.length >= 3
        ? "Multiple disconnected/low-power slots undermine bracket target"
        : falseTagCountConfidence
          ? "Tag counts overstate functional interaction quality"
          : resemblesTargetBracket
            ? "Provisional deck resembles target bracket"
            : "Some quality gaps remain before finalization",
  };
}
