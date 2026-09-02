/**
 * Bracket upgrade mission v4.11 — executable swap-based bracket alignment.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketAdjudicationV411 } from "./professor-bracket-adjudication-v4-11-v1";
import type { BracketGapAnalysisV410 } from "./professor-bracket-gap-analysis-v4-10-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import type { BracketDragCardV411 } from "./professor-bracket-drag-analysis-v4-11-v1";
import type { GameChangerEvaluationV411 } from "./professor-game-changer-discovery-v4-11-v1";
import type { TutorCandidateV411 } from "./professor-tutor-discovery-v4-11-v1";

export const PROFESSOR_BRACKET_UPGRADE_MISSION_V4_11_V1_VERSION = "professor-bracket-upgrade-mission-v4-11-v1";

export const MAX_BRACKET_UPGRADE_ITERATIONS_V411 = 2;

export type BracketDeficitV411 = {
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  evidence: string;
  targetState: string;
};

export type BracketUpgradeResearchMissionV411 = {
  need: string;
  requiredImprovement: string;
  searchStrategy: string;
  deckNeedId?: string;
};

export type BracketProposedSwapV411 = {
  cut: string;
  add: string;
  reason: string;
  resolvesDeficit: string;
  verified: boolean;
  rejectionReason?: string;
};

export type BracketUpgradeMissionStatusV411 =
  | "PENDING"
  | "RESEARCHING"
  | "SWAPPING"
  | "RE_ADJUDICATING"
  | "ALIGNED"
  | "BRACKET_TARGET_UNRESOLVED"
  | "BRACKET_OVERSHOOT";

export type BracketUpgradeMissionV411 = {
  version: typeof PROFESSOR_BRACKET_UPGRADE_MISSION_V4_11_V1_VERSION;
  missionId: string;
  sourceDeckFingerprint: string;
  requestedBracket: CommanderBracket;
  predictedBracket: CommanderBracket;
  missionType: "UPGRADE" | "DOWNGRADE";
  bracketGap: BracketGapAnalysisV410 | null;
  deficits: BracketDeficitV411[];
  deckNeeds: DeckNeedV47[];
  researchMissions: BracketUpgradeResearchMissionV411[];
  bracketDragCards: BracketDragCardV411[];
  tutorCandidatesConsidered: TutorCandidateV411[];
  gameChangersConsidered: GameChangerEvaluationV411[];
  proposedSwaps: BracketProposedSwapV411[];
  acceptedSwaps: BracketProposedSwapV411[];
  rejectedSwaps: BracketProposedSwapV411[];
  status: BracketUpgradeMissionStatusV411;
  iteration: number;
  preserveCharter: boolean;
};

function deficitFromText(text: string): BracketDeficitV411 {
  const lower = text.toLowerCase();
  let category = "GENERAL";
  if (/tutor|search|access|consistency/i.test(lower)) category = "TUTOR_ACCESS";
  else if (/land|mana|ramp|color/i.test(lower)) category = "MANA";
  else if (/interaction|removal|counter/i.test(lower)) category = "INTERACTION";
  else if (/protection|resilien/i.test(lower)) category = "PROTECTION";
  else if (/filler|quality|slow|expensive/i.test(lower)) category = "EFFICIENCY";
  else if (/finisher|win|kill|combo/i.test(lower)) category = "WIN_ARCHITECTURE";
  else if (/game changer/i.test(lower)) category = "GAME_CHANGER";

  return {
    category,
    severity: /emergency|absent|zero|no tutors|15 or more|critical/i.test(lower) ? "HIGH" : /thin|low|under/i.test(lower) ? "MEDIUM" : "LOW",
    evidence: text,
    targetState: `Resolve for B${0} target`.replace("B0", ""),
  };
}

export function buildBracketUpgradeMissionV411(args: {
  missionId: string;
  sourceDeckFingerprint: string;
  requestedBracket: CommanderBracket;
  adjudication: BracketAdjudicationV411;
  bracketGap: BracketGapAnalysisV410 | null;
  deckNeeds: DeckNeedV47[];
  dragCards: BracketDragCardV411[];
  tutorCandidates: TutorCandidateV411[];
  gameChangers: GameChangerEvaluationV411[];
  powerPlan: BracketPowerPlanV410 | null;
  iteration?: number;
}): BracketUpgradeMissionV411 {
  const predicted = args.adjudication.predictedEffectiveBracket;
  const missionType: "UPGRADE" | "DOWNGRADE" = predicted > args.requestedBracket ? "DOWNGRADE" : "UPGRADE";

  const deficits: BracketDeficitV411[] = [
    ...args.adjudication.powerDeficits.map(deficitFromText),
    ...(args.bracketGap?.currentPowerDeficits ?? []).map((d) => ({
      category: "GAP",
      severity: "HIGH" as const,
      evidence: d,
      targetState: args.bracketGap?.recommendedPowerLevers.join(", ") ?? "",
    })),
  ].slice(0, 8);

  const researchMissions: BracketUpgradeResearchMissionV411[] = [];
  for (const d of deficits) {
    if (d.category === "TUTOR_ACCESS") {
      researchMissions.push({
        need: "STRATEGY_ACCESS",
        requiredImprovement: "Efficient tutors for sacrifice engines, payoff pieces, or compact finishers",
        searchStrategy: "TUTOR functional oracle scan — legal colors, B4 efficiency",
      });
    } else if (d.category === "INTERACTION") {
      researchMissions.push({
        need: "INTERACTION_EFFICIENCY",
        requiredImprovement: "Replace expensive narrow answers with cheap broad interaction",
        searchStrategy: "Low MV interaction in color identity",
      });
    } else if (d.category === "WIN_ARCHITECTURE") {
      researchMissions.push({
        need: "COMPACT_FINISH",
        requiredImprovement: "Sacrifice-aligned finishers that reduce setup turns",
        searchStrategy: "Charter-aligned compact win pieces",
      });
    } else if (d.category === "EFFICIENCY") {
      researchMissions.push({
        need: "FILLER_REMOVAL",
        requiredImprovement: "Remove low-impact filler; add bracket-appropriate efficiency",
        searchStrategy: "Cut bracketDragCards; add power-plan levers",
      });
    } else if (d.category === "GAME_CHANGER") {
      researchMissions.push({
        need: "GAME_CHANGER",
        requiredImprovement: "Strategy-aligned Game Changers that improve this deck",
        searchStrategy: "getLegalRelevantGameChangersV411",
      });
    }
  }

  if (researchMissions.length === 0) {
    researchMissions.push({
      need: "BRACKET_ALIGNMENT",
      requiredImprovement: args.adjudication.toBecomeTargetWithoutAbandoningCharter,
      searchStrategy: `Close B${Math.abs(args.requestedBracket - predicted)} gap via power plan levers`,
    });
  }

  return {
    version: PROFESSOR_BRACKET_UPGRADE_MISSION_V4_11_V1_VERSION,
    missionId: args.missionId,
    sourceDeckFingerprint: args.sourceDeckFingerprint,
    requestedBracket: args.requestedBracket,
    predictedBracket: predicted,
    missionType,
    bracketGap: args.bracketGap,
    deficits,
    deckNeeds: args.deckNeeds,
    researchMissions: researchMissions.slice(0, 6),
    bracketDragCards: args.dragCards,
    tutorCandidatesConsidered: args.tutorCandidates,
    gameChangersConsidered: args.gameChangers,
    proposedSwaps: [],
    acceptedSwaps: [],
    rejectedSwaps: [],
    status: "PENDING",
    iteration: args.iteration ?? 1,
    preserveCharter: true,
  };
}
