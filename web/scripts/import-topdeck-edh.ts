#!/usr/bin/env npx tsx
/**
 * TopDeck EDH ingestion — config-keyed checkpoints, auto window subdivision on 503.
 *
 * Default: 3-month window, local study artifacts only (NO production Firestore).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { createGzip } from "node:zlib";
import { createWriteStream } from "node:fs";
import {
  loadProjectEnvLocal,
  resolveTopdeckApiKey,
  redactEnvForReport,
} from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { TopdeckClient, testTopdeckConnectivity } from "../src/lib/commander-strategy/topdeck/client";
import { TOPDECK_BULK_EDH_REQUEST, TOPDECK_ATTRIBUTION } from "../src/lib/commander-strategy/topdeck/types";
import { normalizeTournament } from "../src/lib/commander-strategy/topdeck/normalize";
import {
  topdeckArtifactPath,
  topdeckRawRunDir,
} from "../src/lib/commander-strategy/topdeck/artifact-paths";
import {
  batchWriteNormalizedData,
  writeTopdeckImportRun,
  writeTopdeckTournament,
} from "../src/lib/commander-strategy/topdeck/firestore-writer";
import { TOPDECK_IMPORTER_VERSION, type TopdeckImportRun } from "../src/lib/commander-strategy/types";
import {
  importConfigKey,
  logicalMonthWindows,
  monthKeyFromWindow,
} from "../src/lib/commander-strategy/topdeck/window-planner";
import {
  loadConfigCheckpoint,
  saveConfigCheckpoint,
} from "../src/lib/commander-strategy/topdeck/import-checkpoint";
import { fetchLogicalMonthWithSubdivision } from "../src/lib/commander-strategy/topdeck/fetch-with-subdivision";
import {
  loadHistoricalImportManifest,
  saveHistoricalImportManifest,
  upsertMonthRecord,
} from "../src/lib/commander-strategy/topdeck/historical-manifest";

loadProjectEnvLocal();

function parseArgs() {
  const args = process.argv.slice(2);
  let months = 3;
  let writeFirestore = false;
  let dryRun = false;
  let startOverride: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--months" && args[i + 1]) months = Number.parseInt(args[i + 1], 10);
    if (args[i] === "--write-firestore") writeFirestore = true;
    if (args[i] === "--dry-run") dryRun = true;
    if (args[i] === "--start" && args[i + 1]) startOverride = args[i + 1];
  }
  return { months, writeFirestore, dryRun, startOverride };
}

async function main() {
  const { months, writeFirestore, dryRun, startOverride } = parseArgs();
  const keyInfo = resolveTopdeckApiKey();
  const envReport = redactEnvForReport();

  if (!keyInfo.detected && !dryRun) {
    throw new Error("TOPDECK_API_KEY not detected. Checked process env, web/.env.local, repo/.env.local.");
  }
  if (writeFirestore) {
    console.warn("WARNING: --write-firestore enabled. QA approval recommended before production writes.");
  }

  const startAt = startOverride ? new Date(startOverride) : new Date();
  if (!startOverride) {
    startAt.setUTCDate(1);
    startAt.setUTCHours(0, 0, 0, 0);
    startAt.setUTCMonth(startAt.getUTCMonth() - (months - 1));
  }

  const configKey = importConfigKey({ startAt, months });
  const checkpoint = loadConfigCheckpoint(configKey);
  const logicalMonths = logicalMonthWindows({ startAt, months });

  const runId = checkpoint.lastRunId ?? `topdeck-edh-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runDir = topdeckRawRunDir(runId);
  mkdirSync(runDir, { recursive: true });

  console.log(`TopDeck EDH import run ${runId}`);
  console.log(`Config key: ${configKey}`);
  console.log(`Logical months: ${logicalMonths.map((w) => w.label).join(", ")}`);
  console.log(`API key detected: ${envReport.topDeckApiKeyDetected} (${envReport.topDeckApiKeySource})`);

  if (keyInfo.detected && !dryRun) {
    const ok = await testTopdeckConnectivity(process.env.TOPDECK_API_KEY!);
    console.log(`Connectivity test: ${ok ? "OK" : "FAILED"}`);
    if (!ok) throw new Error("TopDeck connectivity test failed.");
  }

  const client = new TopdeckClient(process.env.TOPDECK_API_KEY ?? "dry-run-placeholder");
  const catalog = await loadDeckResolutionCatalog();
  console.log(
    `Catalog: raw=${catalog.catalogUniverse.rawCatalogIdentitiesLoaded} paper=${catalog.catalogUniverse.paperIdentitiesAvailable}`,
  );

  const rawPath = `${runDir}/raw-tournaments.jsonl.gz`;
  const gzip = createGzip();
  const rawStream = createWriteStream(rawPath);
  gzip.pipe(rawStream);

  const seenTids = new Set<string>();
  let duplicateTids = 0;
  const allDeckInstances = new Map<string, ReturnType<typeof normalizeTournament>["deckInstances"][0]>();
  const allPodGames = new Map<string, ReturnType<typeof normalizeTournament>["podGames"][0]>();
  const tournamentMeta: Array<Record<string, unknown>> = [];
  const aggregateStats = {
    pods: 0,
    completedPods: 0,
    pendingPods: 0,
    activePods: 0,
    excludedPods: 0,
    roundsObserved: 0,
    podSizeCounts: {} as Record<string, number>,
    deckAppearances: 0,
    decklistAvailable: 0,
    deckObjAvailable: 0,
    structuredCommanderAvailable: 0,
    parsedTextCommanderAvailable: 0,
    draws: 0,
    winnerAssigned: 0,
    noWinnerPods: 0,
  };
  const sourceFormatBreakdown: Record<string, number> = {};
  let tournamentCount = 0;

  const historical = loadHistoricalImportManifest();

  for (const logicalMonth of logicalMonths) {
    console.log(`Importing logical month ${logicalMonth.label}`);
    if (dryRun) continue;

    const monthCheckpoint = loadConfigCheckpoint(`${configKey}:${logicalMonth.label}`);
    const fetchResult = await fetchLogicalMonthWithSubdivision({
      client,
      logicalMonth,
      baseRequest: TOPDECK_BULK_EDH_REQUEST,
      resumeCompletedWindows: monthCheckpoint.completedFetchWindows,
      resumeMissingIntervals: monthCheckpoint.missingIntervals,
    });

    monthCheckpoint.completedFetchWindows = fetchResult.fetchWindowsUsed;
    monthCheckpoint.missingIntervals = fetchResult.missingIntervals;
    monthCheckpoint.lastRunId = runId;
    saveConfigCheckpoint(monthCheckpoint);

    let monthOutOfWindowPods = 0;

    for (const tournament of fetchResult.tournaments) {
      const tid = tournament.TID ?? "unknown";
      if (seenTids.has(tid)) {
        duplicateTids += 1;
        continue;
      }
      seenTids.add(tid);
      tournamentCount += 1;

      gzip.write(`${JSON.stringify({ fetchedAt: new Date().toISOString(), tournament, logicalMonth: logicalMonth.label })}\n`);

      const fmt = tournament.format ?? "EDH";
      sourceFormatBreakdown[fmt] = (sourceFormatBreakdown[fmt] ?? 0) + 1;
      tournamentMeta.push({
        tid,
        name: tournament.tournamentName,
        startDate: tournament.startDate,
        participants: tournament.standings?.length,
        city: tournament.eventData?.city,
        state: tournament.eventData?.state,
      });

      const normalized = normalizeTournament({
        tournament,
        catalog,
        requestedFetchWindow: logicalMonth.label,
      });
      for (const pod of normalized.podGames) {
        if (pod.canonicalMonth && pod.canonicalMonth !== logicalMonth.label) {
          monthOutOfWindowPods += 1;
        }
      }
      for (const deck of normalized.deckInstances) {
        allDeckInstances.set(deck.deckInstanceId, deck);
      }
      for (const pod of normalized.podGames) {
        allPodGames.set(pod.podId, pod);
      }

      aggregateStats.pods += normalized.stats.pods;
      aggregateStats.completedPods += normalized.stats.completedPods;
      aggregateStats.pendingPods += normalized.stats.pendingPods;
      aggregateStats.activePods += normalized.stats.activePods;
      aggregateStats.excludedPods += normalized.stats.excludedPods;
      aggregateStats.roundsObserved += normalized.stats.roundsObserved;
      aggregateStats.deckAppearances += normalized.stats.deckAppearances;
      aggregateStats.decklistAvailable += normalized.stats.decklistAvailable;
      aggregateStats.deckObjAvailable += normalized.stats.deckObjAvailable;
      aggregateStats.structuredCommanderAvailable += normalized.stats.structuredCommanderAvailable;
      aggregateStats.parsedTextCommanderAvailable += normalized.stats.parsedTextCommanderAvailable;
      aggregateStats.draws += normalized.stats.draws;
      aggregateStats.winnerAssigned += normalized.stats.winnerAssigned;
      aggregateStats.noWinnerPods += normalized.stats.noWinnerPods;
      for (const [k, v] of Object.entries(normalized.stats.podSizeCounts)) {
        aggregateStats.podSizeCounts[k] = (aggregateStats.podSizeCounts[k] ?? 0) + v;
      }

      if (writeFirestore) {
        await writeTopdeckTournament(tid, {
          tid,
          tournamentName: tournament.tournamentName,
          startDate: tournament.startDate,
          game: tournament.game,
          format: tournament.format,
          importedAt: new Date().toISOString(),
          importRunId: runId,
          sourcePopulation: "topdeck_edh_tournaments",
        });
      }
    }

    const monthKey = monthKeyFromWindow(logicalMonth);
    const monthPods = [...allPodGames.values()].filter((p) => p.tournamentDate.startsWith(monthKey));
    upsertMonthRecord(historical, monthKey, {
      status: fetchResult.status,
      logicalRange: {
        start: logicalMonth.start.toISOString().slice(0, 10),
        end: logicalMonth.end.toISOString().slice(0, 10),
      },
      requestedFetchWindow: logicalMonth.label,
      outOfRequestedWindowRecordCount: monthOutOfWindowPods,
      tournaments: fetchResult.tournaments.length,
      pods: monthPods.length,
      fetchWindows: fetchResult.fetchWindowsUsed,
      missingIntervals: fetchResult.missingIntervals,
      duplicateTidRetrievals: fetchResult.duplicateTidRetrievals,
      runId,
      generatedAt: new Date().toISOString(),
      requestLogSummary: {
        totalRequests: client.metrics.requestLog.length,
        retries: client.metrics.retries,
        rateLimit429Count: client.metrics.rateLimit429Count,
        splitDepthMax: client.metrics.splitDepthMax,
      },
    });
    saveHistoricalImportManifest(historical);

    console.log(
      `  ${logicalMonth.label}: ${fetchResult.status} — ${fetchResult.tournaments.length} tournaments, missing=${fetchResult.missingIntervals.join("; ") || "none"}`,
    );
  }

  checkpoint.lastRunId = runId;
  saveConfigCheckpoint(checkpoint);

  await new Promise<void>((resolve, reject) => {
    gzip.end();
    rawStream.on("finish", () => resolve());
    rawStream.on("error", reject);
  });

  const rawDigest = dryRun ? "dry-run" : createHash("sha256").update(readFileSync(rawPath)).digest("hex");
  const podGames = [...allPodGames.values()];
  const outOfRequestedWindowRecordCount = podGames.filter(
    (p) => p.requestedFetchWindow && p.canonicalMonth && p.canonicalMonth !== p.requestedFetchWindow,
  ).length;

  const importRun: TopdeckImportRun = {
    runId,
    source: "TopDeck",
    apiVersion: "v2",
    game: "Magic: The Gathering",
    format: "EDH",
    rangeStart: logicalMonths[0]?.start.toISOString() ?? "",
    rangeEnd: logicalMonths[logicalMonths.length - 1]?.end.toISOString() ?? "",
    requestedFetchWindows: logicalMonths.map((m) => m.label),
    outOfRequestedWindowRecordCount,
    fetchedAt: new Date().toISOString(),
    tournamentCount,
    rawDigest,
    importerVersion: TOPDECK_IMPORTER_VERSION,
    checkpointPath: configKey,
    status: "completed",
    fetchMetrics: client.metrics,
    catalogUniverse: catalog.catalogUniverse,
  };

  writeFileSync(`${runDir}/run-manifest.json`, JSON.stringify(importRun, null, 2));
  writeFileSync(topdeckArtifactPath("latestRunManifest"), JSON.stringify(importRun, null, 2));

  const deckInstances = [...allDeckInstances.values()];
  writeFileSync(`${runDir}/normalized-decks.json`, JSON.stringify(deckInstances, null, 0));
  writeFileSync(`${runDir}/normalized-pods.json`, JSON.stringify(podGames, null, 0));
  writeFileSync(
    `${runDir}/aggregate-stats.json`,
    JSON.stringify({ aggregateStats, sourceFormatBreakdown, duplicateTids, tournamentMeta, configKey }, null, 2),
  );

  if (writeFirestore && !dryRun) {
    await batchWriteNormalizedData({ deckInstances, podGames, writeFirestore: true });
    await writeTopdeckImportRun(importRun);
  }

  console.log(`Done. Tournaments: ${tournamentCount}, pods: ${podGames.length}, unique pods: ${allPodGames.size}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
