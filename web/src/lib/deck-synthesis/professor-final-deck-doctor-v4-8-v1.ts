/**
 * GPT-5.6 Sol Head Professor / Final Deck Doctor v4.8.
 */
import { deckListSha as canonicalDeckListSha, deckListShaFromCards } from "./professor-canonical-card-identity-v4-15-1-v1";
import type { FinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import { dossierToPromptText } from "./professor-deck-dossier-v4-8-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import {
  callHeadProfessorJsonV48,
  HeadProfessorCallFailedError,
  HEAD_PROFESSOR_PRODUCT_NAME,
} from "./professor-head-professor-caller-v4-8-v1";

export const PROFESSOR_FINAL_DECK_DOCTOR_V4_8_V1_VERSION = "professor-final-deck-doctor-v4-8-v1";
export const PROFESSOR_V4_8_HEAD_PROFESSOR_DECISION_V1 =
  "PROFESSOR_V4_8_GPT56SOL_FINAL_DECK_DOCTOR_AND_POST_REVIEW_GRADING_V1_AUTHORIZED";

export const HEAD_PROFESSOR_MODEL =
  process.env.PROFESSOR_BREW_HEAD_PROFESSOR_MODEL?.trim() || "gpt-5.6-sol";

export type FinalDeckDoctorPriorityV48 = "HIGH" | "MEDIUM" | "LOW";

export type FinalDeckDoctorCutV48 = {
  card: string;
  priority: FinalDeckDoctorPriorityV48;
  whyCut: string;
  slotFunctionLost: string;
};

export type FinalDeckDoctorAdditionV48 = {
  card: string;
  priority: FinalDeckDoctorPriorityV48;
  whyAdd: string;
  intendedRole: string;
  packagesImproved: string[];
};

export type FinalDeckDoctorSwapV48 = {
  cut: string;
  add: string;
  priority: FinalDeckDoctorPriorityV48;
  reason: string;
  expectedImprovement: string[];
};

export function sanitizeHeadProfessorSwap(
  raw: Partial<FinalDeckDoctorSwapV48>,
): FinalDeckDoctorSwapV48 | null {
  const cut = typeof raw.cut === "string" ? raw.cut.trim() : "";
  const add = typeof raw.add === "string" ? raw.add.trim() : "";
  if (!cut || !add) return null;
  const priority: FinalDeckDoctorPriorityV48 =
    raw.priority === "HIGH" || raw.priority === "LOW" ? raw.priority : "MEDIUM";
  return {
    cut,
    add,
    priority,
    reason: typeof raw.reason === "string" ? raw.reason.trim() : "",
    expectedImprovement: Array.isArray(raw.expectedImprovement)
      ? raw.expectedImprovement.filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      : [],
  };
}

export function normalizeHeadProfessorSwaps(raw: {
  swaps?: Partial<FinalDeckDoctorSwapV48>[];
  cuts?: Array<Partial<FinalDeckDoctorCutV48>>;
  additions?: Array<Partial<FinalDeckDoctorAdditionV48>>;
}): FinalDeckDoctorSwapV48[] {
  const swaps: FinalDeckDoctorSwapV48[] = [];
  for (const entry of raw.swaps ?? []) {
    const clean = sanitizeHeadProfessorSwap(entry);
    if (clean) swaps.push(clean);
  }
  for (const cut of raw.cuts ?? []) {
    const cutName = typeof cut.card === "string" ? cut.card.trim() : "";
    if (!cutName) continue;
    const pairedAdd = raw.additions?.find((a) => a.priority === cut.priority);
    const addName = typeof pairedAdd?.card === "string" ? pairedAdd.card.trim() : "";
    if (!addName || swaps.some((s) => s.cut === cutName)) continue;
    const clean = sanitizeHeadProfessorSwap({
      cut: cutName,
      add: addName,
      priority: cut.priority,
      reason: cut.whyCut,
      expectedImprovement: pairedAdd?.intendedRole ? [pairedAdd.intendedRole] : [],
    });
    if (clean) swaps.push(clean);
  }
  return swaps;
}

export type FinalDeckDoctorResearchRequestV48 = {
  topic: string;
  cardName?: string;
  question: string;
};

export type FinalDeckDoctorReviewV48 = {
  version: typeof PROFESSOR_FINAL_DECK_DOCTOR_V4_8_V1_VERSION;
  model: string;
  generatedAt: string;
  headProfessorCallCompleted: boolean;
  overallAssessment: string;
  deckIdentityAssessment: string;
  bracketAssessment: string;
  predictedEffectiveBracket: CommanderBracket;
  playStyleAssessment: string;
  commanderDependenceAssessment: string;
  strengths: string[];
  structuralProblems: string[];
  mechanicalProblems: string[];
  manaProblems: string[];
  interactionProblems: string[];
  resourceProblems: string[];
  resilienceProblems: string[];
  winPathProblems: string[];
  creativityOpportunities: string[];
  preserveAtAllCosts: string[];
  cuts: FinalDeckDoctorCutV48[];
  additions: FinalDeckDoctorAdditionV48[];
  swaps: FinalDeckDoctorSwapV48[];
  researchRequests: FinalDeckDoctorResearchRequestV48[];
  revisedGamePlan: string | null;
  requiresMajorRevision: boolean;
  remainingConcerns: string[];
  keyImprovements: string[];
};

type HeadProfessorJsonV48 = Omit<
  FinalDeckDoctorReviewV48,
  "version" | "model" | "generatedAt" | "headProfessorCallCompleted"
> & {
  structuralChanges?: string[];
};

const HEAD_PROFESSOR_SYSTEM = `You are the Head Professor — GPT-5.6 Sol, senior Commander deckbuilder.

The council assembled a provisional 100-card deck. Read the BUILD BRIEF, COMMANDER ORACLE, and COUNCIL LOG SUMMARY to understand what deck the player asked for before reviewing cards.

Perform a fast final review BEFORE grading. Return compact JSON only.

bracketAssessment: State the assigned bracket from the BUILD BRIEF and give an exact reason it fits (or misfits) using Wizards Commander Bracket Framework signals — Game Changers, tutors, fast mana, combo speed, stax, extra turns, and average card quality. Name specific cards or patterns from the list. One short paragraph.

predictedEffectiveBracket: Ignoring the player's selected label, what bracket (1-5) does this deck actually play like? Be honest — a slow turn-8 combat deck with two Game Changers is often B3, not B4.

keyImprovements: 3–6 plain-language improvements the deck needs (themes, roles, mana, interaction) — NO card names, NO cut/add pairs.

The swaps array is the primary execution output — at most 15 paired CUT→ADD swaps using exact card names from the list, legal in color identity. Swaps are applied silently; players see keyImprovements only.

Keep strings short. Priority: land count under 30, thin interaction/draw, off-theme filler vs charter. Set requiresMajorRevision true only for emergency mana base (under 30 lands) or pervasive off-theme filler — not for missing 1-3 ideal lands when already at 30+.`;

function normalizeSwaps(raw: HeadProfessorJsonV48): FinalDeckDoctorSwapV48[] {
  return normalizeHeadProfessorSwaps(raw);
}

function clampBracket(value: unknown, fallback: CommanderBracket): CommanderBracket {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseInt(value, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n as CommanderBracket;
  return fallback;
}

export async function runHeadProfessorReviewV48(
  dossier: FinalDeckDoctorDossierV48,
): Promise<FinalDeckDoctorReviewV48> {
  const prompt = dossierToPromptText(dossier);

  const { parsed: raw, model } = await callHeadProfessorJsonV48<HeadProfessorJsonV48>({
    system: HEAD_PROFESSOR_SYSTEM,
    userContent: prompt,
  });

  const swaps = normalizeSwaps(raw);

  return {
    version: PROFESSOR_FINAL_DECK_DOCTOR_V4_8_V1_VERSION,
    model,
    generatedAt: new Date().toISOString(),
    headProfessorCallCompleted: true,
    overallAssessment: raw.overallAssessment ?? "",
    deckIdentityAssessment: raw.deckIdentityAssessment ?? "",
    bracketAssessment: raw.bracketAssessment ?? "",
    predictedEffectiveBracket: clampBracket(raw.predictedEffectiveBracket ?? dossier.bracket),
    playStyleAssessment: raw.playStyleAssessment ?? "",
    commanderDependenceAssessment: raw.commanderDependenceAssessment ?? "",
    strengths: raw.strengths ?? [],
    structuralProblems: [...(raw.structuralProblems ?? []), ...(raw.structuralChanges ?? [])],
    mechanicalProblems: raw.mechanicalProblems ?? [],
    manaProblems: raw.manaProblems ?? [],
    interactionProblems: raw.interactionProblems ?? [],
    resourceProblems: raw.resourceProblems ?? [],
    resilienceProblems: raw.resilienceProblems ?? [],
    winPathProblems: raw.winPathProblems ?? [],
    creativityOpportunities: raw.creativityOpportunities ?? [],
    preserveAtAllCosts: raw.preserveAtAllCosts ?? [],
    cuts: raw.cuts ?? [],
    additions: raw.additions ?? [],
    swaps,
    researchRequests: raw.researchRequests ?? [],
    revisedGamePlan: raw.revisedGamePlan ?? null,
    requiresMajorRevision: raw.requiresMajorRevision ?? false,
    remainingConcerns: raw.remainingConcerns ?? [],
    keyImprovements: (raw.keyImprovements ?? []).filter(Boolean).slice(0, 6),
  };
}

const HEAD_PROFESSOR_REFINEMENT_PASS_SYSTEM = `You are GPT-5.6 Sol performing a bounded second Head Professor pass on an already partially refined deck.

The first pass applied some swaps; others were rejected. Critical structural problems may remain.

Return compact JSON only. Recommend NEW swaps only for unresolved material problems (especially mana base). Do not repeat already-accepted swaps. Max 10 new swaps.

Update bracketAssessment and keyImprovements if the refined list changes bracket fit or priorities. keyImprovements must be plain language — no card names.`;

export async function runHeadProfessorRefinementPassV48(args: {
  dossier: FinalDeckDoctorDossierV48;
  priorReview: FinalDeckDoctorReviewV48;
  executedSwaps: ExecutedSwapV48[];
}): Promise<FinalDeckDoctorReviewV48> {
  const accepted = args.executedSwaps.filter((s) => s.status === "ACCEPTED");
  const rejected = args.executedSwaps.filter((s) => s.status === "REJECTED");
  const prompt = [
    dossierToPromptText(args.dossier),
    "",
    "# FIRST PASS RESULT",
    `Assessment: ${args.priorReview.overallAssessment}`,
    `Major revision needed: ${args.priorReview.requiresMajorRevision}`,
    `Remaining concerns: ${args.priorReview.remainingConcerns.join("; ") || "none listed"}`,
    `Mana problems: ${args.priorReview.manaProblems.join("; ") || "none listed"}`,
    "",
    "Accepted swaps:",
    accepted.length > 0 ? accepted.map((s) => `- ${s.cut} → ${s.add}`).join("\n") : "(none)",
    "",
    "Rejected swaps:",
    rejected.length > 0
      ? rejected.map((s) => `- ${s.cut} → ${s.add}: ${s.rejectionReason ?? "rejected"}`).join("\n")
      : "(none)",
    "",
    "Which material problems STILL need correction before this deck should be graded? Return only NEW swaps.",
  ].join("\n");

  const { parsed: raw, model } = await callHeadProfessorJsonV48<HeadProfessorJsonV48>({
    system: HEAD_PROFESSOR_REFINEMENT_PASS_SYSTEM,
    userContent: prompt,
  });

  const priorCuts = new Set(accepted.map((s) => s.cut.toLowerCase()));
  const swaps = normalizeSwaps(raw).filter((s) => !priorCuts.has(s.cut.toLowerCase()));

  return {
    version: PROFESSOR_FINAL_DECK_DOCTOR_V4_8_V1_VERSION,
    model,
    generatedAt: new Date().toISOString(),
    headProfessorCallCompleted: true,
    overallAssessment: raw.overallAssessment ?? args.priorReview.overallAssessment,
    deckIdentityAssessment: raw.deckIdentityAssessment ?? "",
    bracketAssessment: raw.bracketAssessment?.trim() || args.priorReview.bracketAssessment,
    predictedEffectiveBracket: clampBracket(
      raw.predictedEffectiveBracket ?? args.priorReview.predictedEffectiveBracket,
      args.dossier.bracket,
    ),
    playStyleAssessment: raw.playStyleAssessment ?? "",
    commanderDependenceAssessment: raw.commanderDependenceAssessment ?? "",
    strengths: raw.strengths ?? args.priorReview.strengths,
    structuralProblems: [...(raw.structuralProblems ?? []), ...(raw.structuralChanges ?? [])],
    mechanicalProblems: raw.mechanicalProblems ?? [],
    manaProblems: raw.manaProblems ?? args.priorReview.manaProblems,
    interactionProblems: raw.interactionProblems ?? [],
    resourceProblems: raw.resourceProblems ?? [],
    resilienceProblems: raw.resilienceProblems ?? [],
    winPathProblems: raw.winPathProblems ?? [],
    creativityOpportunities: raw.creativityOpportunities ?? [],
    preserveAtAllCosts: raw.preserveAtAllCosts ?? args.priorReview.preserveAtAllCosts,
    cuts: raw.cuts ?? [],
    additions: raw.additions ?? [],
    swaps,
    researchRequests: raw.researchRequests ?? [],
    revisedGamePlan: raw.revisedGamePlan ?? null,
    requiresMajorRevision: raw.requiresMajorRevision ?? args.priorReview.requiresMajorRevision,
    remainingConcerns: raw.remainingConcerns ?? args.priorReview.remainingConcerns,
    keyImprovements:
      (raw.keyImprovements ?? []).filter(Boolean).length > 0
        ? (raw.keyImprovements ?? []).filter(Boolean).slice(0, 6)
        : args.priorReview.keyImprovements,
  };
}

export { HeadProfessorCallFailedError, HEAD_PROFESSOR_PRODUCT_NAME };

export type ExecutedSwapV48 = {
  cut: string;
  add: string;
  reason: string;
  recommendedBy: "HEAD_PROFESSOR" | "STRUCTURAL_REPAIR";
  verifiedBy: "RESEARCH" | "REJECTED";
  approvedBy: "CRITIC" | "REJECTED";
  expectedImprovement: string[];
  status: "ACCEPTED" | "REJECTED";
  rejectionReason?: string;
};

export type FinalDeckDoctorSessionV48 = {
  status: "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";
  headProfessorModel: string | null;
  headProfessorCallCompleted: boolean;
  headProfessorError: string | null;
  provisionalDeckSha: string | null;
  finalDeckSha: string | null;
  finalDeckRevision?: number;
  finalDeckFingerprint?: string;
  finalSnapshotRevision?: number;
  headProfessorReviewedDeckFingerprint?: string | null;
  gradingStartedAfterFinalDeckSha: boolean;
  dossier: FinalDeckDoctorDossierV48 | null;
  review: FinalDeckDoctorReviewV48 | null;
  executedSwaps: ExecutedSwapV48[];
  rejectedRecommendations: { card: string; reason: string }[];
  modelCalls: { headProfessor: number; research: number; confirmation: number };
  summary: {
    recommended: number;
    accepted: number;
    rejected: number;
    keyImprovements: string[];
  } | null;
  bracketAdjudicationV410?: import("./professor-bracket-upgrade-mission-v4-10-v1").BracketAdjudicationV410 | null;
  bracketAdjudicationV411?: import("./professor-bracket-adjudication-v4-11-v1").BracketAdjudicationV411 | null;
};

export function emptyFinalDeckDoctorSessionV48(): FinalDeckDoctorSessionV48 {
  return {
    status: "PENDING",
    headProfessorModel: null,
    headProfessorCallCompleted: false,
    headProfessorError: null,
    provisionalDeckSha: null,
    finalDeckSha: null,
    gradingStartedAfterFinalDeckSha: false,
    dossier: null,
    review: null,
    executedSwaps: [],
    rejectedRecommendations: [],
    modelCalls: { headProfessor: 0, research: 0, confirmation: 0 },
    summary: null,
  };
}

export function deckListSha(names: string[]): string {
  return canonicalDeckListSha(names);
}

export { deckListShaFromCards };
