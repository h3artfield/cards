/**
 * Bracket-only Head Professor adjudication v4.11 — evaluates exact post-mana final deck.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { FinalDeckDoctorDossierV48 } from "./professor-deck-dossier-v4-8-v1";
import { dossierToPromptText } from "./professor-deck-dossier-v4-8-v1";
import { callHeadProfessorJsonV48 } from "./professor-head-professor-caller-v4-8-v1";
import type { BracketAdjudicationV410 } from "./professor-bracket-upgrade-mission-v4-10-v1";
import type { FinalDeckFingerprintV411 } from "./professor-deck-fingerprint-v4-11-v1";

export const PROFESSOR_BRACKET_ADJUDICATION_V4_11_V1_VERSION = "professor-bracket-adjudication-v4-11-v1";

export type BracketAdjudicationV411 = BracketAdjudicationV410 & {
  version: typeof PROFESSOR_BRACKET_ADJUDICATION_V4_11_V1_VERSION;
  headProfessorReviewedDeckFingerprint: string;
  finalSnapshotRevision: number;
  structuralMetrics: {
    landCount: number;
    avgManaValue: number;
    tutorCount: number;
    rampNonLandCount: number;
    interactionCount: number;
    protectionCount: number;
    cardAdvantageCount: number;
    gameChangerCount: number;
  };
};

const BRACKET_ADJUDICATION_SYSTEM = `You are GPT-5.6 Sol — Head Professor bracket adjudicator.

You receive the EXACT current 100-card Commander deck AFTER mana base construction. Metrics in the dossier reflect the actual final list — trust them.

Ignore the player's selected bracket label. Based ONLY on this exact deck list and metrics, answer:

1. What bracket (1-5) does this deck actually play like?
2. Why — cite Game Changers, tutors, fast mana, interaction efficiency, protection, card velocity, win architecture, average card quality.
3. Power strengths and deficits relative to the REQUESTED bracket in the brief.

Return compact JSON only:
{
  "predictedEffectiveBracket": 1-5,
  "confidence": "HIGH"|"MEDIUM"|"LOW",
  "bracketAssessment": "one paragraph",
  "reasons": ["..."],
  "powerStrengths": ["..."],
  "powerDeficits": ["..."],
  "recommendedBracketChanges": ["plain language, no card names"]
}

Be honest. A slow synergy deck with one Game Changer and zero tutors is often B2, not B4. Do NOT cite land shortages unless structural metrics show fewer than 30 lands.`;

type BracketAdjudicationJson = {
  predictedEffectiveBracket?: number;
  confidence?: "HIGH" | "MEDIUM" | "LOW";
  bracketAssessment?: string;
  reasons?: string[];
  powerStrengths?: string[];
  powerDeficits?: string[];
  recommendedBracketChanges?: string[];
};

function clampBracket(value: unknown, fallback: CommanderBracket): CommanderBracket {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseInt(value, 10) : NaN;
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n as CommanderBracket;
  return fallback;
}

export function buildBracketAdjudicationPromptV411(dossier: FinalDeckDoctorDossierV48): string {
  const m = dossier.structuralMetrics;
  return [
    dossierToPromptText(dossier),
    "",
    "# BRACKET ADJUDICATION TASK",
    "Evaluate bracket fit for the EXACT deck above. Metrics are authoritative:",
    `- Lands: ${m.landCount} | Avg MV (nonlands): ${m.avgManaValue} | Ramp: ${m.rampCount}`,
    `- Tutors: count from list | Interaction: ${m.interactionCount} | Protection: ${m.protectionCount} | Draw: ${m.cardAdvantageCount}`,
    `- Requested bracket: ${dossier.bracketLabel}`,
    "",
    "Ignore the requested label when predicting effective bracket.",
  ].join("\n");
}

export async function runBracketAdjudicationV411(args: {
  dossier: FinalDeckDoctorDossierV48;
  fingerprint: FinalDeckFingerprintV411;
  gameChangerCount?: number;
}): Promise<BracketAdjudicationV411> {
  const { parsed: raw, model } = await callHeadProfessorJsonV48<BracketAdjudicationJson>({
    system: BRACKET_ADJUDICATION_SYSTEM,
    userContent: buildBracketAdjudicationPromptV411(args.dossier),
  });

  const predicted = clampBracket(raw.predictedEffectiveBracket, args.dossier.bracket);
  const gap = args.dossier.bracket - predicted;

  return {
    version: PROFESSOR_BRACKET_ADJUDICATION_V4_11_V1_VERSION,
    requestedBracket: args.dossier.bracket,
    predictedEffectiveBracket: predicted,
    confidence: raw.confidence ?? (gap <= 0 ? "HIGH" : gap === 1 ? "MEDIUM" : "LOW"),
    reasons: (raw.reasons ?? [raw.bracketAssessment ?? ""]).filter(Boolean),
    powerStrengths: raw.powerStrengths ?? [],
    powerDeficits: raw.powerDeficits ?? [],
    recommendedBracketChanges: raw.recommendedBracketChanges ?? [],
    playsLikeBecause: raw.bracketAssessment ?? "",
    toBecomeTargetWithoutAbandoningCharter:
      (raw.recommendedBracketChanges ?? []).join("; ") || "Apply bracket power levers without abandoning deck charter.",
    headProfessorReviewedDeckFingerprint: args.fingerprint.finalDeckFingerprint,
    finalSnapshotRevision: args.fingerprint.finalSnapshotRevision,
    structuralMetrics: {
      landCount: args.fingerprint.landCount,
      avgManaValue: args.fingerprint.avgManaValue,
      tutorCount: args.fingerprint.tutorCount,
      rampNonLandCount: args.fingerprint.rampNonLandCount,
      interactionCount: args.dossier.structuralMetrics.interactionCount,
      protectionCount: args.dossier.structuralMetrics.protectionCount,
      cardAdvantageCount: args.dossier.structuralMetrics.cardAdvantageCount,
      gameChangerCount: args.gameChangerCount ?? 0,
    },
  };
}

export function adjudicationToReviewFieldsV411(adj: BracketAdjudicationV411): {
  bracketAssessment: string;
  predictedEffectiveBracket: CommanderBracket;
  strengths: string[];
  manaProblems: string[];
  interactionProblems: string[];
  winPathProblems: string[];
  keyImprovements: string[];
} {
  return {
    bracketAssessment: adj.playsLikeBecause,
    predictedEffectiveBracket: adj.predictedEffectiveBracket,
    strengths: adj.powerStrengths,
    manaProblems: adj.powerDeficits.filter((d) => /land|mana|ramp|color/i.test(d)),
    interactionProblems: adj.powerDeficits.filter((d) => /interaction|removal|counter|protection/i.test(d)),
    winPathProblems: adj.powerDeficits.filter((d) => /win|finisher|combo|kill|speed/i.test(d)),
    keyImprovements: adj.recommendedBracketChanges,
  };
}
