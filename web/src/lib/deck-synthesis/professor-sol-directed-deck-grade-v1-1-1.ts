/**
 * Derive Professor v4 category scores for Sol-directed finished decks.
 */
import type { SolDirectedHeadProfessorWholeDeckVerdictV111 } from "./professor-sol-directed-head-professor-v1-1-1";
import {
  scoreToLetter,
  type ProfessorCategoryGradeV4,
  type ProfessorDeckGradeV4,
  type ProfessorGradeCategoryIdV4,
} from "./professor-deck-grade-v4-v1";

export const PROFESSOR_SOL_DIRECTED_DECK_GRADE_V1_1_1_VERSION =
  "professor-sol-directed-deck-grade-v1-1-1";

const CATEGORY_LABELS: Record<ProfessorGradeCategoryIdV4, string> = {
  commanderFit: "Commander Fit",
  engineSynergy: "Engine Synergy",
  harmony: "Harmony",
  resilience: "Resilience",
  roleCompression: "Role Compression",
  interaction: "Interaction",
  resourceEngine: "Resource / Card Advantage",
  winPaths: "Win Paths",
  manaCurve: "Mana / Curve",
  creativity: "Creativity",
};

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function textAssessmentToScore(text: string, baseline = 72): number {
  const t = text.toLowerCase();
  let score = baseline;
  if (/excellent|strong|solid|coherent|well-built|robust|clear|tight|exemplary/.test(t)) score += 12;
  if (/good|capable|reasonable|adequate|functional|works|aligned/.test(t)) score += 6;
  if (/weak|poor|missing|lack|fail|defect|problem|concern|thin|low|inconsistent|off-plan|misaligned/.test(t)) {
    score -= 14;
  }
  if (/mixed|uneven|acceptable|moderate|some issues|minor/.test(t)) score -= 4;
  return clamp(score);
}

function classificationBaseline(classification: SolDirectedHeadProfessorWholeDeckVerdictV111["classification"]): number {
  if (classification === "CONSTRUCTION_SUCCESS") return 86;
  if (classification === "OPTIONAL_REFINEMENT") return 78;
  return 58;
}

export function parseLetterFromGradeText(grade: string): string | null {
  const asSubmitted = grade.match(/^([A-F][+-]?)\s+as submitted/i)?.[1];
  if (asSubmitted) return asSubmitted;
  const leading = grade.trim().match(/^([A-F](?:\+|-)?)/);
  if (leading?.[1]) return leading[1];
  const match = grade.match(/(?:^|[^\w])(A\+|A-|A|B\+|B-|B|C\+|C-|C|D\+|D-|D|F)(?:\b|$|[^\w+-])/);
  return match?.[1] ?? null;
}

/** Single letter grade for customer UI — matches Head Professor headline, not blended composite. */
export function headProfessorDisplayLetter(grade: string): string | null {
  return parseHeadProfessorGradeText(grade).asSubmittedLetter ?? parseLetterFromGradeText(grade);
}

export type HeadProfessorGradePartsV111 = {
  asSubmittedLetter: string | null;
  potentialRange: string | null;
  shortLabel: string;
  full: string;
};

/** Parse dual grades like "F as submitted; approximately B+/A- after correction". */
export function parseHeadProfessorGradeText(grade: string): HeadProfessorGradePartsV111 {
  const full = grade.trim();
  const asSubmittedLetter = full.match(/^([A-F][+-]?)\s+as submitted/i)?.[1] ?? null;
  const potentialRange =
    full.match(/approximately\s+([A-F][+-]?(?:\s*\/\s*[A-F][+-]?)?)/i)?.[1]?.replace(/\s+/g, "") ?? null;

  let shortLabel = full;
  if (asSubmittedLetter && potentialRange) {
    shortLabel = `${asSubmittedLetter} as built → ~${potentialRange}`;
  } else if (asSubmittedLetter) {
    shortLabel = `${asSubmittedLetter} as built`;
  } else if (full.length > 24) {
    shortLabel = full.slice(0, 22) + "…";
  }

  return { asSubmittedLetter, potentialRange, shortLabel, full };
}

const HEAD_PROFESSOR_GRADE_RANK: Record<string, number> = {
  F: 0,
  "D-": 1,
  D: 2,
  "D+": 3,
  "C-": 4,
  C: 5,
  "C+": 6,
  "B-": 7,
  B: 8,
  "B+": 9,
  "A-": 10,
  A: 11,
  "A+": 12,
};

export function headProfessorGradeRank(grade: string): number | null {
  const letter = parseLetterFromGradeText(grade);
  if (!letter) return null;
  return HEAD_PROFESSOR_GRADE_RANK[letter] ?? null;
}

/**
 * Whether to ship a deck an earlier repair pass produced instead of the latest one.
 *
 * Repair passes can lower the grade — a live Mikaeus build went C+ then D+ then
 * C- and shipped the C-, because the loop kept whatever came last. An
 * unparseable current grade counts as worse than a known one: there is no
 * reason to prefer a deck we cannot grade over one we can.
 */
export function shouldKeepEarlierGradedDeckV111(args: {
  currentGrade: string;
  earlierGrade: string;
}): boolean {
  const earlierRank = headProfessorGradeRank(args.earlierGrade);
  if (earlierRank == null) return false;
  const currentRank = headProfessorGradeRank(args.currentGrade);
  if (currentRank == null) return true;
  return currentRank < earlierRank;
}

/** After repair passes are exhausted, ship legal decks graded D+ or better instead of hard-failing. */
export function isSolDirectedHeadProfessorBestEffortShippableV111(
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111,
  options: {
    repairPassesCompleted: number;
    maxRepairPasses: number;
    validationPass: boolean;
    deckPreferencesConstrained?: boolean;
  },
): boolean {
  if (!options.validationPass) return false;
  if (options.repairPassesCompleted < options.maxRepairPasses) return false;

  const letter = parseLetterFromGradeText(verdict.grade);
  if (!letter || letter.startsWith("F")) return false;

  const rank = headProfessorGradeRank(verdict.grade);
  const minRank =
    options.deckPreferencesConstrained === true
      ? HEAD_PROFESSOR_GRADE_RANK["D"]!
      : HEAD_PROFESSOR_GRADE_RANK["D+"]!;
  return rank !== null && rank >= minRank;
}

export function prepareHeadProfessorVerdictForCustomerV111(
  verdict: SolDirectedHeadProfessorWholeDeckVerdictV111,
  bestEffortShip: boolean,
): SolDirectedHeadProfessorWholeDeckVerdictV111 {
  if (!bestEffortShip) return verdict;
  return {
    ...verdict,
    classification:
      verdict.classification === "CONSTRUCTION_DEFECT" ? "OPTIONAL_REFINEMENT" : verdict.classification,
    optionalChanges: [
      ...verdict.requiredChanges.map((change) => `Tuning note: ${change}`),
      ...verdict.optionalChanges,
    ],
    requiredChanges: [],
  };
}

export function headProfessorClassificationHint(
  classification: SolDirectedHeadProfessorWholeDeckVerdictV111["classification"],
  options?: { professorRepairApplied?: boolean },
): string {
  if (classification === "CONSTRUCTION_SUCCESS") {
    return "The Professor thinks this deck executes the plan well as built.";
  }
  if (classification === "OPTIONAL_REFINEMENT") {
    if (options?.professorRepairApplied) {
      return "Solid core — the Professor applied targeted package fixes before the final grade.";
    }
    return "Solid core — optional tuning suggestions only.";
  }
  return "Construction defect — the list has serious issues as built, but the strategy may still be sound after fixes.";
}

/** Strip model-identity phrasing from Head Professor self-build answers for customer UI. */
export function formatProfessorVerdictForCustomer(raw: string): string {
  let text = raw.trim();
  if (!text) return text;

  text = text.replace(
    /^Yes\.?\s*Given the same Commander?,?\s*Bracket\s*\d+,?\s*and\s+[^,.]+[,.]?\s*/i,
    "Yes. This is substantially the deck the Professor would recommend for this commander, bracket, and playstyle. ",
  );
  text = text.replace(
    /^Yes\.?\s*Given the same commander[^.]*\.\s*/i,
    "Yes. This is substantially the deck the Professor would recommend for this commander, bracket, and playstyle. ",
  );
  text = text.replace(
    /\bthis is substantially the deck I would have wanted constructed\b/gi,
    "this is substantially the deck the Professor would recommend",
  );
  text = text.replace(/\bI would have wanted constructed\b/gi, "the Professor would recommend");
  text = text.replace(/\bI might refine\b/gi, "the Professor might suggest refining");
  text = text.replace(/\bI would retain\b/gi, "the Professor would retain");
  text = text.replace(/\bSol\b/g, "the Professor");

  return text;
}

function letterToScore(letter: string): number {
  if (letter === "A+") return 98;
  if (letter === "A") return 94;
  if (letter === "A-") return 90;
  if (letter === "B+") return 87;
  if (letter === "B") return 83;
  if (letter === "B-") return 80;
  if (letter === "C+") return 77;
  if (letter === "C") return 73;
  if (letter === "C-") return 70;
  if (letter === "D+") return 67;
  if (letter === "D") return 63;
  if (letter === "F") return 55;
  return 72;
}

function countHeuristicScore(count: number, ideal: number, spread: number): number {
  const delta = Math.abs(count - ideal);
  return clamp(78 - delta * spread);
}

function buildCategory(
  id: ProfessorGradeCategoryIdV4,
  score: number,
  explanation: string,
): ProfessorCategoryGradeV4 {
  const s = clamp(score);
  return {
    id,
    label: CATEGORY_LABELS[id],
    score: s,
    letter: scoreToLetter(s),
    explanation,
    evidence: [],
    affectedPackages: [],
    affectedCards: [],
    suggestedImprovements: [],
  };
}

export function computeSolDirectedDeckGradeV111(args: {
  headProfessor: SolDirectedHeadProfessorWholeDeckVerdictV111;
  bracket: number;
  playstyle: string;
  thesis?: string;
  primaryWinPaths?: string[];
  audit?: {
    ramp: number;
    draw: number;
    interaction: number;
    protection: number;
    tutorsAccess: number;
    averageMv: number;
  } | null;
  landCount?: number | null;
  validationPass?: boolean;
}): ProfessorDeckGradeV4 {
  const hp = args.headProfessor;
  const gradeParts = parseHeadProfessorGradeText(hp.grade);
  const base = classificationBaseline(hp.classification);
  const parsedLetter = gradeParts.asSubmittedLetter ?? parseLetterFromGradeText(hp.grade);
  const headlineScore = parsedLetter ? letterToScore(parsedLetter) : base;

  const audit = args.audit;
  const rampScore = audit ? countHeuristicScore(audit.ramp, args.bracket >= 4 ? 10 : 8, 4) : base;
  const drawScore = audit ? countHeuristicScore(audit.draw, args.bracket >= 3 ? 8 : 6, 3) : base;
  const interactionScore = audit
    ? countHeuristicScore(audit.interaction, args.bracket >= 3 ? 8 : 6, 4)
    : textAssessmentToScore(hp.interactionAssessment, base);
  const protectionScore = audit ? countHeuristicScore(audit.protection, 5, 4) : base;
  const mvScore = audit ? clamp(82 - Math.max(0, audit.averageMv - 2.8) * 8) : base;
  const landScore =
    args.landCount != null ? clamp(68 + (args.landCount >= 33 && args.landCount <= 38 ? 14 : args.landCount >= 30 ? 6 : -10)) : base;

  const offPlanPenalty = Math.min(18, hp.offPlanCards.length * 4);
  const requiredPenalty = Math.min(22, hp.requiredChanges.length * 6);

  const categories: ProfessorCategoryGradeV4[] = [
    buildCategory(
      "commanderFit",
      avg([textAssessmentToScore(hp.strategyCoherence, base), textAssessmentToScore(hp.selfBuildQuestionAnswer, base)]) -
        offPlanPenalty * 0.4,
      hp.strategyCoherence || "How tightly the 99 supports the commander.",
    ),
    buildCategory(
      "engineSynergy",
      avg([
        textAssessmentToScore(hp.strategyCoherence, base),
        textAssessmentToScore(hp.earlyMidLateGameAssessment, base - 4),
      ]) - offPlanPenalty * 0.3,
      hp.strategyCoherence || "Whether packages and roles feed each other.",
    ),
    buildCategory(
      "harmony",
      avg([
        textAssessmentToScore(hp.strategyCoherence, base),
        textAssessmentToScore(hp.earlyMidLateGameAssessment, base),
        textAssessmentToScore(hp.bracketFit, base),
      ]),
      hp.earlyMidLateGameAssessment || "Early, mid, and late game working as one plan.",
    ),
    buildCategory(
      "resilience",
      avg([textAssessmentToScore(hp.resilienceAssessment, base), protectionScore]) - requiredPenalty * 0.25,
      hp.resilienceAssessment || "Recovery from disruption and removal.",
    ),
    buildCategory(
      "roleCompression",
      avg([mvScore, drawScore, rampScore]) - offPlanPenalty * 0.2,
      "Slots doing multiple jobs — inferred from curve and resource density.",
    ),
    buildCategory(
      "interaction",
      avg([textAssessmentToScore(hp.interactionAssessment, base), interactionScore]),
      hp.interactionAssessment || "Answers on board and stack.",
    ),
    buildCategory(
      "resourceEngine",
      avg([textAssessmentToScore(hp.manaAssessment, base), rampScore, drawScore, audit?.tutorsAccess ? countHeuristicScore(audit.tutorsAccess, 4, 5) : base]),
      hp.manaAssessment || "Ramp, draw, tutors, and mana quality.",
    ),
    buildCategory(
      "winPaths",
      avg([
        textAssessmentToScore(hp.winConditionAssessment, base),
        clamp(55 + (args.primaryWinPaths?.length ?? 1) * 12),
      ]),
      hp.winConditionAssessment || "Clear ways to close games.",
    ),
    buildCategory(
      "manaCurve",
      avg([textAssessmentToScore(hp.manaAssessment, base), landScore, mvScore]),
      hp.manaAssessment || "Mana base and curve executing the plan.",
    ),
    buildCategory(
      "creativity",
      clamp(
        base +
          (args.thesis && args.thesis.length > 80 ? 6 : 0) -
          offPlanPenalty -
          Math.min(8, hp.optionalChanges.length * 2) +
          (hp.classification === "CONSTRUCTION_SUCCESS" ? 4 : 0),
      ),
      "Novel synergies vs a generic goodstuff pile.",
    ),
  ];

  const strategicScores = categories.map((c) => c.score);
  const categoryAverage = avg(strategicScores);
  const overallScore = clamp(categoryAverage * 0.55 + headlineScore * 0.45);
  const sorted = [...categories].sort((a, b) => b.score - a.score);

  const displayLetter = parsedLetter ?? scoreToLetter(overallScore);

  return {
    version: "professor-deck-grade-v4-v1",
    overallScore,
    legacyScore: overallScore,
    overallLetter: displayLetter,
    mechanicalConfidencePercent: args.validationPass ? 88 : 62,
    verifiedConnections: args.validationPass ? categories.length : Math.max(1, categories.length - 3),
    totalConnections: categories.length,
    weirdDiscoveries: Math.max(0, 3 - hp.offPlanCards.length),
    categories,
    bestArea: sorted[0]!,
    weakestArea: sorted[sorted.length - 1]!,
    professorNotes: [
      hp.reasoningSummary.slice(0, 240) || hp.grade,
      `Best area: ${sorted[0]!.label} (${sorted[0]!.letter}).`,
      `Weakest area: ${sorted[sorted.length - 1]!.label} (${sorted[sorted.length - 1]!.letter}).`,
    ],
    improvementOptions: [],
    improvementProfessorLine: hp.selfBuildQuestionAnswer || hp.reasoningSummary,
    characterSheet: {
      coreEngines: args.primaryWinPaths?.slice(0, 3) ?? [],
      discoveredSynergies: Math.max(0, 10 - hp.offPlanCards.length),
      verifiedConnectionsLabel: args.validationPass ? "Commander legal" : "Review needed",
      weirdDiscoveries: Math.max(0, 2 - hp.requiredChanges.length),
      independencePercent: clamp(textAssessmentToScore(hp.resilienceAssessment, 70)),
    },
    bracketAlignment: {
      requestedBracket: args.bracket,
      effectiveBracket: args.bracket,
      alignment: textAssessmentToScore(hp.bracketFit, 75) >= 75 ? "PASS" : "LOW",
      explanation: hp.bracketFit,
      score: textAssessmentToScore(hp.bracketFit, 75),
      letter: scoreToLetter(textAssessmentToScore(hp.bracketFit, 75)),
    },
    bracketAlignmentStatus:
      textAssessmentToScore(hp.bracketFit, 75) >= 80 ? "TARGET_ACHIEVED" : "TARGET_MISSED",
  };
}
