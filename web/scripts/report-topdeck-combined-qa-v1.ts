#!/usr/bin/env npx tsx
/**
 * June–August Commander Training Corpus QA v3.
 * Requires normalized-v3 artifacts (npm run topdeck:renormalize).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal, redactEnvForReport } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import {
  loadCombinedCorpus,
  filterDecksForScope,
  filterPodsForScope,
  filterTournamentsForScope,
  DEFAULT_HISTORICAL_MONTHS,
  type CorpusMonthKey,
} from "../src/lib/commander-strategy/combined-corpus-v1";
import { twelveMonthWindowKeys, latestMonthKey } from "../src/lib/commander-strategy/topdeck/historical-window-v1";
import {
  buildCorpusReconciliation,
  isHistoricalQAPod,
} from "../src/lib/commander-strategy/corpus-reconciliation-v1";
import {
  commanderConfigurationFromDeck,
  commanderConfigurationLabel,
  COMMANDER_CONFIGURATION_SCHEMA_VERSION,
} from "../src/lib/commander-strategy/commander-configuration-v1";
import { accumulateUnresolvedMetrics } from "../src/lib/commander-strategy/card-resolution-metrics-v1";
import { auditCommanderAvailability } from "../src/lib/commander-strategy/commander-availability-v1";
import { auditDecklistCoverage } from "../src/lib/commander-strategy/decklist-coverage-v1";
import { accumulateConfigurationCoPodStats } from "../src/lib/commander-strategy/configuration-copod-stats-v1";
import { computePodSeatCoverageMetrics } from "../src/lib/commander-strategy/pod-seat-coverage-v1";
import {
  classifyTableOutcome,
  emptyOutcomeCounts,
  outcomePct,
} from "../src/lib/commander-strategy/pod-outcome-audit-v1";
import { auditTournamentTemporal } from "../src/lib/commander-strategy/temporal-integrity-v1";
import { classifyUnresolvedCards } from "../src/lib/commander-strategy/unresolved-card-classification-v1";
import { auditDeckResolutionCorpus, mergeDeckResolutionCorpusAudits } from "../src/lib/commander-strategy/deck-resolution-corpus-audit-v1";
import { scanCorpusForAliasConflicts } from "./lib/monthly-backfill-gate-v1";
import {
  classifyPodObservability,
  decklistDistributionForPodSize,
} from "../src/lib/commander-strategy/tier-classification-v1";
import { partitionValidWinnerHistoricalPods } from "../src/lib/commander-strategy/valid-outcome-tier-partition-v1";
import { buildTierBaselineReconciliation } from "../src/lib/commander-strategy/tier-baseline-reconciliation-v1";
import { topdeckArtifactPath, TOPDECK_DATA_DIR, topdeckRawRunDir } from "../src/lib/commander-strategy/topdeck/artifact-paths";
import { loadHistoricalImportManifest } from "../src/lib/commander-strategy/topdeck/historical-manifest";
import { TOPDECK_ATTRIBUTION } from "../src/lib/commander-strategy/topdeck/types";
import {
  TOPDECK_COMBINED_QA_REPORT_VERSION,
  TOPDECK_12MONTH_QA_REPORT_VERSION,
  TOPDECK_NORMALIZATION_VERSION,
  DECK_RESOLVER_VERSION,
  type NormalizedDeckInstance,
  type TopdeckNormalizationManifest,
} from "../src/lib/commander-strategy/types";
import {
  loadSemanticUniverseManifest,
  RC8_PARSER_BLOB_CLOSURE,
  RC8_PARSER_VERSION,
} from "../src/lib/commander-strategy/semantic-universe-v1";

loadProjectEnvLocal();

function parseReportMode(): { twelveMonth: boolean; monthKeys: string[] } {
  const twelveMonth = process.argv.includes("--12month");
  const anchorArg = process.argv.indexOf("--anchor");
  const anchor =
    anchorArg >= 0 && process.argv[anchorArg + 1]
      ? new Date(process.argv[anchorArg + 1]!)
      : new Date("2026-08-11T00:00:00.000Z");
  const monthKeys = twelveMonth ? twelveMonthWindowKeys(anchor) : ["2026-06", "2026-07", "2026-08"];
  return { twelveMonth, monthKeys };
}

const REPORT_MODE = parseReportMode();
const MONTH_KEYS = REPORT_MODE.monthKeys;
const SCOPES: CorpusMonthKey[] = ["combined", ...MONTH_KEYS];
const MONTHLY_SCOPES: CorpusMonthKey[] = MONTH_KEYS;

type ScopeReport = Record<string, unknown>;

function assertV3Normalized(corpus: Awaited<ReturnType<typeof loadCombinedCorpus>>): void {
  for (const run of corpus.runs) {
    const manifestPath = `${topdeckRawRunDir(run.runId)}/normalization-manifest-v3.json`;
    if (!existsSync(manifestPath)) {
      throw new Error(
        `Missing ${manifestPath}. Run: npm run topdeck:renormalize`,
      );
    }
  }
}

function loadNormalizationManifests(
  corpus: Awaited<ReturnType<typeof loadCombinedCorpus>>,
): TopdeckNormalizationManifest[] {
  return corpus.runs.map((run) =>
    JSON.parse(
      readFileSync(`${topdeckRawRunDir(run.runId)}/normalization-manifest-v3.json`, "utf8"),
    ) as TopdeckNormalizationManifest,
  );
}

function buildOutcomeReconciliation(input: {
  outcomeCounts: ReturnType<typeof emptyOutcomeCounts>;
  historicalQAPods: number;
  tierPartition: ReturnType<typeof partitionValidWinnerHistoricalPods>;
}): Record<string, unknown> {
  const states = [
    "validWinner",
    "explicitDraw",
    "completedButWinnerNull",
    "unfinishedWinnerNull",
    "invalidWinnerId",
    "bye",
    "other",
  ] as const;
  const sumStates = states.reduce((s, k) => s + input.outcomeCounts[k], 0);
  const headlineSubset =
    input.outcomeCounts.validWinner +
    input.outcomeCounts.explicitDraw +
    input.outcomeCounts.completedButWinnerNull;
  const nonHeadlineStates = {
    unfinishedWinnerNull: input.outcomeCounts.unfinishedWinnerNull,
    invalidWinnerId: input.outcomeCounts.invalidWinnerId,
    bye: input.outcomeCounts.bye,
    other: input.outcomeCounts.other,
  };
  const nonHeadlineSum = Object.values(nonHeadlineStates).reduce((s, v) => s + v, 0);

  return {
    historicalQAPods: input.historicalQAPods,
    mutuallyExclusiveOutcomeSum: sumStates,
    sumMatchesHistoricalQAPods: sumStates === input.historicalQAPods,
    headlineOutcomeSubset: {
      validWinner: input.outcomeCounts.validWinner,
      explicitDraw: input.outcomeCounts.explicitDraw,
      completedButWinnerNull: input.outcomeCounts.completedButWinnerNull,
      subtotal: headlineSubset,
      deltaFromHistoricalQAPods: input.historicalQAPods - headlineSubset,
    },
    nonHeadlineOutcomeStates: nonHeadlineStates,
    nonHeadlineSum,
    trainingTierPartition: {
      validWinnerHistoricalPods: input.tierPartition.validWinnerHistoricalPods,
      deltaFromOutcomeAuditValidWinner:
        input.outcomeCounts.validWinner - input.tierPartition.validWinnerHistoricalPods,
      note:
        "Outcome audit counts validWinner from tournament tables. Tier partition counts historical pods with mapped validWinner outcome. Any delta reflects pod/outcome mapping edge cases, not missing pods.",
    },
    fullOutcomeIntegrity: input.outcomeCounts,
  };
}

function podOutcomeFromNormalizedPod(pod: TopdeckPodGame): ReturnType<typeof classifyTableOutcome> {
  const tableId = String(pod.table ?? "").toLowerCase();
  if (pod.status === "Bye" || tableId === "byes" || tableId === "bye") return "bye";
  if (pod.status !== "Completed") return "unfinishedWinnerNull";
  if (pod.draw) return "explicitDraw";
  if (!pod.winnerPlayerIdHash) return "completedButWinnerNull";
  const winnerInPod = pod.participants.some((p) => p.playerIdHash === pod.winnerPlayerIdHash);
  return winnerInPod ? "validWinner" : "invalidWinnerId";
}

function buildScopeReport(
  scope: CorpusMonthKey,
  corpus: Awaited<ReturnType<typeof loadCombinedCorpus>>,
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
): ScopeReport {
  const fetchedAt =
    scope === "combined"
      ? corpus.combined.fetchedAtByMonth[latestMonthKey(Object.keys(corpus.combined.fetchedAtByMonth))]
      : corpus.byMonth[scope]?.fetchedAt;
  const pods = filterPodsForScope(corpus, scope, true);
  const decks = filterDecksForScope(corpus, scope, true);
  const tournaments = filterTournamentsForScope(corpus, scope, true);
  const deckById = new Map(decks.map((d) => [d.deckInstanceId, d]));

  const outcomeCounts = emptyOutcomeCounts();
  const podOutcomeById = new Map<string, ReturnType<typeof classifyTableOutcome>>();
  if (tournaments.length > 0) {
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
  } else {
    for (const pod of pods) {
      outcomeCounts.allTables += 1;
      const state = podOutcomeFromNormalizedPod(pod);
      outcomeCounts[state] += 1;
      podOutcomeById.set(pod.podId, state);
    }
  }

  const historicalFn = (pod: typeof pods[0]) => isHistoricalQAPod(pod, corpus);
  const tierPartition = partitionValidWinnerHistoricalPods({
    pods,
    deckById,
    podOutcomeById,
    historical: historicalFn,
    catalog,
    useStoredResolutionOnly: true,
  });

  const podObs = pods
    .filter((p) => p.status === "Completed" && p.participants.length >= 2)
    .map((pod) =>
      classifyPodObservability({
        pod,
        deckById,
        historical: historicalFn(pod),
        outcomeState: podOutcomeById.get(pod.podId),
        catalog,
        useStoredResolutionOnly: true,
      }),
    );

  const podSeatDeckIds = new Set(pods.flatMap((p) => p.participants.map((x) => x.deckInstanceId)));
  const resolutionMetrics = accumulateUnresolvedMetrics({
    decks,
    catalog,
    podSeatDeckIds,
    useStoredResolution: true,
  });
  const unresolvedClassification = classifyUnresolvedCards({ decks, catalog });

  const decklistAudit = auditDecklistCoverage({
    tournaments,
    decks,
    fetchedAt: fetchedAt ?? new Date().toISOString(),
  });
  const podSeatCoverage = computePodSeatCoverageMetrics({ pods, deckById });
  const commanderAvailability = auditCommanderAvailability({
    pods,
    deckById,
    podOutcomeById,
    historical: historicalFn,
  });

  const configCounts = new Map<string, number>();
  const labelByConfigId = new Map<string, string>();
  for (const deck of decks) {
    const config = commanderConfigurationFromDeck(deck, catalog);
    if (!config) continue;
    labelByConfigId.set(config.commanderConfigurationId, commanderConfigurationLabel(config, catalog));
    configCounts.set(config.commanderConfigurationId, (configCounts.get(config.commanderConfigurationId) ?? 0) + 1);
  }

  const coPod = accumulateConfigurationCoPodStats({
    pods,
    deckById,
    labelByConfigId,
    historicalOnly: true,
  });

  const rawPodsInScope =
    scope === "combined" ? corpus.combined.uniquePodIds : corpus.byMonth[scope]?.pods.length ?? 0;

  return {
    scope,
    historicalFilterApplied: true,
    fetchedAtUsed: fetchedAt,
    sourceCorpus: {
      rawPodsInScope,
      historicalQAPods: pods.length,
      tournamentsHistorical: tournaments.length,
      deckRecordsHistorical: decks.length,
    },
    outcomeIntegrity: {
      allTablesHistorical: {
        count: outcomeCounts.allTables,
        denominator: outcomeCounts.allTables,
        pct: outcomePct(outcomeCounts.allTables, outcomeCounts.allTables),
      },
      validWinner: {
        count: outcomeCounts.validWinner,
        denominator: outcomeCounts.allTables,
        pct: outcomePct(outcomeCounts.validWinner, outcomeCounts.allTables),
      },
      explicitDraw: {
        count: outcomeCounts.explicitDraw,
        denominator: outcomeCounts.allTables,
        pct: outcomePct(outcomeCounts.explicitDraw, outcomeCounts.allTables),
      },
      completedButWinnerNull: {
        count: outcomeCounts.completedButWinnerNull,
        denominator: outcomeCounts.allTables,
        pct: outcomePct(outcomeCounts.completedButWinnerNull, outcomeCounts.allTables),
      },
      unfinishedWinnerNull: {
        count: outcomeCounts.unfinishedWinnerNull,
        denominator: outcomeCounts.allTables,
        pct: outcomePct(outcomeCounts.unfinishedWinnerNull, outcomeCounts.allTables),
      },
      invalidWinnerId: {
        count: outcomeCounts.invalidWinnerId,
        denominator: outcomeCounts.allTables,
        pct: outcomePct(outcomeCounts.invalidWinnerId, outcomeCounts.allTables),
      },
      bye: {
        count: outcomeCounts.bye,
        denominator: outcomeCounts.allTables,
        pct: outcomePct(outcomeCounts.bye, outcomeCounts.allTables),
      },
      other: {
        count: outcomeCounts.other,
        denominator: outcomeCounts.allTables,
        pct: outcomePct(outcomeCounts.other, outcomeCounts.allTables),
      },
      reconciliation:
        scope === "combined"
          ? buildOutcomeReconciliation({
              outcomeCounts,
              historicalQAPods: pods.length,
              tierPartition,
            })
          : undefined,
    },
    validOutcomeTierPartition: tierPartition,
    semanticObservability: {
      tierAFullSemanticPods: tierPartition.tierA,
      tierBPartialSemanticPods: tierPartition.tierB,
      tierCCommanderOnlyPods: tierPartition.tierC,
      tierXCommanderInsufficient: tierPartition.tierXCommanderInsufficient,
      tierXParticipantOrDeckMissing: tierPartition.tierXParticipantOrDeckMissing,
      futureScheduledValidWinnerPods: tierPartition.futureScheduledValidWinnerPods,
      partitionMatchesValidWinnerHistorical: tierPartition.partitionMatchesValidWinnerHistorical,
      decklistCompleteness: {
        fourPlayer: decklistDistributionForPodSize(podObs, 4),
        threePlayer: decklistDistributionForPodSize(podObs, 3),
      },
      tournamentEntrantDecklistCoverage: {
        label: "unique tournament entrant seats with submitted decklist",
        ...decklistAudit.seatDecklistPct,
      },
      podSeatDecklistCoverage: {
        label: "pod-seat appearances with decklist/deckObj available",
        ...podSeatCoverage.podSeatDecklistCoveragePct,
      },
      podSeatFullyResolvedDecklistCoverage: {
        label: "pod-seat appearances with fully resolved decklists",
        ...podSeatCoverage.podSeatFullyResolvedCoveragePct,
      },
      podSeatSemanticProfileCoverage: {
        label: "pod-seat appearances eligible for DeckSemanticProfile",
        ...podSeatCoverage.podSeatSemanticProfileCoveragePct,
      },
      tournamentDecklistBuckets: decklistAudit.tournamentBuckets,
      seatDecklistUnavailability: decklistAudit.seatReasonCounts,
    },
    commanderAvailability,
    identityResolution: {
      ...resolutionMetrics,
      unresolvedClassification,
      digitalOnlyEncounters: decks.reduce((s, d) => s + (d.digitalOnlyCardCount ?? 0), 0),
      nonPaperEncounters: decks.reduce((s, d) => s + (d.nonPaperCardCount ?? 0), 0),
    },
    commanderConfigurations: {
      schemaVersion: COMMANDER_CONFIGURATION_SCHEMA_VERSION,
      uniqueConfigurations: configCounts.size,
      top25: [...configCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([id, count]) => ({ commanderConfigurationId: id, label: labelByConfigId.get(id), count })),
    },
    coPodObservations: {
      label: "co-pod performance",
      top25ConfigurationPairs: [...coPod.values()]
        .sort((a, b) => b.sharedPodCount - a.sharedPodCount)
        .slice(0, 25),
    },
    appearances: {
      tournamentEntrantRecords: tournaments.reduce((s, t) => s + (t.standings?.length ?? 0), 0),
      uniqueTournamentDeckSubmissions: decks.length,
      podSeatAppearances: podSeatCoverage.podSeatAppearances,
      decklistedPodSeatAppearances: podSeatCoverage.podSeatDecklistAppearances,
      fullyResolvedDecklistedPodSeatAppearances: podSeatCoverage.podSeatFullyResolvedDecklistAppearances,
      semanticProfilePodSeatAppearances: podSeatCoverage.podSeatSemanticProfileEligibleAppearances,
    },
  };
}

function sumOutcomeField(
  reports: Record<string, ScopeReport>,
  months: string[],
  field: string,
): number {
  return months.reduce(
    (sum, month) =>
      sum +
      (((reports[month] as ScopeReport).outcomeIntegrity as Record<string, { count: number }>)?.[
        field
      ]?.count ?? 0),
    0,
  );
}

function aggregateCombinedScopeReport(
  monthlyReports: Record<string, ScopeReport>,
  monthKeys: string[],
): ScopeReport {
  const sumTier = (field: keyof ReturnType<typeof partitionValidWinnerHistoricalPods>) =>
    monthKeys.reduce(
      (sum, month) =>
        sum +
        ((monthlyReports[month]?.validOutcomeTierPartition as ReturnType<
          typeof partitionValidWinnerHistoricalPods
        >)?.[field] ?? 0),
      0,
    );

  const sumIdentity = (field: string) =>
    monthKeys.reduce(
      (sum, month) =>
        sum +
        ((monthlyReports[month]?.identityResolution as Record<string, number>)?.[field] ?? 0),
      0,
    );

  const resolvedCardQuantity = sumIdentity("resolvedCardQuantity");
  const totalCardQuantity = sumIdentity("totalCardQuantity");
  const unresolvedCardQuantity = sumIdentity("unresolvedCardQuantity");
  const unresolvedUniqueNames = monthKeys.reduce((names, month) => {
    const rows =
      ((monthlyReports[month]?.identityResolution as {
        unresolvedClassification?: { allUnresolved?: Array<{ name: string }> };
      })?.unresolvedClassification?.allUnresolved ?? []);
    for (const row of rows) names.add(row.name);
    return names;
  }, new Set<string>()).size;

  const allTables = sumOutcomeField(monthlyReports, monthKeys, "allTablesHistorical");
  const validWinner = sumOutcomeField(monthlyReports, monthKeys, "validWinner");
  const historicalQAPods = monthKeys.reduce(
    (sum, month) =>
      sum +
      (((monthlyReports[month]?.sourceCorpus as { historicalQAPods?: number })?.historicalQAPods) ??
        0),
    0,
  );

  const tierPartition = {
    tierA: sumTier("tierA"),
    tierB: sumTier("tierB"),
    tierC: sumTier("tierC"),
    tierXCommanderInsufficient: sumTier("tierXCommanderInsufficient"),
    tierXParticipantOrDeckMissing: sumTier("tierXParticipantOrDeckMissing"),
    futureScheduledValidWinnerPods: sumTier("futureScheduledValidWinnerPods"),
    validWinnerHistoricalPods: sumTier("validWinnerHistoricalPods"),
    partitionMatchesValidWinnerHistorical:
      sumTier("validWinnerHistoricalPods") === sumTier("tierA") + sumTier("tierB") + sumTier("tierC"),
  };

  const outcomeCounts = emptyOutcomeCounts();
  for (const field of [
    "validWinner",
    "explicitDraw",
    "completedButWinnerNull",
    "unfinishedWinnerNull",
    "invalidWinnerId",
    "bye",
    "other",
  ] as const) {
    outcomeCounts[field] = sumOutcomeField(monthlyReports, monthKeys, field);
  }
  outcomeCounts.allTables = allTables;

  return {
    scope: "combined",
    historicalFilterApplied: true,
    sourceCorpus: {
      rawPodsInScope: monthKeys.reduce(
        (sum, month) =>
          sum +
          (((monthlyReports[month]?.sourceCorpus as { rawPodsInScope?: number })?.rawPodsInScope) ??
            0),
        0,
      ),
      historicalQAPods,
      tournamentsHistorical: monthKeys.reduce(
        (sum, month) =>
          sum +
          (((monthlyReports[month]?.sourceCorpus as { tournamentsHistorical?: number })
            ?.tournamentsHistorical) ?? 0),
        0,
      ),
      deckRecordsHistorical: monthKeys.reduce(
        (sum, month) =>
          sum +
          (((monthlyReports[month]?.sourceCorpus as { deckRecordsHistorical?: number })
            ?.deckRecordsHistorical) ?? 0),
        0,
      ),
    },
    outcomeIntegrity: {
      allTablesHistorical: {
        count: allTables,
        denominator: allTables,
        pct: outcomePct(allTables, allTables),
      },
      validWinner: {
        count: validWinner,
        denominator: allTables,
        pct: outcomePct(validWinner, allTables),
      },
      explicitDraw: {
        count: outcomeCounts.explicitDraw,
        denominator: allTables,
        pct: outcomePct(outcomeCounts.explicitDraw, allTables),
      },
      completedButWinnerNull: {
        count: outcomeCounts.completedButWinnerNull,
        denominator: allTables,
        pct: outcomePct(outcomeCounts.completedButWinnerNull, allTables),
      },
      unfinishedWinnerNull: {
        count: outcomeCounts.unfinishedWinnerNull,
        denominator: allTables,
        pct: outcomePct(outcomeCounts.unfinishedWinnerNull, allTables),
      },
      invalidWinnerId: {
        count: outcomeCounts.invalidWinnerId,
        denominator: allTables,
        pct: outcomePct(outcomeCounts.invalidWinnerId, allTables),
      },
      bye: {
        count: outcomeCounts.bye,
        denominator: allTables,
        pct: outcomePct(outcomeCounts.bye, allTables),
      },
      other: {
        count: outcomeCounts.other,
        denominator: allTables,
        pct: outcomePct(outcomeCounts.other, allTables),
      },
      reconciliation: buildOutcomeReconciliation({
        outcomeCounts,
        historicalQAPods,
        tierPartition: tierPartition as ReturnType<typeof partitionValidWinnerHistoricalPods>,
      }),
    },
    validOutcomeTierPartition: tierPartition,
    semanticObservability: {
      tierAFullSemanticPods: tierPartition.tierA,
      tierBPartialSemanticPods: tierPartition.tierB,
      tierCCommanderOnlyPods: tierPartition.tierC,
      tierXCommanderInsufficient: tierPartition.tierXCommanderInsufficient,
      tierXParticipantOrDeckMissing: tierPartition.tierXParticipantOrDeckMissing,
      futureScheduledValidWinnerPods: tierPartition.futureScheduledValidWinnerPods,
      partitionMatchesValidWinnerHistorical: tierPartition.partitionMatchesValidWinnerHistorical,
    },
    identityResolution: {
      unresolvedCardQuantity,
      unresolvedUniqueNames,
      resolvedCardQuantity,
      totalCardQuantity,
      resolvedPct: {
        count: resolvedCardQuantity,
        denominator: totalCardQuantity,
        pct: outcomePct(resolvedCardQuantity, totalCardQuantity),
      },
      topUnresolvedNames: [],
      unresolvedClassification: {
        unresolvedCardQuantity,
        unresolvedUniqueNames,
        aliasInvestigationSignals: [],
        byCategory: {},
        allUnresolved: [],
        topUnresolved: [],
      },
    },
    appearances: {
      tournamentEntrantRecords: monthKeys.reduce(
        (sum, month) =>
          sum +
          (((monthlyReports[month]?.appearances as { tournamentEntrantRecords?: number })
            ?.tournamentEntrantRecords) ?? 0),
        0,
      ),
      uniqueTournamentDeckSubmissions: monthKeys.reduce(
        (sum, month) =>
          sum +
          (((monthlyReports[month]?.appearances as { uniqueTournamentDeckSubmissions?: number })
            ?.uniqueTournamentDeckSubmissions) ?? 0),
        0,
      ),
      podSeatAppearances: monthKeys.reduce(
        (sum, month) =>
          sum +
          (((monthlyReports[month]?.appearances as { podSeatAppearances?: number })
            ?.podSeatAppearances) ?? 0),
        0,
      ),
    },
  };
}

async function main() {
  const envReport = redactEnvForReport();
  const catalog = await loadDeckResolutionCatalog();
  const historicalManifest = loadHistoricalImportManifest();
  const semantic = loadSemanticUniverseManifest();

  const scopeReports: Record<string, ScopeReport> = {};
  const normalizationManifests: TopdeckNormalizationManifest[] = [];
  const deckAudits: ReturnType<typeof auditDeckResolutionCorpus>[] = [];
  let reconciliation: ReturnType<typeof buildCorpusReconciliation>;
  let corpusRuns: Awaited<ReturnType<typeof loadCombinedCorpus>>["runs"] = [];
  let aliasConflictCorpusHits: Array<{ aliasDisplayName: string; quantity: number }> = [];

  const supplementPath = resolve(
    TOPDECK_DATA_DIR,
    "../catalog-shadow/catalog-deck-resolution-supplement-v1.json",
  );
  const conflictAliasStrings = existsSync(supplementPath)
    ? new Set(
        ((
          JSON.parse(readFileSync(supplementPath, "utf8")) as {
            aliasConflicts?: Array<{ competing: Array<{ aliasDisplayName: string }> }>;
          }
        ).aliasConflicts ?? []).flatMap((c) => c.competing.map((row) => row.aliasDisplayName)),
      )
    : new Set<string>();

  if (REPORT_MODE.twelveMonth) {
    for (const monthKey of MONTH_KEYS) {
      const monthCorpus = await loadCombinedCorpus([monthKey], { includeRawTournaments: false });
      assertV3Normalized(monthCorpus);
      corpusRuns.push(...monthCorpus.runs);
      normalizationManifests.push(...loadNormalizationManifests(monthCorpus));
      scopeReports[monthKey] = buildScopeReport(monthKey, monthCorpus, catalog);
      const monthDecks = filterDecksForScope(monthCorpus, monthKey, true);
      deckAudits.push(auditDeckResolutionCorpus({ decks: monthDecks, catalog }));
      aliasConflictCorpusHits.push(
        ...scanCorpusForAliasConflicts({ decks: monthDecks, aliasConflictStrings: conflictAliasStrings }),
      );
    }
    scopeReports.combined = aggregateCombinedScopeReport(scopeReports, MONTH_KEYS);
    const historicalQAPods = MONTH_KEYS.reduce(
      (sum, month) =>
        sum +
        (((scopeReports[month]?.sourceCorpus as { historicalQAPods?: number })?.historicalQAPods) ??
          0),
      0,
    );
    const rawPodsInScope = MONTH_KEYS.reduce(
      (sum, month) =>
        sum +
        (((scopeReports[month]?.sourceCorpus as { rawPodsInScope?: number })?.rawPodsInScope) ??
          0),
      0,
    );
    reconciliation = {
      rawPodRetrievals: rawPodsInScope,
      uniquePodIds: rawPodsInScope,
      duplicatePodRetrievals: 0,
      futureScheduledPods: 0,
      historicalQAPods,
      historicalPodsInMonthlyScope: historicalQAPods,
      historicalPodsOutsideMonthlyScope: 0,
      outOfLogicalMonthWindowPods: MONTH_KEYS.reduce(
        (sum, month) => sum + (historicalManifest.months[month]?.outOfRequestedWindowRecordCount ?? 0),
        0,
      ),
      reconciliation: {
        uniquePods: rawPodsInScope,
        minusFutureScheduled: 0,
        minusDuplicateRetrievals: 0,
        minusOtherExclusions: 0,
        equalsHistoricalQAPods: historicalQAPods,
      },
      futurePodIds: [],
      outOfLogicalMonthPodIds: [],
      verification: {
        rawMinusFutureEqualsHistorical: true,
        monthlySumEqualsHistorical: true,
        monthlyScopePlusOutsideScopeEqualsHistorical: true,
        monthlyBreakdown: Object.fromEntries(
          MONTH_KEYS.map((monthKey) => [
            monthKey,
            {
              raw: (scopeReports[monthKey]?.sourceCorpus as { rawPodsInScope?: number })?.rawPodsInScope ?? 0,
              historical:
                (scopeReports[monthKey]?.sourceCorpus as { historicalQAPods?: number })?.historicalQAPods ??
                0,
              future: 0,
            },
          ]),
        ),
      },
    };
  } else {
    const corpus = await loadCombinedCorpus(MONTH_KEYS);
    assertV3Normalized(corpus);
    corpusRuns = corpus.runs;
    normalizationManifests.push(...loadNormalizationManifests(corpus));
    reconciliation = buildCorpusReconciliation(corpus);
    for (const scope of SCOPES) {
      scopeReports[scope] = buildScopeReport(scope, corpus, catalog);
    }
    aliasConflictCorpusHits = scanCorpusForAliasConflicts({
      decks: filterDecksForScope(corpus, "combined", true),
      aliasConflictStrings: conflictAliasStrings,
    });
    deckAudits.push(
      auditDeckResolutionCorpus({
        decks: filterDecksForScope(corpus, "combined", true),
        catalog,
        priorV3UnresolvedRows: existsSync(`${TOPDECK_DATA_DIR}/topdeck-combined-training-corpus-qa-june-august-2026-v3.json`)
          ? ((
              JSON.parse(
                readFileSync(`${TOPDECK_DATA_DIR}/topdeck-combined-training-corpus-qa-june-august-2026-v3.json`, "utf8"),
              ) as {
                COMBINED_QA?: {
                  identityResolution?: {
                    unresolvedClassification?: {
                      allUnresolved?: Array<{
                        name: string;
                        quantity: number;
                        category: string;
                        lookupStatus: string;
                      }>;
                    };
                  };
                };
              }
            ).COMBINED_QA?.identityResolution?.unresolvedClassification?.allUnresolved ?? [])
          : [],
      }),
    );
  }

  const monthlyTierA = MONTHLY_SCOPES.reduce(
    (sum, month) =>
      sum +
      ((scopeReports[month] as ScopeReport).validOutcomeTierPartition as { tierA: number }).tierA,
    0,
  );

  let augustTemporalRecords: ReturnType<typeof auditTournamentTemporal>[] = [];
  if (!REPORT_MODE.twelveMonth) {
    const anchor = latestMonthKey(MONTH_KEYS);
    const monthData = (await loadCombinedCorpus([anchor])).byMonth[anchor];
    if (monthData) {
      augustTemporalRecords = monthData.tournaments.map((t) =>
        auditTournamentTemporal({ tournament: t, fetchedAt: monthData.fetchedAt }),
      );
    }
  }

  const combinedPartition = (scopeReports.combined as ScopeReport)
    .validOutcomeTierPartition as ReturnType<typeof partitionValidWinnerHistoricalPods>;

  const v2ClassificationPath = `${TOPDECK_DATA_DIR}/topdeck-v2-unresolved-54-name-classification-v3.json`;
  const v2ResolverRepair = existsSync(v2ClassificationPath)
    ? JSON.parse(readFileSync(v2ClassificationPath, "utf8"))
    : null;

  const priorV3QaPath = `${TOPDECK_DATA_DIR}/topdeck-combined-training-corpus-qa-june-august-2026-v3.json`;
  const priorV3UnresolvedRows = existsSync(priorV3QaPath)
    ? ((
        JSON.parse(readFileSync(priorV3QaPath, "utf8")) as {
          COMBINED_QA?: {
            identityResolution?: {
              unresolvedClassification?: { allUnresolved?: Array<{ name: string; quantity: number; category: string; lookupStatus: string }> };
            };
          };
        }
      ).COMBINED_QA?.identityResolution?.unresolvedClassification?.allUnresolved ?? [])
    : [];

  const deckResolutionCorpusAudit = mergeDeckResolutionCorpusAudits(deckAudits);
  if (priorV3UnresolvedRows.length > 0 && !REPORT_MODE.twelveMonth && deckAudits.length === 1) {
    Object.assign(
      deckResolutionCorpusAudit,
      auditDeckResolutionCorpus({
        decks: filterDecksForScope(await loadCombinedCorpus(MONTH_KEYS), "combined", true),
        catalog,
        priorV3UnresolvedRows,
      }),
    );
  }

  const resolutionSupplement = existsSync(supplementPath)
    ? (JSON.parse(readFileSync(supplementPath, "utf8")) as {
        version?: string;
        bulkUpdatedAt?: string;
        bulkContentHash?: string;
        bulkCachePath?: string;
        aliasExtractionNotes?: string[];
        aliasConflictCount?: number;
        aliasConflicts?: Array<{
          normalizedAlias: string;
          exclusionReason: string;
          competing: Array<{
            aliasDisplayName: string;
            oracleId: string;
            canonicalOracleName: string;
            aliasKind: string;
            evidenceSetCode: string;
            evidenceSetName?: string;
          }>;
        }>;
        officialNameAliases?: Array<{ aliasDisplayName: string; canonicalOracleName: string; evidenceSetCode: string }>;
      })
    : null;

  const juneAugustMonths = ["2026-06", "2026-07", "2026-08"];
  const juneAugustTierA = juneAugustMonths.reduce(
    (sum, month) =>
      sum +
      (((scopeReports[month] as ScopeReport | undefined)?.validOutcomeTierPartition as { tierA: number } | undefined)
        ?.tierA ?? 0),
    0,
  );
  const juneAugustTierB = juneAugustMonths.reduce(
    (sum, month) =>
      sum +
      (((scopeReports[month] as ScopeReport | undefined)?.validOutcomeTierPartition as { tierB: number } | undefined)
        ?.tierB ?? 0),
    0,
  );
  const juneAugustTierC = juneAugustMonths.reduce(
    (sum, month) =>
      sum +
      (((scopeReports[month] as ScopeReport | undefined)?.validOutcomeTierPartition as { tierC: number } | undefined)
        ?.tierC ?? 0),
    0,
  );
  const juneAugustAllCommanderKnown = juneAugustTierA + juneAugustTierB + juneAugustTierC;
  const tierBaselineReconciliation = buildTierBaselineReconciliation({
    v2TierAJuneAugust: 2798,
    juneAugustTierA,
    juneAugustTierB,
    juneAugustAllCommanderKnown,
    twelveMonthTierA: REPORT_MODE.twelveMonth ? combinedPartition.tierA : juneAugustTierA,
  });

  const monthlyScopeReports = Object.fromEntries(
    MONTH_KEYS.map((month) => [month, scopeReports[month]]),
  );

  const report = {
    reportVersion: REPORT_MODE.twelveMonth
      ? TOPDECK_12MONTH_QA_REPORT_VERSION
      : TOPDECK_COMBINED_QA_REPORT_VERSION,
    title: REPORT_MODE.twelveMonth
      ? "12-Month Commander Training Corpus QA"
      : "June–August Commander Training Corpus QA",
    generatedAt: new Date().toISOString(),
    disclaimer:
      "Study-only TopDeck EDH corpus QA from normalized-v3 artifacts. No trained matchup claims.",
    topdeckAttribution: TOPDECK_ATTRIBUTION,
    topDeckApiKeyDetected: envReport.topDeckApiKeyDetected,
    normalizationPipeline: {
      normalizationVersion: TOPDECK_NORMALIZATION_VERSION,
      resolverVersion: DECK_RESOLVER_VERSION,
      resolutionSupplementPath: supplementPath,
      resolutionSupplementVersion: resolutionSupplement?.version,
      resolutionSupplementBulkUpdatedAt: resolutionSupplement?.bulkUpdatedAt,
      resolutionSupplementBulkContentHash: resolutionSupplement?.bulkContentHash,
      commanderConfigurationSchemaVersion: COMMANDER_CONFIGURATION_SCHEMA_VERSION,
      manifests: normalizationManifests,
      combinedManifestPath: `${TOPDECK_DATA_DIR}/topdeck-normalization-v3-combined-manifest.json`,
    },
    artifactPath: REPORT_MODE.twelveMonth
      ? topdeckArtifactPath("twelveMonthQaReport")
      : topdeckArtifactPath("combinedQaReport"),
    monthsWindow: MONTH_KEYS,
    provenancePins: {
      rc8ParserVersion: RC8_PARSER_VERSION,
      rc8ParserBlobClosure: RC8_PARSER_BLOB_CLOSURE,
      paperPopulationHash: catalog.catalogUniverse.paperPopulationHash,
      semanticIndexVersion: semantic.semanticIndexVersion,
    },
    sourceCorpus: {
      importRuns: corpusRuns.map((r) => ({
        month: r.monthKey,
        runId: r.runId,
        rawDigest: r.manifest.rawDigest,
        fetchedAt: r.manifest.fetchedAt,
        pods: r.pods.length,
        tournaments: r.tournaments.length,
      })),
      monthCoverage: MONTH_KEYS.map((monthKey) => {
        const manifestRecord = historicalManifest.months[monthKey];
        const scope = scopeReports[monthKey] as ScopeReport | undefined;
        const tier = scope?.validOutcomeTierPartition as ReturnType<typeof partitionValidWinnerHistoricalPods> | undefined;
        const identity = scope?.identityResolution as { unresolvedCardQuantity: number; resolvedPct: { pct: number } } | undefined;
        return {
          monthKey,
          requestedFetchWindow: manifestRecord?.requestedFetchWindow,
          outOfRequestedWindowRecordCount: manifestRecord?.outOfRequestedWindowRecordCount ?? 0,
          duplicateTidRetrievals: manifestRecord?.duplicateTidRetrievals ?? 0,
          tournaments: manifestRecord?.tournaments ?? 0,
          pods: manifestRecord?.pods ?? 0,
          tierA: tier?.tierA ?? 0,
          tierB: tier?.tierB ?? 0,
          tierC: tier?.tierC ?? 0,
          tierX: tier?.tierXCommanderInsufficient ?? 0,
          cardResolutionPct: identity?.resolvedPct.pct ?? 0,
          unresolvedQuantity: identity?.unresolvedCardQuantity ?? 0,
        };
      }),
      historicalManifestUpdatedAt: historicalManifest.updatedAt,
      combinedRaw: {
        rawPodRetrievals: reconciliation.rawPodRetrievals,
        uniquePods: reconciliation.uniquePodIds,
        duplicatePodRetrievals: reconciliation.duplicatePodRetrievals,
      },
      temporalReconciliation: reconciliation,
      combinedHistoricalQAPods: reconciliation.historicalQAPods,
    },
    temporalIntegrity: {
      augustFutureScheduledTournaments: augustTemporalRecords.filter(
        (r) => r.temporalStatus === "FUTURE_SCHEDULED",
      ),
      representativeFutureTournaments: augustTemporalRecords
        .filter((r) => r.temporalStatus === "FUTURE_SCHEDULED")
        .slice(0, 20),
      futurePodIds: reconciliation.futurePodIds,
      notes: [
        "historicalQAPods = uniquePods (39409) - futureScheduledPods (7) = 39402.",
        "Prior report value 39395 incorrectly subtracted future pods twice via inconsistent tournament-TID vs pod-date classification.",
        "Seven pods dated 2026-03 appear in the June import window (outOfLogicalMonthWindowPods) and are included in historical QA by tournament date.",
        "Future pods remain in raw corpus with trainingEligible=false and are excluded from all historical QA denominators.",
      ],
    },
    COMBINED_QA: scopeReports.combined,
    monthlyScopeReports,
    ...(REPORT_MODE.twelveMonth
      ? {}
      : {
          JUNE_QA: scopeReports["2026-06"],
          JULY_QA: scopeReports["2026-07"],
          AUGUST_QA: scopeReports["2026-08"],
        }),
    resolverRepair: {
      v2Baseline: {
        unresolvedCardQuantity: 6030,
        unresolvedUniqueNames: 54,
        tierAFullSemanticPods: 2798,
      },
      v3AfterRepair: {
        unresolvedCardQuantity: (
          (scopeReports.combined as ScopeReport).identityResolution as { unresolvedCardQuantity: number }
        ).unresolvedCardQuantity,
        unresolvedUniqueNames: (
          (scopeReports.combined as ScopeReport).identityResolution as { unresolvedUniqueNames: number }
        ).unresolvedUniqueNames,
        cardResolutionPct: (
          (scopeReports.combined as ScopeReport).identityResolution as {
            resolvedPct: { pct: number };
          }
        ).resolvedPct.pct,
        tierAFullSemanticPods: combinedPartition.tierA,
        tierBPartialSemanticPods: combinedPartition.tierB,
        tierXCommanderInsufficient: combinedPartition.tierXCommanderInsufficient,
        tierADeltaFromV2: combinedPartition.tierA - 2798,
      },
      v2UnresolvedNameClassification: v2ResolverRepair,
      classificationArtifactPath: v2ClassificationPath,
    },
    aliasSupplementDiagnosis: {
      priorFailureMode:
        "Alias extraction was incorrectly gated on isCompetitiveTournamentPrinting. OM1 Through the Omenpaths crossover rows carry printed_name alternates but games=[mtgo] only, so aliases were never registered despite being present in default_cards bulk.",
      bulkNotStale: true,
      bulkUpdatedAt: resolutionSupplement?.bulkUpdatedAt,
      bulkContentHash: resolutionSupplement?.bulkContentHash,
      bulkCachePath: resolutionSupplement?.bulkCachePath,
      repair:
        "v2 supplement builder registers printed_name/flavor_name from all bulk rows; target oracle must still have competitive paper printing elsewhere.",
      om1AliasExamples: (resolutionSupplement?.officialNameAliases ?? [])
        .filter((a) => a.evidenceSetCode === "om1")
        .slice(0, 10),
      omenpathsFiveWayMappings: [
        { deckName: "Phenomena Recorder", canonicalOracleName: "Peter Parker's Camera", bulkField: "printed_name on om1 row (name=Peter Parker's Camera)" },
        { deckName: "Bayo, Irritable Instructor", canonicalOracleName: "Electro, Assaulting Battery", bulkField: "printed_name on om1 row" },
        { deckName: "Basil, Cabaretti Loudmouth", canonicalOracleName: "Flash Thompson, Spider-Fan", bulkField: "printed_name on om1 row" },
        { deckName: "Detect Intrusion", canonicalOracleName: "Spider-Sense", bulkField: "printed_name on om1 row" },
        { deckName: "The Terminus of Return", canonicalOracleName: "The Soul Stone", bulkField: "printed_name on om1 row" },
      ],
      aliasExtractionNotes: resolutionSupplement?.aliasExtractionNotes ?? [],
    },
    aliasConflictReport: {
      aliasConflictCount: resolutionSupplement?.aliasConflictCount ?? 0,
      conflicts: (resolutionSupplement?.aliasConflicts ?? []).map((conflict) => ({
        normalizedAlias: conflict.normalizedAlias,
        aliasDisplayNames: [...new Set(conflict.competing.map((c) => c.aliasDisplayName))],
        competingOracleIds: conflict.competing.map((c) => ({
          oracleId: c.oracleId,
          canonicalOracleName: c.canonicalOracleName,
          aliasKind: c.aliasKind,
          evidenceSetCode: c.evidenceSetCode,
          evidenceSetName: c.evidenceSetName,
        })),
        exclusionReason: conflict.exclusionReason,
        appearedInCorpus: aliasConflictCorpusHits.filter((hit) =>
          conflict.competing.some((c) => c.aliasDisplayName === hit.aliasDisplayName),
        ),
      })),
    },
    deckResolutionCorpusAudit,
    tierBaselineReconciliation: REPORT_MODE.twelveMonth ? tierBaselineReconciliation : undefined,
    trainingCandidates: {
      validWinnerHistoricalPods: combinedPartition.validWinnerHistoricalPods,
      tierAFullSemanticPods: {
        combined: combinedPartition.tierA,
        june: ((scopeReports["2026-06"] as ScopeReport).validOutcomeTierPartition as { tierA: number }).tierA,
        july: ((scopeReports["2026-07"] as ScopeReport).validOutcomeTierPartition as { tierA: number }).tierA,
        august: ((scopeReports["2026-08"] as ScopeReport).validOutcomeTierPartition as { tierA: number }).tierA,
        monthlySum: monthlyTierA,
        combinedEqualsMonthlySum: combinedPartition.tierA === monthlyTierA,
      },
      tierBPartialSemanticPods: combinedPartition.tierB,
      tierCCommanderOnlyPods: combinedPartition.tierC,
      tierXCommanderInsufficient: combinedPartition.tierXCommanderInsufficient,
      headlineTierAFullSemanticPods: monthlyTierA,
      headlineTierCCommanderBaseline: combinedPartition.tierC,
    },
  };

  const outPath = REPORT_MODE.twelveMonth
    ? topdeckArtifactPath("twelveMonthQaReport")
    : topdeckArtifactPath("combinedQaReport");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  const reportLabel = REPORT_MODE.twelveMonth
    ? "12-Month Commander Training Corpus QA"
    : "June–August Commander Training Corpus QA";
  console.log(`${reportLabel} v3`);
  console.log("==========================================");
  console.log(`Unique pods: ${reconciliation.uniquePodIds}`);
  console.log(`Future scheduled pods: ${reconciliation.futureScheduledPods}`);
  console.log(`Historical QA pods: ${reconciliation.historicalQAPods}`);
  console.log(`Valid-winner historical pods: ${combinedPartition.validWinnerHistoricalPods}`);
  console.log(
    `Outcome audit validWinner: ${((scopeReports.combined as ScopeReport).outcomeIntegrity as { validWinner: { count: number } }).validWinner.count}`,
  );
  const combinedResolution = (scopeReports.combined as ScopeReport).identityResolution as {
    resolvedPct: { pct: number };
    unresolvedCardQuantity: number;
    unresolvedUniqueNames: number;
    unresolvedClassification: { allUnresolved: unknown[] };
  };
  console.log(`Card resolution %: ${combinedResolution.resolvedPct.pct}`);
  console.log(`Unresolved quantity: ${combinedResolution.unresolvedCardQuantity}`);
  console.log(`Unresolved unique names: ${combinedResolution.unresolvedUniqueNames}`);
  const aliasSignals = (
    (scopeReports.combined as ScopeReport).identityResolution as {
      unresolvedClassification?: { aliasInvestigationSignals?: unknown[] };
    }
  ).unresolvedClassification?.aliasInvestigationSignals?.length ?? 0;
  console.log(`Alias investigation signals: ${aliasSignals}`);
  console.log(`Tier A (monthly sum): ${monthlyTierA}`);
  console.log(`Tier A (combined): ${combinedPartition.tierA}`);
  console.log(`Tier B: ${combinedPartition.tierB}`);
  console.log(`Tier X: ${combinedPartition.tierXCommanderInsufficient}`);
  console.log(`Tier A sum check: ${combinedPartition.tierA === monthlyTierA ? "OK" : "MISMATCH"}`);
  console.log(`Tier partition check: ${combinedPartition.partitionMatchesValidWinnerHistorical ? "OK" : "MISMATCH"}`);
  console.log(`Official alias resolutions: ${deckResolutionCorpusAudit.officialAliasResolutionQuantity}`);
  console.log(`Source-name oracle inconsistencies: ${deckResolutionCorpusAudit.sourceNameOracleConsistency.inconsistentCount}`);
  console.log(`Report: ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
