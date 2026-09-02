/**
 * Architecture transformation execution v4.15 — bounded multi-card mutations from Sol proposal.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import type { ArchitectureTransformationProposalV415 } from "./professor-win-architecture-v4-15-v1";
import {
  buildPackageUpgradeProposalsV414,
  type BracketUpgradePackageProposalV414,
} from "./professor-win-package-v4-14-v1";
import { executePackageUpgradeV414 } from "./professor-package-executor-v4-14-v1";
import { buildDeepRefinementSwapProposalsV413 } from "./professor-deep-refinement-swap-v4-13-v1";
import { executeBracketUpgradeSwapsV412 } from "./professor-bracket-upgrade-swap-v4-12-v1";
import { deriveDeficitPortfolioV413 } from "./professor-bracket-deficit-portfolio-v4-13-v1";
import type { BracketAdjudicationV411 } from "./professor-bracket-adjudication-v4-11-v1";
import type { BracketDragSlotV412 } from "./professor-bracket-drag-slot-v4-12-v1";
import type { BracketDeficitCategoryV413 } from "./professor-bracket-deficit-portfolio-v4-13-v1";
import { scoreCutOpportunityV413, resolveCardReferenceV413, type OpportunityCostSlotV413 } from "./professor-opportunity-cost-slot-v4-13-v1";

export const PROFESSOR_ARCHITECTURE_TRANSFORMATION_V4_15_V1_VERSION =
  "professor-architecture-transformation-v4-15-v1";

export type ArchitectureExecutionResultV415 = {
  state: ProfessorCouncilStateV47;
  acceptedSwaps: number;
  acceptedPackages: number;
  rejectedCount: number;
};

function proposalToPackage(proposal: ArchitectureTransformationProposalV415): BracketUpgradePackageProposalV414 {
  return {
    version: "professor-win-package-v4-14-v1",
    proposalId: proposal.proposalId,
    currentPackage: proposal.removeCards,
    removeCards: proposal.removeCards,
    preserveCards: proposal.preserveCards,
    addCards: proposal.addCards,
    reason: proposal.reason,
    deficitsSolved: proposal.deficitsSolved,
    oldWinArchitecture: proposal.oldWinArchitecture,
    newWinArchitecture: proposal.newWinArchitecture,
    oldSlotCount: proposal.oldSlotCount,
    newSlotCount: proposal.newSlotCount,
    expectedThreatWindowBefore: proposal.expectedThreatWindowBefore,
    expectedThreatWindowAfter: proposal.expectedThreatWindowAfter,
    commanderFit: true,
    charterFit: true,
    bracketImpact: proposal.bracketImpact,
    criticApproved: false,
  };
}

export function executeArchitectureTransformationV415(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
  charter: DeckCharterV45 | null;
  proposal: ArchitectureTransformationProposalV415;
}): ArchitectureExecutionResultV415 {
  let state = args.state;
  let acceptedSwaps = 0;
  let acceptedPackages = 0;
  let rejectedCount = 0;

  if (args.proposal.removeCards.length > 0 && args.proposal.addCards.length > 0) {
    const batch = executePackageUpgradeV414({
      state,
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      commanderName: args.commanderName,
      charter: args.charter,
      proposal: proposalToPackage(args.proposal),
    });
    if (batch.accepted) {
      state = batch.state;
      acceptedPackages += 1;
    } else {
      rejectedCount += 1;
    }
  }

  return { state, acceptedSwaps, acceptedPackages, rejectedCount };
}

export function buildOpportunitySlotsFromNames(args: {
  cardNames: string[];
  selectedCards: ProfessorCouncilStateV47["selectedCards"];
  catalog: DeckResolutionCatalog;
  upgradeCategory: BracketDeficitCategoryV413;
  currentBracket: number;
  targetBracket: number;
}): OpportunityCostSlotV413[] {
  const slots: OpportunityCostSlotV413[] = [];
  for (const name of args.cardNames) {
    const resolved = resolveCardReferenceV413({ selectedCards: args.selectedCards, ref: { cardName: name } });
    if (!resolved) continue;
    slots.push({
      version: "professor-opportunity-cost-slot-v4-13-v1",
      slotId: `opp-${resolved.cardId}`,
      cardId: resolved.cardId,
      oracleId: resolved.oracleId,
      cardName: resolved.name,
      currentRoles: resolved.roles,
      currentContribution: "Acceptable at current bracket",
      bracketQuality: "B3",
      roleReplaceability: "HIGH",
      uniqueFunction: false,
      opportunityCost: scoreCutOpportunityV413({
        card: resolved,
        deck: args.selectedCards,
        catalog: args.catalog,
        upgradeCategory: args.upgradeCategory,
        currentBracket: args.currentBracket,
        targetBracket: args.targetBracket,
      }),
      upgradeCategory: args.upgradeCategory,
      whyAcceptableAtCurrentBracket: "Playable include",
      whyInsufficientAtTargetBracket: "Weaker implementation for target bracket",
      desiredReplacementRole: [args.upgradeCategory.toLowerCase()],
    });
  }
  return slots;
}

export async function executeHeadProfessorSwapsV415(args: {
  review: import("./professor-final-deck-doctor-v4-8-v1").FinalDeckDoctorReviewV48;
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
  charter: DeckCharterV45 | null;
  dossierLandCount: number;
}): Promise<{
  state: ProfessorCouncilStateV47;
  executed: import("./professor-final-deck-doctor-v4-8-v1").ExecutedSwapV48[];
}> {
  const { executeFinalRefinementV48 } = await import("./professor-final-refinement-v4-8-v1");
  const refinement = executeFinalRefinementV48({
    review: args.review,
    state: args.state,
    catalog: args.catalog,
    colorIdentity: args.colorIdentity,
    commanderName: args.commanderName,
    charter: args.charter,
    dossierLandCount: args.dossierLandCount,
  });
  return { state: refinement.state, executed: refinement.executed };
}

export function executeOpportunitySwapsFromReviewV415(args: {
  opportunityCardNames: string[];
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
  charter: DeckCharterV45 | null;
  bracket: import("@/lib/bracket-policy/commander-bracket-snapshot-v1").CommanderBracket;
  adjudication: BracketAdjudicationV411;
  fingerprint: ReturnType<typeof import("./professor-deck-fingerprint-v4-11-v1").computeFinalDeckFingerprintV411>;
  charterKeywords: string[];
  maxSwaps?: number;
}): { state: ProfessorCouncilStateV47; accepted: number } {
  const portfolio = deriveDeficitPortfolioV413({
    currentBracket: args.adjudication.predictedEffectiveBracket,
    targetBracket: args.bracket,
    adjudication: args.adjudication,
    fingerprint: args.fingerprint,
  });

  const slots = buildOpportunitySlotsFromNames({
    cardNames: args.opportunityCardNames,
    selectedCards: args.state.selectedCards,
    catalog: args.catalog,
    upgradeCategory: portfolio.activeCategories[0] ?? "WIN_COMPACTNESS",
    currentBracket: args.adjudication.predictedEffectiveBracket,
    targetBracket: args.bracket,
  }).slice(0, args.maxSwaps ?? 4);

  if (slots.length === 0) return { state: args.state, accepted: 0 };

  const proposals = buildDeepRefinementSwapProposalsV413({
    opportunitySlots: slots,
    selectedCards: args.state.selectedCards,
    catalog: args.catalog,
    colorIdentity: args.colorIdentity,
    bracket: args.bracket,
    charterKeywords: args.charterKeywords,
    portfolio,
    tutorAudits: [],
  });

  const slotsById = new Map<string, BracketDragSlotV412>(
    slots.map((s) => [
      s.slotId,
      {
        version: "professor-bracket-drag-slot-v4-12-v1",
        dragSlotId: s.slotId,
        cardId: s.cardId,
        oracleId: s.oracleId,
        cardName: s.cardName,
        dragReason: s.whyInsufficientAtTargetBracket,
        priority: "HIGH",
        roleCurrentlyFilled: s.currentRoles,
        rolesThatMustBePreserved: [],
        desiredReplacementRole: s.desiredReplacementRole,
        bracketDeficitAddressed: [s.upgradeCategory],
        reservedForMission: true,
      },
    ]),
  );

  const batch = executeBracketUpgradeSwapsV412({
    state: args.state,
    catalog: args.catalog,
    colorIdentity: args.colorIdentity,
    commanderName: args.commanderName,
    charter: args.charter,
    proposals: proposals.slice(0, args.maxSwaps ?? 4),
    slotsById,
  });

  return { state: batch.state, accepted: batch.accepted.length };
}
