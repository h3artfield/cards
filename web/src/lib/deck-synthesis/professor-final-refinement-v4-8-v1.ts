/**
 * Final refinement — verify Head Professor swaps, Critic approval, execute mutations.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { paperMetaForOracle, isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import { resolveBenchmarkCommanderName } from "./benchmark-commander-resolver-v1";
import type { CouncilCardV46, CardDecisionV46 } from "./professor-council-assembly-v4-6-v1";
import type { CouncilTurnV45, DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import {
  computeDeckSnapshotV47,
  evaluateLegalityGateV47,
  type ProfessorCouncilStateV47,
} from "./professor-council-assembly-v4-7-v1";
import { buildFunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import type {
  ExecutedSwapV48,
  FinalDeckDoctorReviewV48,
  FinalDeckDoctorSwapV48,
} from "./professor-final-deck-doctor-v4-8-v1";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import { buildProfessorManaBaseLandNamesV48 } from "./professor-brew-deck-list-v4-3-v1";
import { discoverCatalogLandsV48 } from "./professor-mana-base-v4-8-v1";
import {
  isManaRelatedSwap,
  COMMANDER_MIN_LAND_COUNT_V48,
} from "./professor-final-refinement-gate-v4-8-v1";

export const PROFESSOR_FINAL_REFINEMENT_V4_8_V1_VERSION = "professor-final-refinement-v4-8-v1";

const MAX_HEAD_PROFESSOR_SWAPS = 30;

import {
  basicLandAllowsDuplicate,
  evaluateSingletonPool,
  isBasicLandName,
} from "./professor-commander-legality-v4-9-v1";
import { findCouncilCardByIdentity } from "./professor-canonical-card-identity-v4-15-1-v1";

function findSelectedByName(selected: CouncilCardV46[], name: string | null | undefined): CouncilCardV46 | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  return findCouncilCardByIdentity(selected, trimmed) ?? null;
}

function councilBasicLand(args: { name: string; revision: number; reason: string; slotKey: string }): CouncilCardV46 {
  return {
    cardId: `card-${args.slotKey}`,
    oracleId: null,
    name: args.name,
    proposedBy: "RESEARCH",
    origin: "ORACLE_SEARCH",
    proposalReason: args.reason,
    functions: ["land"],
    roles: ["land", "ramp"],
    packages: ["Mana Base"],
    engines: [],
    commanderDependence: "LOW",
    worksWithoutCommander: "HIGH",
    semanticConnections: ["mana-base"],
    oracleVerified: true,
    legalityVerified: true,
    colorIdentityVerified: true,
    criticStatus: "CHARTER_OK",
    status: "SELECTED",
    addedAtRevision: args.revision,
    lastReviewedRevision: args.revision,
    category: "land",
  };
}

function resolveLibraryAddCard(args: {
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
    const slotKey = `${args.name.toLowerCase().replace(/\s+/g, "-")}-${args.revision}-${args.excludeNames.size}`;
    return { ok: true, card: councilBasicLand({ name: args.name, revision: args.revision, reason: args.reason, slotKey }) };
  }

  const audit = resolveBenchmarkCommanderName(args.catalog, args.name);
  if (!audit.resolved || !audit.oracleId) {
    return { ok: false, reason: `Could not resolve "${args.name}" in catalog` };
  }
  const golden = args.catalog.byOracleId.get(audit.oracleId);
  if (!golden) return { ok: false, reason: `Oracle ID missing for ${args.name}` };
  if (!isCurrentlyCommanderLegal(golden)) {
    return { ok: false, reason: `${golden.canonicalName} not legal in Commander` };
  }
  if (!commanderLegalInIdentity(golden.colorIdentity ?? [], args.colorIdentity)) {
    return { ok: false, reason: `${golden.canonicalName} outside color identity` };
  }
  const paper = paperMetaForOracle(args.catalog, golden.oracleId);
  if (paper && !paper.paperEligible) {
    return { ok: false, reason: `${golden.canonicalName} not paper-eligible` };
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
      packages: ["Final Refinement"],
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

function criticApproveSwap(args: {
  swap: FinalDeckDoctorSwapV48;
  cutCard: CouncilCardV46;
  addCard: CouncilCardV46;
  charter: DeckCharterV45 | null;
  preserveNames: Set<string>;
}): { approved: boolean; reason: string } {
  if (args.preserveNames.has(normalizeOracleName(args.cutCard.name))) {
    return { approved: false, reason: `${args.cutCard.name} marked preserve-at-all-costs` };
  }
  if (args.cutCard.status === "CORE" && args.swap.priority !== "HIGH") {
    return { approved: false, reason: "Non-HIGH swap would cut a CORE card" };
  }
  return { approved: true, reason: "Swap preserves charter/bracket/legality constraints" };
}

function rankSwaps(review: FinalDeckDoctorReviewV48): FinalDeckDoctorSwapV48[] {
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return [...review.swaps].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]).slice(0, MAX_HEAD_PROFESSOR_SWAPS);
}

function scoreCutCandidate(card: CouncilCardV46): number {
  if (card.category === "land") return 1000;
  let score = (card.roles?.length ?? 0) * -1;
  if (card.commanderDependence === "HIGH") score -= 1;
  return score;
}

export function computeTargetLandCountV48(selected: CouncilCardV46[]): number {
  const nonlands = selected.filter((c) => c.category !== "land");
  const avgMv =
    nonlands.length > 0
      ? nonlands.reduce((sum, c) => sum + (c.roles.includes("ramp") ? 0 : 3), 0) / nonlands.length
      : 3;
  let target = 36;
  if (avgMv >= 3.2) target += 1;
  if (avgMv >= 3.8) target += 2;
  return Math.min(42, Math.max(33, target));
}

function trySubstituteAddForNeed(args: {
  swap: FinalDeckDoctorSwapV48;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  excludeNames: Set<string>;
  revision: number;
  rejectedReason: string;
}): { ok: true; card: CouncilCardV46; substituteReason: string } | { ok: false; reason: string } {
  if (!isManaRelatedSwap(args.swap.add, args.swap.reason, args.swap.expectedImprovement)) {
    return { ok: false, reason: args.rejectedReason };
  }

  const catalogLands = discoverCatalogLandsV48({
    catalog: args.catalog,
    colorIdentity: args.colorIdentity,
    excludeNames: args.excludeNames,
    maxCount: 5,
  });
  const basicNames = buildProfessorManaBaseLandNamesV48({
    colorIdentity: args.colorIdentity,
    existingNames: [...args.excludeNames],
    count: 5,
  });
  const candidates = [...catalogLands.map((l) => l.canonicalName), ...basicNames];

  for (const name of candidates) {
    if (normalizeOracleName(name) === normalizeOracleName(args.swap.add)) continue;
    const resolved = resolveLibraryAddCard({
      catalog: args.catalog,
      name,
      colorIdentity: args.colorIdentity,
      excludeNames: args.excludeNames,
      revision: args.revision,
      reason: `Substitute for rejected ${args.swap.add}: ${args.swap.reason}`,
    });
    if (resolved.ok) {
      return {
        ok: true,
        card: resolved.card,
        substituteReason: `Research substitute (${args.swap.add} rejected: ${args.rejectedReason}) → ${resolved.card.name}`,
      };
    }
  }

  return { ok: false, reason: args.rejectedReason };
}

function applyManaStructuralRepairs(args: {
  selected: CouncilCardV46[];
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  revision: number;
  targetLandCount: number;
  maxRepairs: number;
  executed: ExecutedSwapV48[];
  rejected: { card: string; reason: string }[];
}): CouncilCardV46[] {
  let selected = [...args.selected];
  const landCount = () => selected.filter((c) => c.category === "land").length;
  const excludeNames = new Set(selected.map((c) => normalizeOracleName(c.name)));
  let repairs = 0;

  while (landCount() < args.targetLandCount && repairs < args.maxRepairs) {
    const cutCandidates = selected
      .filter((c) => c.category !== "land" && c.status !== "CORE")
      .sort((a, b) => scoreCutCandidate(a) - scoreCutCandidate(b));
    const cutCard = cutCandidates[0];
    if (!cutCard) break;

    const landNames = buildProfessorManaBaseLandNamesV48({
      colorIdentity: args.colorIdentity,
      existingNames: [...excludeNames],
      count: 6,
    });
    const catalogLands = discoverCatalogLandsV48({
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      excludeNames,
      maxCount: 12,
    });
    const candidateNames = [...catalogLands.map((land) => land.canonicalName), ...landNames];

    let resolved: ReturnType<typeof resolveLibraryAddCard> = { ok: false, reason: "No land candidates" };
    for (const addName of candidateNames) {
      resolved = resolveLibraryAddCard({
        catalog: args.catalog,
        name: addName,
        colorIdentity: args.colorIdentity,
        excludeNames,
        revision: args.revision,
        reason: `Structural mana repair — raise land count toward ${args.targetLandCount}`,
      });
      if (resolved.ok) break;
    }
    if (!resolved.ok) break;

    const cutIdx = selected.findIndex((c) => c.cardId === cutCard.cardId);
    if (cutIdx < 0) break;
    selected.splice(cutIdx, 1, resolved.card);
    excludeNames.delete(normalizeOracleName(cutCard.name));
    excludeNames.add(normalizeOracleName(resolved.card.name));

    args.executed.push({
      cut: cutCard.name,
      add: resolved.card.name,
      reason: `Mana structural repair (${landCount()}/${args.targetLandCount} lands)`,
      recommendedBy: "STRUCTURAL_REPAIR",
      verifiedBy: "RESEARCH",
      approvedBy: "CRITIC",
      expectedImprovement: ["mana stability"],
      status: "ACCEPTED",
    });
    repairs++;
  }

  return selected;
}

export function executeFinalRefinementV48(args: {
  review: FinalDeckDoctorReviewV48;
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
  charter: DeckCharterV45 | null;
  dossierLandCount: number;
}): {
  state: ProfessorCouncilStateV47;
  executed: ExecutedSwapV48[];
  rejected: { card: string; reason: string }[];
} {
  const preserveNames = new Set(args.review.preserveAtAllCosts.map((n) => normalizeOracleName(n)));
  let selected = [...args.state.selectedCards];
  const executed: ExecutedSwapV48[] = [];
  const rejected: { card: string; reason: string }[] = [];
  const excludeNames = new Set(selected.map((c) => normalizeOracleName(c.name)));
  const revision = args.state.assemblyRevision + 1;
  const cardDecisions: CardDecisionV46[] = [...args.state.cardDecisions];
  const conversation: CouncilTurnV45[] = [...args.state.conversation];
  let turnCounter = conversation.length;

  conversation.push({
    turnId: `t-${turnCounter++}`,
    phase: "FINAL",
    speaker: "CREATIVE",
    intent: "PROPOSE",
    respondsToTurnIds: [],
    message: args.review.overallAssessment.slice(0, 400),
    developerDetail: `Head Professor (${args.review.model}) final deck review`,
  });
  const tHead = conversation[conversation.length - 1]!.turnId;

  for (let swap of rankSwaps(args.review)) {
    if (!swap.cut?.trim() || !swap.add?.trim()) {
      rejected.push({ card: swap.cut || swap.add || "(invalid swap)", reason: "Missing cut or add card name" });
      executed.push({
        cut: swap.cut ?? "",
        add: swap.add ?? "",
        reason: swap.reason,
        recommendedBy: "HEAD_PROFESSOR",
        verifiedBy: "REJECTED",
        approvedBy: "REJECTED",
        expectedImprovement: swap.expectedImprovement,
        status: "REJECTED",
        rejectionReason: "Missing cut or add card name",
      });
      continue;
    }

    const cutCard = findSelectedByName(selected, swap.cut);
    if (!cutCard) {
      rejected.push({ card: swap.cut, reason: "Cut target not in deck" });
      executed.push({
        cut: swap.cut,
        add: swap.add,
        reason: swap.reason,
        recommendedBy: "HEAD_PROFESSOR",
        verifiedBy: "REJECTED",
        approvedBy: "REJECTED",
        expectedImprovement: swap.expectedImprovement,
        status: "REJECTED",
        rejectionReason: "Cut target not in deck",
      });
      continue;
    }

    let resolved = resolveLibraryAddCard({
      catalog: args.catalog,
      name: swap.add,
      colorIdentity: args.colorIdentity,
      excludeNames,
      revision,
      reason: swap.reason,
    });
    if (!resolved.ok) {
      const substitute = trySubstituteAddForNeed({
        swap,
        catalog: args.catalog,
        colorIdentity: args.colorIdentity,
        excludeNames,
        revision,
        rejectedReason: resolved.reason,
      });
      if (substitute.ok) {
        resolved = { ok: true, card: substitute.card };
        swap = { ...swap, reason: substitute.substituteReason };
      }
    }
    if (!resolved.ok) {
      rejected.push({ card: swap.add, reason: resolved.reason });
      executed.push({
        cut: swap.cut,
        add: swap.add,
        reason: swap.reason,
        recommendedBy: "HEAD_PROFESSOR",
        verifiedBy: "REJECTED",
        approvedBy: "REJECTED",
        expectedImprovement: swap.expectedImprovement,
        status: "REJECTED",
        rejectionReason: resolved.reason,
      });
      continue;
    }

    const critic = criticApproveSwap({
      swap,
      cutCard,
      addCard: resolved.card,
      charter: args.charter,
      preserveNames,
    });
    if (!critic.approved) {
      rejected.push({ card: swap.add, reason: critic.reason });
      executed.push({
        cut: swap.cut,
        add: swap.add,
        reason: swap.reason,
        recommendedBy: "HEAD_PROFESSOR",
        verifiedBy: "RESEARCH",
        approvedBy: "REJECTED",
        expectedImprovement: swap.expectedImprovement,
        status: "REJECTED",
        rejectionReason: critic.reason,
      });
      continue;
    }

    conversation.push({
      turnId: `t-${turnCounter++}`,
      phase: "FINAL",
      speaker: "RESEARCH",
      intent: "VERIFY",
      respondsToTurnIds: [tHead],
      message: `Verified ${resolved.card.name} — legal library card replacing ${cutCard.name}: ${swap.reason.slice(0, 160)}`,
    });
    conversation.push({
      turnId: `t-${turnCounter++}`,
      phase: "FINAL",
      speaker: "CRITIC",
      intent: "DECIDE",
      respondsToTurnIds: [conversation[conversation.length - 1]!.turnId],
      message: critic.reason,
    });

    const cutIdx = selected.findIndex((c) => c.cardId === cutCard.cardId);
    if (cutIdx >= 0) {
      selected.splice(cutIdx, 1, resolved.card);
      excludeNames.delete(normalizeOracleName(cutCard.name));
      excludeNames.add(normalizeOracleName(resolved.card.name));
    }

    cardDecisions.push({
      decisionId: `dec-refine-${revision}-${cutCard.oracleId ?? cutCard.cardId}`,
      cardId: resolved.card.cardId,
      cardName: resolved.card.name,
      action: "REPLACE",
      proposedBy: "CREATIVE",
      supportingCouncilTurnIds: [tHead],
      reason: swap.reason,
      replacedCardName: cutCard.name,
      revision,
    });

    executed.push({
      cut: cutCard.name,
      add: resolved.card.name,
      reason: swap.reason,
      recommendedBy: "HEAD_PROFESSOR",
      verifiedBy: "RESEARCH",
      approvedBy: "CRITIC",
      expectedImprovement: swap.expectedImprovement,
      status: "ACCEPTED",
    });
  }

  const targetLandCount = computeTargetLandCountV48(selected);
  const currentLandCount = selected.filter((c) => c.category === "land").length;
  const repairTarget = Math.max(targetLandCount, COMMANDER_MIN_LAND_COUNT_V48);
  const needsManaRepair =
    currentLandCount < COMMANDER_MIN_LAND_COUNT_V48 ||
    (args.review.requiresMajorRevision && currentLandCount < repairTarget);
  if (needsManaRepair) {
    selected = applyManaStructuralRepairs({
      selected,
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      revision,
      targetLandCount: repairTarget,
      maxRepairs: args.review.requiresMajorRevision ? 12 : 8,
      executed,
      rejected,
    });
  }

  const functionalProfiles: Record<string, ReturnType<typeof buildFunctionalCardProfileV47>> = {};
  for (const card of selected) {
    if (card.oracleId) {
      const golden = args.catalog.byOracleId.get(card.oracleId);
      if (golden) functionalProfiles[card.oracleId] = buildFunctionalCardProfileV47(golden);
    }
  }

  const freshSnapshot = computeDeckSnapshotV47({
    state: { ...args.state, selectedCards: selected, functionalProfiles, assemblyRevision: revision },
    catalog: args.catalog,
  });

  let nextState: ProfessorCouncilStateV47 = {
    ...args.state,
    selectedCards: selected,
    cardDecisions,
    conversation,
    assemblyRevision: revision,
    buildPhase: "FINAL_REFINEMENT",
    functionalProfiles,
    snapshots: [freshSnapshot],
  };

  nextState.buildPhase = "FINAL_LEGALITY";
  nextState.legalityGate = evaluateLegalityGateV47({ state: nextState, commanderName: args.commanderName });

  return { state: nextState, executed, rejected };
}

export function summarizeRefinement(executed: ExecutedSwapV48[]): {
  recommended: number;
  accepted: number;
  rejected: number;
  keyImprovements: string[];
} {
  const accepted = executed.filter((s) => s.status === "ACCEPTED");
  const improvements = new Set<string>();
  for (const swap of accepted) {
    for (const imp of swap.expectedImprovement) improvements.add(imp);
  }
  return {
    recommended: executed.length,
    accepted: accepted.length,
    rejected: executed.length - accepted.length,
    keyImprovements: [...improvements].slice(0, 8),
  };
}

export function mergeHeadProfessorSummaryV48(
  review: FinalDeckDoctorReviewV48,
  refinementSummary: ReturnType<typeof summarizeRefinement>,
): ReturnType<typeof summarizeRefinement> {
  const merged: string[] = [];
  for (const item of [...review.keyImprovements, ...refinementSummary.keyImprovements]) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (merged.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) continue;
    merged.push(trimmed);
  }
  return {
    ...refinementSummary,
    keyImprovements: merged.slice(0, 8),
  };
}
