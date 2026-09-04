/**
 * P4 + P5 — Hard pre-Head-Professor gate and validation evidence split (v1.1.1).
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import { isCanonicalLandForDeckPartition } from "./professor-canonical-deck-partition-v1";
import { basicLandColorIdentity, isBasicLandName, evaluateSingletonPool } from "./professor-commander-legality-v4-9-v1";
import { normalizeCardNameForMatch } from "./professor-canonical-card-identity-v4-15-1-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import {
  candidateDictionaryOracleIdSet,
  landOracleIdSet,
  type IdentityResolutionLedgerEntryV111,
} from "./professor-sol-directed-candidate-hydration-v1-1-1";
import type {
  CanonicalCardFactsV11,
  LandPoolV11,
  RetrievalContractV11,
  SolDirectedConstructedDeckV11,
} from "./professor-sol-directed-types-v1-1";
import type { SolDirectedValidationV1 } from "./professor-sol-directed-types-v1";

export const PROFESSOR_SOL_DIRECTED_PRE_HEAD_PROFESSOR_GATE_V1_1_1_VERSION =
  "professor-sol-directed-pre-head-professor-gate-v1-1-1";

export type ArchitectRequirementRealizationV111 = {
  counts: Record<string, number>;
  expected: Record<string, number>;
  pass: boolean;
  mismatches: string[];
};

export type LegacyHeuristicAuditV111 = {
  label: "NON_AUTHORITATIVE_DIAGNOSTIC";
  ramp: number;
  draw: number;
  interaction: number;
  protection: number;
  tutorsAccess: number;
  averageMv: number;
  note: string;
};

export type SolDirectedValidationV111 = SolDirectedValidationV1 & {
  architectRequirementRealization: ArchitectRequirementRealizationV111;
  legacyHeuristicAudit: LegacyHeuristicAuditV111;
  candidateTracePass: boolean;
  identityLedgerErrors: string[];
};

function computeArchitectRequirementRealization(args: {
  deck: SolDirectedConstructedDeckV11;
  contract: RetrievalContractV11;
}): ArchitectRequirementRealizationV111 {
  const counts: Record<string, number> = {};
  const expected: Record<string, number> = {};
  for (const requirement of args.contract.cardRequirements) {
    counts[requirement.requirementId] = 0;
    expected[requirement.requirementId] = requirement.requestedCount;
  }
  for (const card of args.deck.nonlands) {
    const id = card.primaryArchitectRequirement;
    if (id in counts) counts[id] += 1;
  }
  const mismatches = args.contract.cardRequirements
    .filter((requirement) => counts[requirement.requirementId] !== requirement.requestedCount)
    .map(
      (requirement) =>
        `${requirement.requirementId}:${counts[requirement.requirementId] ?? 0}!=${requirement.requestedCount}`,
    );
  return {
    counts,
    expected,
    pass: mismatches.length === 0,
    mismatches,
  };
}

function computeLegacyHeuristicAudit(
  resolvedNonlands: Array<{ oracleText: string; manaValue: number | null }>,
): LegacyHeuristicAuditV111 {
  const hay = (text: string) => text.toLowerCase();
  return {
    label: "NON_AUTHORITATIVE_DIAGNOSTIC",
    ramp: resolvedNonlands.filter((card) => /\badd \{/.test(hay(card.oracleText))).length,
    draw: resolvedNonlands.filter((card) => /draw (a|one|two|three|\d+) card|draws .* card/.test(hay(card.oracleText)))
      .length,
    interaction: resolvedNonlands.filter((card) => /destroy target|exile target|counter target/.test(hay(card.oracleText)))
      .length,
    protection: resolvedNonlands.filter((card) => /hexproof|indestructible|protection from/.test(hay(card.oracleText)))
      .length,
    tutorsAccess: resolvedNonlands.filter((card) => /search your library/.test(hay(card.oracleText))).length,
    averageMv:
      resolvedNonlands.length > 0
        ? resolvedNonlands.reduce((sum, card) => sum + (card.manaValue ?? 0), 0) / resolvedNonlands.length
        : 0,
    note:
      "Legacy regex audit only. Does not reflect Architect requirement allocations or strategic tutor policy. Land-ramp searches must not be treated as strategic tutors.",
  };
}

export function validateSolDirectedDeckV111(args: {
  deck: SolDirectedConstructedDeckV11;
  catalog: DeckResolutionCatalog;
  contract: RetrievalContractV11;
  candidateDictionary: Record<string, CanonicalCardFactsV11>;
  landPool: LandPoolV11;
  identityLedger: IdentityResolutionLedgerEntryV111[];
  prohibitedOracleIds?: string[];
}): SolDirectedValidationV111 {
  const violations: string[] = [];
  const identityLedgerErrors = args.identityLedger
    .filter((entry) => entry.error)
    .map((entry) => `${entry.error}:${entry.selectionName}`);
  violations.push(...identityLedgerErrors);

  const prohibited = new Set(args.prohibitedOracleIds ?? []);
  const allowedNonlands = candidateDictionaryOracleIdSet(args.candidateDictionary);
  const allowedLands = landOracleIdSet(args.landPool);
  const resolvedNonlands: Array<{ name: string; oracleText: string; manaValue: number | null; oracleId: string }> = [];

  for (const card of args.deck.nonlands) {
    if (!card.oracleId) violations.push(`MISSING_ORACLE_ID:${card.name}`);
    if (card.oracleId && !allowedNonlands.has(card.oracleId)) {
      violations.push(`NONLAND_NOT_IN_CANDIDATE_DICTIONARY:${card.name}:${card.oracleId}`);
    }

    const truth = resolveCanonicalCardTruthV4164({
      name: card.name,
      oracleId: card.oracleId || undefined,
      catalog: args.catalog,
    });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) {
      violations.push(`UNRESOLVED_NONLAND:${card.name}`);
      continue;
    }
    if (truth.oracleId && truth.oracleId !== card.oracleId) {
      violations.push(`ORACLE_ID_DRIFT:${card.name}:${card.oracleId}->${truth.oracleId}`);
    }
    if (prohibited.has(truth.oracleId!)) violations.push(`GUARDRAIL_PROHIBITED:${card.name}`);
    if (isCanonicalLandForDeckPartition(truth)) violations.push(`LAND_IN_NONLANDS:${card.name}`);
    if (!isCurrentlyCommanderLegal(args.catalog.byOracleId.get(truth.oracleId!)!)) {
      violations.push(`ILLEGAL:${card.name}`);
    }
    if (!commanderLegalInIdentity(truth.colorIdentity, args.deck.commander.colorIdentity)) {
      violations.push(`OFF_COLOR:${card.name}`);
    }
    if (!card.primaryArchitectRequirement?.trim()) {
      violations.push(`MISSING_PRIMARY_REQUIREMENT:${card.name}`);
    }
    resolvedNonlands.push({
      name: truth.name,
      oracleText: truth.oracleText,
      manaValue: truth.manaValue,
      oracleId: truth.oracleId!,
    });
  }

  const landNamesExpanded: string[] = [];
  const landLedgerByName = new Map(
    args.identityLedger
      .filter((entry) => entry.resolutionSource === "LAND_POOL")
      .map((entry) => [normalizeCardNameForMatch(entry.selectionName), entry] as const),
  );

  for (const land of args.deck.lands) {
    const ledgerEntry = landLedgerByName.get(normalizeCardNameForMatch(land.name));
    const truth = resolveCanonicalCardTruthV4164({
      name: land.name,
      oracleId: ledgerEntry?.resolvedOracleId ?? undefined,
      catalog: args.catalog,
    });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) {
      violations.push(`UNRESOLVED_LAND:${land.name}`);
      continue;
    }
    if (!isCanonicalLandForDeckPartition(truth)) violations.push(`NONLAND_IN_LANDS:${land.name}`);
    if (truth.oracleId && !allowedLands.has(truth.oracleId) && !isBasicLandName(truth.name)) {
      violations.push(`LAND_NOT_IN_LAND_POOL:${land.name}:${truth.oracleId}`);
    }
    if (ledgerEntry?.resolvedOracleId && truth.oracleId !== ledgerEntry.resolvedOracleId) {
      violations.push(`LAND_ORACLE_ID_DRIFT:${land.name}:${ledgerEntry.resolvedOracleId}->${truth.oracleId}`);
    }
    if (prohibited.has(truth.oracleId!)) violations.push(`GUARDRAIL_LAND:${land.name}`);
    const landColorIdentity = isBasicLandName(truth.name)
      ? basicLandColorIdentity(truth.name)
      : truth.colorIdentity;
    if (!commanderLegalInIdentity(landColorIdentity, args.deck.commander.colorIdentity)) {
      violations.push(`OFF_COLOR_LAND:${land.name}`);
    }
    if (!isBasicLandName(truth.name) && land.copies > 1) {
      violations.push(`NONBASIC_DUPLICATE:${land.name}x${land.copies}`);
    }
    if (!isCurrentlyCommanderLegal(args.catalog.byOracleId.get(truth.oracleId!)!)) {
      violations.push(`ILLEGAL_LAND:${land.name}`);
    }
    for (let i = 0; i < land.copies; i += 1) landNamesExpanded.push(truth.name);
  }

  const libraryCount = resolvedNonlands.length + landNamesExpanded.length;
  if (libraryCount !== COMMANDER_DECK_LIBRARY_SIZE_V47) {
    violations.push(`LIBRARY_COUNT:${libraryCount}!=${COMMANDER_DECK_LIBRARY_SIZE_V47}`);
  }
  const landCount = landNamesExpanded.length;
  if (landCount !== args.contract.landSlotsRequired) {
    violations.push(`LAND_COUNT:${landCount}!=${args.contract.landSlotsRequired}`);
  }
  if (resolvedNonlands.length !== args.contract.nonlandSlotsRequired) {
    violations.push(`NONLAND_COUNT:${resolvedNonlands.length}!=${args.contract.nonlandSlotsRequired}`);
  }

  const singleton = evaluateSingletonPool([
    ...resolvedNonlands.map((card) => card.name),
    ...landNamesExpanded.filter((name) => !isBasicLandName(name)),
  ]);
  if (!singleton.pass) violations.push(`DUPLICATES:${singleton.duplicateNonBasics.join(",")}`);

  const architectRequirementRealization = computeArchitectRequirementRealization({
    deck: args.deck,
    contract: args.contract,
  });
  if (!architectRequirementRealization.pass) {
    violations.push(`ARCHITECT_COUNTS:${architectRequirementRealization.mismatches.join(",")}`);
  }

  const legacyHeuristicAudit = computeLegacyHeuristicAudit(resolvedNonlands);
  const candidateTracePass =
    identityLedgerErrors.length === 0 &&
    args.deck.nonlands.every((card) => card.oracleId && allowedNonlands.has(card.oracleId));

  return {
    pass: violations.length === 0,
    libraryCount,
    landCount,
    nonlandCount: resolvedNonlands.length,
    violations,
    auditCounts: {
      ramp: legacyHeuristicAudit.ramp,
      draw: legacyHeuristicAudit.draw,
      interaction: legacyHeuristicAudit.interaction,
      protection: legacyHeuristicAudit.protection,
      tutorsAccess: legacyHeuristicAudit.tutorsAccess,
      averageMv: legacyHeuristicAudit.averageMv,
    },
    architectRequirementRealization,
    legacyHeuristicAudit,
    candidateTracePass,
    identityLedgerErrors,
  };
}

export function evaluatePreHeadProfessorGateV111(
  validation: SolDirectedValidationV111,
): { pass: boolean; reasons: string[] } {
  if (validation.pass) return { pass: true, reasons: [] };
  return { pass: false, reasons: validation.violations };
}
