/**
 * Win architecture v4.15 — win lines, target architecture, transformation proposals.
 */
import type { FinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import { dossierToPromptText } from "./professor-deck-dossier-v4-8-v1";
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import type { FullHeadProfessorReviewV415 } from "./professor-head-professor-full-review-v4-15-v1";
import type { WinPreferenceChoiceV415 } from "./professor-win-preference-v4-15-v1";

export const PROFESSOR_WIN_ARCHITECTURE_V4_15_V1_VERSION = "professor-win-architecture-v4-15-v1";

export type WinLineV415 = {
  lineName: string;
  cardsRequired: string[];
  commanderRequired: boolean;
  resourcesRequired: string[];
  setupTurns: number;
  executionMana: string;
  tutorAccess: string;
  redundancy: string;
  interactionExposure: string;
  lethalMechanism: string;
  numberOfOpponentsKilled: string;
  expectedThreatWindow: string;
  outcomeType: "VALUE" | "ADVANTAGE" | "THREATENING_BOARD" | "ACTUAL_WIN";
};

export type TargetBracketArchitectureV415 = {
  summary: string;
  primaryWinPlan: string;
  secondaryWinPlan?: string;
  threatWindow: string;
  compactnessScore: number;
  winLines: WinLineV415[];
  transformationNeeded?: string;
  enginesToPreserve?: string[];
  packagesToRemove?: string[];
  packagesToTransform?: string[];
  missingBridgeFunctions?: string[];
  estimatedSlotsToChange?: number;
};

export type ArchitectureTransformationProposalV415 = {
  proposalId: string;
  preserveCards: string[];
  removeCards: string[];
  addCards: string[];
  reason: string;
  deficitsSolved: string[];
  oldWinArchitecture: string;
  newWinArchitecture: string;
  oldSlotCount: number;
  newSlotCount: number;
  expectedThreatWindowBefore: string;
  expectedThreatWindowAfter: string;
  commanderFit: string;
  charterFit: string;
  bracketImpact: string;
};

const ARCHITECTURE_SYSTEM = `You are GPT-5.6 Sol designing a B4 win architecture transformation.

The deck cannot reach requested bracket through card-quality alone. Design the SMALLEST strategic transformation that makes the game plan behave like the target bracket while preserving commander identity and user win preference.

Return JSON:
{
  "targetArchitecture": { summary, primaryWinPlan, secondaryWinPlan, threatWindow, compactnessScore, winLines[], estimatedSlotsToChange },
  "transformationProposal": {
    "preserveCards": [],
    "removeCards": [],
    "addCards": [],
    "reason": "",
    "deficitsSolved": [],
    "oldWinArchitecture": "",
    "newWinArchitecture": "",
    "expectedThreatWindowBefore": "",
    "expectedThreatWindowAfter": "",
    "commanderFit": "",
    "charterFit": "",
    "bracketImpact": ""
  }
}

Do NOT equate more tutors/finishers/Game Changers with a stronger win architecture. Focus on resource conversion → decisive win.`;

type ArchJson = {
  targetArchitecture?: TargetBracketArchitectureV415;
  transformationProposal?: Partial<ArchitectureTransformationProposalV415>;
};

export async function analyzeArchitectureTransformationV415(args: {
  dossier: FinalDeckDoctorDossierV48;
  review: FullHeadProfessorReviewV415;
  winPreference: WinPreferenceChoiceV415;
  currentBracket: number;
  targetBracket: number;
}): Promise<{
  targetArchitecture: TargetBracketArchitectureV415;
  proposal: ArchitectureTransformationProposalV415 | null;
}> {
  if (args.currentBracket >= args.targetBracket) {
    return {
      targetArchitecture:
        args.review.targetWinArchitecture ??
        args.review.currentWinArchitecture ?? {
          summary: "Current architecture meets target",
          primaryWinPlan: args.review.overallAssessment.slice(0, 200),
          threatWindow: "On curve",
          compactnessScore: 7,
          winLines: [],
        },
      proposal: null,
    };
  }

  const prompt = [
    dossierToPromptText(args.dossier),
    "",
    "# CURRENT HEAD PROFESSOR ASSESSMENT",
    `Effective: B${args.review.predictedEffectiveBracket} | Requested: B${args.targetBracket}`,
    `Gap: ${args.review.b3ToB4GapExplanation}`,
    `Preserve: ${args.review.preserveAtAllCosts.join(", ")}`,
    `Win preference: ${args.winPreference.architectureGuidance}`,
    "",
    "Design the smallest architecture transformation. 4-10 card changes allowed if justified.",
  ].join("\n");

  try {
    const { parsed } = await callHeadProfessorJsonV48<ArchJson>({
      system: ARCHITECTURE_SYSTEM,
      userContent: prompt,
    });

    const targetArchitecture = parsed.targetArchitecture ??
      args.review.targetWinArchitecture ?? {
        summary: "Compact win through existing engine",
        primaryWinPlan: "Accelerate and compress win line",
        threatWindow: "Turn 6-8",
        compactnessScore: 6,
        winLines: [],
        estimatedSlotsToChange: 6,
      };

    const raw = parsed.transformationProposal;
    const proposal: ArchitectureTransformationProposalV415 | null = raw
      ? {
          proposalId: `arch-xform-${Date.now()}`,
          preserveCards: raw.preserveCards ?? args.review.preserveAtAllCosts,
          removeCards: raw.removeCards ?? [],
          addCards: raw.addCards ?? [],
          reason: raw.reason ?? "Compress win architecture for target bracket",
          deficitsSolved: raw.deficitsSolved ?? ["WIN_COMPACTNESS"],
          oldWinArchitecture: raw.oldWinArchitecture ?? args.review.currentWinArchitecture?.summary ?? "",
          newWinArchitecture: raw.newWinArchitecture ?? targetArchitecture.summary,
          oldSlotCount: raw.removeCards?.length ?? 0,
          newSlotCount: raw.addCards?.length ?? 0,
          expectedThreatWindowBefore:
            raw.expectedThreatWindowBefore ?? args.review.currentWinArchitecture?.threatWindow ?? "Slow",
          expectedThreatWindowAfter: raw.expectedThreatWindowAfter ?? targetArchitecture.threatWindow,
          commanderFit: raw.commanderFit ?? "Preserves commander engine",
          charterFit: raw.charterFit ?? "Within deck charter",
          bracketImpact: raw.bracketImpact ?? `Targets B${args.targetBracket} gameplay`,
        }
      : null;

    return { targetArchitecture, proposal };
  } catch {
    return {
      targetArchitecture: {
        summary: "Fallback — tighten win package",
        primaryWinPlan: "Replace slow value route with compact closure",
        threatWindow: "Turn 7-9",
        compactnessScore: 5,
        winLines: [],
        estimatedSlotsToChange: 5,
      },
      proposal: null,
    };
  }
}
