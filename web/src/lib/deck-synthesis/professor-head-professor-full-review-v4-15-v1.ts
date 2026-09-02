/**
 * Full GPT-5.6 Sol Head Professor review v4.15 — whole-deck strategic analysis before refinement.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { FinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import { dossierToPromptText } from "./professor-deck-dossier-v4-8-v1";
import {
  callHeadProfessorJsonV48,
  HEAD_PROFESSOR_PRODUCT_NAME,
} from "./professor-head-professor-caller-v4-8-v1";
import type {
  FinalDeckDoctorAdditionV48,
  FinalDeckDoctorCutV48,
  FinalDeckDoctorResearchRequestV48,
  FinalDeckDoctorReviewV48,
  FinalDeckDoctorSwapV48,
} from "./professor-final-deck-doctor-v4-8-v1";
import { normalizeHeadProfessorSwaps } from "./professor-final-deck-doctor-v4-8-v1";
import type { WinPreferenceChoiceV415 } from "./professor-win-preference-v4-15-v1";
import type { WinLineV415, TargetBracketArchitectureV415 } from "./professor-win-architecture-v4-15-v1";

export const PROFESSOR_HEAD_PROFESSOR_FULL_REVIEW_V4_15_V1_VERSION =
  "professor-head-professor-full-review-v4-15-v1";

export type WeakPackageV415 = {
  packageId: string;
  cards: string[];
  purpose: string;
  reasonItDrags: string;
  desiredReplacementFunction: string;
};

export type CardSuggestionV415 = {
  action: "ADD" | "CUT" | "SWAP";
  card?: string;
  cut?: string;
  add?: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  addressesDeficit?: string;
};

export type FullHeadProfessorReviewV415 = FinalDeckDoctorReviewV48 & {
  version415: typeof PROFESSOR_HEAD_PROFESSOR_FULL_REVIEW_V4_15_V1_VERSION;
  commanderAssessment: string;
  strategyAssessment: string;
  weakCards: string[];
  opportunityCostCards: string[];
  weakPackages: WeakPackageV415[];
  missingFunctions: string[];
  missingPowerLevers: string[];
  currentWinArchitecture: TargetBracketArchitectureV415 | null;
  targetWinArchitecture: TargetBracketArchitectureV415 | null;
  specificCardSuggestions: CardSuggestionV415[];
  requiresMinorRefinement: boolean;
  b3ToB4GapExplanation: string;
  identityPreserved: boolean;
  adjudicationConfidence: number;
  adjudicationReasons: string[];
  structuredFieldStatus?: StructuredFieldStatusV415;
};

export type StructuredFieldPopulationV415 = "populated" | "empty_genuine" | "schema_omitted";

export type StructuredFieldStatusV415 = {
  deckIdentityAssessment: StructuredFieldPopulationV415;
  commanderAssessment: StructuredFieldPopulationV415;
  strategyAssessment: StructuredFieldPopulationV415;
  preserveAtAllCosts: StructuredFieldPopulationV415;
  weakCards: StructuredFieldPopulationV415;
  opportunityCostCards: StructuredFieldPopulationV415;
  weakPackages: StructuredFieldPopulationV415;
  currentWinArchitecture: StructuredFieldPopulationV415;
  targetWinArchitecture: StructuredFieldPopulationV415;
  specificCardSuggestions: StructuredFieldPopulationV415;
  researchRequests: StructuredFieldPopulationV415;
};

const STRING_ARRAY = { type: "array", items: { type: "string" }, maxItems: 12 } as const;

const WEAK_CARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    oracleId: { type: "string" },
    canonicalName: { type: "string" },
    reason: { type: "string" },
    replacementFunction: { type: "string" },
  },
  required: ["canonicalName", "reason", "replacementFunction"],
} as const;

const WIN_ARCHITECTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    primaryWinPlan: { type: "string" },
    secondaryWinPlan: { type: "string" },
    threatWindow: { type: "string" },
    compactnessScore: { type: "number" },
    transformationNeeded: { type: "string" },
    winLines: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          lineName: { type: "string" },
          lethalMechanism: { type: "string" },
          expectedThreatWindow: { type: "string" },
          outcomeType: {
            type: "string",
            enum: ["VALUE", "ADVANTAGE", "THREATENING_BOARD", "ACTUAL_WIN"],
          },
        },
        required: ["lineName", "lethalMechanism", "expectedThreatWindow", "outcomeType"],
      },
    },
  },
  required: ["summary", "primaryWinPlan", "threatWindow", "compactnessScore", "winLines"],
} as const;

/** Strict JSON schema for v4.15 full Head Professor review — includes structured strategic fields. */
export const HEAD_PROFESSOR_FULL_REVIEW_V415_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    overallAssessment: { type: "string" },
    deckIdentityAssessment: { type: "string" },
    commanderAssessment: { type: "string" },
    strategyAssessment: { type: "string" },
    bracketAssessment: { type: "string" },
    playStyleAssessment: { type: "string" },
    commanderDependenceAssessment: { type: "string" },
    predictedEffectiveBracket: { type: "number", enum: [1, 2, 3, 4, 5] },
    adjudicationConfidence: { type: "number" },
    adjudicationReasons: STRING_ARRAY,
    b3ToB4GapExplanation: { type: "string" },
    strengths: STRING_ARRAY,
    structuralProblems: STRING_ARRAY,
    mechanicalProblems: STRING_ARRAY,
    manaProblems: STRING_ARRAY,
    interactionProblems: STRING_ARRAY,
    resourceProblems: STRING_ARRAY,
    resilienceProblems: STRING_ARRAY,
    winPathProblems: STRING_ARRAY,
    preserveAtAllCosts: STRING_ARRAY,
    weakCards: { type: "array", maxItems: 16, items: WEAK_CARD_SCHEMA },
    opportunityCostCards: STRING_ARRAY,
    weakPackages: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          packageId: { type: "string" },
          cards: STRING_ARRAY,
          purpose: { type: "string" },
          reasonItDrags: { type: "string" },
          desiredReplacementFunction: { type: "string" },
        },
        required: ["packageId", "cards", "purpose", "reasonItDrags", "desiredReplacementFunction"],
      },
    },
    missingFunctions: STRING_ARRAY,
    missingPowerLevers: STRING_ARRAY,
    currentWinArchitecture: WIN_ARCHITECTURE_SCHEMA,
    targetWinArchitecture: WIN_ARCHITECTURE_SCHEMA,
    specificCardSuggestions: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["ADD", "CUT", "SWAP"] },
          card: { type: "string" },
          cut: { type: "string" },
          add: { type: "string" },
          priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          reason: { type: "string" },
          addressesDeficit: { type: "string" },
        },
        required: ["action", "priority", "reason"],
      },
    },
    researchRequests: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: { type: "string" },
          priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
        },
        required: ["question", "priority"],
      },
    },
    swaps: {
      type: "array",
      maxItems: 15,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          cut: { type: "string" },
          add: { type: "string" },
          priority: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] },
          reason: { type: "string" },
          expectedImprovement: { type: "array", items: { type: "string" }, maxItems: 3 },
        },
        required: ["cut", "add", "priority", "reason", "expectedImprovement"],
      },
    },
    requiresMinorRefinement: { type: "boolean" },
    requiresMajorRevision: { type: "boolean" },
    keyImprovements: { type: "array", items: { type: "string" }, maxItems: 6 },
    remainingConcerns: STRING_ARRAY,
  },
  required: [
    "overallAssessment",
    "deckIdentityAssessment",
    "commanderAssessment",
    "strategyAssessment",
    "bracketAssessment",
    "predictedEffectiveBracket",
    "adjudicationConfidence",
    "adjudicationReasons",
    "b3ToB4GapExplanation",
    "strengths",
    "structuralProblems",
    "preserveAtAllCosts",
    "weakCards",
    "opportunityCostCards",
    "weakPackages",
    "missingFunctions",
    "missingPowerLevers",
    "currentWinArchitecture",
    "targetWinArchitecture",
    "specificCardSuggestions",
    "researchRequests",
    "swaps",
    "requiresMinorRefinement",
    "requiresMajorRevision",
    "keyImprovements",
    "remainingConcerns",
  ],
} as const;

const FULL_HEAD_PROFESSOR_SYSTEM = `You are the Head Professor — GPT-5.6 Sol, senior Commander deckbuilder.

The council assembled a provisional 100-card deck. Perform a COMPLETE strategic review before any card mutations.

Read BUILD BRIEF, COMMANDER ORACLE, CHARTER, and the full card list. Evaluate the deck as a senior brewer would — not bracket-only.

Return compact JSON with these fields:
- overallAssessment, deckIdentityAssessment, commanderAssessment, bracketAssessment, strategyAssessment
- playStyleAssessment, commanderDependenceAssessment
- predictedEffectiveBracket (1-5): IGNORE the player's selected label — what bracket does this deck ACTUALLY play like?
- adjudicationConfidence (0-1), adjudicationReasons[] (concrete reasons for effective bracket)
- b3ToB4GapExplanation: if below requested bracket, WHY (tutors find value not wins? slow threat window? diffuse win plan?)
- strengths[], structuralProblems[], mechanicalProblems[], manaProblems[], interactionProblems[], resourceProblems[], resilienceProblems[], winPathProblems[]
- preserveAtAllCosts[] (exact card names)
- weakCards[] (obvious filler / bad slots)
- opportunityCostCards[] (acceptable at current power but wrong for target bracket)
- weakPackages[]: { packageId, cards[], purpose, reasonItDrags, desiredReplacementFunction }
- missingFunctions[], missingPowerLevers[]
- currentWinArchitecture: { summary, primaryWinPlan, threatWindow, compactnessScore (1-10), winLines[] }
- targetWinArchitecture: { summary, primaryWinPlan, threatWindow, compactnessScore, winLines[], transformationNeeded }
- specificCardSuggestions[]: { action, card/cut/add, priority, reason, addressesDeficit }
- swaps[] (max 12 paired CUT→ADD with exact names), cuts[], additions[], researchRequests[]
- requiresMinorRefinement, requiresMajorRevision
- keyImprovements[] (3-6 plain language, NO card names)
- remainingConcerns[]

Be honest about effective bracket. Eight tutors with no compact win line is still B3, not B4.`;

type FullReviewJson = Partial<
  Omit<
    FullHeadProfessorReviewV415,
    "version" | "model" | "generatedAt" | "headProfessorCallCompleted" | "version415"
  >
>;

function normalizeSwaps(raw: FullReviewJson): FinalDeckDoctorSwapV48[] {
  return normalizeHeadProfessorSwaps(raw).slice(0, 12);
}

function clampBracket(value: unknown, fallback: CommanderBracket): CommanderBracket {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseInt(value, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n as CommanderBracket;
  return fallback;
}

function fieldPopulation(
  raw: Record<string, unknown>,
  key: string,
  populatedWhen: boolean,
): StructuredFieldPopulationV415 {
  if (!(key in raw)) return "schema_omitted";
  return populatedWhen ? "populated" : "empty_genuine";
}

function normalizeWeakCardNames(raw: FullReviewJson): string[] {
  const entries = raw.weakCards ?? [];
  if (entries.length === 0) return [];
  if (typeof entries[0] === "string") return entries as string[];
  return (entries as Array<{ canonicalName?: string; reason?: string }>)
    .map((entry) => entry.canonicalName?.trim() || "")
    .filter(Boolean);
}

function normalizeWinArchitecture(raw: unknown): TargetBracketArchitectureV415 | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (!value.summary && !value.primaryWinPlan) return null;
  return {
    summary: String(value.summary ?? ""),
    primaryWinPlan: String(value.primaryWinPlan ?? ""),
    secondaryWinPlan: value.secondaryWinPlan ? String(value.secondaryWinPlan) : undefined,
    threatWindow: String(value.threatWindow ?? ""),
    compactnessScore: typeof value.compactnessScore === "number" ? value.compactnessScore : 0,
    transformationNeeded: value.transformationNeeded ? String(value.transformationNeeded) : undefined,
    winLines: Array.isArray(value.winLines)
      ? value.winLines.map((line) => {
          const row = line as Record<string, unknown>;
          return {
            lineName: String(row.lineName ?? ""),
            cardsRequired: [],
            commanderRequired: false,
            resourcesRequired: [],
            setupTurns: 0,
            executionMana: "",
            tutorAccess: "",
            redundancy: "",
            interactionExposure: "",
            lethalMechanism: String(row.lethalMechanism ?? ""),
            numberOfOpponentsKilled: "",
            expectedThreatWindow: String(row.expectedThreatWindow ?? ""),
            outcomeType: (row.outcomeType as WinLineV415["outcomeType"]) ?? "VALUE",
          };
        })
      : [],
  };
}

function buildStructuredFieldStatus(raw: Record<string, unknown>): StructuredFieldStatusV415 {
  const weakCards = normalizeWeakCardNames(raw as FullReviewJson);
  const currentWinArchitecture = normalizeWinArchitecture(raw.currentWinArchitecture);
  const targetWinArchitecture = normalizeWinArchitecture(raw.targetWinArchitecture);
  return {
    deckIdentityAssessment: fieldPopulation(raw, "deckIdentityAssessment", Boolean(String(raw.deckIdentityAssessment ?? "").trim())),
    commanderAssessment: fieldPopulation(raw, "commanderAssessment", Boolean(String(raw.commanderAssessment ?? "").trim())),
    strategyAssessment: fieldPopulation(raw, "strategyAssessment", Boolean(String(raw.strategyAssessment ?? "").trim())),
    preserveAtAllCosts: fieldPopulation(raw, "preserveAtAllCosts", Array.isArray(raw.preserveAtAllCosts) && raw.preserveAtAllCosts.length > 0),
    weakCards: fieldPopulation(raw, "weakCards", weakCards.length > 0),
    opportunityCostCards: fieldPopulation(
      raw,
      "opportunityCostCards",
      Array.isArray(raw.opportunityCostCards) && raw.opportunityCostCards.length > 0,
    ),
    weakPackages: fieldPopulation(raw, "weakPackages", Array.isArray(raw.weakPackages) && raw.weakPackages.length > 0),
    currentWinArchitecture: fieldPopulation(raw, "currentWinArchitecture", Boolean(currentWinArchitecture)),
    targetWinArchitecture: fieldPopulation(raw, "targetWinArchitecture", Boolean(targetWinArchitecture)),
    specificCardSuggestions: fieldPopulation(
      raw,
      "specificCardSuggestions",
      Array.isArray(raw.specificCardSuggestions) && raw.specificCardSuggestions.length > 0,
    ),
    researchRequests: fieldPopulation(
      raw,
      "researchRequests",
      Array.isArray(raw.researchRequests) && raw.researchRequests.length > 0,
    ),
  };
}

export async function runFullHeadProfessorReviewV415(args: {
  dossier: FinalDeckDoctorDossierV48;
  winPreference: WinPreferenceChoiceV415;
  reviewedFingerprint: string;
  /** Live Brew Room — sync-first, low reasoning, bounded timeout. */
  liveFast?: boolean;
  telemetry?: import("./professor-model-telemetry-v4-15-1-v1").ModelTelemetryCollectorV4151;
}): Promise<FullHeadProfessorReviewV415> {
  const prompt = [
    dossierToPromptText(args.dossier),
    "",
    "# WIN PREFERENCE",
    args.winPreference.architectureGuidance,
    "",
    `# DECK FINGERPRINT (review binds to this list)`,
    args.reviewedFingerprint,
  ].join("\n");

  const { parsed: raw, model } = await callHeadProfessorJsonV48<FullReviewJson>({
    system: FULL_HEAD_PROFESSOR_SYSTEM,
    userContent: prompt,
    jsonSchema: HEAD_PROFESSOR_FULL_REVIEW_V415_JSON_SCHEMA,
    schemaName: "head_professor_full_review_v415",
    useJsonSchema: false,
    backgroundFirst: args.liveFast ? false : true,
    liveFast: args.liveFast,
    telemetry: args.telemetry
      ? { collector: args.telemetry, purpose: "HEAD_PROFESSOR_REVIEW", planned: true }
      : undefined,
  });

  const swaps = normalizeSwaps(raw);
  const weakCards = normalizeWeakCardNames(raw);
  const structuredFieldStatus = buildStructuredFieldStatus(raw as Record<string, unknown>);
  const currentWinArchitecture = normalizeWinArchitecture(raw.currentWinArchitecture);
  const targetWinArchitecture = normalizeWinArchitecture(raw.targetWinArchitecture);

  return {
    version: "professor-final-deck-doctor-v4-8-v1",
    version415: PROFESSOR_HEAD_PROFESSOR_FULL_REVIEW_V4_15_V1_VERSION,
    model,
    generatedAt: new Date().toISOString(),
    headProfessorCallCompleted: true,
    overallAssessment: raw.overallAssessment ?? "",
    deckIdentityAssessment: raw.deckIdentityAssessment ?? "",
    bracketAssessment: raw.bracketAssessment ?? "",
    predictedEffectiveBracket: clampBracket(raw.predictedEffectiveBracket, args.dossier.bracket),
    playStyleAssessment: raw.playStyleAssessment ?? "",
    commanderDependenceAssessment: raw.commanderDependenceAssessment ?? "",
    strengths: raw.strengths ?? [],
    structuralProblems: raw.structuralProblems ?? [],
    mechanicalProblems: raw.mechanicalProblems ?? [],
    manaProblems: raw.manaProblems ?? [],
    interactionProblems: raw.interactionProblems ?? [],
    resourceProblems: raw.resourceProblems ?? [],
    resilienceProblems: raw.resilienceProblems ?? [],
    winPathProblems: raw.winPathProblems ?? [],
    creativityOpportunities: raw.creativityOpportunities ?? [],
    preserveAtAllCosts: raw.preserveAtAllCosts ?? [],
    cuts: (raw.cuts ?? []) as FinalDeckDoctorCutV48[],
    additions: (raw.additions ?? []) as FinalDeckDoctorAdditionV48[],
    swaps,
    researchRequests: (raw.researchRequests ?? []) as FinalDeckDoctorResearchRequestV48[],
    revisedGamePlan: raw.revisedGamePlan ?? null,
    requiresMajorRevision: raw.requiresMajorRevision ?? false,
    remainingConcerns: raw.remainingConcerns ?? [],
    keyImprovements: (raw.keyImprovements ?? []).filter(Boolean).slice(0, 6),
    commanderAssessment: raw.commanderAssessment ?? "",
    strategyAssessment: raw.strategyAssessment ?? "",
    weakCards,
    opportunityCostCards: raw.opportunityCostCards ?? [],
    weakPackages: raw.weakPackages ?? [],
    missingFunctions: raw.missingFunctions ?? [],
    missingPowerLevers: raw.missingPowerLevers ?? [],
    currentWinArchitecture,
    targetWinArchitecture,
    specificCardSuggestions: raw.specificCardSuggestions ?? [],
    requiresMinorRefinement: raw.requiresMinorRefinement ?? swaps.length > 0,
    b3ToB4GapExplanation: raw.b3ToB4GapExplanation ?? "",
    identityPreserved: raw.identityPreserved ?? true,
    adjudicationConfidence: raw.adjudicationConfidence ?? 0.7,
    adjudicationReasons: raw.adjudicationReasons ?? [],
    structuredFieldStatus,
  };
}

export function parseHeadProfessorReviewPayloadV415(args: {
  raw: Record<string, unknown>;
  model?: string;
  dossierBracket: CommanderBracket;
}): Pick<
  FullHeadProfessorReviewV415,
  | "weakCards"
  | "commanderAssessment"
  | "strategyAssessment"
  | "deckIdentityAssessment"
  | "structuredFieldStatus"
  | "currentWinArchitecture"
  | "targetWinArchitecture"
> {
  const reviewJson = args.raw as FullReviewJson;
  return {
    deckIdentityAssessment: String(reviewJson.deckIdentityAssessment ?? ""),
    commanderAssessment: String(reviewJson.commanderAssessment ?? ""),
    strategyAssessment: String(reviewJson.strategyAssessment ?? ""),
    weakCards: normalizeWeakCardNames(reviewJson),
    currentWinArchitecture: normalizeWinArchitecture(reviewJson.currentWinArchitecture),
    targetWinArchitecture: normalizeWinArchitecture(reviewJson.targetWinArchitecture),
    structuredFieldStatus: buildStructuredFieldStatus(args.raw),
  };
}

export function fullReviewToBaseReview(review: FullHeadProfessorReviewV415): FinalDeckDoctorReviewV48 {
  const { version415: _v, commanderAssessment: _c, strategyAssessment: _s, weakCards: _w, opportunityCostCards: _o, weakPackages: _p, missingFunctions: _mf, missingPowerLevers: _mp, currentWinArchitecture: _cwa, targetWinArchitecture: _twa, specificCardSuggestions: _scs, requiresMinorRefinement: _rmr, b3ToB4GapExplanation: _gap, identityPreserved: _ip, adjudicationConfidence: _ac, adjudicationReasons: _ar, structuredFieldStatus: _sfs, ...base } = review;
  return base;
}

export { HEAD_PROFESSOR_PRODUCT_NAME };
