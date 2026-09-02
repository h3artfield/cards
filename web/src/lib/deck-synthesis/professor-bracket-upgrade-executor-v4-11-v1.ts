/**
 * Bracket upgrade mission executor v4.11 — Research finds replacements, Critic verifies, swaps apply.
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { isCurrentlyCommanderLegal, paperMetaForOracle } from "../../../scripts/lib/load-deck-resolution-catalog";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import { resolveBenchmarkCommanderName } from "./benchmark-commander-resolver-v1";
import type { CouncilCardV46, CardDecisionV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import {
  computeDeckSnapshotV47,
  evaluateLegalityGateV47,
  type ProfessorCouncilStateV47,
} from "./professor-council-assembly-v4-7-v1";
import { buildFunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import {
  basicLandAllowsDuplicate,
  isBasicLandName,
} from "./professor-commander-legality-v4-9-v1";
import type {
  BracketProposedSwapV411,
  BracketUpgradeMissionV411,
} from "./professor-bracket-upgrade-mission-v4-11-v1";
import { recomputeFinalDeckSnapshotV411 } from "./professor-final-deck-canonical-v4-11-v1";
import type { TutorCandidateV411 } from "./professor-tutor-discovery-v4-11-v1";
import type { GameChangerEvaluationV411 } from "./professor-game-changer-discovery-v4-11-v1";
import type { BracketDragCardV411 } from "./professor-bracket-drag-analysis-v4-11-v1";
import { analyzeBracketGapV410 } from "./professor-bracket-gap-analysis-v4-10-v1";

export const PROFESSOR_BRACKET_UPGRADE_EXECUTOR_V4_11_V1_VERSION = "professor-bracket-upgrade-executor-v4-11-v1";

export const BRACKET_UPGRADE_BATCH_SIZE_V411 = 6;

function findSelectedByName(selected: CouncilCardV46[], name: string): CouncilCardV46 | null {
  const norm = normalizeOracleName(name);
  return (
    selected.find((c) => normalizeOracleName(c.name) === norm) ??
    selected.find((c) => c.name.toLowerCase() === name.toLowerCase()) ??
    null
  );
}

function resolveAddCard(args: {
  catalog: DeckResolutionCatalog;
  name: string;
  colorIdentity: string[];
  excludeNames: Set<string>;
  revision: number;
  reason: string;
}): { ok: true; card: CouncilCardV46 } | { ok: false; reason: string } {
  const key = normalizeOracleName(args.name);
  if (args.excludeNames.has(key) && !basicLandAllowsDuplicate(args.name)) {
    return { ok: false, reason: `${args.name} already in deck (singleton)` };
  }

  if (isBasicLandName(args.name)) {
    return {
      ok: true,
      card: {
        cardId: `card-basic-${key}-${args.revision}`,
        oracleId: null,
        name: args.name,
        proposedBy: "RESEARCH",
        origin: "ORACLE_SEARCH",
        proposalReason: args.reason,
        functions: ["land"],
        roles: ["land"],
        packages: ["Bracket Upgrade"],
        engines: [],
        commanderDependence: "LOW",
        worksWithoutCommander: "HIGH",
        semanticConnections: [],
        oracleVerified: true,
        legalityVerified: true,
        colorIdentityVerified: true,
        criticStatus: "CHARTER_OK",
        status: "SELECTED",
        addedAtRevision: args.revision,
        lastReviewedRevision: args.revision,
        category: "land",
      },
    };
  }

  const audit = resolveBenchmarkCommanderName(args.catalog, args.name);
  if (!audit.resolved || !audit.oracleId) {
    return { ok: false, reason: `Could not resolve "${args.name}"` };
  }
  const golden = args.catalog.byOracleId.get(audit.oracleId);
  if (!golden || !isCurrentlyCommanderLegal(golden)) {
    return { ok: false, reason: `${args.name} not Commander legal` };
  }
  if (!commanderLegalInIdentity(golden.colorIdentity ?? [], args.colorIdentity)) {
    return { ok: false, reason: `${args.name} outside color identity` };
  }
  const paper = paperMetaForOracle(args.catalog, golden.oracleId);
  if (paper && !paper.paperEligible) {
    return { ok: false, reason: `${args.name} not paper-eligible` };
  }

  const profile = buildFunctionalCardProfileV47(golden);
  const isLand = (golden.typeLine ?? "").toLowerCase().includes("land");
  return {
    ok: true,
    card: {
      cardId: `card-${golden.oracleId}`,
      oracleId: golden.oracleId,
      name: golden.canonicalName,
      proposedBy: "RESEARCH",
      origin: "SEMANTIC_ORACLE",
      proposalReason: args.reason,
      functions: profile.roles,
      roles: profile.roles,
      packages: ["Bracket Upgrade"],
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
    },
  };
}

function criticApproveBracketSwap(args: {
  cut: CouncilCardV46;
  add: CouncilCardV46;
  charter: DeckCharterV45 | null;
  cutRolesLost: string[];
}): { approved: boolean; reason: string } {
  if (args.cut.status === "CORE") {
    return { approved: false, reason: "Cannot cut CORE structural card without replacement role" };
  }
  const essentialRoles = ["sacrifice-outlet", "interaction"];
  for (const role of essentialRoles) {
    if (args.cutRolesLost.includes(role) && !args.add.roles.includes(role)) {
      return { approved: false, reason: `Cut removes ${role} without replacement` };
    }
  }
  if (args.charter?.avoidPatterns.some((p) => args.add.name.toLowerCase().includes(p.toLowerCase().slice(0, 8)))) {
    return { approved: false, reason: "Addition matches charter avoid pattern" };
  }
  return { approved: true, reason: "Critic approved — legality, charter, role balance OK" };
}

export function proposeBracketUpgradeSwapsV411(args: {
  dragCards: BracketDragCardV411[];
  tutorCandidates: TutorCandidateV411[];
  gameChangers: GameChangerEvaluationV411[];
  selectedCards: CouncilCardV46[];
  maxProposals?: number;
}): BracketProposedSwapV411[] {
  const proposals: BracketProposedSwapV411[] = [];
  const usedCuts = new Set<string>();
  const usedAdds = new Set<string>();

  const dragSorted = [...args.dragCards].sort((a, b) => {
    const p = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return p[a.priority] - p[b.priority];
  });

  const addQueue: { name: string; reason: string; deficit: string }[] = [];
  for (const t of args.tutorCandidates.slice(0, 5)) {
    addQueue.push({ name: t.name, reason: t.reason, deficit: "TUTOR_ACCESS" });
  }
  for (const g of args.gameChangers.filter((g) => g.selected && !g.rejectionReason).slice(0, 3)) {
    addQueue.push({ name: g.card, reason: g.reasonRelevant, deficit: "GAME_CHANGER" });
  }

  for (const drag of dragSorted) {
    if (proposals.length >= (args.maxProposals ?? BRACKET_UPGRADE_BATCH_SIZE_V411)) break;
    if (usedCuts.has(drag.card.toLowerCase())) continue;
    if (!findSelectedByName(args.selectedCards, drag.card)) continue;

    const add = addQueue.find((a) => !usedAdds.has(a.name.toLowerCase()));
    if (!add) continue;

    proposals.push({
      cut: drag.card,
      add: add.name,
      reason: `Replace ${drag.card} (${drag.whyItDragsBracket}) with ${add.name}`,
      resolvesDeficit: add.deficit,
      verified: false,
    });
    usedCuts.add(drag.card.toLowerCase());
    usedAdds.add(add.name.toLowerCase());
  }

  return proposals;
}

export function executeBracketUpgradeBatchV411(args: {
  mission: BracketUpgradeMissionV411;
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
  charter: DeckCharterV45 | null;
  proposals: BracketProposedSwapV411[];
}): {
  state: ProfessorCouncilStateV47;
  mission: BracketUpgradeMissionV411;
  accepted: BracketProposedSwapV411[];
  rejected: BracketProposedSwapV411[];
} {
  let selectedCards = [...args.state.selectedCards];
  const cardDecisions: CardDecisionV46[] = [...args.state.cardDecisions];
  const revision = args.state.assemblyRevision + 1;
  const excludeNames = new Set(selectedCards.map((c) => normalizeOracleName(c.name)));
  const accepted: BracketProposedSwapV411[] = [];
  const rejected: BracketProposedSwapV411[] = [];

  for (const proposal of args.proposals.slice(0, BRACKET_UPGRADE_BATCH_SIZE_V411)) {
    const cutCard = findSelectedByName(selectedCards, proposal.cut);
    if (!cutCard) {
      rejected.push({ ...proposal, verified: false, rejectionReason: "Cut card not in deck" });
      continue;
    }

    const resolved = resolveAddCard({
      catalog: args.catalog,
      name: proposal.add,
      colorIdentity: args.colorIdentity,
      excludeNames,
      revision,
      reason: proposal.reason,
    });
    if (!resolved.ok) {
      rejected.push({ ...proposal, verified: false, rejectionReason: resolved.reason });
      continue;
    }

    const critic = criticApproveBracketSwap({
      cut: cutCard,
      add: resolved.card,
      charter: args.charter,
      cutRolesLost: cutCard.roles,
    });
    if (!critic.approved) {
      rejected.push({ ...proposal, verified: false, rejectionReason: critic.reason });
      continue;
    }

    selectedCards = selectedCards.filter((c) => normalizeOracleName(c.name) !== normalizeOracleName(cutCard.name));
    selectedCards.push(resolved.card);
    excludeNames.delete(normalizeOracleName(cutCard.name));
    excludeNames.add(normalizeOracleName(resolved.card.name));

    cardDecisions.push({
      decisionId: `dec-bracket-swap-${revision}-${cutCard.cardId}`,
      cardId: cutCard.cardId,
      cardName: cutCard.name,
      action: "CUT",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: proposal.reason,
      revision,
      replacedCardName: resolved.card.name,
    });
    cardDecisions.push({
      decisionId: `dec-bracket-add-${revision}-${resolved.card.cardId}`,
      cardId: resolved.card.cardId,
      cardName: resolved.card.name,
      action: "ADD",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: proposal.reason,
      revision,
    });

    accepted.push({ ...proposal, verified: true });
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

  const snapshot = computeDeckSnapshotV47({ state: nextState, catalog: args.catalog });
  const gap = analyzeBracketGapV410({
    plan: nextState.bracketBuildPlan ?? null,
    powerPlan: nextState.bracketPowerPlanV410 ?? null,
    snapshot,
    gameChangerCount: undefined,
    tutorCount: snapshot.tutorCount,
  });

  const updatedMission: BracketUpgradeMissionV411 = {
    ...args.mission,
    proposedSwaps: args.proposals,
    acceptedSwaps: [...args.mission.acceptedSwaps, ...accepted],
    rejectedSwaps: [...args.mission.rejectedSwaps, ...rejected],
    bracketGap: gap,
    status: accepted.length > 0 ? "SWAPPING" : args.mission.status,
  };

  return { state: nextState, mission: updatedMission, accepted, rejected };
}
