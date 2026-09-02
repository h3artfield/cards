/**
 * Professor deck final report v4.8 — council synthesis + frontier model adversarial review.
 */
import { callOpenAiJson } from "../card-flow-v2/openai-json";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import { ASSEMBLY_STRUCTURAL_TARGET_V47, COMMANDER_DECK_TOTAL_CARDS_V47 } from "./professor-deck-completion-v4-7-v1";
import { bracketLabel } from "./professor-brew-bracket-v4-v1";

import type { FinalDeckDoctorSessionV48 } from "./professor-final-deck-doctor-v4-8-v1";

export const PROFESSOR_DECK_FINAL_REPORT_V4_8_V1_VERSION = "professor-deck-final-report-v4-8-v1";
export const PROFESSOR_V4_8_DECISION_V1 =
  "PROFESSOR_V4_8_GPT56SOL_FINAL_DECK_DOCTOR_AND_POST_REVIEW_GRADING_V1_AUTHORIZED";

const FRONTIER_MODEL =
  process.env.PROFESSOR_BREW_FRONTIER_MODEL?.trim() ||
  process.env.PROFESSOR_BREW_DEFENSE_MODEL?.trim() ||
  "gpt-4o";

export type FrontierReviewVerdictV48 = "ENDORSE" | "MINOR_CHANGES" | "MAJOR_CHANGES";

export type FrontierProposedChangeV48 = {
  action: "ADD" | "CUT" | "REPLACE";
  cardOrSlot: string;
  replaceWith?: string;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
};

export type ProfessorDeckFinalReportV48 = {
  version: typeof PROFESSOR_DECK_FINAL_REPORT_V4_8_V1_VERSION;
  decision: typeof PROFESSOR_V4_8_DECISION_V1;
  status: "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";
  generatedAt: string | null;
  deckName: string;
  deckSubtitle: string;
  strategySummary: string;
  primaryWinCondition: string;
  secondaryWinPaths: string[];
  uniquenessThesis: string;
  deckIdentity: string;
  professorDefense: {
    councilSummary: string;
    strengths: string[];
    risks: string[];
    closingStatement: string;
  };
  frontierReview: {
    model: string;
    verdict: FrontierReviewVerdictV48;
    wouldChangeDeck: boolean;
    summary: string;
    proposedChanges: FrontierProposedChangeV48[];
    whatProfessorsGotRight: string[];
    whatProfessorsMissed: string[];
    overallAssessment: string;
  } | null;
  structuralCardCount: number;
  targetCardCount: number;
  /** Canonical library fingerprint — must match grade + final deck doctor binding */
  deckFingerprint?: string;
  error?: string;
  playReport?: ProfessorFinalPlayReportV48 | null;
  headProfessorReview?: FinalDeckDoctorSessionV48 | null;
};

export type ProfessorFinalPlayReportV48 = {
  howItWorks: { earlyGame: string; midgame: string; lateGame: string };
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
  professorGradeLetter: string;
  professorGradeScore: number;
};

type FrontierReportJsonV48 = {
  deckName: string;
  deckSubtitle: string;
  strategySummary: string;
  primaryWinCondition: string;
  secondaryWinPaths: string[];
  uniquenessThesis: string;
  deckIdentity: string;
  professorDefense: {
    councilSummary: string;
    strengths: string[];
    risks: string[];
    closingStatement: string;
  };
  frontierReview: {
    verdict: FrontierReviewVerdictV48;
    wouldChangeDeck: boolean;
    summary: string;
    proposedChanges: FrontierProposedChangeV48[];
    whatProfessorsGotRight: string[];
    whatProfessorsMissed: string[];
    overallAssessment: string;
  };
};

function emptyFinalReportV48(): ProfessorDeckFinalReportV48 {
  return {
    version: PROFESSOR_DECK_FINAL_REPORT_V4_8_V1_VERSION,
    decision: PROFESSOR_V4_8_DECISION_V1,
    status: "PENDING",
    generatedAt: null,
    deckName: "",
    deckSubtitle: "",
    strategySummary: "",
    primaryWinCondition: "",
    secondaryWinPaths: [],
    uniquenessThesis: "",
    deckIdentity: "",
    professorDefense: {
      councilSummary: "",
      strengths: [],
      risks: [],
      closingStatement: "",
    },
    frontierReview: null,
    structuralCardCount: 0,
    targetCardCount: COMMANDER_DECK_TOTAL_CARDS_V47,
  };
}

function buildReportContextText(args: {
  commanderName: string;
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  theory: WorkingDeckTheoryV4 | null;
  councilState: ProfessorCouncilStateV47;
}): string {
  const { charter, theory, councilState } = args;
  const snapshot = councilState.snapshots[councilState.snapshots.length - 1];
  const deckList = [args.commanderName, ...councilState.selectedCards.map((c) => c.name)];
  const decisions = councilState.councilDecisions
    .slice(-12)
    .map((d) => `- ${d.decision}: ${d.reasoning}`)
    .join("\n");
  const mutations = councilState.cardDecisions
    .slice(-20)
    .map((d) => `- ${d.action} ${d.cardName}${d.replacedCardName ? ` → ${d.replacedCardName}` : ""}: ${d.reason}`)
    .join("\n");
  const conversationTail = councilState.conversation
    .slice(-16)
    .map((t) => `[${t.speaker}/${t.intent}] ${t.message}`)
    .join("\n");

  return [
    `Commander: ${args.commanderName}`,
    `Bracket: ${bracketLabel(args.bracket)}`,
    `Structural cards committed: ${councilState.selectedCards.length} (target structural ${ASSEMBLY_STRUCTURAL_TARGET_V47}, format ${COMMANDER_DECK_TOTAL_CARDS_V47})`,
    "",
    "## Deck Charter",
    charter
      ? [
          `Identity: ${charter.deckIdentity}`,
          `Primary strategy: ${charter.primaryStrategy}`,
          `Secondary: ${charter.secondaryStrategy}`,
          `Harmony plan: ${charter.harmonyPlan}`,
          `Win paths (charter): ${charter.intendedWinPaths.join("; ")}`,
          `Design rules: ${charter.designRules.join(" · ")}`,
          `Avoid: ${charter.avoidPatterns.join(" · ")}`,
        ].join("\n")
      : "(no charter)",
    "",
    "## Working Deck Theory",
    theory
      ? [
          `Thesis: ${theory.thesis.summary}`,
          `Win paths: ${theory.winPaths.map((w) => w.description).join("; ")}`,
          `Packages: ${theory.packages.map((p) => `${p.name} (${p.roles.join("+")})`).join("; ")}`,
        ].join("\n")
      : "(no theory)",
    "",
    "## Latest Snapshot",
    snapshot
      ? [
          `Card advantage coverage: ${snapshot.cardAdvantageCoverage ?? "?"}`,
          `Interaction coverage: ${snapshot.interactionCoverage ?? "?"}`,
          `Weaknesses: ${snapshot.weaknesses?.join("; ") ?? "none noted"}`,
          `Commander dependence (H/M/L): ${snapshot.commanderDependenceDistribution?.high ?? "?"}/${snapshot.commanderDependenceDistribution?.medium ?? "?"}/${snapshot.commanderDependenceDistribution?.low ?? "?"}`,
        ].join("\n")
      : "(no snapshot)",
    "",
    "## Full Deck List (commander + library)",
    deckList.map((n, i) => `${i + 1}. ${n}`).join("\n"),
    "",
    "## Recent Council Decisions",
    decisions || "(none)",
    "",
    "## Card Mutations",
    mutations || "(none)",
    "",
    "## Recent Council Conversation",
    conversationTail || "(none)",
  ].join("\n");
}

const FINAL_REPORT_SYSTEM = `You are the Professor Council presenting a final deck defense report for a Magic: The Gathering Commander brew session.

Your job has TWO parts in one JSON response:

1) PROFESSOR DEFENSE — Name the deck (creative title, not just commander name), summarize strategy, primary win condition, secondary paths, and what makes this list UNIQUE vs a generic EDHREC/staple pile. Be specific to the actual card list provided.

2) FRONTIER ADVERSARIAL REVIEW — You are also playing the role of an independent frontier-tier deck analyst (GPT-5.6-class reasoning). Critically review the assembled list against the charter and bracket. Would you change the deck? List concrete ADD/CUT/REPLACE suggestions with priorities. Be thorough and honest — do not rubber-stamp the professors.

Rules:
- Ground claims in the provided deck list and charter; do not invent cards not in the list except in proposedChanges.
- Respect bracket constraints from the charter.
- proposedChanges may reference real Magic card names for suggestions.
- strengths/risks: 3-6 bullets each.
- whatProfessorsGotRight / whatProfessorsMissed: 2-5 bullets each.
- overallAssessment: 2-4 sentences, direct tone.

Return JSON matching the schema exactly.`;

const FINAL_REPORT_JSON_SCHEMA = `{
  "deckName": "creative deck title",
  "deckSubtitle": "short tagline",
  "strategySummary": "2-4 sentences on how the deck plays",
  "primaryWinCondition": "main way this list wins",
  "secondaryWinPaths": ["alt win line 1", "alt win line 2"],
  "uniquenessThesis": "what makes this build distinct from conventional COMMANDER_NAME lists",
  "deckIdentity": "one sentence identity",
  "professorDefense": {
    "councilSummary": "paragraph synthesizing council work",
    "strengths": ["..."],
    "risks": ["..."],
    "closingStatement": "confident closing to the player"
  },
  "frontierReview": {
    "verdict": "ENDORSE|MINOR_CHANGES|MAJOR_CHANGES",
    "wouldChangeDeck": true,
    "summary": "frontier analyst summary",
    "proposedChanges": [{
      "action": "ADD|CUT|REPLACE",
      "cardOrSlot": "card name or slot",
      "replaceWith": "only for REPLACE",
      "reason": "why",
      "priority": "HIGH|MEDIUM|LOW"
    }],
    "whatProfessorsGotRight": ["..."],
    "whatProfessorsMissed": ["..."],
    "overallAssessment": "..."
  }
}`;

function buildDeterministicFallback(args: {
  commanderName: string;
  charter: DeckCharterV45 | null;
  theory: WorkingDeckTheoryV4 | null;
  councilState: ProfessorCouncilStateV47;
}): Omit<ProfessorDeckFinalReportV48, "version" | "decision" | "status" | "generatedAt" | "structuralCardCount" | "targetCardCount" | "frontierReview"> & {
  frontierReview: NonNullable<ProfessorDeckFinalReportV48["frontierReview"]>;
} {
  const charter = args.charter;
  const winPath = args.theory?.winPaths[0]?.description ?? charter?.intendedWinPaths[0] ?? "Overwhelm through synergistic creature pressure.";
  return {
    deckName: charter?.deckIdentity ?? `${args.commanderName} Harmony Engine`,
    deckSubtitle: charter?.primaryStrategy ?? "Collaborative council brew",
    strategySummary:
      charter?.expectedPlayPattern ??
      args.theory?.thesis.summary ??
      "A hybrid list balancing commander scaling with independent value engines.",
    primaryWinCondition: winPath,
    secondaryWinPaths: (charter?.intendedWinPaths ?? args.theory?.winPaths.map((w) => w.description) ?? []).slice(1, 4),
    uniquenessThesis:
      "Built from needs-driven catalog discovery rather than a fixed staple list — role compression and checkpoint cuts shaped the final pool.",
    deckIdentity: charter?.deckIdentity ?? `A ${args.commanderName} list tuned for ${charter?.commanderRelationship ?? "harmony"}.`,
    professorDefense: {
      councilSummary: `The council assembled ${args.councilState.selectedCards.length} structural cards through batched discovery, checkpoint review, and cut/replace decisions aligned to the charter.`,
      strengths: [
        charter?.primaryStrategy ? `Primary strategy locked: ${charter.primaryStrategy}` : "Clear primary strategy from creative pass.",
        "Role compression enforced over narrow single-purpose slots.",
        `${args.councilState.cardDecisions.filter((d) => d.action === "REPLACE").length} targeted replacements during assembly.`,
      ],
      risks: (args.councilState.snapshots.at(-1)?.weaknesses ?? ["Mana base and final 15 slots not yet finalized at structural stop."]).slice(0, 5),
      closingStatement:
        "This is a structural draft ready for your review — the professors stand behind the charter alignment and discovery path.",
    },
    frontierReview: {
      model: "deterministic-fallback",
      verdict: "MINOR_CHANGES",
      wouldChangeDeck: true,
      summary:
        "Frontier review unavailable (API). A full adversarial pass would stress-test mana base, interaction density, and win-con redundancy before calling the list tournament-ready.",
      proposedChanges: [
        {
          action: "ADD",
          cardOrSlot: "Mana base / land slots",
          reason: "Structural assembly stops before the final ~15 lands; verify land count and fixing.",
          priority: "HIGH",
        },
      ],
      whatProfessorsGotRight: ["Needs-driven discovery avoided hardcoded staple injection."],
      whatProfessorsMissed: ["Frontier adversarial pass may suggest mana-base or interaction tuning before tournament play."],
      overallAssessment:
        "The collaborative process produced a coherent list; a frontier model may still propose targeted swaps in interaction density or high-variance slots.",
    },
  };
}

export function isStructuralAssemblyCompleteV48(selectedNonCommanderCount: number): boolean {
  return selectedNonCommanderCount >= ASSEMBLY_STRUCTURAL_TARGET_V47;
}

export async function runProfessorDeckFinalReportV48(args: {
  commanderName: string;
  bracket: CommanderBracket;
  charter: DeckCharterV45 | null;
  theory: WorkingDeckTheoryV4 | null;
  councilState: ProfessorCouncilStateV47;
}): Promise<ProfessorDeckFinalReportV48> {
  const running: ProfessorDeckFinalReportV48 = {
    ...emptyFinalReportV48(),
    status: "RUNNING",
    structuralCardCount: args.councilState.selectedCards.length,
  };

  const contextText = buildReportContextText(args);

  try {
    const raw = await callOpenAiJson<FrontierReportJsonV48>(
      FINAL_REPORT_SYSTEM,
      [
        {
          type: "text",
          text: `${contextText}\n\nReturn JSON schema:\n${FINAL_REPORT_JSON_SCHEMA.replace("COMMANDER_NAME", args.commanderName)}`,
        },
      ],
      { model: FRONTIER_MODEL, maxTokens: 4096, temperature: 0.3 },
    );

    return {
      ...running,
      status: "COMPLETE",
      generatedAt: new Date().toISOString(),
      deckName: raw.deckName || `${args.commanderName} Council Brew`,
      deckSubtitle: raw.deckSubtitle || "",
      strategySummary: raw.strategySummary,
      primaryWinCondition: raw.primaryWinCondition,
      secondaryWinPaths: raw.secondaryWinPaths ?? [],
      uniquenessThesis: raw.uniquenessThesis,
      deckIdentity: raw.deckIdentity,
      professorDefense: raw.professorDefense,
      frontierReview: {
        ...raw.frontierReview,
        model: FRONTIER_MODEL,
      },
    };
  } catch (err) {
    const fallback = buildDeterministicFallback({
      commanderName: args.commanderName,
      charter: args.charter,
      theory: args.theory,
      councilState: args.councilState,
    });
    const message = err instanceof Error ? err.message : "Final report generation failed";
    return {
      ...running,
      status: "COMPLETE",
      generatedAt: new Date().toISOString(),
      ...fallback,
      error: message,
    };
  }
}
