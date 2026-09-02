/**
 * Bracket deficit portfolio v4.13 — drives iteration 2+ from remaining gaps, not filler list.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketAdjudicationV411 } from "./professor-bracket-adjudication-v4-11-v1";
import type { FinalDeckFingerprintV411 } from "./professor-deck-fingerprint-v4-11-v1";

export const PROFESSOR_BRACKET_DEFICIT_PORTFOLIO_V4_13_V1_VERSION = "professor-bracket-deficit-portfolio-v4-13-v1";

export type BracketDeficitCategoryV413 =
  | "ACCELERATION"
  | "FAST_MANA"
  | "ACCESS_TUTORS"
  | "CARD_VELOCITY"
  | "INTERACTION"
  | "PROTECTION"
  | "RESILIENCE"
  | "ENGINE_DENSITY"
  | "SACRIFICE_FUEL"
  | "WIN_COMPACTNESS"
  | "FINISHER_QUALITY"
  | "MANA_EFFICIENCY"
  | "REDUNDANCY"
  | "DEAD_CARD_RATE";

export type BracketDeficitSeverityV413 = "HIGH" | "MEDIUM" | "LOW" | "SATISFIED";

export type BracketDeficitEntryV413 = {
  category: BracketDeficitCategoryV413;
  severity: BracketDeficitSeverityV413;
  evidence: string;
  desiredState: string;
  estimatedSlotsNeeded: number;
};

export type BracketDeficitPortfolioV413 = {
  version: typeof PROFESSOR_BRACKET_DEFICIT_PORTFOLIO_V4_13_V1_VERSION;
  currentBracket: CommanderBracket;
  targetBracket: CommanderBracket;
  deficits: BracketDeficitEntryV413[];
  satisfiedCategories: BracketDeficitCategoryV413[];
  activeCategories: BracketDeficitCategoryV413[];
};

export type RemainingBracketDeficitV413 = {
  category: BracketDeficitCategoryV413;
  severity: "HIGH" | "MEDIUM" | "LOW";
  explanation: string;
  currentDeckEvidence: string[];
  desiredImprovement: string;
  suggestedSlotsToReconsider: Array<{ oracleId?: string | null; cardName: string; reason?: string }>;
};

const CATEGORY_PATTERNS: { category: BracketDeficitCategoryV413; re: RegExp }[] = [
  { category: "ACCESS_TUTORS", re: /tutor|search|access|consistency|find/i },
  { category: "ACCELERATION", re: /acceler|ramp|mana development|speed up/i },
  { category: "FAST_MANA", re: /fast mana|sol ring|mana crypt|mox|ritual/i },
  { category: "INTERACTION", re: /interaction|removal|counter|answer|disrupt/i },
  { category: "PROTECTION", re: /protection|resilien|hexproof|indestruct|ward/i },
  { category: "CARD_VELOCITY", re: /draw|card advantage|velocity|cantrip/i },
  { category: "WIN_COMPACTNESS", re: /win|finisher|combo|kill|close|compact|threat window/i },
  { category: "FINISHER_QUALITY", re: /finisher|payoff|closing|lethal/i },
  { category: "ENGINE_DENSITY", re: /engine|synergy|density|core piece/i },
  { category: "SACRIFICE_FUEL", re: /sacrifice fuel|token|food|fodder/i },
  { category: "MANA_EFFICIENCY", re: /mana efficiency|expensive|curve|mv|cost/i },
  { category: "RESILIENCE", re: /recover|recur|graveyard|resilien/i },
  { category: "REDUNDANCY", re: /redundan|overlap|duplicate role/i },
  { category: "DEAD_CARD_RATE", re: /dead|filler|low impact|weak card/i },
];

function categoryFromText(text: string): BracketDeficitCategoryV413 | null {
  for (const { category, re } of CATEGORY_PATTERNS) {
    if (re.test(text)) return category;
  }
  return null;
}

function defaultDesiredState(category: BracketDeficitCategoryV413, target: CommanderBracket): string {
  const map: Record<BracketDeficitCategoryV413, string> = {
    ACCELERATION: `B${target}-grade mana development for 5-drop commander`,
    FAST_MANA: `Premium fast mana for B${target} tempo`,
    ACCESS_TUTORS: `Efficient tutors to find engine/finisher consistently`,
    CARD_VELOCITY: `Repeatable draw/impulse for B${target} consistency`,
    INTERACTION: `Cheap broad interaction at B${target} efficiency`,
    PROTECTION: `Compact protection for key engine pieces`,
    RESILIENCE: `Recovery/recursion when engine disrupted`,
    ENGINE_DENSITY: `Higher density of sacrifice-engine enablers`,
    SACRIFICE_FUEL: `Efficient token/fuel generation`,
    WIN_COMPACTNESS: `Compact 2-4 card win lines accessible by tutors`,
    FINISHER_QUALITY: `Premium sacrifice-aligned finishers`,
    MANA_EFFICIENCY: `Lower average MV on nonlands`,
    REDUNDANCY: `Reduce overlapping low-impact roles`,
    DEAD_CARD_RATE: `Replace slow/narrow slots with B${target} power`,
  };
  return map[category];
}

function snapshotEvidence(args: {
  category: BracketDeficitCategoryV413;
  fingerprint: FinalDeckFingerprintV411;
  adjudication: BracketAdjudicationV411;
}): string {
  const m = args.adjudication.structuralMetrics;
  switch (args.category) {
    case "ACCESS_TUTORS":
      return `tutors=${args.fingerprint.tutorCount}`;
    case "ACCELERATION":
      return `ramp=${args.fingerprint.rampNonLandCount} lands=${args.fingerprint.landCount}`;
    case "INTERACTION":
      return `interaction=${m.interactionCount}`;
    case "PROTECTION":
      return `protection=${m.protectionCount}`;
    case "CARD_VELOCITY":
      return `draw=${m.cardAdvantageCount}`;
    case "MANA_EFFICIENCY":
      return `avgMV=${args.fingerprint.avgManaValue}`;
    default:
      return `bracket gap B${args.adjudication.predictedEffectiveBracket}→B${args.adjudication.requestedBracket}`;
  }
}

function isCategorySatisfied(args: {
  category: BracketDeficitCategoryV413;
  fingerprint: FinalDeckFingerprintV411;
  adjudication: BracketAdjudicationV411;
}): boolean {
  const m = args.adjudication.structuralMetrics;
  switch (args.category) {
    case "ACCESS_TUTORS":
      return args.fingerprint.tutorCount >= 3;
    case "ACCELERATION":
      return args.fingerprint.rampNonLandCount >= 10;
    case "FAST_MANA":
      return args.fingerprint.rampNonLandCount >= 12;
    case "INTERACTION":
      return m.interactionCount >= 8;
    case "PROTECTION":
      return m.protectionCount >= 4;
    case "CARD_VELOCITY":
      return m.cardAdvantageCount >= 6;
    default:
      return false;
  }
}

function estimateSlots(severity: BracketDeficitSeverityV413): number {
  if (severity === "SATISFIED") return 0;
  if (severity === "HIGH") return 2;
  if (severity === "MEDIUM") return 1;
  return 1;
}

export function deriveDeficitPortfolioV413(args: {
  currentBracket: CommanderBracket;
  targetBracket: CommanderBracket;
  adjudication: BracketAdjudicationV411;
  fingerprint: FinalDeckFingerprintV411;
  solRemainingDeficits?: RemainingBracketDeficitV413[];
}): BracketDeficitPortfolioV413 {
  const byCategory = new Map<BracketDeficitCategoryV413, BracketDeficitEntryV413>();

  for (const text of args.adjudication.powerDeficits) {
    const cat = categoryFromText(text);
    if (!cat) continue;
    const existing = byCategory.get(cat);
    const severity: BracketDeficitSeverityV413 = /critical|zero|no |absent|severely|emergency/i.test(text)
      ? "HIGH"
      : /thin|low|under|limited|weak/i.test(text)
        ? "MEDIUM"
        : "LOW";
    if (!existing || severity === "HIGH") {
      byCategory.set(cat, {
        category: cat,
        severity,
        evidence: text,
        desiredState: defaultDesiredState(cat, args.targetBracket),
        estimatedSlotsNeeded: estimateSlots(severity),
      });
    }
  }

  for (const sol of args.solRemainingDeficits ?? []) {
    const satisfied = isCategorySatisfied({
      category: sol.category,
      fingerprint: args.fingerprint,
      adjudication: args.adjudication,
    });
    byCategory.set(sol.category, {
      category: sol.category,
      severity: satisfied ? "SATISFIED" : sol.severity,
      evidence: sol.explanation,
      desiredState: sol.desiredImprovement,
      estimatedSlotsNeeded: satisfied ? 0 : estimateSlots(sol.severity),
    });
  }

  const gap = args.targetBracket - args.currentBracket;
  if (gap > 0 && byCategory.size === 0) {
    const defaults: BracketDeficitCategoryV413[] = [
      "WIN_COMPACTNESS",
      "INTERACTION",
      "PROTECTION",
      "ACCELERATION",
    ];
    for (const cat of defaults) {
      if (!byCategory.has(cat)) {
        const satisfied = isCategorySatisfied({ category: cat, fingerprint: args.fingerprint, adjudication: args.adjudication });
        byCategory.set(cat, {
          category: cat,
          severity: satisfied ? "SATISFIED" : gap >= 2 ? "HIGH" : "MEDIUM",
          evidence: snapshotEvidence({ category: cat, fingerprint: args.fingerprint, adjudication: args.adjudication }),
          desiredState: defaultDesiredState(cat, args.targetBracket),
          estimatedSlotsNeeded: satisfied ? 0 : gap >= 2 ? 2 : 1,
        });
      }
    }
  }

  for (const [cat, entry] of byCategory.entries()) {
    if (isCategorySatisfied({ category: cat, fingerprint: args.fingerprint, adjudication: args.adjudication })) {
      byCategory.set(cat, { ...entry, severity: "SATISFIED", estimatedSlotsNeeded: 0 });
    }
  }

  const deficits = [...byCategory.values()].sort((a, b) => {
    const sev = { SATISFIED: 3, LOW: 2, MEDIUM: 1, HIGH: 0 };
    return sev[a.severity] - sev[b.severity] || b.estimatedSlotsNeeded - a.estimatedSlotsNeeded;
  });

  const satisfiedCategories = deficits.filter((d) => d.severity === "SATISFIED").map((d) => d.category);
  const activeCategories = deficits.filter((d) => d.severity !== "SATISFIED").map((d) => d.category);

  return {
    version: PROFESSOR_BRACKET_DEFICIT_PORTFOLIO_V4_13_V1_VERSION,
    currentBracket: args.currentBracket,
    targetBracket: args.targetBracket,
    deficits,
    satisfiedCategories,
    activeCategories,
  };
}

export function deficitToReplacementRole(category: BracketDeficitCategoryV413): string[] {
  const map: Record<BracketDeficitCategoryV413, string[]> = {
    ACCELERATION: ["premium acceleration", "efficient ramp"],
    FAST_MANA: ["fast mana", "premium acceleration"],
    ACCESS_TUTORS: ["efficient tutor/access"],
    CARD_VELOCITY: ["repeatable draw", "card advantage"],
    INTERACTION: ["efficient interaction", "cheap removal"],
    PROTECTION: ["protection", "resilience"],
    RESILIENCE: ["recursion", "protection"],
    ENGINE_DENSITY: ["compact engine piece", "sacrifice outlet"],
    SACRIFICE_FUEL: ["token generation", "sacrifice fuel"],
    WIN_COMPACTNESS: ["compact win engine", "finisher"],
    FINISHER_QUALITY: ["premium finisher", "compact win engine"],
    MANA_EFFICIENCY: ["mana-efficient engine piece"],
    REDUNDANCY: ["role compression upgrade"],
    DEAD_CARD_RATE: ["compact engine piece"],
  };
  return map[category];
}

export function categoryPriorityScore(category: BracketDeficitCategoryV413, severity: BracketDeficitSeverityV413): number {
  if (severity === "SATISFIED") return -1000;
  const base = { HIGH: 300, MEDIUM: 200, LOW: 100 }[severity];
  const catBoost: Partial<Record<BracketDeficitCategoryV413, number>> = {
    WIN_COMPACTNESS: 50,
    INTERACTION: 40,
    PROTECTION: 35,
    ACCELERATION: 30,
    ACCESS_TUTORS: -200,
  };
  return base + (catBoost[category] ?? 0);
}
