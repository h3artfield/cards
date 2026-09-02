/**
 * Deep refinement swap proposals v4.13 — deficit-driven, non-filler upgrades.
 */
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import { isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import { buildFunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketDeficitPortfolioV413 } from "./professor-bracket-deficit-portfolio-v4-13-v1";
import { categoryPriorityScore, deficitToReplacementRole } from "./professor-bracket-deficit-portfolio-v4-13-v1";
import type { OpportunityCostSlotV413 } from "./professor-opportunity-cost-slot-v4-13-v1";
import type { TutorAuditEntryV413 } from "./professor-tutor-audit-v4-13-v1";
import {
  PROFESSOR_BRACKET_UPGRADE_SWAP_V4_12_V1_VERSION,
  type BracketUpgradeSwapProposalV412,
  BRACKET_UPGRADE_BATCH_SIZE_V412,
} from "./professor-bracket-upgrade-swap-v4-12-v1";
import { classifyTutorCardV411 } from "./professor-tutor-discovery-v4-11-v1";
import { findCardInDeck } from "./professor-bracket-drag-slot-v4-12-v1";

export const PROFESSOR_DEEP_REFINEMENT_SWAP_V4_13_V1_VERSION = "professor-deep-refinement-swap-v4-13-v1";

const FAST_MANA_RE = /sol ring|mana crypt|dockside|chrome mox|mox diamond|jeweled lotus|lotus petal|grim monolith|mana vault|ancient tomb|ritual|seething/i;
const INTERACTION_RE = /destroy target|exile target|counter target|instant|flash|terminate|beast within|assassin's trophy/i;
const PROTECTION_RE = /hexproof|indestructible|ward|protection from|deflecting swat|heroic intervention|autumn's veil/i;
const RAMP_RE = /add \{|\btutor\b|search your library|ramp|cultivate|farseek|nature's lore|three visits|dork/i;
const WIN_RE = /win the game|infinite|extra turn|damage equal|sacrifice.*deal|blood artist|pitiless plunderer|finisher/i;
const DRAW_RE = /draw a card|draw two|draw three|impulse|reveal.*hand/i;

const PREMIUM_ADDS: Record<string, string[]> = {
  ACCELERATION: ["Fellwar Stone", "Talisman of Indulgence", "Talisman of Impulse", "Arcane Signet", "Farseek", "Nature's Lore", "Three Visits", "Sakura-Tribe Elder"],
  FAST_MANA: ["Sol Ring", "Mana Crypt", "Dockside Extortionist", "Chrome Mox"],
  INTERACTION: ["Assassin's Trophy", "Beast Within", "Abrupt Decay", "Terminate", "Chaos Warp", "Putrefy", "Bedevil"],
  PROTECTION: ["Heroic Intervention", "Deflecting Swat", "Autumn's Veil", "Tyvar's Stand", "Swiftfoot Boots"],
  WIN_COMPACTNESS: ["Blood Artist", "Zulaport Cutthroat", "Mayhem Devil", "Impact Tremors", "Poison-Tip Archer", "Bastion of Remembrance"],
  CARD_VELOCITY: ["Skullclamp", "Deadly Dispute", "Plumb the Forbidden", "Village Rites", "Costly Plunder"],
  FINISHER_QUALITY: ["Craterhoof Behemoth", "Triumph of the Hordes", "Overwhelming Stampede"],
};

function roleOverlap(a: string[], b: string[]): number {
  return a.filter((r) => b.includes(r)).length;
}

function scoreRoleCompressionUpgrade(args: {
  cut: CouncilCardV46;
  addRoles: string[];
  addMv: number;
  cutMv: number;
}): number {
  const overlap = roleOverlap(args.cut.roles, args.addRoles);
  let score = overlap * 15;
  if (args.addMv < args.cutMv) score += 20;
  if (args.addRoles.length > args.cut.roles.length) score += 10;
  return score;
}

function discoverUpgradeForSlot(args: {
  slot: OpportunityCostSlotV413;
  cutCard: CouncilCardV46;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  excludeNames: Set<string>;
  portfolio: BracketDeficitPortfolioV413;
  tutorsSatisfied: boolean;
  charterKeywords: string[];
}): { name: string; reason: string; roles: string[]; evidence: string; pattern: string } | null {
  const roles =
    args.slot.desiredReplacementRole.length > 0
      ? args.slot.desiredReplacementRole
      : deficitToReplacementRole(args.slot.upgradeCategory);

  const cutGolden = args.cutCard.oracleId ? args.catalog.byOracleId.get(args.cutCard.oracleId) : null;
  const cutMv = cutGolden?.manaValue ?? 3;

  if (args.tutorsSatisfied && args.slot.upgradeCategory === "ACCESS_TUTORS") {
    return null;
  }

  const premiumList = PREMIUM_ADDS[args.slot.upgradeCategory] ?? [];
  for (const name of premiumList) {
    if (args.excludeNames.has(name.toLowerCase())) continue;
    const golden = [...args.catalog.byOracleId.values()].find(
      (c) => c.canonicalName.toLowerCase() === name.toLowerCase(),
    );
    if (!golden || !isCurrentlyCommanderLegal(golden)) continue;
    if (!commanderLegalInIdentity(golden.colorIdentity ?? [], args.colorIdentity)) continue;
    const profile = buildFunctionalCardProfileV47(golden);
    const compression = scoreRoleCompressionUpgrade({
      cut: args.cutCard,
      addRoles: profile.roles,
      addMv: golden.manaValue ?? 3,
      cutMv,
    });
    return {
      name: golden.canonicalName,
      reason: compression >= 25 ? "roleCompressionUpgrade" : `Addresses ${args.slot.upgradeCategory}`,
      roles: profile.roles,
      evidence: `premium ${args.slot.upgradeCategory} · compression=${compression}`,
      pattern: compression >= 25 ? "roleCompressionUpgrade" : "strictFunctionalUpgrade",
    };
  }

  let best: { name: string; reason: string; roles: string[]; evidence: string; pattern: string; score: number } | null = null;

  for (const [, card] of args.catalog.byOracleId.entries()) {
    if (!isCurrentlyCommanderLegal(card)) continue;
    if (!commanderLegalInIdentity(card.colorIdentity ?? [], args.colorIdentity)) continue;
    if (args.excludeNames.has(card.canonicalName.toLowerCase())) continue;
    const tl = (card.typeLine ?? "").toLowerCase();
    if (/\bland\b/.test(tl) && !/\bcreature\b|\bartifact\b/.test(tl)) continue;

    if (args.tutorsSatisfied && classifyTutorCardV411(card)) continue;

    const text = combinedGoldenOracleText(card).toLowerCase();
    const profile = buildFunctionalCardProfileV47(card);
    const roleStr = roles.join(" ").toLowerCase();
    let match = false;

    if (/interaction|removal/i.test(roleStr) && (INTERACTION_RE.test(text) || profile.roles.includes("interaction"))) match = true;
    if (/protection/i.test(roleStr) && (PROTECTION_RE.test(text) || profile.roles.includes("protection"))) match = true;
    if (/acceler|ramp|fast/i.test(roleStr) && (RAMP_RE.test(text) || FAST_MANA_RE.test(card.canonicalName.toLowerCase()))) match = true;
    if (/win|finisher|compact/i.test(roleStr) && (WIN_RE.test(text) || profile.roles.includes("finisher"))) match = true;
    if (/draw|velocity/i.test(roleStr) && (DRAW_RE.test(text) || profile.roles.includes("card-advantage"))) match = true;

    if (!match) continue;

    const compression = scoreRoleCompressionUpgrade({
      cut: args.cutCard,
      addRoles: profile.roles,
      addMv: card.manaValue ?? 3,
      cutMv,
    });
    const charterBoost = args.charterKeywords.some((k) => text.includes(k.toLowerCase().slice(0, 6))) ? 10 : 0;
    const score = compression + charterBoost + (card.manaValue ?? 3 <= 3 ? 5 : 0);

    if (!best || score > best.score) {
      best = {
        name: card.canonicalName,
        reason: compression >= 20 ? "roleCompressionUpgrade" : `Upgrade for ${args.slot.upgradeCategory}`,
        roles: profile.roles,
        evidence: `oracle scan score=${score} MV${card.manaValue}`,
        pattern: compression >= 20 ? "roleCompressionUpgrade" : "strictFunctionalUpgrade",
        score,
      };
    }
  }

  return best ? { name: best.name, reason: best.reason, roles: best.roles, evidence: best.evidence, pattern: best.pattern } : null;
}

export function buildDeepRefinementSwapProposalsV413(args: {
  opportunitySlots: OpportunityCostSlotV413[];
  selectedCards: CouncilCardV46[];
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  bracket: CommanderBracket;
  charterKeywords: string[];
  portfolio: BracketDeficitPortfolioV413;
  tutorAudits?: TutorAuditEntryV413[];
  maxProposals?: number;
}): BracketUpgradeSwapProposalV412[] {
  const tutorsSatisfied = args.portfolio.satisfiedCategories.includes("ACCESS_TUTORS");
  const excludeNames = new Set(args.selectedCards.map((c) => c.name.toLowerCase()));
  const proposals: BracketUpgradeSwapProposalV412[] = [];
  const usedCuts = new Set<string>();
  const usedAdds = new Set<string>();

  const slotsByPriority = [...args.opportunitySlots].sort((a, b) => {
    const catA = categoryPriorityScore(a.upgradeCategory, "HIGH");
    const catB = categoryPriorityScore(b.upgradeCategory, "HIGH");
    return catB - catA || b.opportunityCost - a.opportunityCost;
  });

  for (const audit of args.tutorAudits ?? []) {
    if (!audit.recommendReplacement) continue;
    const tutorCard = findCardInDeck(args.selectedCards, { cardName: audit.tutorName, oracleId: audit.oracleId });
    if (!tutorCard || usedCuts.has(tutorCard.cardId)) continue;
    slotsByPriority.unshift({
      version: "professor-opportunity-cost-slot-v4-13-v1",
      slotId: `tutor-audit-${tutorCard.cardId}`,
      cardId: tutorCard.cardId,
      oracleId: tutorCard.oracleId,
      cardName: tutorCard.name,
      currentRoles: tutorCard.roles,
      currentContribution: "tutor",
      bracketQuality: "B3",
      roleReplaceability: "HIGH",
      uniqueFunction: false,
      opportunityCost: 100,
      upgradeCategory: "INTERACTION",
      whyAcceptableAtCurrentBracket: audit.auditVerdict,
      whyInsufficientAtTargetBracket: audit.replacementReason ?? "Misplaced tutor",
      desiredReplacementRole: ["efficient interaction", "compact win engine"],
    });
  }

  for (const slot of slotsByPriority) {
    if (proposals.length >= (args.maxProposals ?? BRACKET_UPGRADE_BATCH_SIZE_V412)) break;
    if (tutorsSatisfied && slot.upgradeCategory === "ACCESS_TUTORS") continue;

    const cutCard = findCardInDeck(args.selectedCards, slot);
    if (!cutCard || usedCuts.has(cutCard.cardId)) continue;

    const pick = discoverUpgradeForSlot({
      slot,
      cutCard,
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      excludeNames,
      portfolio: args.portfolio,
      tutorsSatisfied,
      charterKeywords: args.charterKeywords,
    });
    if (!pick || usedAdds.has(pick.name.toLowerCase())) continue;

    proposals.push({
      version: PROFESSOR_BRACKET_UPGRADE_SWAP_V4_12_V1_VERSION,
      proposalId: `deep-swap-${slot.slotId}`,
      cut: cutCard.name,
      cutCardId: cutCard.cardId,
      add: pick.name,
      cutReason: slot.whyInsufficientAtTargetBracket,
      addReason: `${pick.pattern}: ${pick.reason}`,
      roleLost: cutCard.roles,
      roleGained: pick.roles,
      rolePreserved: [],
      deficitsImproved: [slot.upgradeCategory],
      expectedBracketImpact: `Close ${slot.upgradeCategory} gap for B${args.bracket}`,
      expectedDeckImpact: `${pick.pattern} — ${pick.name} replaces opportunity-cost slot ${cutCard.name}`,
      researchEvidence: [pick.evidence, `opportunityCost=${slot.opportunityCost}`],
      dragSlotId: slot.slotId,
      criticApproved: false,
    });
    usedCuts.add(cutCard.cardId);
    usedAdds.add(pick.name.toLowerCase());
  }

  return proposals;
}
