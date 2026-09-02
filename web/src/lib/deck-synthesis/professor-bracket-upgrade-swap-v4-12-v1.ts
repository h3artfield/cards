/**
 * Bracket upgrade swap proposals + execution v4.12.
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import { combinedGoldenOracleText } from "../../../scripts/lib/load-golden-catalog-index";
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
import { basicLandAllowsDuplicate, isBasicLandName } from "./professor-commander-legality-v4-9-v1";
import type { BracketDragSlotV412 } from "./professor-bracket-drag-slot-v4-12-v1";
import { findCardInDeck } from "./professor-bracket-drag-slot-v4-12-v1";
import { classifyTutorCardV411 } from "./professor-tutor-discovery-v4-11-v1";
import { rankTutorsForDeckV412, type RankedTutorCandidateV412 } from "./professor-tutor-ranking-v4-12-v1";
import type { GameChangerEvaluationV411 } from "./professor-game-changer-discovery-v4-11-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import { recomputeFinalDeckSnapshotV411 } from "./professor-final-deck-canonical-v4-11-v1";

export const PROFESSOR_BRACKET_UPGRADE_SWAP_V4_12_V1_VERSION = "professor-bracket-upgrade-swap-v4-12-v1";

export const BRACKET_UPGRADE_BATCH_SIZE_V412 = 8;

export type BracketUpgradeSwapProposalV412 = {
  version: typeof PROFESSOR_BRACKET_UPGRADE_SWAP_V4_12_V1_VERSION;
  proposalId: string;
  cut: string;
  cutCardId: string;
  add: string;
  cutReason: string;
  addReason: string;
  roleLost: string[];
  roleGained: string[];
  rolePreserved: string[];
  deficitsImproved: string[];
  expectedBracketImpact: string;
  expectedDeckImpact: string;
  researchEvidence: string[];
  dragSlotId: string;
  criticApproved: boolean;
  criticRejectionReason?: string;
};

const FAST_MANA_RE = /sol ring|mana crypt|dockside|chrome mox|mox diamond|jeweled lotus|lotus petal|grim monolith|mana vault|ancient tomb|ritual|seething/i;
const INTERACTION_RE = /destroy target|exile target|counter target|instant|flash/i;
const RAMP_RE = /add \{|\btutor\b|search your library|ramp|cultivate|farseek|nature's lore|three visits/i;

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
  if (!audit.resolved || !audit.oracleId) return { ok: false, reason: `Could not resolve "${args.name}"` };
  const golden = args.catalog.byOracleId.get(audit.oracleId);
  if (!golden || !isCurrentlyCommanderLegal(golden)) return { ok: false, reason: `${args.name} not legal` };
  if (!commanderLegalInIdentity(golden.colorIdentity ?? [], args.colorIdentity)) {
    return { ok: false, reason: `${args.name} outside color identity` };
  }
  const paper = paperMetaForOracle(args.catalog, golden.oracleId);
  if (paper && !paper.paperEligible) return { ok: false, reason: `${args.name} not paper-eligible` };
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

function discoverCandidatesForRole(args: {
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  excludeNames: Set<string>;
  role: string;
  bracket: CommanderBracket;
  charterKeywords: string[];
  tutors: RankedTutorCandidateV412[];
  gameChangers: GameChangerEvaluationV411[];
}): { name: string; reason: string; roles: string[]; evidence: string }[] {
  const r = args.role.toLowerCase();
  const out: { name: string; reason: string; roles: string[]; evidence: string }[] = [];

  if (/tutor|access|search|consistency/i.test(r)) {
    for (const t of args.tutors.slice(0, 8)) {
      out.push({ name: t.name, reason: t.reason, roles: ["tutor"], evidence: `tutor rank deckScore=${t.deckScore}` });
    }
  }

  if (/game changer|gc/i.test(r)) {
    for (const g of args.gameChangers.filter((x) => x.selected && !x.rejectionReason).slice(0, 4)) {
      out.push({
        name: g.card,
        reason: g.reasonRelevant,
        roles: g.role.split("+"),
        evidence: `GC bracketContribution=${g.bracketPowerContribution}`,
      });
    }
  }

  for (const [, card] of args.catalog.byOracleId.entries()) {
    if (!isCurrentlyCommanderLegal(card)) continue;
    if (!commanderLegalInIdentity(card.colorIdentity ?? [], args.colorIdentity)) continue;
    if (args.excludeNames.has(card.canonicalName.toLowerCase())) continue;
    const text = combinedGoldenOracleText(card).toLowerCase();
    const profile = buildFunctionalCardProfileV47(card);
    const tl = (card.typeLine ?? "").toLowerCase();
    if (/\bland\b/.test(tl) && !/\bcreature\b|\bartifact\b/.test(tl)) continue;

    let match = false;
    if (/acceler|ramp|fast mana|premium acceleration/i.test(r) && (RAMP_RE.test(text) || FAST_MANA_RE.test(card.canonicalName.toLowerCase()))) {
      match = true;
    }
    if (/interaction|removal|counter/i.test(r) && (INTERACTION_RE.test(text) || profile.roles.includes("interaction"))) {
      match = true;
    }
    if (/protection/i.test(r) && profile.roles.includes("protection")) match = true;
    if (/draw|velocity|card advantage/i.test(r) && profile.roles.includes("card-advantage")) match = true;
    if (/finisher|win|compact|engine/i.test(r) && (profile.roles.includes("finisher") || profile.roles.includes("sacrifice-outlet") || profile.roles.includes("token-generation"))) {
      match = true;
    }

    if (match) {
      out.push({
        name: card.canonicalName,
        reason: `Matches ${args.role}`,
        roles: profile.roles,
        evidence: `oracle scan · MV${card.manaValue ?? "?"}`,
      });
    }
  }

  const seen = new Set<string>();
  return out.filter((c) => {
    const k = c.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function criticEvaluateSwapV412(args: {
  cut: CouncilCardV46;
  add: CouncilCardV46;
  selectedAfterCut: CouncilCardV46[];
  charter: DeckCharterV45 | null;
  slot: BracketDragSlotV412;
}): { approved: boolean; reason: string; rolePreserved: string[] } {
  if (args.cut.status === "CORE") {
    return { approved: false, reason: "Cannot cut CORE card", rolePreserved: [] };
  }

  for (const mustPreserve of args.slot.rolesThatMustBePreserved) {
    const stillInDeck = args.selectedAfterCut.some((c) => c.roles.includes(mustPreserve));
    const cutRemoves = args.cut.roles.includes(mustPreserve);
    const addReplaces = args.add.roles.includes(mustPreserve);
    if (cutRemoves && !addReplaces && !stillInDeck) {
      return {
        approved: false,
        reason: `Cut removes only source of ${mustPreserve} — find another cut slot`,
        rolePreserved: [],
      };
    }
  }

  const essential = ["sacrifice-outlet", "interaction"] as const;
  for (const role of essential) {
    if (args.cut.roles.includes(role) && !args.add.roles.includes(role)) {
      const remaining = args.selectedAfterCut.filter((c) => c.roles.includes(role)).length;
      if (remaining < 2) {
        return {
          approved: false,
          reason: `Cut thins ${role} below minimum (${remaining} remaining after cut)`,
          rolePreserved: [],
        };
      }
    }
  }

  if (args.charter?.avoidPatterns.some((p) => args.add.name.toLowerCase().includes(p.toLowerCase().slice(0, 6)))) {
    return { approved: false, reason: "Addition matches charter avoid pattern", rolePreserved: [] };
  }

  const preserved = args.slot.rolesThatMustBePreserved.filter((r) =>
    args.selectedAfterCut.some((c) => c.roles.includes(r)),
  );
  return { approved: true, reason: "Net change improves bracket alignment without critical role loss", rolePreserved: preserved };
}

export function buildSwapProposalsForSlotsV412(args: {
  slots: BracketDragSlotV412[];
  selectedCards: CouncilCardV46[];
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  bracket: CommanderBracket;
  charterKeywords: string[];
  powerPlan: BracketPowerPlanV410 | null;
  gameChangers: GameChangerEvaluationV411[];
  maxProposals?: number;
}): BracketUpgradeSwapProposalV412[] {
  const excludeNames = new Set(args.selectedCards.map((c) => c.name.toLowerCase()));
  const tutorCards: import("@/lib/deck-builder/golden-catalog/schemas").GoldenCatalogOracleCard[] = [];
  for (const [, card] of args.catalog.byOracleId.entries()) {
    if (classifyTutorCardV411(card) && commanderLegalInIdentity(card.colorIdentity ?? [], args.colorIdentity)) {
      if (!excludeNames.has(card.canonicalName.toLowerCase())) tutorCards.push(card);
    }
  }
  const rankedTutors = rankTutorsForDeckV412(tutorCards, {
    charterKeywords: args.charterKeywords,
    bracket: args.bracket,
  });

  const proposals: BracketUpgradeSwapProposalV412[] = [];
  const usedAdds = new Set<string>();
  const usedCuts = new Set<string>();

  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sorted = [...args.slots].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  for (const slot of sorted) {
    if (proposals.length >= (args.maxProposals ?? BRACKET_UPGRADE_BATCH_SIZE_V412)) break;
    const cutCard = findCardInDeck(args.selectedCards, slot);
    if (!cutCard || usedCuts.has(cutCard.cardId)) continue;

    const roles = slot.desiredReplacementRole.length > 0 ? slot.desiredReplacementRole : ["compact engine piece"];
    let bestAdd: { name: string; reason: string; roles: string[]; evidence: string } | null = null;

    for (const role of roles) {
      const candidates = discoverCandidatesForRole({
        catalog: args.catalog,
        colorIdentity: args.colorIdentity,
        excludeNames,
        role,
        bracket: args.bracket,
        charterKeywords: args.charterKeywords,
        tutors: rankedTutors,
        gameChangers: args.gameChangers.map((g) => ({
          ...g,
          currentCardToReplace: slot.cardName,
        })) as GameChangerEvaluationV411[],
      });
      const pick = candidates.find((c) => !usedAdds.has(c.name.toLowerCase()));
      if (pick) {
        bestAdd = pick;
        break;
      }
    }

    if (!bestAdd) continue;

    proposals.push({
      version: PROFESSOR_BRACKET_UPGRADE_SWAP_V4_12_V1_VERSION,
      proposalId: `swap-${slot.dragSlotId}`,
      cut: cutCard.name,
      cutCardId: cutCard.cardId,
      add: bestAdd.name,
      cutReason: slot.dragReason,
      addReason: bestAdd.reason,
      roleLost: cutCard.roles,
      roleGained: bestAdd.roles,
      rolePreserved: slot.rolesThatMustBePreserved,
      deficitsImproved: slot.bracketDeficitAddressed,
      expectedBracketImpact: `Address ${slot.bracketDeficitAddressed.join(", ")}`,
      expectedDeckImpact: `Replace filler with ${bestAdd.name}`,
      researchEvidence: [bestAdd.evidence],
      dragSlotId: slot.dragSlotId,
      criticApproved: false,
    });
    usedCuts.add(cutCard.cardId);
    usedAdds.add(bestAdd.name.toLowerCase());
  }

  return proposals;
}

export function executeBracketUpgradeSwapsV412(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
  charter: DeckCharterV45 | null;
  proposals: BracketUpgradeSwapProposalV412[];
  slotsById: Map<string, BracketDragSlotV412>;
}): {
  state: ProfessorCouncilStateV47;
  accepted: BracketUpgradeSwapProposalV412[];
  rejected: BracketUpgradeSwapProposalV412[];
} {
  let selectedCards = [...args.state.selectedCards];
  const cardDecisions: CardDecisionV46[] = [...args.state.cardDecisions];
  const revision = args.state.assemblyRevision + 1;
  const excludeNames = new Set(selectedCards.map((c) => normalizeOracleName(c.name)));
  const accepted: BracketUpgradeSwapProposalV412[] = [];
  const rejected: BracketUpgradeSwapProposalV412[] = [];

  for (const proposal of args.proposals) {
    const cutCard = findCardInDeck(selectedCards, { cardId: proposal.cutCardId, cardName: proposal.cut });
    if (!cutCard) {
      rejected.push({ ...proposal, criticApproved: false, criticRejectionReason: "Cut card not in deck" });
      continue;
    }

    const resolved = resolveAddCard({
      catalog: args.catalog,
      name: proposal.add,
      colorIdentity: args.colorIdentity,
      excludeNames,
      revision,
      reason: proposal.addReason,
    });
    if (!resolved.ok) {
      rejected.push({ ...proposal, criticApproved: false, criticRejectionReason: resolved.reason });
      continue;
    }

    const selectedAfterCut = selectedCards.filter((c) => c.cardId !== cutCard.cardId);
    const slot = args.slotsById.get(proposal.dragSlotId) ?? {
      dragSlotId: proposal.dragSlotId,
      rolesThatMustBePreserved: proposal.rolePreserved,
    } as BracketDragSlotV412;

    const critic = criticEvaluateSwapV412({
      cut: cutCard,
      add: resolved.card,
      selectedAfterCut,
      charter: args.charter,
      slot,
    });
    if (!critic.approved) {
      rejected.push({ ...proposal, criticApproved: false, criticRejectionReason: critic.reason });
      continue;
    }

    selectedCards = selectedAfterCut;
    selectedCards.push(resolved.card);
    excludeNames.delete(normalizeOracleName(cutCard.name));
    excludeNames.add(normalizeOracleName(resolved.card.name));

    cardDecisions.push({
      decisionId: `dec-v412-cut-${revision}-${cutCard.cardId}`,
      cardId: cutCard.cardId,
      cardName: cutCard.name,
      action: "CUT",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: proposal.cutReason,
      revision,
      replacedCardName: resolved.card.name,
    });
    cardDecisions.push({
      decisionId: `dec-v412-add-${revision}-${resolved.card.cardId}`,
      cardId: resolved.card.cardId,
      cardName: resolved.card.name,
      action: "ADD",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: proposal.addReason,
      revision,
    });

    accepted.push({
      ...proposal,
      rolePreserved: critic.rolePreserved,
      criticApproved: true,
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

  return { state: nextState, accepted, rejected };
}

export function discoverTutorsForMissionV412(args: {
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  excludeNames: Set<string>;
  bracket: CommanderBracket;
  charterKeywords: string[];
}): RankedTutorCandidateV412[] {
  const cards: import("@/lib/deck-builder/golden-catalog/schemas").GoldenCatalogOracleCard[] = [];
  for (const [, card] of args.catalog.byOracleId.entries()) {
    if (!isCurrentlyCommanderLegal(card)) continue;
    if (!commanderLegalInIdentity(card.colorIdentity ?? [], args.colorIdentity)) continue;
    if (args.excludeNames.has(card.canonicalName.toLowerCase())) continue;
    if (classifyTutorCardV411(card)) cards.push(card);
  }
  return rankTutorsForDeckV412(cards, { charterKeywords: args.charterKeywords, bracket: args.bracket }).slice(0, 12);
}
