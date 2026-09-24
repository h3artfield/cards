#!/usr/bin/env npx tsx
/**
 * Deliverable 1: TopDeck ingestion QA report v2 (observational only — no trained matchup claims).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import {
  loadProjectEnvLocal,
  resolveTopdeckApiKey,
  redactEnvForReport,
} from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { testTopdeckConnectivity } from "../src/lib/commander-strategy/topdeck/client";
import { TOPDECK_ATTRIBUTION } from "../src/lib/commander-strategy/topdeck/types";
import {
  accumulateCommanderPodStats,
  toCoPodObservation,
} from "../src/lib/commander-strategy/commander-copod-stats-v1";
import {
  topdeckArtifactPath,
  topdeckRawRunDir,
  TOPDECK_DATA_DIR,
} from "../src/lib/commander-strategy/topdeck/artifact-paths";
import type {
  NormalizedDeckInstance,
  TopdeckImportRun,
  TopdeckIngestionQaReport,
  TopdeckPodGame,
} from "../src/lib/commander-strategy/types";
import { TOPDECK_QA_REPORT_VERSION } from "../src/lib/commander-strategy/types";

loadProjectEnvLocal();

function parseRunId(): string | undefined {
  const idx = process.argv.indexOf("--run");
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

function findLatestRunId(): string | undefined {
  const runsDir = `${TOPDECK_DATA_DIR}/topdeckImportRuns`;
  if (!existsSync(runsDir)) return undefined;
  return readdirSync(runsDir).sort().pop();
}

function pct(num: number, den: number): number {
  return den > 0 ? Number(((num / den) * 100).toFixed(2)) : 0;
}

function commanderName(
  oracleId: string,
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
): string {
  return catalog.byOracleId.get(oracleId)?.canonicalName ?? oracleId;
}

function commanderConfigKey(ids: string[]): string {
  return [...ids].sort().join("|");
}

async function main() {
  const runId = parseRunId() ?? findLatestRunId();
  if (!runId) throw new Error("No import run found. Run: npm run topdeck:import");

  const runDir = topdeckRawRunDir(runId);
  const podsPath = `${runDir}/normalized-pods.json`;
  const decksPath = `${runDir}/normalized-decks.json`;
  const statsPath = `${runDir}/aggregate-stats.json`;
  const manifestPath = `${runDir}/run-manifest.json`;

  if (!existsSync(podsPath) || !existsSync(decksPath)) {
    throw new Error(`Normalized artifacts missing for run ${runId}.`);
  }

  const catalog = await loadDeckResolutionCatalog();
  const pods = JSON.parse(readFileSync(podsPath, "utf8")) as TopdeckPodGame[];
  const decks = JSON.parse(readFileSync(decksPath, "utf8")) as NormalizedDeckInstance[];
  const aggregate = existsSync(statsPath)
    ? (JSON.parse(readFileSync(statsPath, "utf8")) as {
        aggregateStats: Record<string, unknown>;
        sourceFormatBreakdown: Record<string, number>;
        duplicateTids: number;
        tournamentMeta?: Array<{
          tid: string;
          name?: string;
          startDate?: number;
          participants?: number;
          city?: string;
          state?: string;
        }>;
      })
    : null;
  const importRun = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as TopdeckImportRun)
    : undefined;

  const envReport = redactEnvForReport();
  const authenticated =
    envReport.topDeckApiKeyDetected &&
    (await testTopdeckConnectivity(process.env.TOPDECK_API_KEY ?? ""));

  const completedPods = pods.filter((p) => p.status === "Completed");
  const winnerPods = completedPods.filter((p) => p.winnerPlayerIdHash || p.draw);
  const drawPods = completedPods.filter((p) => p.draw);

  const unresolvedNameCounts = new Map<string, number>();
  let unresolvedCardCount = 0;
  let resolvedMainCards = 0;
  let totalMainCards = 0;
  let digitalOnlyEncounters = 0;
  let nonPaperEncounters = 0;
  let commanderResolved = 0;
  let commanderTotal = 0;

  const commanderSet = new Set<string>();
  const deckHashCounts = new Map<string, number>();
  const playerIds = new Set<string>();
  const configCounts: Record<string, number> = {};

  for (const deck of decks) {
    playerIds.add(deck.playerIdHash);
    deckHashCounts.set(deck.deckHash, (deckHashCounts.get(deck.deckHash) ?? 0) + 1);
    for (const cmd of deck.commanderOracleIds) commanderSet.add(cmd);
    if (deck.commanderOracleIds.length > 0) {
      const key = commanderConfigKey(deck.commanderOracleIds);
      configCounts[key] = (configCounts[key] ?? 0) + 1;
    }
    commanderTotal += deck.commanders.length;
    commanderResolved += deck.commanders.filter((c) => c.resolutionStatus === "resolved").length;
    digitalOnlyEncounters += deck.digitalOnlyCardCount ?? 0;
    nonPaperEncounters += deck.nonPaperCardCount ?? 0;

    for (const card of deck.mainboard) {
      totalMainCards += card.quantity;
      if (card.resolutionStatus === "resolved") resolvedMainCards += card.quantity;
      else {
        unresolvedCardCount += card.quantity;
        unresolvedNameCounts.set(card.sourceName, (unresolvedNameCounts.get(card.sourceName) ?? 0) + card.quantity);
      }
    }
  }

  const uniqueDeckHashes = deckHashCounts.size;
  const duplicateDeckAppearances = decks.length - uniqueDeckHashes;

  const participantDistribution: Record<string, number> = {};
  const tournamentSizeDistribution: Record<string, number> = {};
  const dateDistribution: Record<string, number> = {};
  const eventNameCounts = new Map<string, number>();

  for (const meta of aggregate?.tournamentMeta ?? []) {
    const pBucket =
      meta.participants == null
        ? "unknown"
        : meta.participants <= 8
          ? "<=8"
          : meta.participants <= 16
            ? "9-16"
            : meta.participants <= 32
              ? "17-32"
              : meta.participants <= 64
                ? "33-64"
                : "65+";
    participantDistribution[pBucket] = (participantDistribution[pBucket] ?? 0) + 1;
    tournamentSizeDistribution[pBucket] = (tournamentSizeDistribution[pBucket] ?? 0) + 1;
    if (meta.startDate) {
      const month = new Date(meta.startDate * 1000).toISOString().slice(0, 7);
      dateDistribution[month] = (dateDistribution[month] ?? 0) + 1;
    }
    if (meta.name) eventNameCounts.set(meta.name, (eventNameCounts.get(meta.name) ?? 0) + 1);
  }

  const { commanderStats, pairStats } = accumulateCommanderPodStats(completedPods);

  const commanderDeckCounts = new Map<string, Set<string>>();
  for (const deck of decks) {
    const cmd = deck.commanderOracleIds[0];
    if (!cmd) continue;
    const set = commanderDeckCounts.get(cmd) ?? new Set<string>();
    set.add(deck.deckHash);
    commanderDeckCounts.set(cmd, set);
  }

  const topCommandersByAppearances = [...commanderStats.values()]
    .sort((a, b) => b.pods - a.pods)
    .slice(0, 25)
    .map((s) => ({
      oracleId: s.oracleId,
      name: commanderName(s.oracleId, catalog),
      count: s.pods,
    }));

  const topCommandersByUniqueDecks = [...commanderDeckCounts.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, 25)
    .map(([oracleId, set]) => ({
      oracleId,
      name: commanderName(oracleId, catalog),
      count: set.size,
    }));

  const topCommandersByWins = [...commanderStats.values()]
    .sort((a, b) => b.wins - a.wins)
    .slice(0, 25)
    .map((s) => ({
      oracleId: s.oracleId,
      name: commanderName(s.oracleId, catalog),
      wins: s.wins,
      pods: s.pods,
    }));

  const topPairs = [...pairStats.values()]
    .sort((a, b) => b.sharedPodCount - a.sharedPodCount)
    .slice(0, 25)
    .map((p) => ({
      a: commanderName(p.aOracleId, catalog),
      b: commanderName(p.bOracleId, catalog),
      sharedPods: p.sharedPodCount,
    }));

  const topUnresolvedCardNames = [...unresolvedNameCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 100)
    .map(([name, count]) => ({ name, count }));

  const dates = decks.map((d) => d.tournamentDate).filter((d) => d !== "unknown").sort();
  const agg = aggregate?.aggregateStats ?? {};

  const uniquePodIds = new Set(pods.map((p) => p.podId));
  const duplicatePodRecords = pods.length - uniquePodIds.size;
  let unresolvedCommanderCount = 0;
  for (const deck of decks) {
    unresolvedCommanderCount += deck.commanders.filter((c) => c.resolutionStatus === "unresolved").length;
  }

  const report: TopdeckIngestionQaReport = {
    reportVersion: TOPDECK_QA_REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    importRunId: runId,
    sourcePopulation: "topdeck_edh_tournaments",
    topDeckApiKeyDetected: envReport.topDeckApiKeyDetected,
    topDeckApiKeySource: (envReport.topDeckApiKeySource === "none"
      ? "none"
      : envReport.topDeckApiKeySource) as TopdeckIngestionQaReport["topDeckApiKeySource"],
    topdeckAttribution: TOPDECK_ATTRIBUTION,
    disclaimer:
      "TopDeck EDH tournament corpus — observational co-pod performance only. " +
      "NOT representative of all Commander. NOT head-to-head win rates. NOT trained matchup predictions. " +
      "Insufficient sample → matchup = UNKNOWN.",
    connection: {
      authenticated,
      apiVersion: "v2",
      importStart: importRun?.rangeStart,
      importEnd: importRun?.rangeEnd,
      fetchWindows: importRun?.fetchMetrics?.windows ?? [],
      failedRequests: importRun?.fetchMetrics?.failedRequests ?? 0,
      retries: importRun?.fetchMetrics?.retries ?? 0,
      rateLimit429Count: importRun?.fetchMetrics?.rateLimit429Count ?? 0,
    },
    catalogUniverse: importRun?.catalogUniverse ?? catalog.catalogUniverse,
    tournaments: {
      tournamentsFetched: new Set(decks.map((d) => d.tid)).size,
      dateRange: { start: dates[0], end: dates[dates.length - 1] },
      exactDuplicateTids: aggregate?.duplicateTids ?? 0,
      participantDistribution,
      sourceFormatBreakdown: aggregate?.sourceFormatBreakdown ?? {},
      tournamentSizeDistribution,
      dateDistribution,
      geographicSamples: (aggregate?.tournamentMeta ?? [])
        .filter((m) => m.city || m.state)
        .slice(0, 25)
        .map((m) => ({ tid: m.tid, city: m.city, state: m.state })),
      repeatedEventNames: [...eventNameCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([name, count]) => ({ name, count })),
    },
    pods: {
      roundsObserved: Number(agg.roundsObserved ?? 0),
      totalTables: Number(agg.pods ?? pods.length),
      completedPods: Number(agg.completedPods ?? completedPods.length),
      pendingPods: Number(agg.pendingPods ?? 0),
      activePods: Number(agg.activePods ?? 0),
      excludedPods: Number(agg.excludedPods ?? 0),
      podSizeDistribution: (agg.podSizeCounts as Record<string, number>) ?? {},
      winnerCoveragePct: pct(winnerPods.length, completedPods.length),
      drawOrNoWinnerCoveragePct: pct(drawPods.length + Number(agg.noWinnerPods ?? 0), completedPods.length),
    },
    decklists: {
      deckAppearances: Number(agg.deckAppearances ?? decks.length),
      decklistAvailablePct: pct(
        decks.filter((d) => d.decklistAvailable).length,
        decks.length,
      ),
      deckObjAvailablePct: pct(decks.filter((d) => d.deckObjAvailable).length, decks.length),
      structuredCommanderAvailablePct: pct(
        decks.filter((d) => d.structuredCommanderAvailable).length,
        decks.length,
      ),
      parsedTextCommanderAvailablePct: pct(
        decks.filter((d) => d.parsedTextCommanderAvailable).length,
        decks.length,
      ),
    },
    identityResolution: {
      commanderResolvedPct: pct(commanderResolved, commanderTotal),
      commanderUnresolvedPct: pct(commanderTotal - commanderResolved, commanderTotal),
      deckCardsResolvedPct: pct(resolvedMainCards, totalMainCards),
      unresolvedCardCount,
      unresolvedUniqueCardNames: [...unresolvedNameCounts.keys()],
      topUnresolvedCardNames,
      digitalOnlyCardEncounters: digitalOnlyEncounters,
      nonPaperCardEncounters: nonPaperEncounters,
    },
    decks: {
      uniqueCanonicalDeckHashCount: uniqueDeckHashes,
      duplicateDeckAppearances,
      uniqueCommanderIdentities: commanderSet.size,
      commanderConfigurationCounts: Object.fromEntries(
        Object.entries(configCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 25),
      ),
    },
    deduplication: {
      exactDuplicateTournamentRecords: aggregate?.duplicateTids ?? 0,
      duplicateTidRetrievals: importRun?.fetchMetrics?.duplicateTidRetrievals ?? 0,
      uniquePodIds: uniquePodIds.size,
      duplicatePodRecords,
      unresolvedCommanderCount,
    },
    players: {
      uniqueHashedPlayerIds: playerIds.size,
      repeatPlayerRate:
        decks.length > 0
          ? Number(((decks.length - playerIds.size) / decks.length).toFixed(4))
          : 0,
    },
    coPodPerformance: {
      topCommandersByAppearances,
      topCommandersByUniqueDecks,
      topCommandersByWins,
      topCommanderPairsSharingPods: topPairs,
      sampleObservations: [...pairStats.values()]
        .filter((p) => p.sharedPodCount >= 3)
        .sort((a, b) => b.sharedPodCount - a.sharedPodCount)
        .slice(0, 25)
        .map((p) => toCoPodObservation(p)),
    },
  };

  const outPath = topdeckArtifactPath("qaReport");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log("TopDeck Ingestion QA Report v2");
  console.log("==============================");
  console.log(`Run: ${runId}`);
  console.log(`topDeckApiKeyDetected: ${report.topDeckApiKeyDetected} (${report.topDeckApiKeySource})`);
  console.log(`Authenticated: ${report.connection.authenticated}`);
  console.log(`Catalog: raw=${report.catalogUniverse.rawCatalogIdentitiesLoaded} paper=${report.catalogUniverse.paperIdentitiesAvailable}`);
  console.log(`Tournaments: ${report.tournaments.tournamentsFetched}`);
  console.log(`Pods completed: ${report.pods.completedPods} / ${report.pods.totalTables}`);
  console.log(`Commander resolved: ${report.identityResolution.commanderResolvedPct}%`);
  console.log(`Deck cards resolved: ${report.identityResolution.deckCardsResolvedPct}%`);
  console.log(`Digital-only encounters: ${report.identityResolution.digitalOnlyCardEncounters}`);
  console.log(`Report: ${outPath}`);
  console.log(report.disclaimer);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
