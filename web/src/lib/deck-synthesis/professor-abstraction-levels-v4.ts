/**
 * Three abstraction levels v4 — CARD → FUNCTION → MECHANIC and reverse search.
 */
import type { EvidenceRef } from "./professor-planning-evidence-v3";

export const PROFESSOR_ABSTRACTION_LEVELS_V4_VERSION = "professor-abstraction-levels-v4";

export type AbstractionLevelV4 = "CARD" | "FUNCTION" | "MECHANIC";

export type CardAbstractionV4 = {
  level: "CARD";
  cardName: string;
};

export type FunctionAbstractionV4 = {
  level: "FUNCTION";
  functionLabel: string;
  derivedFrom?: string;
};

export type MechanicAbstractionV4 = {
  level: "MECHANIC";
  steps: string[];
  derivedFrom?: string;
};

export type AbstractionChainV4 = {
  card: CardAbstractionV4;
  function: FunctionAbstractionV4;
  mechanic: MechanicAbstractionV4;
  evidenceRefs?: EvidenceRef[];
};

/** Example fixture chain — Spore Frog combat protection via self-sacrifice loop. */
export const SPORE_FROG_ABSTRACTION_EXAMPLE_V4: AbstractionChainV4 = {
  card: { level: "CARD", cardName: "Spore Frog" },
  function: {
    level: "FUNCTION",
    functionLabel: "repeatable combat protection",
    derivedFrom: "Spore Frog",
  },
  mechanic: {
    level: "MECHANIC",
    steps: [
      "creature",
      "sacrifice self",
      "prevent combat damage",
      "enters graveyard",
      "Meren can return it",
    ],
    derivedFrom: "repeatable combat protection",
  },
};

export type MechanicReverseSearchQueryV4 = {
  mechanicSteps: string[];
  excludeCardNames?: string[];
};

export type MechanicReverseSearchResultV4 = {
  query: MechanicReverseSearchQueryV4;
  candidateCards: string[];
  mechanicalBasis: string;
  evidenceRefs: EvidenceRef[];
};

/** Generic function→candidate map for reverse search demo (not commander-specific). */
const MECHANIC_FUNCTION_CATALOG_V4: Record<string, string[]> = {
  sacrifice: ["Shambling Ghast", "Plaguecrafter", "Caustic Caterpillar", "Viscera Seer"],
  ramp: ["Sakura-Tribe Elder", "Burnished Hart", "Sakura-Tribe Scout"],
  recur: ["Reassembling Skeleton", "Spore Frog", "Eternal Witness"],
  protection: ["Spore Frog", "Selfless Spirit"],
  value: ["Solemn Simulacrum", "Shambling Ghast"],
};

/** Generic reverse search — matches mechanic steps to function catalog + pool (no commander branches). */
export function reverseSearchFromMechanicV4(args: {
  query: MechanicReverseSearchQueryV4;
  candidatePool: string[];
}): MechanicReverseSearchResultV4 {
  const keywords = args.query.mechanicSteps
    .flatMap((step) => step.toLowerCase().split(/\W+/))
    .filter((w) => w.length > 3);
  const exclude = new Set((args.query.excludeCardNames ?? []).map((n) => n.toLowerCase()));
  const pool = new Set(args.candidatePool);
  for (const [fn, cards] of Object.entries(MECHANIC_FUNCTION_CATALOG_V4)) {
    if (keywords.some((kw) => kw.includes(fn) || fn.includes(kw))) {
      for (const c of cards) pool.add(c);
    }
  }
  const candidateCards = [...pool].filter((name) => {
    if (exclude.has(name.toLowerCase())) return false;
    const lower = name.toLowerCase();
    return keywords.some((kw) => lower.includes(kw)) ||
      Object.entries(MECHANIC_FUNCTION_CATALOG_V4).some(
        ([fn, cards]) => cards.includes(name) && keywords.some((kw) => kw.includes(fn) || fn.includes(kw)),
      );
  });
  return {
    query: args.query,
    candidateCards,
    mechanicalBasis: `Reverse search from mechanic steps: ${args.query.mechanicSteps.join(" → ")}`,
    evidenceRefs: [],
  };
}

export function cardToMechanicChainV4(args: {
  cardName: string;
  functionLabel: string;
  mechanicSteps: string[];
  evidenceRefs?: EvidenceRef[];
}): AbstractionChainV4 {
  return {
    card: { level: "CARD", cardName: args.cardName },
    function: { level: "FUNCTION", functionLabel: args.functionLabel, derivedFrom: args.cardName },
    mechanic: { level: "MECHANIC", steps: args.mechanicSteps, derivedFrom: args.functionLabel },
    evidenceRefs: args.evidenceRefs,
  };
}
