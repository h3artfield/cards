/**
 * Professor final play report v4.8 — generated AFTER Head Professor refinement and grading.
 */
import { callOpenAiJsonWithUsage } from "../card-flow-v2/openai-json";
import type { ModelTelemetryCollectorV4151 } from "./professor-model-telemetry-v4-15-1-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import type { ProfessorDeckGradeV4 } from "./professor-deck-grade-v4-v1";
import type { FinalDeckDoctorSessionV48 } from "./professor-final-deck-doctor-v4-8-v1";
import { COMMANDER_DECK_TOTAL_CARDS_V47 } from "./professor-deck-completion-v4-7-v1";
import { bracketLabel } from "./professor-brew-bracket-v4-v1";
import { PROFESSOR_DECK_FINAL_REPORT_V4_8_V1_VERSION, PROFESSOR_V4_8_DECISION_V1 } from "./professor-deck-final-report-v4-8-v1";

export type ProfessorDeckFinalReportV48 = import("./professor-deck-final-report-v4-8-v1").ProfessorDeckFinalReportV48;

const PLAY_REPORT_MODEL =
  process.env.PROFESSOR_BREW_PLAY_REPORT_MODEL?.trim() ||
  process.env.PROFESSOR_BREW_DEFENSE_MODEL?.trim() ||
  "gpt-4o";

type PlayReportJsonV48 = {
  deckName: string;
  deckSubtitle: string;
  strategySummary: string;
  primaryWinCondition: string;
  secondaryWinPaths: string[];
  uniquenessThesis: string;
  deckIdentity: string;
  howItWorks: {
    earlyGame: string;
    midgame: string;
    lateGame: string;
  };
  commanderRole: string;
  coreEngines: string[];
  harmonyPlan: string;
  mulliganGuide: string;
  pilotingGuide: string;
  strengths: string[];
  weaknesses: string[];
  opponentAttacks: string[];
  recoveryPlan: string;
  bracketExplanation: string;
  playExperience: string;
  professorDefense: {
    councilSummary: string;
    strengths: string[];
    risks: string[];
    closingStatement: string;
  };
};

function buildPlayReportContext(args: {
  commanderName: string;
  commanderOracleText: string;
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  theory: WorkingDeckTheoryV4 | null;
  councilState: ProfessorCouncilStateV47;
  deckGrade: ProfessorDeckGradeV4;
  finalDeckDoctor: FinalDeckDoctorSessionV48;
}): string {
  const snapshot = args.councilState.snapshots[args.councilState.snapshots.length - 1];
  const deckList = [args.commanderName, ...args.councilState.selectedCards.map((c) => c.name)];
  const swaps = args.finalDeckDoctor.executedSwaps.filter((s) => s.status === "ACCEPTED");

  return [
    `Commander: ${args.commanderName}`,
    args.commanderOracleText ? `Commander Oracle (AUTHORITATIVE — do not invent abilities):\n${args.commanderOracleText}` : "",
    `Bracket: ${bracketLabel(args.bracket)}`,
    `Player relationship: ${args.charter?.commanderRelationship ?? "Harmony"}`,
    `FINAL GRADE: ${args.deckGrade.overallLetter} (${args.deckGrade.overallScore}/100)`,
    `Weakest area: ${args.deckGrade.weakestArea.label} (${args.deckGrade.weakestArea.score})`,
    `Lands: ${snapshot?.landCount ?? "?"} · Card adv: ${snapshot?.cardAdvantageCoverage ?? "?"}`,
    "",
    "Head Professor accepted swaps:",
    ...swaps.map((s) => `- ${s.cut} → ${s.add}: ${s.reason.slice(0, 120)}`),
    "",
    "Deck list:",
    deckList.map((n, i) => `${i + 1}. ${n}`).join("\n"),
    "",
    args.charter ? `Charter: ${args.charter.deckIdentity} — ${args.charter.primaryStrategy}` : "",
    args.theory ? `Theory: ${args.theory.thesis.summary}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const PLAY_REPORT_SYSTEM = `You write the final Professor play report for a Magic: The Gathering Commander deck AFTER Head Professor review and grading.

The player receives the REVIEWED final list — not a provisional draft.

CRITICAL: Commander mechanics must match the provided Oracle text exactly. Do NOT confuse this commander with other cards that share part of the name. Do NOT invent triggers or abilities not present in Oracle text.

Write clear, practical guidance: how the deck works, how to pilot it, strengths, weaknesses, and how opponents will attack it.

Include professorDefense summarizing council work and Head Professor refinement.

Return JSON only.`;

export async function runProfessorPlayReportV48(args: {
  commanderName: string;
  commanderOracleText?: string;
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  theory: WorkingDeckTheoryV4 | null;
  councilState: ProfessorCouncilStateV47;
  deckGrade: ProfessorDeckGradeV4;
  finalDeckDoctor: FinalDeckDoctorSessionV48;
  finalDeckFingerprint?: string;
  telemetry?: ModelTelemetryCollectorV4151;
}): Promise<ProfessorDeckFinalReportV48> {
  const boundFingerprint =
    args.finalDeckFingerprint ||
    args.finalDeckDoctor.finalDeckFingerprint ||
    args.deckGrade.deckFingerprint ||
    "";
  if (!boundFingerprint) {
    throw new Error("Play report requires finalDeckFingerprint binding");
  }
  const context = buildPlayReportContext({
    ...args,
    commanderOracleText: args.commanderOracleText ?? "",
  });
  const headReview = args.finalDeckDoctor.review;

  try {
    const startedAt = Date.now();
    const { parsed: raw, usage } = await callOpenAiJsonWithUsage<PlayReportJsonV48>(
      PLAY_REPORT_SYSTEM,
      [
        {
          type: "text",
          text: `${context}\n\nHead Professor assessment: ${headReview?.overallAssessment ?? ""}\n\nReturn JSON with deckName, deckSubtitle, strategySummary, primaryWinCondition, secondaryWinPaths, uniquenessThesis, deckIdentity, howItWorks {earlyGame,midgame,lateGame}, commanderRole, coreEngines[], harmonyPlan, mulliganGuide, pilotingGuide, strengths[], weaknesses[], opponentAttacks[], recoveryPlan, bracketExplanation, playExperience, professorDefense {councilSummary,strengths[],risks[],closingStatement}`,
        },
      ],
      { model: PLAY_REPORT_MODEL, maxTokens: 4096, temperature: 0.35 },
    );
    args.telemetry?.record({
      model: PLAY_REPORT_MODEL,
      purpose: "PLAY_REPORT",
      usage,
      latencyMs: Date.now() - startedAt,
      planned: true,
    });

    return {
      version: PROFESSOR_DECK_FINAL_REPORT_V4_8_V1_VERSION,
      decision: PROFESSOR_V4_8_DECISION_V1,
      status: "COMPLETE",
      generatedAt: new Date().toISOString(),
      deckFingerprint: boundFingerprint,
      deckName: raw.deckName || `${args.commanderName} Council Brew`,
      deckSubtitle: raw.deckSubtitle || "",
      strategySummary: raw.strategySummary,
      primaryWinCondition: raw.primaryWinCondition,
      secondaryWinPaths: raw.secondaryWinPaths ?? [],
      uniquenessThesis: raw.uniquenessThesis,
      deckIdentity: raw.deckIdentity,
      professorDefense: raw.professorDefense,
      frontierReview: headReview
        ? {
            model: headReview.model,
            verdict: headReview.requiresMajorRevision ? "MAJOR_CHANGES" : headReview.swaps.length > 0 ? "MINOR_CHANGES" : "ENDORSE",
            wouldChangeDeck: headReview.swaps.length > 0,
            summary: headReview.overallAssessment,
            proposedChanges: args.finalDeckDoctor.executedSwaps.map((s) => ({
              action: "REPLACE" as const,
              cardOrSlot: s.cut,
              replaceWith: s.add,
              reason: s.reason,
              priority: "HIGH" as const,
            })),
            whatProfessorsGotRight: headReview.strengths,
            whatProfessorsMissed: headReview.structuralProblems,
            overallAssessment: headReview.overallAssessment,
          }
        : null,
      structuralCardCount: args.councilState.selectedCards.length,
      targetCardCount: COMMANDER_DECK_TOTAL_CARDS_V47,
      playReport: {
        howItWorks: raw.howItWorks,
        commanderRole: raw.commanderRole,
        coreEngines: raw.coreEngines,
        harmonyPlan: raw.harmonyPlan,
        mulliganGuide: raw.mulliganGuide,
        pilotingGuide: raw.pilotingGuide,
        strengths: raw.strengths,
        weaknesses: raw.weaknesses,
        opponentAttacks: raw.opponentAttacks,
        recoveryPlan: raw.recoveryPlan,
        bracketExplanation: raw.bracketExplanation,
        playExperience: raw.playExperience,
        professorGradeLetter: args.deckGrade.overallLetter,
        professorGradeScore: args.deckGrade.overallScore,
      },
      headProfessorReview: args.finalDeckDoctor,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Play report failed";
    return {
      version: PROFESSOR_DECK_FINAL_REPORT_V4_8_V1_VERSION,
      decision: PROFESSOR_V4_8_DECISION_V1,
      status: "COMPLETE",
      generatedAt: new Date().toISOString(),
      deckFingerprint: boundFingerprint,
      deckName: args.charter?.deckIdentity ?? `${args.commanderName} Council Brew`,
      deckSubtitle: args.charter?.primaryStrategy ?? "",
      strategySummary: args.theory?.thesis.summary ?? "Collaborative council brew with Head Professor refinement.",
      primaryWinCondition: args.charter?.intendedWinPaths[0] ?? "Win through synergistic board pressure.",
      secondaryWinPaths: args.charter?.intendedWinPaths.slice(1) ?? [],
      uniquenessThesis: "Needs-driven discovery with final Head Professor review.",
      deckIdentity: args.charter?.deckIdentity ?? `${args.commanderName} list`,
      professorDefense: {
        councilSummary: `Final list after ${args.finalDeckDoctor.summary?.accepted ?? 0} Head Professor swaps.`,
        strengths: headReview?.strengths ?? [],
        risks: headReview?.structuralProblems ?? [],
        closingStatement: `Final grade: ${args.deckGrade.overallLetter}.`,
      },
      frontierReview: null,
      structuralCardCount: args.councilState.selectedCards.length,
      targetCardCount: COMMANDER_DECK_TOTAL_CARDS_V47,
      error: message,
      headProfessorReview: args.finalDeckDoctor,
      playReport: {
        howItWorks: { earlyGame: "", midgame: "", lateGame: "" },
        commanderRole: "",
        coreEngines: [],
        harmonyPlan: "",
        mulliganGuide: "",
        pilotingGuide: "",
        strengths: [],
        weaknesses: [],
        opponentAttacks: [],
        recoveryPlan: "",
        bracketExplanation: bracketLabel(args.bracket),
        playExperience: "",
        professorGradeLetter: args.deckGrade.overallLetter,
        professorGradeScore: args.deckGrade.overallScore,
      },
    };
  }
}
