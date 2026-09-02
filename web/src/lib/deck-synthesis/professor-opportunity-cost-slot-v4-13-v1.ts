/**
 * Opportunity-cost cut slots v4.13 — acceptable B3 cards that should yield for B4.
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { BracketDeficitCategoryV413 } from "./professor-bracket-deficit-portfolio-v4-13-v1";
import { deficitToReplacementRole } from "./professor-bracket-deficit-portfolio-v4-13-v1";
import type { RemainingBracketDeficitV413 } from "./professor-bracket-deficit-portfolio-v4-13-v1";

export const PROFESSOR_OPPORTUNITY_COST_SLOT_V4_13_V1_VERSION = "professor-opportunity-cost-slot-v4-13-v1";

export type BracketQualityV413 = "B2" | "B3" | "B4" | "B5";

export type OpportunityCostSlotV413 = {
  version: typeof PROFESSOR_OPPORTUNITY_COST_SLOT_V4_13_V1_VERSION;
  slotId: string;
  cardId: string;
  oracleId: string | null;
  cardName: string;
  currentRoles: string[];
  currentContribution: string;
  bracketQuality: BracketQualityV413;
  roleReplaceability: "HIGH" | "MEDIUM" | "LOW";
  uniqueFunction: boolean;
  opportunityCost: number;
  upgradeCategory: BracketDeficitCategoryV413;
  whyAcceptableAtCurrentBracket: string;
  whyInsufficientAtTargetBracket: string;
  desiredReplacementRole: string[];
  upgradePattern?: "strictFunctionalUpgrade" | "roleCompressionUpgrade" | "packageRedesign";
};

export function resolveCardReferenceV413(args: {
  selectedCards: CouncilCardV46[];
  ref: { oracleId?: string | null; cardName?: string; cardId?: string; reason?: string };
}): CouncilCardV46 | null {
  if (args.ref.oracleId) {
    const byOracle = args.selectedCards.find((c) => c.oracleId === args.ref.oracleId);
    if (byOracle) return byOracle;
  }
  if (args.ref.cardId) {
    const byId = args.selectedCards.find((c) => c.cardId === args.ref.cardId);
    if (byId) return byId;
  }
  if (args.ref.cardName) {
    const norm = normalizeOracleName(args.ref.cardName);
    const exact =
      args.selectedCards.find((c) => c.name && normalizeOracleName(c.name) === norm) ??
      args.selectedCards.find((c) => c.name?.toLowerCase() === args.ref.cardName!.toLowerCase());
    if (exact) return exact;

    const partial = args.selectedCards.filter((c) => {
      if (!c.name) return false;
      const cn = c.name.toLowerCase();
      const q = args.ref.cardName!.toLowerCase();
      return cn.includes(q) || q.includes(cn.split(" //")[0]!);
    });
    if (partial.length === 1) return partial[0]!;
  }

  if (args.ref.reason) {
    const reason = args.ref.reason.toLowerCase();
    const roleMatch = args.selectedCards.filter((c) =>
      c.roles.some((r) => reason.includes(r.replace("-", " ")) || reason.includes(r)),
    );
    if (roleMatch.length === 1) return roleMatch[0]!;
  }
  return null;
}

function roleRedundancy(card: CouncilCardV46, deck: CouncilCardV46[]): number {
  let count = 0;
  for (const role of card.roles) {
    if (role === "land") continue;
    count += deck.filter((c) => c.cardId !== card.cardId && c.roles.includes(role)).length;
  }
  return count;
}

function isCoreRole(card: CouncilCardV46): boolean {
  if (card.status === "CORE") return true;
  const coreRoles = ["sacrifice-outlet", "interaction", "finisher"];
  return coreRoles.some((r) => card.roles.includes(r)) && card.commanderDependence === "HIGH";
}

export function scoreCutOpportunityV413(args: {
  card: CouncilCardV46;
  deck: CouncilCardV46[];
  catalog: DeckResolutionCatalog;
  upgradeCategory: BracketDeficitCategoryV413;
  currentBracket: number;
  targetBracket: number;
}): number {
  let score = 0;
  const golden = args.card.oracleId ? args.catalog.byOracleId.get(args.card.oracleId) : null;
  const mv = golden?.manaValue ?? 3;

  if (args.card.category === "land") return -1000;
  if (isCoreRole(args.card)) score -= 80;

  const redundancy = roleRedundancy(args.card, args.deck);
  score += Math.min(redundancy * 8, 40);

  if (mv >= 5) score += 25;
  else if (mv >= 4) score += 15;

  if (args.card.roles.length <= 1) score += 20;
  if (args.card.commanderDependence === "LOW") score += 10;

  const uniqueRoles = ["sacrifice-outlet", "interaction", "protection", "finisher"];
  const hasUnique = args.card.roles.some(
    (r) => uniqueRoles.includes(r) && args.deck.filter((c) => c.roles.includes(r)).length <= 2,
  );
  if (hasUnique) score -= 50;

  if (args.card.roles.length >= 3) score -= 15;

  if (args.card.roles.includes("finisher") || args.card.roles.includes("sacrifice-outlet")) score -= 60;
  if (/pitiless plunderer|blood artist|skullclamp|doubling season|worldly tutor|vampiric tutor|entomb|diabolic intent|finale of devastation/i.test(args.card.name)) score -= 100;

  if (/slow|narrow|medium|replaceable|acceptable/i.test(args.card.proposalReason)) score += 10;

  const catBoost: Partial<Record<BracketDeficitCategoryV413, number>> = {
    WIN_COMPACTNESS: 15,
    INTERACTION: 10,
    ACCELERATION: 8,
    ACCESS_TUTORS: -30,
  };
  score += catBoost[args.upgradeCategory] ?? 0;

  return score;
}

export function opportunitySlotFromCard(args: {
  card: CouncilCardV46;
  deck: CouncilCardV46[];
  catalog: DeckResolutionCatalog;
  upgradeCategory: BracketDeficitCategoryV413;
  currentBracket: number;
  targetBracket: number;
  whyAcceptable: string;
  whyInsufficient: string;
  desiredReplacementRole: string[];
  slotIndex: number;
}): OpportunityCostSlotV413 {
  const score = scoreCutOpportunityV413({
    card: args.card,
    deck: args.deck,
    catalog: args.catalog,
    upgradeCategory: args.upgradeCategory,
    currentBracket: args.currentBracket,
    targetBracket: args.targetBracket,
  });
  const redundancy = roleRedundancy(args.card, args.deck);

  return {
    version: PROFESSOR_OPPORTUNITY_COST_SLOT_V4_13_V1_VERSION,
    slotId: `opp-slot-${args.slotIndex}-${args.card.cardId}`,
    cardId: args.card.cardId,
    oracleId: args.card.oracleId,
    cardName: args.card.name,
    currentRoles: args.card.roles.slice(0, 5),
    currentContribution: args.card.roles.join(", ") || "utility",
    bracketQuality: `B${args.currentBracket}` as BracketQualityV413,
    roleReplaceability: redundancy >= 3 ? "HIGH" : redundancy >= 1 ? "MEDIUM" : "LOW",
    uniqueFunction: redundancy === 0 && args.card.roles.some((r) => ["sacrifice-outlet", "interaction"].includes(r)),
    opportunityCost: score,
    upgradeCategory: args.upgradeCategory,
    whyAcceptableAtCurrentBracket: args.whyAcceptable,
    whyInsufficientAtTargetBracket: args.whyInsufficient,
    desiredReplacementRole: args.desiredReplacementRole,
    upgradePattern: "strictFunctionalUpgrade",
  };
}

export function deriveOpportunityCostSlotsV413(args: {
  selectedCards: CouncilCardV46[];
  catalog: DeckResolutionCatalog;
  solSuggestions: RemainingBracketDeficitV413[];
  activeCategories: BracketDeficitCategoryV413[];
  currentBracket: number;
  targetBracket: number;
  maxSlots?: number;
}): OpportunityCostSlotV413[] {
  const slots: OpportunityCostSlotV413[] = [];
  const usedIds = new Set<string>();

  for (const deficit of args.solSuggestions) {
    if (args.activeCategories.length > 0 && !args.activeCategories.includes(deficit.category)) continue;
    for (const ref of deficit.suggestedSlotsToReconsider) {
      const card = resolveCardReferenceV413({ selectedCards: args.selectedCards, ref });
      if (!card || usedIds.has(card.cardId) || card.category === "land") continue;
      slots.push(
        opportunitySlotFromCard({
          card,
          deck: args.selectedCards,
          catalog: args.catalog,
          upgradeCategory: deficit.category,
          currentBracket: args.currentBracket,
          targetBracket: args.targetBracket,
          whyAcceptable: `Playable at B${args.currentBracket} — ${deficit.explanation.slice(0, 80)}`,
          whyInsufficient: deficit.desiredImprovement,
          desiredReplacementRole: deficit.desiredImprovement.split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 2),
          slotIndex: slots.length,
        }),
      );
      usedIds.add(card.cardId);
    }
  }

  if (slots.length < (args.maxSlots ?? 6)) {
    const activeCats = args.activeCategories.length > 0 ? args.activeCategories : ["WIN_COMPACTNESS", "INTERACTION", "PROTECTION", "ACCELERATION"];
    const candidates = args.selectedCards
      .filter((c) => c.category !== "land" && !usedIds.has(c.cardId))
      .map((c) => ({
        card: c,
        score: scoreCutOpportunityV413({
          card: c,
          deck: args.selectedCards,
          catalog: args.catalog,
          upgradeCategory: activeCats[0] ?? "WIN_COMPACTNESS",
          currentBracket: args.currentBracket,
          targetBracket: args.targetBracket,
        }),
      }))
      .sort((a, b) => b.score - a.score);

    let catIdx = 0;
    for (const { card, score } of candidates) {
      if (slots.length >= (args.maxSlots ?? 6)) break;
      if (score < 30) break;
      const category = activeCats[catIdx % activeCats.length] ?? "WIN_COMPACTNESS";
      catIdx++;
      slots.push(
        opportunitySlotFromCard({
          card,
          deck: args.selectedCards,
          catalog: args.catalog,
          upgradeCategory: category,
          currentBracket: args.currentBracket,
          targetBracket: args.targetBracket,
          whyAcceptable: `Acceptable B${args.currentBracket} ${card.roles[0] ?? "role"} — opportunity cost cut for B${args.targetBracket}`,
          whyInsufficient: `B${args.targetBracket} needs stronger ${category.replace(/_/g, " ").toLowerCase()}`,
          desiredReplacementRole: deficitToReplacementRole(category),
          slotIndex: slots.length,
        }),
      );
      usedIds.add(card.cardId);
    }
  }

  return slots.sort((a, b) => b.opportunityCost - a.opportunityCost).slice(0, args.maxSlots ?? 8);
}
