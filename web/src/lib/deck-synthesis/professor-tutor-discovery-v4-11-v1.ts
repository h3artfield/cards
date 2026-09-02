/**
 * Tutor-capable discovery v4.11 — functional tutor search, not RAG keyword matching.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  isCurrentlyCommanderLegal,
  type DeckResolutionCatalog,
} from "../../../scripts/lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { buildFunctionalCardProfileV47, type FunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import { scoreCandidateForBracketV410 } from "./professor-bracket-candidate-scoring-v4-10-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";

export const PROFESSOR_TUTOR_DISCOVERY_V4_11_V1_VERSION = "professor-tutor-discovery-v4-11-v1";

export type TutorClassificationV411 =
  | "UNRESTRICTED"
  | "CREATURE"
  | "ARTIFACT"
  | "ENCHANTMENT"
  | "LAND"
  | "SACRIFICE_LINKED"
  | "TOP_DECK"
  | "TRANSMUTE"
  | "FUNCTIONAL";

export type TutorCandidateV411 = {
  name: string;
  oracleId: string;
  classification: TutorClassificationV411;
  manaValue: number;
  bracketScore: number;
  reason: string;
};

const TUTOR_ORACLE_PATTERNS: { re: RegExp; classification: TutorClassificationV411 }[] = [
  { re: /search your library for (?:a|an|any) card/i, classification: "UNRESTRICTED" },
  { re: /search your library for (?:a|an) creature/i, classification: "CREATURE" },
  { re: /search your library for (?:a|an) artifact/i, classification: "ARTIFACT" },
  { re: /search your library for (?:a|an) enchantment/i, classification: "ENCHANTMENT" },
  { re: /search your library for (?:a|an) (?:basic )?land/i, classification: "LAND" },
  { re: /search your library for (?:a|an) (?:instant|sorcery)/i, classification: "FUNCTIONAL" },
  { re: /search your library for (?:a|an) (?:permanent|card) (?:with|that)/i, classification: "FUNCTIONAL" },
  { re: /transmute/i, classification: "TRANSMUTE" },
  { re: /look at the top \d+ cards.* put .* into your hand/i, classification: "TOP_DECK" },
  { re: /sacrifice.*search your library/i, classification: "SACRIFICE_LINKED" },
];

export function classifyTutorCardV411(card: GoldenCatalogOracleCard): TutorClassificationV411 | null {
  const tl = (card.typeLine ?? "").toLowerCase();
  if (/\bland\b/.test(tl) && !/\bcreature\b|\bartifact\b|\benchantment\b|\binstant\b|\bsorcery\b/.test(tl)) {
    return null;
  }

  const text = combinedGoldenOracleText(card);
  const nameLower = card.canonicalName.toLowerCase();

  if (/vampiric tutor|demonic tutor|imperial seal|gamble|diabolic intent|diabolic tutor|grim tutor|scheming symmetry|wishclaw|spellseeker|personal tutor|mystical tutor|worldly tutor|enlightened tutor|idyllic tutor|urza's saga|recruiter of the guard|imperial recruiter|survival of the fittest|finale of devastation|fabricate|merchant scroll|tribute mage|isochron scepter|entomb|buried alive|collective brutality|agatha's soul cauldron|diabolic edict/i.test(nameLower)) {
    if (/worldly|survival|recruiter|finale of devastation|collective brutality/i.test(nameLower)) return "CREATURE";
    if (/fabricate|tribute mage|urza's saga|isochron/i.test(nameLower)) return "ARTIFACT";
    if (/mystical|personal|merchant scroll|spellseeker|wishclaw/i.test(nameLower)) return "FUNCTIONAL";
    return "UNRESTRICTED";
  }

  for (const { re, classification } of TUTOR_ORACLE_PATTERNS) {
    if (re.test(text)) return classification;
  }
  return null;
}

export function isTutorCardV411(card: GoldenCatalogOracleCard): boolean {
  return classifyTutorCardV411(card) !== null;
}

export function discoverTutorCandidatesV411(args: {
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  excludeNames: Set<string>;
  bracket: CommanderBracket;
  powerPlan: BracketPowerPlanV410 | null;
  need: DeckNeedV47;
  charterKeywords?: string[];
  maxResults?: number;
}): TutorCandidateV411[] {
  const results: TutorCandidateV411[] = [];
  const charterKw = (args.charterKeywords ?? []).map((k) => k.toLowerCase());

  for (const [, card] of args.catalog.byOracleId.entries()) {
    if (!isCurrentlyCommanderLegal(card)) continue;
    if (!commanderLegalInIdentity(card.colorIdentity ?? [], args.colorIdentity)) continue;
    if (args.excludeNames.has(card.canonicalName.toLowerCase())) continue;

    const classification = classifyTutorCardV411(card);
    if (!classification) continue;

    const profile = buildFunctionalCardProfileV47(card);
    const oracleText = combinedGoldenOracleText(card).toLowerCase();
    let synergyBonus = 0;
    if (/sacrifice|token|treasure|food|artifact|creature/i.test(oracleText) && charterKw.some((k) => /sacrifice|token|engine/i.test(k))) {
      synergyBonus += 3;
    }

    const bracketScore = scoreCandidateForBracketV410({
      profile,
      need: args.need,
      bracket: args.bracket,
      powerPlan: args.powerPlan,
    }).finalScore + synergyBonus;

    results.push({
      name: card.canonicalName,
      oracleId: card.oracleId,
      classification,
      manaValue: card.manaValue ?? 0,
      bracketScore,
      reason: `${classification} tutor · MV${card.manaValue ?? "?"} · bracket score ${bracketScore}`,
    });
  }

  results.sort((a, b) => {
    const tier = (c: TutorCandidateV411) =>
      c.classification === "UNRESTRICTED" ? 100 : c.classification === "CREATURE" ? 80 : c.classification === "FUNCTIONAL" ? 60 : 20;
    return tier(b) - tier(a) || b.bracketScore - a.bracketScore || a.manaValue - b.manaValue;
  });
  return results.slice(0, args.maxResults ?? 12);
}

export function profileIsTutorV411(profile: FunctionalCardProfileV47, oracleText: string): boolean {
  return TUTOR_ORACLE_PATTERNS.some(({ re }) => re.test(oracleText)) ||
    /search your library/i.test(oracleText);
}
