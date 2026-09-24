#!/usr/bin/env npx tsx
/**
 * P0–P5: Final snapshot audit, freeze commander-semantic-training-12m-v1,
 * prospective holdout registry, chronological train/val/test splits.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import {
  loadCombinedCorpus,
  filterDecksForScope,
  filterPodsForScope,
} from "../src/lib/commander-strategy/combined-corpus-v1";
import { twelveMonthWindowKeys } from "../src/lib/commander-strategy/topdeck/historical-window-v1";
import {
  topdeckRawRunDir,
  TOPDECK_DATA_DIR,
  topdeckArtifactPath,
} from "../src/lib/commander-strategy/topdeck/artifact-paths";
import { auditFinalResolverCorpus } from "../src/lib/commander-strategy/deck-resolution-final-audit-v1";
import { buildTierBaselineReconciliation } from "../src/lib/commander-strategy/tier-baseline-reconciliation-v1";
import { partitionValidWinnerHistoricalPods, classifyValidOutcomeTier } from "../src/lib/commander-strategy/valid-outcome-tier-partition-v1";
import { classifyPodObservability } from "../src/lib/commander-strategy/tier-classification-v1";
import { classifyTableOutcome } from "../src/lib/commander-strategy/pod-outcome-audit-v1";
import { isHistoricalQAPod } from "../src/lib/commander-strategy/corpus-reconciliation-v1";
import { buildCommanderConfiguration } from "../src/lib/commander-strategy/commander-configuration-v1";
import { COMMANDER_CONFIGURATION_SCHEMA_VERSION } from "../src/lib/commander-strategy/commander-configuration-v1";
import {
  saveProspectiveHoldoutManifest,
  PROSPECTIVE_HOLDOUT_CUTOFF_DATE,
  COMMANDER_PROSPECTIVE_HOLDOUT_V1,
  prospectiveHoldoutArtifactPath,
} from "../src/lib/commander-strategy/commander-prospective-holdout-v1";
import {
  OBSERVATION_WINDOW,
  REQUESTED_SOURCE_WINDOW_START,
  REQUESTED_SOURCE_WINDOW_END,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import {
  loadSemanticUniverseManifest,
  RC8_PARSER_BLOB_CLOSURE,
  RC8_PARSER_VERSION,
} from "../src/lib/commander-strategy/semantic-universe-v1";
import {
  DECK_RESOLVER_VERSION,
  DECK_SEMANTIC_PROFILE_VERSION,
  STRATEGY_TAXONOMY_VERSION,
  TOPDECK_NORMALIZATION_VERSION,
  type NormalizedDeckInstance,
  type TopdeckNormalizationManifest,
  type TopdeckPodGame,
} from "../src/lib/commander-strategy/types";

loadProjectEnvLocal();

export const COMMANDER_SEMANTIC_TRAINING_12M_V1 = "commander-semantic-training-12m-v1";

const MONTHS = twelveMonthWindowKeys(new Date("2026-08-11T00:00:00.000Z"));
const JUNE_AUG = ["2026-06", "2026-07", "2026-08"];
const TRAIN_MONTHS = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"];
const VAL_MONTHS = ["2026-03", "2026-04"];
const TEST_MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08"];

const OUT_DIR = resolve(TOPDECK_DATA_DIR, "training-snapshots", COMMANDER_SEMANTIC_TRAINING_12M_V1);
const SUPPLEMENT_PATH = resolve(
  process.cwd(),
  "data/milestones/catalog-shadow/catalog-deck-resolution-supplement-v1.json",
);

function podOutcomeFromNormalizedPod(pod: TopdeckPodGame): ReturnType<typeof classifyTableOutcome> {
  const tableId = String(pod.table ?? "").toLowerCase();
  if (pod.status === "Bye" || tableId === "byes" || tableId === "bye") return "bye";
  if (pod.status !== "Completed") return "unfinishedWinnerNull";
  if (pod.draw) return "explicitDraw";
  if (!pod.winnerPlayerIdHash) return "completedButWinnerNull";
  return pod.participants.some((p) => p.playerIdHash === pod.winnerPlayerIdHash)
    ? "validWinner"
    : "invalidWinnerId";
}

function computeTierPartition(input: {
  pods: TopdeckPodGame[];
  decks: NormalizedDeckInstance[];
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>;
  corpus: Awaited<ReturnType<typeof loadCombinedCorpus>>;
}) {
  const deckById = new Map(input.decks.map((d) => [d.deckInstanceId, d]));
  const podOutcomeById = new Map<string, ReturnType<typeof classifyTableOutcome>>();
  for (const pod of input.pods) {
    podOutcomeById.set(pod.podId, podOutcomeFromNormalizedPod(pod));
  }
  return partitionValidWinnerHistoricalPods({
    pods: input.pods,
    deckById,
    podOutcomeById,
    historical: (pod) => isHistoricalQAPod(pod, input.corpus),
    catalog: input.catalog,
    useStoredResolutionOnly: true,
  });
}

function collectTierAPodIds(input: {
  pods: TopdeckPodGame[];
  decks: NormalizedDeckInstance[];
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>;
  corpus: Awaited<ReturnType<typeof loadCombinedCorpus>>;
}): string[] {
  const deckById = new Map(input.decks.map((d) => [d.deckInstanceId, d]));
  const podOutcomeById = new Map<string, ReturnType<typeof classifyTableOutcome>>();
  for (const pod of input.pods) {
    podOutcomeById.set(pod.podId, podOutcomeFromNormalizedPod(pod));
  }
  const ids: string[] = [];
  for (const pod of input.pods) {
    if (pod.status !== "Completed" || pod.participants.length < 2) continue;
    const outcomeState = podOutcomeById.get(pod.podId);
    if (outcomeState !== "validWinner") continue;
    const podObs = classifyPodObservability({
      pod,
      deckById,
      historical: isHistoricalQAPod(pod, input.corpus),
      outcomeState,
      catalog: input.catalog,
      useStoredResolutionOnly: true,
    });
    if (!podObs.historical) continue;
    if (classifyValidOutcomeTier({ podObs, deckById, pod }) === "TIER_A") {
      ids.push(pod.podId);
    }
  }
  return ids;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const catalog = await loadDeckResolutionCatalog();
  loadSemanticUniverseManifest();
  const supplement = existsSync(SUPPLEMENT_PATH)
    ? (JSON.parse(readFileSync(SUPPLEMENT_PATH, "utf8")) as {
        version?: string;
        bulkUpdatedAt?: string;
        bulkContentHash?: string;
      })
    : null;

  const importRuns: Array<{
    month: string;
    runId: string;
    rawDigest: string;
    normalizedDatasetHash: string;
  }> = [];

  let allDecks: NormalizedDeckInstance[] = [];
  let allPods: TopdeckPodGame[] = [];
  let tournamentCount = 0;
  const tierAPodIds: string[] = [];
  const deckHashes = new Set<string>();
  const commanderConfigIds = new Set<string>();
  const playerHashes = new Set<string>();
  const podSizeCounts: Record<string, number> = {};

  let juneAugTierA = 0;
  let juneAugTierB = 0;
  let juneAugTierC = 0;
  let juneAugTierX = 0;
  let twelveMonthTierA = 0;
  let twelveMonthTierB = 0;
  let twelveMonthTierC = 0;
  let twelveMonthTierX = 0;
  let validOutcomePodCount = 0;

  for (const monthKey of MONTHS) {
    const corpus = await loadCombinedCorpus([monthKey], { includeRawTournaments: false });
    const manifestPath = `${topdeckRawRunDir(corpus.runs[0]!.runId)}/normalization-manifest-v3.json`;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as TopdeckNormalizationManifest;
    importRuns.push({
      month: monthKey,
      runId: corpus.runs[0]!.runId,
      rawDigest: corpus.runs[0]!.manifest.rawDigest,
      normalizedDatasetHash: manifest.normalizedDatasetHash,
    });
    tournamentCount += manifest.tournamentCount;

    const pods = filterPodsForScope(corpus, monthKey, true);
    const decks = filterDecksForScope(corpus, monthKey, true);
    allPods.push(...pods);
    allDecks.push(...decks);

    for (const pod of pods) {
      podSizeCounts[String(pod.participants.length)] =
        (podSizeCounts[String(pod.participants.length)] ?? 0) + 1;
      if (podOutcomeFromNormalizedPod(pod) === "validWinner") validOutcomePodCount += 1;
    }
    for (const deck of decks) {
      if (deck.deckHash && !deck.deckHash.startsWith("unresolved:")) deckHashes.add(deck.deckHash);
      const config = buildCommanderConfiguration({
        commanderOracleIds: deck.commanderOracleIds,
        commanderNames: deck.commanders.map((c) => c.sourceName),
      });
      if (config) commanderConfigIds.add(config.commanderConfigurationId);
      if (deck.playerIdHash) playerHashes.add(deck.playerIdHash);
    }

    const tier = computeTierPartition({ pods, decks, catalog, corpus });
    tierAPodIds.push(...collectTierAPodIds({ pods, decks, catalog, corpus }));
    twelveMonthTierA += tier.tierA;
    twelveMonthTierB += tier.tierB;
    twelveMonthTierC += tier.tierC;
    twelveMonthTierX += tier.tierXCommanderInsufficient;

    if (JUNE_AUG.includes(monthKey)) {
      juneAugTierA += tier.tierA;
      juneAugTierB += tier.tierB;
      juneAugTierC += tier.tierC;
      juneAugTierX += tier.tierXCommanderInsufficient;
    }
  }

  const uniqueTierAPodIds = [...new Set(tierAPodIds)].sort();
  if (uniqueTierAPodIds.length !== twelveMonthTierA) {
    throw new Error(
      `Tier A pod id count mismatch: ids=${uniqueTierAPodIds.length} partition=${twelveMonthTierA}`,
    );
  }

  const juneAugustAllCommanderKnown = juneAugTierA + juneAugTierB + juneAugTierC;

  const resolverAudit = auditFinalResolverCorpus({ decks: allDecks, catalog });

  const tierBaseline = buildTierBaselineReconciliation({
    v2TierAJuneAugust: 2798,
    juneAugustTierA: juneAugTierA,
    juneAugustTierB: juneAugTierB,
    juneAugustAllCommanderKnown,
    twelveMonthTierA,
  });

  if (!resolverAudit.identityResolutionIndependent) {
    throw new Error(
      `Resolver audit failed: violations=${resolverAudit.finalCandidateCountViolations.length} ambiguous=${resolverAudit.ambiguousAfterFilteringQuantity}`,
    );
  }

  const tournamentToMonth = new Map<string, string>();
  for (const pod of allPods) {
    const month = pod.canonicalMonth ?? pod.tournamentDate.slice(0, 7);
    if (!tournamentToMonth.has(pod.tid)) tournamentToMonth.set(pod.tid, month);
  }

  function tournamentsForMonths(months: string[]): string[] {
    return [...tournamentToMonth.entries()]
      .filter(([, m]) => months.includes(m))
      .map(([tid]) => tid)
      .sort();
  }

  const trainTids = tournamentsForMonths(TRAIN_MONTHS);
  const valTids = tournamentsForMonths(VAL_MONTHS);
  const testTids = tournamentsForMonths(TEST_MONTHS);
  const overlap = trainTids.filter((t) => valTids.includes(t) || testTids.includes(t));
  if (overlap.length > 0) {
    throw new Error(`Tournament leakage across splits: ${overlap.slice(0, 5).join(", ")}`);
  }

  const podById = new Map(allPods.map((p) => [p.podId, p]));
  const trainTierAPods = uniqueTierAPodIds.filter((podId) => {
    const pod = podById.get(podId);
    if (!pod) return false;
    const month = pod.canonicalMonth ?? pod.tournamentDate.slice(0, 7);
    return TRAIN_MONTHS.includes(month);
  });
  const valTierAPods = uniqueTierAPodIds.filter((podId) => {
    const pod = podById.get(podId);
    if (!pod) return false;
    const month = pod.canonicalMonth ?? pod.tournamentDate.slice(0, 7);
    return VAL_MONTHS.includes(month);
  });
  const testTierAPods = uniqueTierAPodIds.filter((podId) => {
    const pod = podById.get(podId);
    if (!pod) return false;
    const month = pod.canonicalMonth ?? pod.tournamentDate.slice(0, 7);
    return TEST_MONTHS.includes(month);
  });

  const trainDeckHashes = new Set<string>();
  const testDeckHashesUnseenInTrain = new Set<string>();
  const trainCommanderConfigs = new Set<string>();
  for (const deck of allDecks) {
    const month = deck.canonicalMonth ?? deck.tournamentDate.slice(0, 7);
    if (deck.deckHash && !deck.deckHash.startsWith("unresolved:") && TRAIN_MONTHS.includes(month)) {
      trainDeckHashes.add(deck.deckHash);
    }
    const config = buildCommanderConfiguration({
      commanderOracleIds: deck.commanderOracleIds,
      commanderNames: deck.commanders.map((c) => c.sourceName),
    });
    if (config && TRAIN_MONTHS.includes(month)) trainCommanderConfigs.add(config.commanderConfigurationId);
  }
  for (const deck of allDecks) {
    if (!deck.deckHash || deck.deckHash.startsWith("unresolved:")) continue;
    const month = deck.canonicalMonth ?? deck.tournamentDate.slice(0, 7);
    if (TEST_MONTHS.includes(month) && !trainDeckHashes.has(deck.deckHash)) {
      testDeckHashesUnseenInTrain.add(deck.deckHash);
    }
  }

  const snapshotCore = {
    version: COMMANDER_SEMANTIC_TRAINING_12M_V1,
    requestedSourceWindowStart: REQUESTED_SOURCE_WINDOW_START,
    requestedSourceWindowEnd: REQUESTED_SOURCE_WINDOW_END,
    observationCutoff: PROSPECTIVE_HOLDOUT_CUTOFF_DATE,
    observationWindow: OBSERVATION_WINDOW,
    startDate: REQUESTED_SOURCE_WINDOW_START,
    endDate: REQUESTED_SOURCE_WINDOW_END,
    historicalFetchBoundary: PROSPECTIVE_HOLDOUT_CUTOFF_DATE,
    tournamentCount,
    historicalPodCount: allPods.length,
    validOutcomePodCount,
    tierAFullSemanticPods: twelveMonthTierA,
    tierBPartialSemanticPods: twelveMonthTierB,
    tierCCommanderOnlyPods: twelveMonthTierC,
    tierXCommanderInsufficient: twelveMonthTierX,
    podSizeDistribution: podSizeCounts,
    uniqueCommanderConfigurations: commanderConfigIds.size,
    uniqueDeckHashes: deckHashes.size,
    uniquePlayers: playerHashes.size,
    normalizationVersion: TOPDECK_NORMALIZATION_VERSION,
    resolverVersion: DECK_RESOLVER_VERSION,
    commanderConfigurationSchemaVersion: COMMANDER_CONFIGURATION_SCHEMA_VERSION,
    rc8ParserVersion: RC8_PARSER_VERSION,
    rc8ParserBlobClosure: RC8_PARSER_BLOB_CLOSURE,
    semanticProfileVersion: DECK_SEMANTIC_PROFILE_VERSION,
    strategyTaxonomyVersion: STRATEGY_TAXONOMY_VERSION,
    paperPopulationHash: catalog.catalogUniverse.paperPopulationHash,
    resolutionSupplementVersion: supplement?.version,
    resolutionSupplementBulkUpdatedAt: supplement?.bulkUpdatedAt,
    resolutionSupplementBulkContentHash: supplement?.bulkContentHash,
    topdeckSourceRuns: importRuns,
    generatedAt: new Date().toISOString(),
  };

  const datasetHash = createHash("sha256")
    .update(JSON.stringify({ ...snapshotCore, tierAPodIds: uniqueTierAPodIds }))
    .digest("hex");

  const splits = {
    observationWindow: OBSERVATION_WINDOW,
    testPeriodLabel: OBSERVATION_WINDOW.testPeriodLabel,
    train: {
      months: TRAIN_MONTHS,
      tournamentIds: trainTids,
      tierAPodIds: trainTierAPods,
      tierAPodCount: trainTierAPods.length,
    },
    validation: {
      months: VAL_MONTHS,
      tournamentIds: valTids,
      tierAPodIds: valTierAPods,
      tierAPodCount: valTierAPods.length,
    },
    test: {
      months: TEST_MONTHS,
      tournamentIds: testTids,
      tierAPodIds: testTierAPods,
      tierAPodCount: testTierAPods.length,
    },
    noTournamentLeakage: true,
    cohorts: {
      testDeckHashesSeenInTrain: [...trainDeckHashes].filter((h) =>
        allDecks.some(
          (d) =>
            d.deckHash === h &&
            TEST_MONTHS.includes(d.canonicalMonth ?? d.tournamentDate.slice(0, 7)),
        ),
      ).length,
      testDeckHashesNeverSeenInTrain: testDeckHashesUnseenInTrain.size,
      testCommanderConfigurationsSeenInTrain: [...commanderConfigIds].filter((id) => {
        return allDecks.some((d) => {
          const month = d.canonicalMonth ?? d.tournamentDate.slice(0, 7);
          if (!TEST_MONTHS.includes(month)) return false;
          const config = buildCommanderConfiguration({
            commanderOracleIds: d.commanderOracleIds,
            commanderNames: d.commanders.map((c) => c.sourceName),
          });
          return config?.commanderConfigurationId === id && trainCommanderConfigs.has(id);
        });
      }).length,
    },
  };

  const manifest = {
    ...snapshotCore,
    datasetHash,
    tierAPodIds: uniqueTierAPodIds,
    tierBaselineReconciliation: tierBaseline,
    resolverFinalAudit: resolverAudit,
    chronologicalSplits: splits,
    modelingGate: {
      modelA: "authorized",
      modelB: "authorized_after_model_a",
      modelC: "authorized_after_snapshot_freeze",
      modelD: "authorized_after_model_c",
      probabilityMatrix: "authorized_after_model_d_validation",
      extendHistoricalBackfill: "wait",
      productionFirestore: "wait",
    },
  };

  const manifestPath = resolve(OUT_DIR, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  writeFileSync(resolve(OUT_DIR, "chronological-splits-v1.json"), JSON.stringify(splits, null, 2));

  saveProspectiveHoldoutManifest({
    version: COMMANDER_PROSPECTIVE_HOLDOUT_V1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    cutoffDate: PROSPECTIVE_HOLDOUT_CUTOFF_DATE,
    policy:
      "Tournaments with tournamentDate after 2026-08-11 accumulate into prospective holdout only. Do not merge into commander-semantic-training-12m-v1.",
    tournamentIds: [],
    podIds: [],
    importRunIds: [],
    note: "Registry initialized at snapshot freeze. Future TopDeck imports after cutoff append here.",
  });

  console.log("commander-semantic-training-12m-v1 FROZEN");
  console.log(`datasetHash: ${datasetHash}`);
  console.log(`Tier A full-semantic pods: ${twelveMonthTierA}`);
  console.log(`June-Aug Tier A (final resolver v3.3): ${juneAugTierA}`);
  console.log(`June-Aug valid-winner all-commander-known: ${juneAugustAllCommanderKnown}`);
  console.log(`v2 pipeline-honest Tier A reference: 2798`);
  console.log(`Increase vs comparable Jun-Aug final-resolver: ${twelveMonthTierA - juneAugTierA}`);
  console.log(`Increase vs v2 pipeline-honest baseline: ${twelveMonthTierA - 2798}`);
  console.log(
    `Resolver audit: ${resolverAudit.resolvedCardQuantity}/${resolverAudit.totalCardQuantity} resolved`,
  );
  console.log(
    `Commander-legal step entries: ${resolverAudit.commanderLegalDisambiguation.entriesRequiringStepQuantity}`,
  );
  console.log(`Manifest: ${manifestPath}`);
  console.log(`Prospective holdout: ${topdeckArtifactPath("prospectiveHoldout")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
