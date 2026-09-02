/**
 * Professor grade from final reviewed council deck (post Head Professor), not theory-only.
 */
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import type { DeckSnapshotV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import { COMMANDER_MIN_LAND_COUNT_V48 } from "./professor-final-refinement-gate-v4-8-v1";
import { computeBracketAlignmentGradeV49 } from "./professor-bracket-finalization-gate-v4-9-v1";
import type { FinalDeckDoctorReviewV48 } from "./professor-final-deck-doctor-v4-8-v1";
import type { CanonicalLegalityAssessmentV4161 } from "./professor-canonical-legality-v4-16-1-v1";
import type { B4WinReadinessV4161 } from "./professor-b4-win-readiness-v4-16-1-v1";
import {
  type ProfessorCategoryGradeV4,
  type ProfessorDeckGradeV4,
  type ProfessorGradeCategoryIdV4,
  type BracketAlignmentStatusV415,
  scoreToLetter,
  PROFESSOR_DECK_GRADE_V4_V1_VERSION,
} from "./professor-deck-grade-v4-v1";

export const PROFESSOR_DECK_GRADE_COUNCIL_V4_8_V1_VERSION = "professor-deck-grade-council-v4-8-v1";

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

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function gradeCategory(
  id: ProfessorGradeCategoryIdV4,
  score: number,
  explanation: string,
  evidence: string[],
): ProfessorCategoryGradeV4 {
  return {
    id,
    label: CATEGORY_LABELS[id],
    score,
    letter: scoreToLetter(score),
    explanation,
    evidence,
    affectedPackages: [],
    affectedCards: [],
    suggestedImprovements: [],
  };
}

export function computeProfessorDeckGradeFromCouncilV48(args: {
  councilState: ProfessorCouncilStateV47;
  theory: WorkingDeckTheoryV4 | null;
  charter: DeckCharterV45 | null;
  commanderName: string;
  relationshipLens?: string | null;
  requestedBracket?: import("@/lib/bracket-policy/commander-bracket-snapshot-v1").CommanderBracket;
  headProfessorReview?: FinalDeckDoctorReviewV48 | null;
  deckFingerprint?: string;
  bracketAlignmentStatus?: BracketAlignmentStatusV415;
  legality?: CanonicalLegalityAssessmentV4161 | null;
  winReadiness?: B4WinReadinessV4161 | null;
}): ProfessorDeckGradeV4 | null {
  if (args.legality && !args.legality.gradeEligible) {
    return null;
  }
  const snapshot: DeckSnapshotV46 | undefined = args.councilState.snapshots[args.councilState.snapshots.length - 1];
  const landCount = snapshot?.landCount ?? args.councilState.selectedCards.filter((c) => c.category === "land").length;
  const cardAdv = snapshot?.cardAdvantageCoverage ?? 0;
  const interaction = snapshot?.interactionCoverage ?? 0;
  const protection = snapshot?.protectionCoverage ?? 0;
  const ramp = snapshot?.rampCoverage ?? 0;
  const dep = snapshot?.commanderDependenceDistribution ?? { high: 0, medium: 0, low: 0 };
  const compression = snapshot?.highRoleCompressionCards?.length ?? 0;
  const relationship = args.charter?.commanderRelationship ?? args.relationshipLens ?? "Harmony";
  const isCommanderFocus = /commander focus|dependent/i.test(relationship);
  const isIndependentEngine = /independent/i.test(relationship);

  const manaScore = clampScore(
    landCount >= 36 ? 88 : landCount >= 32 ? 78 : landCount >= 28 ? 65 : landCount >= COMMANDER_MIN_LAND_COUNT_V48 ? 52 : 35,
  );
  const resourceScore = clampScore(40 + cardAdv * 8 + ramp * 3);
  const efficientInteractionRe =
    /terminate|lightning bolt|path to exile|swords to plowshares|counterspell|force of will|cyclonic rift|deadly rollick|toxic deluge|feed the swarm|chaos warp|beast within|generous gift|anguished unmaking|abrupt decay|dismember|fatal push/i;
  const expensiveInteractionRe = /lich's caress|launch party|costs?\s+\{5|\bcosts?\s+5\b/i;
  const nonlands = args.councilState.selectedCards.filter((c) => c.category !== "land");
  const efficientInteraction = nonlands.filter((c) => efficientInteractionRe.test(c.name)).length;
  const expensiveInteraction = nonlands.filter((c) => expensiveInteractionRe.test(c.name)).length;
  let interactionScore = clampScore(35 + Math.min(efficientInteraction, 8) * 8 + Math.min(interaction, 6) * 3);
  if (interaction >= 4 && efficientInteraction < 2) interactionScore = clampScore(interactionScore - 25);
  if (expensiveInteraction > efficientInteraction) interactionScore = clampScore(interactionScore - 15);
  const resilienceScore = clampScore(40 + protection * 12 + (snapshot?.recoveryCoverage ?? 0) * 8);
  const harmonyScore = isCommanderFocus
    ? clampScore(50 + dep.high * 5 + dep.medium * 2)
    : isIndependentEngine
      ? clampScore(50 + dep.low * 5 + dep.medium * 2 - dep.high * 2)
      : clampScore(50 + dep.low * 4 + dep.medium * 2 - dep.high * 3);
  const harmonyLabel = isCommanderFocus
    ? "Commander Integration"
    : isIndependentEngine
      ? "Commander Independence"
      : "Harmony";
  const harmonyExplanation = isCommanderFocus
    ? "How well the list executes a commander-focused plan (high dependence is expected)."
    : isIndependentEngine
      ? "Backup engines and cards that function without the commander."
      : `${relationship} alignment vs commander dependence distribution.`;
  const engineScore = clampScore(50 + (args.theory?.packages.length ?? 0) * 6 + compression * 2);
  const commanderFitScore = clampScore(args.theory ? 72 : 60);
  let creativityScore = clampScore(55 + (args.councilState.discoveryReports?.length ?? 0) * 5);
  let roleCompressionScore = clampScore(45 + compression * 4);
  let resourceScoreAdj = resourceScore;
  let engineScoreAdj = engineScore;
  let resilienceScoreAdj = resilienceScore;

  const hpMajor = args.headProfessorReview?.requiresMajorRevision ?? false;
  const hpStructural =
    hpMajor ||
    (args.headProfessorReview?.structuralProblems ?? []).some((s) =>
      /disconnected|overstate|low-powered|coherent curve/i.test(s),
    );
  if (hpStructural) {
    engineScoreAdj = clampScore(Math.min(engineScoreAdj, 78));
    roleCompressionScore = clampScore(Math.min(roleCompressionScore, 72));
    resourceScoreAdj = clampScore(Math.min(resourceScoreAdj, 82));
    creativityScore = clampScore(Math.min(creativityScore, 75));
    resilienceScoreAdj = clampScore(Math.min(resilienceScoreAdj, 85));
  }

  const winPathScore = clampScore(
    args.winReadiness && args.requestedBracket && args.requestedBracket >= 4
      ? args.winReadiness.concreteLineReady === false
        ? Math.min(args.winReadiness.score, 65)
        : args.winReadiness.score
      : 50 + (args.charter?.intendedWinPaths.length ?? 1) * 10,
  );

  const categories: ProfessorCategoryGradeV4[] = [
    gradeCategory("commanderFit", commanderFitScore, "How well the final list serves the commander's mechanics.", [args.commanderName]),
    gradeCategory("engineSynergy", engineScoreAdj, "Package and engine coherence in the reviewed list.", snapshot?.weaknesses?.slice(0, 2) ?? []),
    gradeCategory("harmony", harmonyScore, harmonyExplanation, [`${harmonyLabel} · H/M/L: ${dep.high}/${dep.medium}/${dep.low}`]),
    gradeCategory("resilience", resilienceScoreAdj, "Protection and recovery after Head Professor refinement.", [`Protection: ${protection}`]),
    gradeCategory("roleCompression", roleCompressionScore, "Multifunction slots vs narrow single-role cards.", [`High compression cards: ${compression}`]),
    gradeCategory("interaction", interactionScore, "Removal, counters, and disruption density.", [`Interaction pieces: ${interaction}`]),
    gradeCategory("resourceEngine", resourceScoreAdj, "Card advantage and ramp coverage.", [`Card advantage: ${cardAdv}, ramp: ${ramp}`]),
    gradeCategory("winPaths", winPathScore, "Clarity and redundancy of win conditions.", args.charter?.intendedWinPaths.slice(0, 2) ?? []),
    gradeCategory("manaCurve", manaScore, "Land count and mana stability of the final 100.", [`Lands: ${landCount}/99 library`]),
    gradeCategory("creativity", creativityScore, "Novel synergies vs conventional pile.", []),
  ];

  const overallScore = clampScore(categories.reduce((sum, c) => sum + c.score, 0) / categories.length);
  const requestedBracket = args.requestedBracket ?? args.charter?.requestedBracket ?? 3;
  const effectiveBracket =
    args.headProfessorReview?.predictedEffectiveBracket ??
    snapshot?.bracketGapAnalysis?.currentlyEstimatedBracket ??
    requestedBracket;
  const bracketAlignment = computeBracketAlignmentGradeV49({ requestedBracket, effectiveBracket });
  const alignmentStatus =
    args.bracketAlignmentStatus ??
    (args.legality && !args.legality.effectiveBracketEvaluable
      ? "TARGET_MISSED"
      : args.winReadiness && requestedBracket >= 4 && !args.winReadiness.ready
        ? "TARGET_MISSED"
        : effectiveBracket > requestedBracket
          ? "TARGET_EXCEEDED"
          : effectiveBracket === requestedBracket
            ? "TARGET_ACHIEVED"
            : "TARGET_MISSED");
  const sorted = [...categories].sort((a, b) => b.score - a.score);
  const structuralNote =
    landCount < COMMANDER_MIN_LAND_COUNT_V48
      ? `Critical: only ${landCount} lands remain after refinement.`
      : snapshot?.weaknesses?.[0]
        ? `Remaining note: ${snapshot.weaknesses[0]}`
        : "Structure meets Commander baseline at final snapshot.";

  const bracketMessage =
    alignmentStatus === "TARGET_ACHIEVED"
      ? `Target bracket B${requestedBracket} achieved.`
      : alignmentStatus === "TARGET_EXCEEDED"
        ? `Effective B${effectiveBracket} exceeds requested B${requestedBracket}.`
        : `Strong deck, but plays like B${effectiveBracket} — not B${requestedBracket}. Bracket alignment: TARGET MISSED.`;

  return {
    version: PROFESSOR_DECK_GRADE_V4_V1_VERSION,
    overallScore,
    legacyScore: overallScore,
    overallLetter: scoreToLetter(overallScore),
    mechanicalConfidencePercent: clampScore(
      (args.councilState.selectedCards.filter((c) => c.oracleVerified).length / Math.max(1, args.councilState.selectedCards.length)) * 100,
    ),
    verifiedConnections: args.councilState.selectedCards.filter((c) => c.oracleVerified).length,
    totalConnections: args.councilState.selectedCards.length,
    weirdDiscoveries: args.councilState.discoveryReports?.length ?? 0,
    categories,
    bestArea: sorted[0]!,
    weakestArea: sorted[sorted.length - 1]!,
    professorNotes: [
      `Grade reflects how successfully we built the deck you asked for (${args.councilState.selectedCards.length} library cards, ${landCount} lands).`,
      bracketMessage,
      structuralNote,
    ],
    improvementOptions: [],
    improvementProfessorLine:
      alignmentStatus === "TARGET_MISSED"
        ? `This is a strong deck, but I'm not going to pretend it's B${requestedBracket}. It currently plays like B${effectiveBracket}.`
        : "This grade describes the finished reviewed deck against your requested build philosophy.",
    characterSheet: {
      coreEngines: args.theory?.packages.map((p) => p.name) ?? [],
      discoveredSynergies: args.councilState.discoveryReports?.length ?? 0,
      verifiedConnectionsLabel: `${args.councilState.selectedCards.filter((c) => c.oracleVerified).length} oracle-verified cards`,
      weirdDiscoveries: args.councilState.discoveryReports?.length ?? 0,
      independencePercent: isCommanderFocus
        ? Math.round(((dep.high + dep.medium * 0.5) / Math.max(1, dep.high + dep.medium + dep.low)) * 100)
        : dep.low + dep.medium > 0
          ? Math.round((dep.low / (dep.high + dep.medium + dep.low)) * 100)
          : 50,
    },
    deckFingerprint: args.deckFingerprint,
    bracketAlignmentStatus: alignmentStatus,
    bracketAlignment: {
      requestedBracket,
      effectiveBracket,
      alignment: bracketAlignment.alignment,
      explanation: bracketAlignment.explanation,
      score: bracketAlignment.score,
      letter: bracketAlignment.letter,
    },
  };
}
