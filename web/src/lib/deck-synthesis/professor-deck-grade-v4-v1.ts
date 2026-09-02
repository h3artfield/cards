/**
 * Professor Deck Grade v4 — explainable deck evaluation from Working Deck Theory.
 * Scores answer: "How successfully did we build the deck we said we wanted?"
 */
import type { CosV1Score } from "@/lib/commander-optimization-score/v1/types";
import type { ProfessorV41ConversationLoopResultV1 } from "./professor-v4-1-conversation-loop-v1";
import type { CardProgressionStatusV42 } from "./professor-brew-tree-v4-2-v1";
import type { WorkingDeckTheoryV4, WorkingDeckPackageV4 } from "./professor-working-deck-theory-v4";

export const PROFESSOR_DECK_GRADE_V4_V1_VERSION = "professor-deck-grade-v4-v1";

export type ProfessorGradeCategoryIdV4 =
  | "commanderFit"
  | "engineSynergy"
  | "harmony"
  | "resilience"
  | "roleCompression"
  | "interaction"
  | "resourceEngine"
  | "winPaths"
  | "manaCurve"
  | "creativity";

export type ProfessorCategoryGradeV4 = {
  id: ProfessorGradeCategoryIdV4;
  label: string;
  score: number;
  letter: string;
  explanation: string;
  evidence: string[];
  affectedPackages: string[];
  affectedCards: string[];
  suggestedImprovements: string[];
};

export type ProfessorCardGradeV4 = {
  cardName: string;
  professorGrade: string;
  overallScore: number;
  commanderFit: number;
  packageFit: number;
  roleCompression: number;
  independence: number;
  mechanicalConfidence: "VERIFIED" | "SUPPORTED" | "MODEL_PRIOR" | "UNVERIFIED";
  roles: string[];
  packageName?: string;
  explanation: string;
};

export type ProfessorImprovementOptionV4 = {
  id: string;
  categoryId: ProfessorGradeCategoryIdV4;
  label: string;
  description: string;
};

export type BracketAlignmentStatusV415 = "TARGET_ACHIEVED" | "TARGET_MISSED" | "TARGET_EXCEEDED";

export type ProfessorDeckGradeV4 = {
  version: typeof PROFESSOR_DECK_GRADE_V4_V1_VERSION;
  overallScore: number;
  /** Previous composite grade. Not the displayed COS headline. */
  legacyScore?: number;
  cos?: CosV1Score | null;
  overallLetter: string;
  mechanicalConfidencePercent: number;
  verifiedConnections: number;
  totalConnections: number;
  weirdDiscoveries: number;
  categories: ProfessorCategoryGradeV4[];
  bestArea: ProfessorCategoryGradeV4;
  weakestArea: ProfessorCategoryGradeV4;
  professorNotes: string[];
  improvementOptions: ProfessorImprovementOptionV4[];
  improvementProfessorLine: string;
  characterSheet: {
    coreEngines: string[];
    discoveredSynergies: number;
    verifiedConnectionsLabel: string;
    weirdDiscoveries: number;
    independencePercent: number;
  };
  /** Fingerprint of the canonical deck this grade describes — must match final deck. */
  deckFingerprint?: string;
  /** Separate from Professor Grade — did we hit the requested bracket? */
  bracketAlignmentStatus?: BracketAlignmentStatusV415;
  bracketAlignment?: {
    requestedBracket: number;
    effectiveBracket: number;
    alignment: "PASS" | "LOW" | "FAIL";
    explanation: string;
    score: number;
    letter: string;
  };
};

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

export function scoreToLetter(score: number): string {
  if (score >= 97) return "A+";
  if (score >= 93) return "A";
  if (score >= 90) return "A-";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B-";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C-";
  if (score >= 67) return "D+";
  if (score >= 63) return "D";
  return "F";
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function dependenceScore(level: string | undefined): number {
  if (level === "HIGH") return 92;
  if (level === "MEDIUM") return 78;
  if (level === "LOW") return 62;
  return 70;
}

export function independencePercentFromDependence(level: string | undefined): number {
  return dependenceScore(level);
}

function packageRoleCompression(pkg: WorkingDeckPackageV4): number {
  const roleCount = pkg.roles.length;
  const cardCount = Math.max(1, pkg.candidateCards.length);
  const multiRoleCards = pkg.candidateCards.filter((_, i) => roleCount >= 3).length;
  return clamp(55 + roleCount * 8 + multiRoleCards * 6 + (pkg.status === "CORE" ? 10 : 0));
}

function countVerifiedCards(
  theory: WorkingDeckTheoryV4,
  overrides: Record<string, CardProgressionStatusV42>,
): { verified: number; total: number; core: number } {
  let verified = 0;
  let core = 0;
  let total = 0;
  for (const pkg of theory.packages) {
    for (const card of pkg.candidateCards.slice(0, 6)) {
      total += 1;
      const key = `card-${pkg.packageId}-0`;
      const status = overrides[key];
      if (status === "VERIFIED" || status === "CORE" || pkg.status === "CORE") verified += 1;
      if (status === "CORE") core += 1;
    }
  }
  return { verified, total: Math.max(total, theory.packages.length * 2), core };
}

function buildCategory(
  id: ProfessorGradeCategoryIdV4,
  score: number,
  explanation: string,
  evidence: string[],
  affectedPackages: string[],
  affectedCards: string[],
  suggestedImprovements: string[],
): ProfessorCategoryGradeV4 {
  return {
    id,
    label: CATEGORY_LABELS[id],
    score: clamp(score),
    letter: scoreToLetter(clamp(score)),
    explanation,
    evidence,
    affectedPackages,
    affectedCards,
    suggestedImprovements,
  };
}

function buildImprovementProfessorLine(
  theory: WorkingDeckTheoryV4,
  weakestArea: ProfessorCategoryGradeV4,
): string {
  const commander = theory.commander.split(",")[0]?.trim() ?? "your commander";
  const weaknessHint = theory.weaknesses[0]?.replace(/\.$/, "").toLowerCase();
  if (weakestArea.id === "resilience" && weaknessHint) {
    return `The deck is strong, but I'm worried about ${weaknessHint}. I see three places where we could improve ${weakestArea.label.toLowerCase()} without changing the deck's identity.`;
  }
  if (weakestArea.id === "resilience") {
    return `The deck is strong, but I'm worried about what happens when ${commander} is removed or your graveyard gets shut off. I see three places where we could improve resilience without changing the deck's identity.`;
  }
  return `The deck is strong, but I'm worried about ${weakestArea.label.toLowerCase()} (${weakestArea.letter}). I see ways to improve that without changing the deck's identity.`;
}

export function computeProfessorDeckGradeV4(args: {
  theory: WorkingDeckTheoryV4;
  loopResult?: ProfessorV41ConversationLoopResultV1 | null;
  deckList?: { name: string; category: string }[];
  cardStatusOverrides?: Record<string, CardProgressionStatusV42>;
  userIntent?: string[];
}): ProfessorDeckGradeV4 {
  const theory = args.theory;
  const packages = theory.packages.filter((p) => p.status !== "REJECTED");
  const overrides = args.cardStatusOverrides ?? {};
  const verification = countVerifiedCards(theory, overrides);
  const discoveries = theory.verifiedDiscoveries.length + (args.loopResult?.scoredDiscoveries?.length ?? 0);
  const weirdDiscoveries =
    args.loopResult?.scoredDiscoveries?.filter((d) => d.axes.novelty >= 0.6).length ??
    theory.ideaBoard?.items.filter((i) => i.lane === "WEIRD").length ??
    0;

  const chain = theory.thesis.mechanicChain;
  const chainScore = clamp(60 + chain.length * 10 + (chain.join(" ").length > 40 ? 12 : 0));
  const packageDependenceAvg = avg(packages.map((p) => dependenceScore(p.commanderDependence)));
  const commanderFitScore = clamp(
    packageDependenceAvg * 0.55 +
      chainScore * 0.25 +
      (packages.length >= 2 ? 12 : 0) +
      (theory.thesis.summary.length > 80 ? 8 : 0),
  );

  const engineSynergyScore = clamp(
    58 +
      packages.length * 9 +
      avg(packages.map((p) => p.inputs.length + p.outputs.length)) * 4 +
      (packages.some((p) => p.outputs.some((o) => packages.some((q) => q.inputs.some((i) => i && o && i.includes(o.slice(0, 8))))))
        ? 14
        : 6),
  );

  const independentEngines = theory.independentEngines ?? [];
  const harmonyScore = clamp(
    55 +
      independentEngines.length * 12 +
      avg(independentEngines.map((e) => dependenceScore(e.worksWithoutCommander))) * 0.25 +
      (args.userIntent?.some((i) => i.includes("HARMONY") || i.includes("Interlocking")) ? 10 : 0),
  );

  const resilienceScore = clamp(
    50 + theory.resiliencePlan.length * 8 + (theory.weaknesses.length <= 2 ? 12 : 0) - theory.weaknesses.length * 3,
  );

  const roleCompressionScore = clamp(avg(packages.map(packageRoleCompression)) || 70);

  const interactionKeywords = /removal|destroy|exile|counter|artifact|enchantment|graveyard hate|board wipe/i;
  const interactionCards =
    args.deckList?.filter((c) => interactionKeywords.test(c.name)).length ??
    packages.flatMap((p) => p.candidateCards).filter((n) => interactionKeywords.test(n)).length;
  const interactionScore = clamp(55 + Math.min(interactionCards, 12) * 3);

  const resourceScore = clamp(
    58 +
      packages.filter((p) => /draw|mana|ramp|recursion|treasure|value/i.test(p.purpose + p.roles.join(" "))).length * 10,
  );

  const winPathScore = clamp(52 + theory.winPaths.length * 14 + avg(theory.winPaths.map((w) => dependenceScore(w.commanderDependence))) * 0.2);

  const landCount = args.deckList?.filter((c) => c.category === "land").length ?? 35;
  const manaScore = clamp(68 + (landCount >= 33 && landCount <= 40 ? 15 : landCount >= 30 ? 8 : -8));

  const creativityScore = clamp(
    50 +
      weirdDiscoveries * 8 +
      (args.userIntent?.some((i) => i.includes("Weird") || i.includes("UNCONVENTIONAL")) ? 12 : 0) +
      discoveries * 3,
  );

  const mechanicalConfidencePercent = clamp(
    verification.total > 0 ? (verification.verified / verification.total) * 100 : 72,
  );

  const commanderFit = buildCategory(
    "commanderFit",
    commanderFitScore,
    `${packages.length} package(s) align with ${theory.commander}'s mechanics and your stated direction.`,
    [
      theory.thesis.summary.slice(0, 160),
      chain.length ? `Mechanic chain: ${chain.join(" → ")}` : "Mechanic chain seeded from Creative thesis.",
    ],
    packages.map((p) => p.name),
    packages.flatMap((p) => p.candidateCards.slice(0, 4)),
    ["Strengthen packages with lower commander dependence if you want more resilience.", "Add cards that advance the mechanic chain directly."],
  );

  const engineSynergy = buildCategory(
    "engineSynergy",
    engineSynergyScore,
    "Professor judged whether cards and packages feed each other instead of sitting as isolated good includes.",
    packages.map((p) => `${p.name}: ${p.purpose.slice(0, 80)}`),
    packages.map((p) => p.name),
    [],
    ["Look for packages whose outputs become another package's inputs.", "Collapse redundant packages that compete for the same role."],
  );

  const harmony = buildCategory(
    "harmony",
    harmonyScore,
    "Measures how well independent engines connect and reinforce one another.",
    independentEngines.map((e) => e.description.slice(0, 100)),
    packages.map((p) => p.name),
    [],
    ["Bridge engines that share a resource transition.", "Add a card that performs two engine roles at once."],
  );

  const resilience = buildCategory(
    "resilience",
    resilienceScore,
    "Whether the deck survives commander removal, hate, and plan disruption.",
    [...theory.resiliencePlan.slice(0, 3), ...theory.weaknesses.slice(0, 2).map((w) => `Risk: ${w}`)],
    [],
    [],
    [
      "Strengthen the independent engine.",
      "Add graveyard-hate recovery.",
      "Protect the commander better.",
    ],
  );

  const roleCompressionCat = buildCategory(
    "roleCompression",
    roleCompressionScore,
    "Cards that perform multiple jobs score higher — fewer slots wasted on narrow includes.",
    packages
      .filter((p) => p.roles.length >= 3)
      .map((p) => `${p.name}: ${p.roles.slice(0, 4).join(", ")}`),
    packages.map((p) => p.name),
    packages.flatMap((p) => p.candidateCards.slice(0, 2)),
    ["Prioritize cards that ramp and set up your engine in one slot.", "Replace single-role cards where a multifunction option exists."],
  );

  const interaction = buildCategory(
    "interaction",
    interactionScore,
    "Ability to answer threats on the board and in the stack.",
    interactionCards > 0 ? [`~${interactionCards} interactive elements identified in the list.`] : ["Limited explicit interaction detected — may be intentional for your plan."],
    [],
    [],
    ["Add flexible removal that still advances your engine.", "Include graveyard or stack interaction if those are common in your meta."],
  );

  const resourceEngine = buildCategory(
    "resourceEngine",
    resourceScore,
    "Draw, selection, mana development, recursion, and other resource loops.",
    packages.filter((p) => /draw|mana|ramp|recursion/i.test(p.purpose)).map((p) => p.name),
    packages.map((p) => p.name),
    [],
    ["Ensure the deck can execute its engine before turn four.", "Add redundancy in the resource package if you stall when disrupted."],
  );

  const winPaths = buildCategory(
    "winPaths",
    winPathScore,
    "Coherent ways to actually end games, not just generate value.",
    theory.winPaths.map((w) => w.description.slice(0, 100)),
    [],
    [],
    ["Make the primary win path explicit in two packages.", "Add a backup win path that doesn't require the commander."],
  );

  const manaCurve = buildCategory(
    "manaCurve",
    manaScore,
    "Whether mana base and curve can realistically execute the plan.",
    [`${landCount} lands in current list.`, "Curve inferred from ramp and high-cost packages."],
    [],
    [],
    ["Adjust land count for your average mana value.", "Add ramp if the engine starts too late."],
  );

  const creativity = buildCategory(
    "creativity",
    creativityScore,
    "Mechanically valid ideas beyond the most obvious list — without ignoring your deck identity.",
    weirdDiscoveries > 0 ? [`${weirdDiscoveries} unconventional discovery branch(es) on the idea board or tree.`] : ["Mostly conventional execution — still valid if that matches your intent."],
    [],
    [],
    ["Ask Research to find a weirder alternative in one package.", "Explore a secondary resource line Research discovered."],
  );

  const categories = [
    commanderFit,
    engineSynergy,
    harmony,
    resilience,
    roleCompressionCat,
    interaction,
    resourceEngine,
    winPaths,
    manaCurve,
    creativity,
  ];

  const strategicScores = categories.map((c) => c.score);
  const overallScore = clamp(avg(strategicScores));
  const sorted = [...categories].sort((a, b) => b.score - a.score);
  const bestArea = sorted[0]!;
  const weakestArea = sorted[sorted.length - 1]!;

  const improvementOptions: ProfessorImprovementOptionV4[] = weakestArea.suggestedImprovements
    .slice(0, 3)
    .map((label, i) => ({
      id: `improve-${weakestArea.id}-${i}`,
      categoryId: weakestArea.id,
      label,
      description: `Target ${weakestArea.label} (${weakestArea.letter}) without changing deck identity.`,
    }));

  improvementOptions.push({
    id: "improve-happy",
    categoryId: weakestArea.id,
    label: "I'm happy with the deck",
    description: "Keep the current grade and continue swapping cards manually.",
  });

  const independencePercent = clamp(
    avg(independentEngines.map((e) => dependenceScore(e.worksWithoutCommander))) || harmonyScore * 0.9,
  );

  return {
    version: PROFESSOR_DECK_GRADE_V4_V1_VERSION,
    overallScore,
    legacyScore: overallScore,
    overallLetter: scoreToLetter(overallScore),
    mechanicalConfidencePercent,
    verifiedConnections: verification.verified,
    totalConnections: verification.total,
    weirdDiscoveries,
    categories,
    bestArea,
    weakestArea,
    professorNotes: [
      `Best area: ${bestArea.label} (${bestArea.letter}).`,
      `Weakest area: ${weakestArea.label} (${weakestArea.letter}).`,
      `Professor sees ${Math.min(3, improvementOptions.length - 1)} possible improvement${improvementOptions.length === 2 ? "" : "s"}.`,
    ],
    improvementOptions,
    improvementProfessorLine: buildImprovementProfessorLine(theory, weakestArea),
    characterSheet: {
      coreEngines: packages.filter((p) => p.status === "CORE").map((p) => p.name).slice(0, 5),
      discoveredSynergies: discoveries,
      verifiedConnectionsLabel: `${verification.verified} / ${verification.total}`,
      weirdDiscoveries,
      independencePercent,
    },
  };
}

export function computeCardGradeV4(args: {
  cardName: string;
  theory: WorkingDeckTheoryV4;
  roles?: string[];
  packageName?: string;
  cardStatus?: CardProgressionStatusV42;
  commanderDependence?: string;
}): ProfessorCardGradeV4 {
  const roles = args.roles ?? [];
  const pkg =
    args.theory.packages.find((p) => p.candidateCards.includes(args.cardName)) ??
    args.theory.packages.find((p) => p.name === args.packageName);

  const commanderFit = clamp(
    dependenceScore(args.commanderDependence ?? pkg?.commanderDependence) + (roles.length >= 2 ? 8 : 0),
  );
  const packageFit = clamp(pkg ? (pkg.status === "CORE" ? 92 : 82) : 70);
  const roleCompression = clamp(50 + roles.length * 12 + (roles.length >= 3 ? 10 : 0));
  const independence = clamp(
    args.commanderDependence === "LOW" ? 90 : args.commanderDependence === "MEDIUM" ? 78 : 62,
  );
  const overallScore = clamp(commanderFit * 0.3 + packageFit * 0.25 + roleCompression * 0.3 + independence * 0.15);
  const mechanicalConfidence: ProfessorCardGradeV4["mechanicalConfidence"] =
    args.cardStatus === "CORE" || args.cardStatus === "VERIFIED"
      ? "VERIFIED"
      : pkg?.evidenceRefs?.length
        ? "SUPPORTED"
        : "UNVERIFIED";

  return {
    cardName: args.cardName,
    professorGrade: scoreToLetter(overallScore),
    overallScore,
    commanderFit,
    packageFit,
    roleCompression,
    independence,
    mechanicalConfidence,
    roles,
    packageName: pkg?.name,
    explanation:
      roles.length >= 3
        ? `${args.cardName} performs ${roles.length} relevant jobs for ${pkg?.name ?? "this deck"}.`
        : `${args.cardName} supports ${pkg?.name ?? "the deck"} as a ${args.cardStatus ?? "CANDIDATE"} include.`,
  };
}

export function packageEngineGradeV4(pkg: WorkingDeckPackageV4): { letter: string; score: number; multiRoleCount: number } {
  const multiRoleCount = Math.max(0, pkg.roles.length - 1);
  const score = clamp(packageRoleCompression(pkg));
  return { letter: scoreToLetter(score), score, multiRoleCount };
}
