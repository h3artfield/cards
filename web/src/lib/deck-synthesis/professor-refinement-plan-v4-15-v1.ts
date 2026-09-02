/**
 * Professor refinement plan v4.15 — routes Head Professor findings to refinement tools.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { FullHeadProfessorReviewV415 } from "./professor-head-professor-full-review-v4-15-v1";
import type { ArchitectureTransformationProposalV415 } from "./professor-win-architecture-v4-15-v1";

export const PROFESSOR_REFINEMENT_PLAN_V4_15_V1_VERSION = "professor-refinement-plan-v4-15-v1";

export type RefinementPhaseV415 = "FILLER_V412" | "OPPORTUNITY_V413" | "PACKAGE_V414" | "ARCHITECTURE_V415";

export type ProfessorRefinementPlanV415 = {
  version: typeof PROFESSOR_REFINEMENT_PLAN_V4_15_V1_VERSION;
  preserveCards: string[];
  cardUpgrades: number;
  opportunityCostUpgrades: number;
  packageTransformations: number;
  winArchitectureTransformation: {
    required: boolean;
    reason: string;
    proposal: ArchitectureTransformationProposalV415 | null;
  };
  researchQuestions: string[];
  phases: RefinementPhaseV415[];
  headProfessorSwapCount: number;
  summary: string;
};

export function buildProfessorRefinementPlanV415(args: {
  review: FullHeadProfessorReviewV415;
  requestedBracket: CommanderBracket;
  architectureProposal: ArchitectureTransformationProposalV415 | null;
}): ProfessorRefinementPlanV415 {
  const effective = args.review.predictedEffectiveBracket;
  const gap = args.requestedBracket - effective;

  const weakCount = args.review.weakCards.length;
  const oppCount = args.review.opportunityCostCards.length;
  const pkgCount = args.review.weakPackages.length;

  const cardUpgrades = Math.max(
    args.review.requiresMajorRevision ? 1 : 0,
    Math.min(weakCount + (args.review.requiresMajorRevision ? 3 : 0), 5),
  );
  const opportunityCostUpgrades = gap > 0 ? Math.min(oppCount, 4) : Math.min(oppCount, 2);
  const packageTransformations = gap > 0 ? Math.min(pkgCount, 2) : Math.min(pkgCount, 1);

  const architectureRequired =
    gap > 0 &&
    (Boolean(args.architectureProposal) ||
      args.review.requiresMajorRevision ||
      (args.review.currentWinArchitecture?.compactnessScore ?? 10) <= 5);

  const phases: RefinementPhaseV415[] = [];

  if (cardUpgrades > 0 || args.review.swaps.length > 0) phases.push("FILLER_V412");
  if (opportunityCostUpgrades > 0 || gap > 0) phases.push("OPPORTUNITY_V413");
  if (packageTransformations > 0) phases.push("PACKAGE_V414");
  if (architectureRequired) phases.push("ARCHITECTURE_V415");

  if (phases.length === 0 && args.review.swaps.length > 0) {
    phases.push("FILLER_V412");
  }

  if (phases.length === 0 && args.review.requiresMajorRevision) {
    phases.push("FILLER_V412");
  }

  const researchQuestions = [
    ...args.review.researchRequests.map((r) => r.question),
    ...(architectureRequired ? ["find compact win closure aligned with charter"] : []),
    ...(gap > 0 ? ["find faster engine access without adding redundant tutors"] : []),
    ...(args.review.requiresMajorRevision
      ? [
          "Structural revision required — replace weakest slots with charter-aligned B4 implementations",
          "Resolve disconnected subthemes competing for deck slots",
        ]
      : []),
  ].slice(0, 6);

  return {
    version: PROFESSOR_REFINEMENT_PLAN_V4_15_V1_VERSION,
    preserveCards: args.review.preserveAtAllCosts,
    cardUpgrades,
    opportunityCostUpgrades,
    packageTransformations,
    winArchitectureTransformation: {
      required: architectureRequired,
      reason: architectureRequired
        ? args.review.b3ToB4GapExplanation || "Win architecture cannot close at target bracket"
        : "",
      proposal: args.architectureProposal,
    },
    researchQuestions,
    phases,
    headProfessorSwapCount: args.review.swaps.length,
    summary: [
      `Preserve ${args.review.preserveAtAllCosts.length} core pieces.`,
      cardUpgrades > 0 ? `${cardUpgrades} filler/obvious upgrades.` : null,
      opportunityCostUpgrades > 0 ? `${opportunityCostUpgrades} opportunity-cost slots.` : null,
      packageTransformations > 0 ? `${packageTransformations} package transformation(s).` : null,
      architectureRequired ? "Win architecture transformation required." : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}
