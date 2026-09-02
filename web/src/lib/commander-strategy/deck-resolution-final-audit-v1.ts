import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  resolveCatalogCardByNameWithAudit,
  type DeckCardResolutionMethod,
  type ResolutionAuditTrail,
} from "./resolve-catalog-card-by-name";
import type { NormalizedDeckInstance } from "./types";

export type FinalResolverAuditReport = {
  totalCardQuantity: number;
  totalUniqueRawNameForms: number;
  resolvedCardQuantity: number;
  unresolvedCardQuantity: number;
  byResolutionPath: Record<string, { quantity: number; uniqueNames: number }>;
  ambiguousBeforeFilteringQuantity: number;
  ambiguousAfterFilteringQuantity: number;
  failClosedQuantity: number;
  multiCandidateResolvedQuantity: number;
  finalCandidateCountViolations: Array<{ sourceName: string; quantity: number; finalCandidateCount: number }>;
  commanderLegalDisambiguation: {
    entriesRequiringStepQuantity: number;
    entriesWhereStepChangedChoiceQuantity: number;
    uniqueNamesRequiringStep: string[];
    uniqueNamesWhereStepChangedChoice: Array<{
      sourceName: string;
      quantity: number;
      chosenOracleId?: string;
    }>;
    note: string;
  };
  sourceKeyNormalizationQuantity: number;
  identityResolutionIndependent: boolean;
};

function bucketResolutionPath(audit: ResolutionAuditTrail): string {
  if (audit.status === "not_found") return "fail_closed_not_found";
  if (audit.status === "ambiguous") return "fail_closed_ambiguous";
  if (audit.keyNormalizationApplied.length > 0 && audit.matchKind === "unique") {
    return "source_key_normalization_then_unique";
  }
  if (audit.keyNormalizationApplied.length > 0) {
    return "source_key_normalization_then_other";
  }
  switch (audit.matchKind) {
    case "exact_canonical":
      return "exact_canonical_name";
    case "unique":
      return "exact_canonical_name";
    case "face_name":
      return "canonical_face_alias";
    case "official_alias":
      return "official_printed_flavor_alias";
    case "paper_preferred":
      return "paper_card_object_filtering";
    case "competitive_filter":
      return "paper_card_object_filtering";
    case "playable_layout_preferred":
      return "non_playable_layout_filtering";
    case "commander_legal_disambiguation":
      return "commander_legal_disambiguation";
    default:
      return audit.matchKind ?? "unknown";
  }
}

export function auditFinalResolverCorpus(input: {
  decks: NormalizedDeckInstance[];
  catalog: DeckResolutionCatalog;
}): FinalResolverAuditReport {
  const nameForms = new Set<string>();
  const pathNames = new Map<string, Set<string>>();
  const pathQty = new Map<string, number>();
  const commanderStepNames = new Set<string>();
  const commanderChanged: Map<string, { quantity: number; chosenOracleId?: string }> = new Map();
  const violations: FinalResolverAuditReport["finalCandidateCountViolations"] = [];

  let totalCardQuantity = 0;
  let resolvedCardQuantity = 0;
  let unresolvedCardQuantity = 0;
  let ambiguousBeforeFilteringQuantity = 0;
  let ambiguousAfterFilteringQuantity = 0;
  let failClosedQuantity = 0;
  let multiCandidateResolvedQuantity = 0;
  let sourceKeyNormalizationQuantity = 0;
  let commanderStepQty = 0;
  let commanderChangedQty = 0;

  for (const deck of input.decks) {
    for (const card of deck.mainboard) {
      totalCardQuantity += card.quantity;
      nameForms.add(card.sourceName);

      const lookup = resolveCatalogCardByNameWithAudit(card.sourceName, input.catalog);
      const path = bucketResolutionPath(lookup.audit);
      pathQty.set(path, (pathQty.get(path) ?? 0) + card.quantity);
      const names = pathNames.get(path) ?? new Set<string>();
      names.add(card.sourceName);
      pathNames.set(path, names);

      if (lookup.audit.keyNormalizationApplied.length > 0) {
        sourceKeyNormalizationQuantity += card.quantity;
      }
      if (lookup.audit.ambiguousBeforeFiltering) {
        ambiguousBeforeFilteringQuantity += card.quantity;
      }
      if (lookup.audit.initialCandidateCount > 1 && lookup.audit.status === "resolved") {
        multiCandidateResolvedQuantity += card.quantity;
      }

      if (lookup.status === "resolved") {
        resolvedCardQuantity += card.quantity;
        if (lookup.audit.finalCandidateCount !== 1) {
          violations.push({
            sourceName: card.sourceName,
            quantity: card.quantity,
            finalCandidateCount: lookup.audit.finalCandidateCount,
          });
        }
        if (lookup.audit.commanderLegalStepApplied) {
          commanderStepQty += card.quantity;
          commanderStepNames.add(card.sourceName);
          if (lookup.audit.commanderLegalChangedChoice) {
            commanderChangedQty += card.quantity;
            const existing = commanderChanged.get(card.sourceName) ?? {
              quantity: 0,
              chosenOracleId: lookup.audit.chosenOracleId,
            };
            existing.quantity += card.quantity;
            commanderChanged.set(card.sourceName, existing);
          }
        }
      } else if (lookup.status === "ambiguous") {
        unresolvedCardQuantity += card.quantity;
        ambiguousAfterFilteringQuantity += card.quantity;
        failClosedQuantity += card.quantity;
      } else {
        unresolvedCardQuantity += card.quantity;
        failClosedQuantity += card.quantity;
      }
    }
  }

  const byResolutionPath: FinalResolverAuditReport["byResolutionPath"] = {};
  for (const [path, qty] of pathQty.entries()) {
    byResolutionPath[path] = { quantity: qty, uniqueNames: pathNames.get(path)?.size ?? 0 };
  }

  return {
    totalCardQuantity,
    totalUniqueRawNameForms: nameForms.size,
    resolvedCardQuantity,
    unresolvedCardQuantity,
    byResolutionPath,
    ambiguousBeforeFilteringQuantity,
    ambiguousAfterFilteringQuantity,
    failClosedQuantity,
    multiCandidateResolvedQuantity,
    finalCandidateCountViolations: violations,
    commanderLegalDisambiguation: {
      entriesRequiringStepQuantity: commanderStepQty,
      entriesWhereStepChangedChoiceQuantity: commanderChangedQty,
      uniqueNamesRequiringStep: [...commanderStepNames].sort(),
      uniqueNamesWhereStepChangedChoice: [...commanderChanged.entries()]
        .map(([sourceName, row]) => ({ sourceName, ...row }))
        .sort((a, b) => a.sourceName.localeCompare(b.sourceName)),
      note:
        "Commander legality is applied only after layout/paper/competitive structural filters. Uses current golden-catalog legality snapshot, not tournament-date rules snapshot (historical legality pinning is a future enhancement).",
    },
    sourceKeyNormalizationQuantity,
    identityResolutionIndependent: violations.length === 0 && ambiguousAfterFilteringQuantity === 0,
  };
}
