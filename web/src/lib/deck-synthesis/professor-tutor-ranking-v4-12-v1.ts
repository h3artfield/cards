/**
 * Premium tutor ranking v4.12 — deck-specific tutor scoring for bracket upgrade.
 */
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import { classifyTutorCardV411, type TutorClassificationV411 } from "./professor-tutor-discovery-v4-11-v1";

export const PROFESSOR_TUTOR_RANKING_V4_12_V1_VERSION = "professor-tutor-ranking-v4-12-v1";

export type RankedTutorCandidateV412 = {
  name: string;
  oracleId: string;
  classification: TutorClassificationV411;
  manaValue: number;
  deckScore: number;
  scoreBreakdown: {
    manaEfficiency: number;
    immediacy: number;
    targetBreadth: number;
    engineFit: number;
    finisherAccess: number;
    setupCost: number;
    bracketContribution: number;
    cardDisadvantage: number;
    speed: number;
  };
  reason: string;
};

const PREMIUM_TUTOR_NAMES = new Set([
  "demonic tutor",
  "vampiric tutor",
  "imperial seal",
  "gamble",
  "diabolic intent",
  "grim tutor",
  "scheming symmetry",
  "profane tutor",
  "wishclaw talisman",
  "mystical tutor",
  "worldly tutor",
  "enlightened tutor",
  "idyllic tutor",
  "survival of the fittest",
  "recruiter of the guard",
  "imperial recruiter",
  "finale of devastation",
  "entomb",
  "buried alive",
]);

export function scorePremiumTutorV412(args: {
  card: GoldenCatalogOracleCard;
  classification: TutorClassificationV411;
  charterKeywords: string[];
  bracket: number;
}): RankedTutorCandidateV412 {
  const text = combinedGoldenOracleText(args.card).toLowerCase();
  const name = args.card.canonicalName.toLowerCase();
  const mv = args.card.manaValue ?? 3;

  let manaEfficiency = mv <= 2 ? 8 : mv <= 3 ? 5 : mv <= 4 ? 2 : 0;
  let immediacy = /instant|flash/i.test(args.card.typeLine ?? "") ? 6 : 2;
  let targetBreadth = args.classification === "UNRESTRICTED" ? 10 : args.classification === "CREATURE" ? 6 : 4;
  let engineFit = 0;
  let finisherAccess = 0;
  let setupCost = mv >= 4 ? -3 : 0;
  let bracketContribution = args.bracket >= 4 ? 6 : 3;
  let cardDisadvantage = /discover the top|reveal|exile.*until/i.test(text) ? -2 : 0;
  let speed = PREMIUM_TUTOR_NAMES.has(name) ? 8 : 3;

  if (PREMIUM_TUTOR_NAMES.has(name)) {
    manaEfficiency += 4;
    targetBreadth += 4;
    speed += 4;
  }
  if (/sacrifice|token|treasure|artifact|creature|permanent/i.test(text)) engineFit += 4;
  if (args.charterKeywords.some((k) => /sacrifice|token|engine/i.test(k))) engineFit += 3;
  if (/any card|card type|permanent card/i.test(text)) finisherAccess += 5;
  if (/creature/i.test(text) && args.classification === "CREATURE") engineFit += 5;
  if (name === "gamble") speed += 3;
  if (name === "worldly tutor" || name === "finale of devastation") engineFit += 6;

  const deckScore =
    manaEfficiency +
    immediacy +
    targetBreadth +
    engineFit +
    finisherAccess +
    setupCost +
    bracketContribution +
    cardDisadvantage +
    speed;

  return {
    name: args.card.canonicalName,
    oracleId: args.card.oracleId,
    classification: args.classification,
    manaValue: mv,
    deckScore,
    scoreBreakdown: {
      manaEfficiency,
      immediacy,
      targetBreadth,
      engineFit,
      finisherAccess,
      setupCost,
      bracketContribution,
      cardDisadvantage,
      speed,
    },
    reason: `deckScore=${deckScore} · ${args.classification} · MV${mv}`,
  };
}

export function rankTutorsForDeckV412(
  cards: GoldenCatalogOracleCard[],
  args: { charterKeywords: string[]; bracket: number },
): RankedTutorCandidateV412[] {
  const ranked: RankedTutorCandidateV412[] = [];
  for (const card of cards) {
    const classification = classifyTutorCardV411(card);
    if (!classification) continue;
    ranked.push(scorePremiumTutorV412({ card, classification, ...args }));
  }
  ranked.sort((a, b) => b.deckScore - a.deckScore || a.manaValue - b.manaValue);
  return ranked;
}
