/**
 * Package-level swap execution v4.14.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { CouncilCardV46, CardDecisionV46 } from "./professor-council-assembly-v4-6-v1";
import {
  evaluateLegalityGateV47,
  type ProfessorCouncilStateV47,
} from "./professor-council-assembly-v4-7-v1";
import { resolveBenchmarkCommanderName } from "./benchmark-commander-resolver-v1";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import { isCurrentlyCommanderLegal, paperMetaForOracle } from "../../../scripts/lib/load-deck-resolution-catalog";
import { buildFunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import { findCardInDeck } from "./professor-bracket-drag-slot-v4-12-v1";
import { recomputeFinalDeckSnapshotV411 } from "./professor-final-deck-canonical-v4-11-v1";
import type { BracketUpgradePackageProposalV414 } from "./professor-win-package-v4-14-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";

export function criticApprovePackageV414(args: {
  proposal: BracketUpgradePackageProposalV414;
  selectedAfter: CouncilCardV46[];
  charter: DeckCharterV45 | null;
}): { approved: boolean; reason: string } {
  if (args.proposal.removeCards.length === 0 || args.proposal.addCards.length === 0) {
    return { approved: false, reason: "Package proposal missing cuts or adds" };
  }
  if (args.selectedAfter.length > 100) {
    return { approved: false, reason: "Package would exceed 100 cards" };
  }
  if (args.selectedAfter.length < 98) {
    return { approved: false, reason: "Package would leave deck under 99 cards" };
  }
  const sacrificeOutlets = args.selectedAfter.filter((c) => c.roles.includes("sacrifice-outlet")).length;
  if (sacrificeOutlets < 2) {
    return { approved: false, reason: "Package thins sacrifice outlets below minimum" };
  }
  if (!args.proposal.commanderFit || !args.proposal.charterFit) {
    return { approved: false, reason: "Package fails commander/charter fit" };
  }
  return { approved: true, reason: "Package improves win architecture while preserving engine skeleton" };
}

function resolveAddCard(args: {
  catalog: DeckResolutionCatalog;
  name: string;
  colorIdentity: string[];
  excludeNames: Set<string>;
  revision: number;
}): CouncilCardV46 | null {
  const audit = resolveBenchmarkCommanderName(args.catalog, args.name);
  if (!audit.resolved || !audit.oracleId) return null;
  const golden = args.catalog.byOracleId.get(audit.oracleId);
  if (!golden || !isCurrentlyCommanderLegal(golden)) return null;
  if (!commanderLegalInIdentity(golden.colorIdentity ?? [], args.colorIdentity)) return null;
  const paper = paperMetaForOracle(args.catalog, golden.oracleId);
  if (paper && !paper.paperEligible) return null;
  if (args.excludeNames.has(golden.canonicalName.toLowerCase())) return null;
  const profile = buildFunctionalCardProfileV47(golden);
  const isLand = (golden.typeLine ?? "").toLowerCase().includes("land");
  return {
    cardId: `card-pkg-${golden.oracleId.slice(0, 8)}`,
    oracleId: golden.oracleId,
    name: golden.canonicalName,
    proposedBy: "RESEARCH",
    origin: "SEMANTIC_ORACLE",
    proposalReason: "Package upgrade add",
    functions: profile.roles,
    roles: profile.roles,
    packages: ["Package Upgrade"],
    engines: [],
    commanderDependence: "MEDIUM",
    worksWithoutCommander: "MEDIUM",
    semanticConnections: [],
    oracleVerified: true,
    legalityVerified: true,
    colorIdentityVerified: true,
    criticStatus: "CHARTER_OK",
    status: "SELECTED",
    addedAtRevision: args.revision,
    lastReviewedRevision: args.revision,
    category: isLand ? "land" : "spell",
  };
}

export function executePackageUpgradeV414(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
  charter: DeckCharterV45 | null;
  proposal: BracketUpgradePackageProposalV414;
}): {
  state: ProfessorCouncilStateV47;
  proposal: BracketUpgradePackageProposalV414;
  accepted: boolean;
} {
  let selectedCards = [...args.state.selectedCards];
  const cardDecisions: CardDecisionV46[] = [...args.state.cardDecisions];
  const revision = args.state.assemblyRevision + 1;
  const excludeNames = new Set(selectedCards.map((c) => normalizeOracleName(c.name)));

  const cuts: CouncilCardV46[] = [];
  for (const name of args.proposal.removeCards) {
    const card = findCardInDeck(selectedCards, { cardName: name });
    if (card && !args.proposal.preserveCards.includes(card.name)) cuts.push(card);
  }
  if (cuts.length === 0) {
    return {
      state: args.state,
      proposal: { ...args.proposal, criticApproved: false, criticRejectionReason: "No valid cut cards in deck" },
      accepted: false,
    };
  }

  const adds: CouncilCardV46[] = [];
  for (const name of args.proposal.addCards) {
    const card = resolveAddCard({
      catalog: args.catalog,
      name,
      colorIdentity: args.colorIdentity,
      excludeNames,
      revision,
    });
    if (card) {
      adds.push(card);
      excludeNames.add(normalizeOracleName(card.name));
    }
  }
  if (adds.length === 0) {
    return {
      state: args.state,
      proposal: { ...args.proposal, criticApproved: false, criticRejectionReason: "Could not resolve package adds" },
      accepted: false,
    };
  }

  const cutIds = new Set(cuts.map((c) => c.cardId));
  selectedCards = selectedCards.filter((c) => !cutIds.has(c.cardId));
  selectedCards.push(...adds);

  const critic = criticApprovePackageV414({
    proposal: args.proposal,
    selectedAfter: selectedCards,
    charter: args.charter,
  });
  if (!critic.approved) {
    return {
      state: args.state,
      proposal: { ...args.proposal, criticApproved: false, criticRejectionReason: critic.reason },
      accepted: false,
    };
  }

  for (const cut of cuts) {
    cardDecisions.push({
      decisionId: `dec-pkg-cut-${revision}-${cut.cardId}`,
      cardId: cut.cardId,
      cardName: cut.name,
      action: "CUT",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: args.proposal.reason,
      revision,
    });
  }
  for (const add of adds) {
    cardDecisions.push({
      decisionId: `dec-pkg-add-${revision}-${add.cardId}`,
      cardId: add.cardId,
      cardName: add.name,
      action: "ADD",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: args.proposal.reason,
      revision,
    });
  }

  let nextState: ProfessorCouncilStateV47 = {
    ...args.state,
    selectedCards,
    cardDecisions,
    assemblyRevision: revision,
    buildPhase: "BRACKET_REFINEMENT",
  };
  nextState.legalityGate = evaluateLegalityGateV47({ state: nextState, commanderName: args.commanderName });
  nextState = recomputeFinalDeckSnapshotV411({ state: nextState, catalog: args.catalog });

  return {
    state: nextState,
    proposal: { ...args.proposal, criticApproved: true },
    accepted: true,
  };
}
