import { resolveCatalogCardByName } from "@/lib/commander-strategy/resolve-catalog-card-by-name";
import { auditDeckResolutionCorpus } from "@/lib/commander-strategy/deck-resolution-corpus-audit-v1";
import { classifyUnresolvedCards } from "@/lib/commander-strategy/unresolved-card-classification-v1";
import { emptyOutcomeCounts, classifyTableOutcome } from "@/lib/commander-strategy/pod-outcome-audit-v1";
import { partitionValidWinnerHistoricalPods } from "@/lib/commander-strategy/valid-outcome-tier-partition-v1";
import { isHistoricalQAPod } from "@/lib/commander-strategy/corpus-reconciliation-v1";
import type { CombinedCorpus } from "@/lib/commander-strategy/combined-corpus-v1";
import {
  filterDecksForScope,
  filterPodsForScope,
  filterTournamentsForScope,
} from "@/lib/commander-strategy/combined-corpus-v1";
import type { DeckResolutionCatalog } from "./load-deck-resolution-catalog";
import type { NormalizedDeckInstance } from "@/lib/commander-strategy/types";

export type MonthlyBackfillGateResult = {
  monthKey: string;
  pass: boolean;
  stopReason?: string;
  checks: {
    outcomeReconciliationPass: boolean;
    duplicateIntegrityPass: boolean;
    sourceNameOracleInconsistencies: number;
    ambiguousResolutionCount: number;
    malformedUnresolvedQuantity: number;
    unresolvedUniqueNames: number;
    aliasInvestigationSignals: number;
  };
  unresolvedClassification?: ReturnType<typeof classifyUnresolvedCards>;
  deckResolutionAudit?: ReturnType<typeof auditDeckResolutionCorpus>;
};

export function evaluateMonthlyBackfillGate(input: {
  monthKey: string;
  corpus: CombinedCorpus;
  catalog: DeckResolutionCatalog;
}): MonthlyBackfillGateResult {
  const pods = filterPodsForScope(input.corpus, input.monthKey, true);
  const decks = filterDecksForScope(input.corpus, input.monthKey, true);
  const tournaments = filterTournamentsForScope(input.corpus, input.monthKey, true);
  const deckById = new Map(decks.map((d) => [d.deckInstanceId, d]));

  const outcomeCounts = emptyOutcomeCounts();
  const podOutcomeById = new Map<string, ReturnType<typeof classifyTableOutcome>>();
  for (const tournament of tournaments) {
    for (const round of tournament.rounds ?? []) {
      for (const table of round.tables ?? []) {
        if (String(table.table ?? "").toLowerCase() === "byes") continue;
        outcomeCounts.allTables += 1;
        const state = classifyTableOutcome(table);
        outcomeCounts[state] += 1;
        podOutcomeById.set(`${tournament.TID}:${round.round}:${table.table}`, state);
      }
    }
  }

  const historicalFn = (pod: (typeof pods)[0]) => isHistoricalQAPod(pod, input.corpus);
  const tierPartition = partitionValidWinnerHistoricalPods({
    pods,
    deckById,
    podOutcomeById,
    historical: historicalFn,
    catalog: input.catalog,
    useStoredResolutionOnly: true,
  });

  const states = [
    "validWinner",
    "explicitDraw",
    "completedButWinnerNull",
    "unfinishedWinnerNull",
    "invalidWinnerId",
    "bye",
    "other",
  ] as const;
  const sumStates = states.reduce((s, k) => s + outcomeCounts[k], 0);
  const outcomeReconciliationPass = sumStates === pods.length;

  const monthPodsRaw = input.corpus.byMonth[input.monthKey]?.pods.length ?? 0;
  const duplicateIntegrityPass = monthPodsRaw >= pods.length;

  const unresolvedClassification = classifyUnresolvedCards({ decks, catalog: input.catalog });
  const deckResolutionAudit = auditDeckResolutionCorpus({ decks, catalog: input.catalog });

  let ambiguousResolutionCount = 0;
  for (const deck of decks) {
    for (const card of deck.mainboard) {
      if (card.resolutionStatus === "resolved") continue;
      const lookup = resolveCatalogCardByName(card.sourceName, input.catalog);
      if (lookup.status === "ambiguous") ambiguousResolutionCount += card.quantity;
    }
  }

  const malformedUnresolvedQuantity =
    unresolvedClassification.byCategory.F_malformed_source_entry.quantity;

  const checks = {
    outcomeReconciliationPass,
    duplicateIntegrityPass,
    sourceNameOracleInconsistencies:
      deckResolutionAudit.sourceNameOracleConsistency.inconsistentCount,
    ambiguousResolutionCount,
    malformedUnresolvedQuantity,
    unresolvedUniqueNames: unresolvedClassification.unresolvedUniqueNames,
    aliasInvestigationSignals: unresolvedClassification.aliasInvestigationSignals.length,
  };

  let stopReason: string | undefined;
  if (!outcomeReconciliationPass) {
    stopReason = `outcome_reconciliation_failed: sum=${sumStates} pods=${pods.length}`;
  } else if (!duplicateIntegrityPass) {
    stopReason = "duplicate_integrity_failed";
  } else if (checks.sourceNameOracleInconsistencies > 0) {
    stopReason = "source_name_maps_to_multiple_oracles";
  } else if (checks.malformedUnresolvedQuantity > 0) {
    stopReason = "malformed_unresolved_entries";
  } else if (checks.ambiguousResolutionCount > 0) {
    stopReason = "ambiguous_resolution_detected";
  }

  return {
    monthKey: input.monthKey,
    pass: !stopReason,
    stopReason,
    checks,
    unresolvedClassification,
    deckResolutionAudit,
  };
}

export function scanCorpusForAliasConflicts(input: {
  decks: NormalizedDeckInstance[];
  aliasConflictStrings: Set<string>;
}): Array<{ aliasDisplayName: string; quantity: number }> {
  const hits = new Map<string, number>();
  for (const deck of input.decks) {
    for (const card of deck.mainboard) {
      if (!input.aliasConflictStrings.has(card.sourceName)) continue;
      hits.set(card.sourceName, (hits.get(card.sourceName) ?? 0) + card.quantity);
    }
  }
  return [...hits.entries()]
    .map(([aliasDisplayName, quantity]) => ({ aliasDisplayName, quantity }))
    .sort((a, b) => b.quantity - a.quantity);
}
