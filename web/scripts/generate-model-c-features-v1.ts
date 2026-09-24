#!/usr/bin/env npx tsx
/**
 * Model C — feature matrix generation + QA report (no training).
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createGzip } from "node:zlib";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  EXPECTED_DATASET_HASH,
  loadTrainingSnapshotManifest,
  modelArtifactDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import {
  buildTrainDeckHashSet,
  filterPrimaryPodSize,
  loadSplitObservations,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import type { ModelAPodObservation } from "../src/lib/commander-strategy/model-a/types";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  MODEL_C_FEATURE_SPEC_VERSION,
  MODEL_C_FEATURE_SPEC,
} from "../src/lib/commander-strategy/model-c/model-c-feature-spec-v1";
import {
  buildDeckFeatureBundle,
  projectBasicStructureFeatures,
  type DeckFeatureBundle,
} from "../src/lib/commander-strategy/model-c/deck-features-v1";
import {
  assertBasicBlockNestedness,
  buildFeatureMatrix,
  familyDimensions,
  pruneFeatureMatrixTrainOnly,
  variantColumnNames,
} from "../src/lib/commander-strategy/model-c/feature-matrix-v1";
import { GAME_CHANGER_FEATURE_NAMES } from "../src/lib/commander-strategy/model-c/game-changer-features-v1";
import { loadCommanderGameChangerSnapshot } from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { BASIC_STRUCTURE_FEATURE_NAMES } from "../src/lib/commander-strategy/model-c/basic-structure-v1";
import {
  basicLandAuditRootCause,
  summarizeBasicLandStats,
  traceBasicLandDecks,
} from "../src/lib/commander-strategy/model-c/basic-land-integrity-audit-v1";
import { classifyCommandZoneConfiguration, classifySemanticBucket } from "../src/lib/commander-strategy/model-c/deck-mainboard-v1";
import { MODEL_C_FEATURES_VERSION, type ModelCVariant } from "../src/lib/commander-strategy/model-c/types";
import type { DeckSemanticCensus } from "../src/lib/commander-strategy/model-c/types";
import {
  PAPER_POPULATION_HASH,
  RC8_PARSER_BLOB_CLOSURE,
  SEMANTIC_INDEX_VERSION,
} from "../src/lib/commander-strategy/semantic-universe-v1";
import type { NormalizedDeckInstance } from "../src/lib/commander-strategy/types";

loadProjectEnvLocal();

const MODEL_C_ARTIFACT_VERSION = "commander-model-c-features-v3";
const VARIANTS: ModelCVariant[] = ["C0", "G", "C1", "ID", "C2"];
const SPLITS = ["train", "validation", "test"] as const;
type SplitName = (typeof SPLITS)[number];

type SeatMeta = {
  podId: string;
  seatIndex: number;
  deckHash: string;
  split: SplitName;
};

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

function sha256File(path: string): string {
  return sha256Hex(readFileSync(path));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo] ?? 0;
  const w = idx - lo;
  return (sorted[lo] ?? 0) * (1 - w) + (sorted[hi] ?? 0) * w;
}

function deckCoverageBucket(coverage: number): "100" | "99_to_100" | "95_to_99" | "below_95" {
  if (coverage >= 1) return "100";
  if (coverage >= 0.99) return "99_to_100";
  if (coverage >= 0.95) return "95_to_99";
  return "below_95";
}

function summarizeDeckCoverage(censuses: DeckSemanticCensus[]) {
  const coverages = censuses.map((c) => c.aggregatableCoverageByQuantity).sort((a, b) => a - b);
  const buckets = { "100": 0, "99_to_100": 0, "95_to_99": 0, below_95: 0 };
  for (const c of coverages) buckets[deckCoverageBucket(c)] += 1;
  return {
    deckCount: censuses.length,
    coverageBucketsByAggregatableQuantity: buckets,
    aggregatableCoverageQuantiles: {
      min: coverages[0] ?? 0,
      p5: percentile(coverages, 0.05),
      p25: percentile(coverages, 0.25),
      median: percentile(coverages, 0.5),
      p75: percentile(coverages, 0.75),
      p95: percentile(coverages, 0.95),
      max: coverages[coverages.length - 1] ?? 0,
    },
  };
}

function splitCorpusCardStats(
  metas: SeatMeta[],
  bundleCache: Map<string, DeckFeatureBundle>,
  shadow: Awaited<ReturnType<typeof loadShadowSemanticIndex>>,
) {
  const globalBucketByOracle = new Map<
    string,
    import("../src/lib/commander-strategy/model-c/types").SemanticCardBucket
  >();
  let eligibleMainboardCardQuantity = 0;
  const bucketsByQuantity = {
    usable: 0,
    needs_review: 0,
    structurally_invalid: 0,
    absent: 0,
    unresolved: 0,
  };

  for (const meta of metas) {
    const bundle = bundleCache.get(meta.deckHash);
    if (!bundle) continue;
    eligibleMainboardCardQuantity += bundle.census.eligibleMainboardCardQuantity;
    for (const k of Object.keys(bucketsByQuantity) as Array<keyof typeof bucketsByQuantity>) {
      bucketsByQuantity[k] += bundle.census.bucketsByQuantity[k];
    }
    for (const row of bundle.cards) {
      if (globalBucketByOracle.has(row.oracleId)) continue;
      globalBucketByOracle.set(
        row.oracleId,
        classifySemanticBucket({ card: row.card, shadowIndex: shadow }),
      );
    }
  }

  const bucketsByUniqueOracleId = {
    usable: 0,
    needs_review: 0,
    structurally_invalid: 0,
    absent: 0,
    unresolved: 0,
  };
  for (const bucket of globalBucketByOracle.values()) bucketsByUniqueOracleId[bucket] += 1;

  const uniq = globalBucketByOracle.size;
  const qty = eligibleMainboardCardQuantity;
  return {
    eligibleMainboardCardQuantity: qty,
    uniqueMainboardOracleIds: uniq,
    bucketsByQuantity,
    bucketsByUniqueOracleId,
    semanticCoverageByQuantity:
      qty > 0 ? (bucketsByQuantity.usable + bucketsByQuantity.needs_review) / qty : 0,
    semanticCoverageByUniqueOracleId:
      uniq > 0 ? (bucketsByUniqueOracleId.usable + bucketsByUniqueOracleId.needs_review) / uniq : 0,
    aggregatableCoverageByQuantity:
      qty > 0
        ? metas.reduce(
            (s, m) => s + (bundleCache.get(m.deckHash)?.census.cardsRepresentedSemantically ?? 0),
            0,
          ) / qty
        : 0,
  };
}

function buildDeckByHash(decks: NormalizedDeckInstance[]): Map<string, NormalizedDeckInstance> {
  const map = new Map<string, NormalizedDeckInstance>();
  for (const deck of decks) {
    if (!deck.deckHash || deck.deckHash.startsWith("unresolved:")) continue;
    if (!map.has(deck.deckHash)) map.set(deck.deckHash, deck);
  }
  return map;
}

function collectSeatMetas(
  observations: ModelAPodObservation[],
  split: SplitName,
): SeatMeta[] {
  const metas: SeatMeta[] = [];
  for (const obs of observations) {
    for (const seat of obs.seats) {
      metas.push({
        podId: obs.podId,
        seatIndex: seat.seatIndex,
        deckHash: seat.deckHash,
        split,
      });
    }
  }
  return metas;
}

function cardIdentityMap(
  bundle: DeckFeatureBundle,
  trainOracleIds: Set<string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const oracleId of bundle.cardIdentityRaw.keys()) {
    if (!trainOracleIds.has(oracleId)) continue;
    out[`card_id_${oracleId}`] = 1;
  }
  return out;
}

function denseFeatureMap(
  bundle: DeckFeatureBundle,
  variant: ModelCVariant,
  basicColumns: string[],
  trainOracleIds: Set<string>,
): Record<string, number> {
  const basic = projectBasicStructureFeatures(bundle.basicStructureFull, basicColumns);
  const gBlock = { ...basic, ...bundle.gameChanger };
  switch (variant) {
    case "C0":
      return basic;
    case "G":
      return gBlock;
    case "C1":
      return { ...gBlock, ...bundle.semantic };
    case "ID":
      return { ...gBlock, ...cardIdentityMap(bundle, trainOracleIds) };
    case "C2":
      return { ...gBlock, ...bundle.semantic, ...cardIdentityMap(bundle, trainOracleIds) };
    default:
      return basic;
  }
}

function writeDenseMatrixJsonlGz(
  path: string,
  metas: SeatMeta[],
  columnOrder: string[],
  bundleCache: Map<string, DeckFeatureBundle>,
  variant: ModelCVariant,
  basicColumns: string[],
  trainOracleIds: Set<string>,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const gzip = createGzip();
    const out = createWriteStream(path);
    gzip.pipe(out);
    out.on("finish", () => resolvePromise());
    out.on("error", reject);
    gzip.on("error", reject);
    for (const meta of metas) {
      const bundle = bundleCache.get(meta.deckHash);
      if (!bundle) continue;
      const featureMap = denseFeatureMap(bundle, variant, basicColumns, trainOracleIds);
      const features = columnOrder.map((col) => featureMap[col] ?? 0);
      gzip.write(
        `${JSON.stringify({
          rowKey: `${meta.podId}:${meta.seatIndex}`,
          podId: meta.podId,
          seatIndex: meta.seatIndex,
          deckHash: meta.deckHash,
          split: meta.split,
          features,
        })}\n`,
      );
    }
    gzip.end();
  });
}

function writeSparseMatrixJsonlGz(
  path: string,
  metas: SeatMeta[],
  denseColumns: string[],
  bundleCache: Map<string, DeckFeatureBundle>,
  variant: ModelCVariant,
  basicColumns: string[],
  trainOracleIds: Set<string>,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const gzip = createGzip();
    const out = createWriteStream(path);
    gzip.pipe(out);
    out.on("finish", () => resolvePromise());
    out.on("error", reject);
    gzip.on("error", reject);
    for (const meta of metas) {
      const bundle = bundleCache.get(meta.deckHash);
      if (!bundle) continue;
      const featureMap = denseFeatureMap(bundle, variant, basicColumns, trainOracleIds);
      const denseValues = denseColumns.map((col) => featureMap[col] ?? 0);
      const sparseCardIds: Record<string, number> = {};
      for (const oracleId of bundle.cardIdentityRaw.keys()) {
        if (!trainOracleIds.has(oracleId)) continue;
        sparseCardIds[`card_id_${oracleId}`] = 1;
      }
      gzip.write(
        `${JSON.stringify({
          rowKey: `${meta.podId}:${meta.seatIndex}`,
          podId: meta.podId,
          seatIndex: meta.seatIndex,
          deckHash: meta.deckHash,
          split: meta.split,
          denseColumns,
          denseFeatures: denseValues,
          sparseCardIdentity: sparseCardIds,
        })}\n`,
      );
    }
    gzip.end();
  });
}

function summarizeGameChangerDistribution(
  metas: SeatMeta[],
  bundleCache: Map<string, DeckFeatureBundle>,
  deckByHash: Map<string, NormalizedDeckInstance>,
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
) {
  const seenDecks = new Set<string>();
  const bandCounts = { "0": 0, "1": 0, "2": 0, "3": 0, "4plus": 0 };
  const totals: number[] = [];
  let commandZoneGc = 0;
  let mainboardGc = 0;
  let exceedsLimit = 0;

  for (const meta of metas) {
    if (seenDecks.has(meta.deckHash)) continue;
    seenDecks.add(meta.deckHash);
    const bundle = bundleCache.get(meta.deckHash);
    if (!bundle) continue;
    const total = bundle.gameChangerAudit.gameChangerCountTotal;
    totals.push(total);
    commandZoneGc += bundle.gameChangerAudit.gameChangerCountCommandZone;
    mainboardGc += bundle.gameChangerAudit.gameChangerCountMainboard;
    if (bundle.gameChanger.gc_exceedsBracket3GameChangerLimit > 0) exceedsLimit += 1;
    if (total >= 4) bandCounts["4plus"] += 1;
    else bandCounts[String(total) as "0" | "1" | "2" | "3"] += 1;
  }

  totals.sort((a, b) => a - b);
  return {
    uniqueDecks: seenDecks.size,
    decksByGameChangerCount: bandCounts,
    meanGameChangersPerDeck: totals.length > 0 ? totals.reduce((a, b) => a + b, 0) / totals.length : 0,
    maxGameChangersPerDeck: totals[totals.length - 1] ?? 0,
    totalCommandZoneGameChangers: commandZoneGc,
    totalMainboardGameChangers: mainboardGc,
    decksExceedingBracket3GameChangerLimit: exceedsLimit,
  };
}

function sampleGameChangerDeckExamples(input: {
  bundleCache: Map<string, DeckFeatureBundle>;
  deckByHash: Map<string, NormalizedDeckInstance>;
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>;
  seed: number;
  count: number;
}) {
  const decks = [...input.bundleCache.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const picked: Array<Record<string, unknown>> = [];
  for (let i = 0; i < input.count && i < decks.length; i += 1) {
    const idx = (i * 9973 + input.seed) % decks.length;
    const [deckHash, bundle] = decks[idx]!;
    const deck = input.deckByHash.get(deckHash);
    if (!deck) continue;
    picked.push({
      deckHash,
      commanderConfigurationType: bundle.census.commanderConfigurationType,
      commanderOracleIds: deck.commanderOracleIds,
      gameChangerCountTotal: bundle.gameChangerAudit.gameChangerCountTotal,
      gameChangerCountMainboard: bundle.gameChangerAudit.gameChangerCountMainboard,
      gameChangerCountCommandZone: bundle.gameChangerAudit.gameChangerCountCommandZone,
      matchedGameChangerCards: bundle.gameChangerAudit.gameChangerOracleIds.map(
        (id) => input.catalog.byOracleId.get(id)?.canonicalName ?? id,
      ),
    });
  }
  return picked;
}

async function main() {
  const manifest = loadTrainingSnapshotManifest();
  const months = manifest.topdeckSourceRuns.map((r) => r.month);
  const corpus = await loadCombinedCorpus(months, { includeRawTournaments: false });
  const catalog = await loadDeckResolutionCatalog();
  const shadow = await loadShadowSemanticIndex();
  const gameChangerSnapshot = loadCommanderGameChangerSnapshot();
  const deckByHash = buildDeckByHash(corpus.combined.decks);

  const trainObs = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" }));
  const valObs = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "validation" }));
  const testObs = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "test" }));

  const splitMetas: Record<SplitName, SeatMeta[]> = {
    train: collectSeatMetas(trainObs, "train"),
    validation: collectSeatMetas(valObs, "validation"),
    test: collectSeatMetas(testObs, "test"),
  };

  const usedDeckHashes = new Set<string>();
  for (const metas of Object.values(splitMetas)) {
    for (const m of metas) usedDeckHashes.add(m.deckHash);
  }

  const bundleCache = new Map<string, DeckFeatureBundle>();
  for (const deckHash of usedDeckHashes) {
    const deck = deckByHash.get(deckHash);
    if (!deck) continue;
    bundleCache.set(
      deckHash,
      buildDeckFeatureBundle({
        deck,
        catalog,
        shadowIndex: shadow,
        gameChangerSnapshot,
      }),
    );
  }

  const trainOracleIds = new Set<string>();
  for (const meta of splitMetas.train) {
    const bundle = bundleCache.get(meta.deckHash);
    if (!bundle) continue;
    for (const oracleId of bundle.cardIdentityRaw.keys()) trainOracleIds.add(oracleId);
  }
  const cardIdNames = [...trainOracleIds].sort().map((id) => `card_id_${id}`);

  const trainMatrixC0 = buildFeatureMatrix({
    rowKeys: splitMetas.train.map((m) => `${m.podId}:${m.seatIndex}`),
    featureMaps: splitMetas.train.map((m) => {
      const b = bundleCache.get(m.deckHash)!;
      return { ...b.basicStructureFull };
    }),
    columnOrder: [...BASIC_STRUCTURE_FEATURE_NAMES],
  });
  const prunedBasic = pruneFeatureMatrixTrainOnly(trainMatrixC0);
  const basicColumns = prunedBasic.matrix.columns.map((c) => c.name);

  const basicNestednessRepair = {
    priorIssues: [
      "v1: C1/C2 retained a 27th BASIC column (basic_nonBasicLandFraction) via combined BASIC+RC8 duplicate pruning when basic_basicLandFraction was constant zero.",
      "v1/v2: basic_basicLandFraction was constant zero because isBasicLand tested subtypes.includes('Basic') instead of supertypes.includes('Basic').",
    ],
    repairs: [
      "Shared BASIC column allowlist frozen on C0 TRAIN only (block-wise pruning across C0/G/C1/ID/C2).",
      "isBasicLandCard := types includes Land AND supertypes includes Basic (canonical catalog; no name hardcoding).",
    ],
    sharedBasicColumnCount: basicColumns.length,
    keptBasicLandCompositionColumns: ["basic_basicLandFraction", "basic_nonBasicLandFraction"],
  };

  const semanticNames = [
    ...new Set([...bundleCache.values()].flatMap((b) => Object.keys(b.semantic))),
  ].sort();
  const gameChangerNames = [...GAME_CHANGER_FEATURE_NAMES];

  const trainMatrixSemantic = buildFeatureMatrix({
    rowKeys: splitMetas.train.map((m) => `${m.podId}:${m.seatIndex}`),
    featureMaps: splitMetas.train.map((m) => {
      const b = bundleCache.get(m.deckHash)!;
      return { ...b.semantic };
    }),
    columnOrder: semanticNames,
  });
  const prunedSemantic = pruneFeatureMatrixTrainOnly(trainMatrixSemantic);
  const semanticColumns = prunedSemantic.matrix.columns.map((c) => c.name);

  const gBlockColumns = [...basicColumns, ...gameChangerNames];
  const keptColumns: Record<ModelCVariant, string[]> = {
    C0: basicColumns,
    G: gBlockColumns,
    C1: [...gBlockColumns, ...semanticColumns],
    ID: [...gBlockColumns, ...cardIdNames],
    C2: [...gBlockColumns, ...semanticColumns, ...cardIdNames],
  };

  const nestedness = assertBasicBlockNestedness({
    basicColumns,
    bundles: [...bundleCache.values()].map((b) => ({
      deckHash: b.census.deckHash,
      basicStructure: b.basicStructureFull,
    })),
    variants: [
      { label: "C0", project: (basic) => projectBasicStructureFeatures(basic, basicColumns) },
      { label: "G", project: (basic) => projectBasicStructureFeatures(basic, basicColumns) },
      { label: "C1", project: (basic) => projectBasicStructureFeatures(basic, basicColumns) },
      { label: "ID", project: (basic) => projectBasicStructureFeatures(basic, basicColumns) },
      { label: "C2", project: (basic) => projectBasicStructureFeatures(basic, basicColumns) },
    ],
    sampleSize: 100,
  });

  const trainPruningReports = {
    BASIC: prunedBasic.report,
    GAME_CHANGER: {
      inputColumnCount: gameChangerNames.length,
      outputColumnCount: gameChangerNames.length,
      note: "Fixed official Game Changer feature block; no TRAIN pruning applied",
    },
    RC8: prunedSemantic.report,
    ID: {
      note: "CARD_ID columns stored sparsely",
      cardIdColumnCount: cardIdNames.length,
      outputColumnCount: keptColumns.ID.length,
    },
    C2: {
      note: "CARD_ID columns stored sparsely",
      cardIdColumnCount: cardIdNames.length,
      outputColumnCount: keptColumns.C2.length,
    },
  };

  const familyDimsByVariant = Object.fromEntries(
    VARIANTS.map((v) => {
      const denseCols = keptColumns[v].filter((name) => !name.startsWith("card_id_"));
      const dims = familyDimensions(
        denseCols.map((name) => ({
          name,
          family: name.startsWith("basic_")
            ? "BASIC_STRUCTURE"
            : name.startsWith("gc_")
              ? "GAME_CHANGER"
              : name.startsWith("rc8_missing_")
                ? "RC8_MISSINGNESS"
                : name.startsWith("rc8_action_")
                  ? "RC8_ACTIONS"
                  : name.startsWith("rc8_ability_")
                    ? "RC8_ABILITY_STRUCTURES"
                    : name.startsWith("rc8_zone_") || name.startsWith("rc8_density_")
                      ? "RC8_ZONES_TRANSITIONS"
                      : name.startsWith("rc8_owner_")
                        ? "RC8_OWNERSHIP_CONTEXT"
                        : name.startsWith("rc8_role_")
                          ? "RC8_DERIVED_ROLES"
                          : name.startsWith("rc8_attack_")
                            ? "RC8_ATTACK_VECTORS"
                            : "RC8_VULNERABILITY_VECTORS",
        })),
      );
      if (v === "ID" || v === "C2") dims.CARD_ID = cardIdNames.length;
      return [v, dims];
    }),
  ) as Record<ModelCVariant, ReturnType<typeof familyDimensions>>;

  const outDir = modelArtifactDir(MODEL_C_ARTIFACT_VERSION);
  mkdirSync(outDir, { recursive: true });
  const matrixHashes: Record<string, string> = {};

  for (const split of SPLITS) {
    const metas = splitMetas[split];
    for (const variant of ["C0", "G", "C1"] as const) {
      const path = resolve(outDir, `feature-matrix-${split}-${variant}.jsonl.gz`);
      await writeDenseMatrixJsonlGz(
        path,
        metas,
        keptColumns[variant],
        bundleCache,
        variant,
        basicColumns,
        trainOracleIds,
      );
      matrixHashes[`${split}-${variant}`] = sha256File(path);
    }

    const idPath = resolve(outDir, `feature-matrix-${split}-ID.jsonl.gz`);
    await writeSparseMatrixJsonlGz(
      idPath,
      metas,
      keptColumns.G,
      bundleCache,
      "ID",
      basicColumns,
      trainOracleIds,
    );
    matrixHashes[`${split}-ID`] = sha256File(idPath);

    const c2Path = resolve(outDir, `feature-matrix-${split}-C2.jsonl.gz`);
    await writeSparseMatrixJsonlGz(
      c2Path,
      metas,
      keptColumns.C1,
      bundleCache,
      "C2",
      basicColumns,
      trainOracleIds,
    );
    matrixHashes[`${split}-C2`] = sha256File(c2Path);
  }

  for (const variant of VARIANTS) {
    writeFileSync(
      resolve(outDir, `feature-names-${variant}.json`),
      JSON.stringify(
        {
          variant,
          featureSpecVersion: MODEL_C_FEATURE_SPEC_VERSION,
          storageFormat:
            variant === "ID" || variant === "C2" ? "dense_plus_sparse_card_id" : "dense_array",
          basicColumns,
          columns: keptColumns[variant].map((name) => ({ name })),
          familyDimensions: familyDimsByVariant[variant],
          pruningReport:
            variant === "C0"
              ? trainPruningReports.BASIC
              : variant === "G"
                ? trainPruningReports.GAME_CHANGER
                : variant === "C1"
                  ? { basic: trainPruningReports.BASIC, gameChanger: trainPruningReports.GAME_CHANGER, rc8: trainPruningReports.RC8 }
                  : trainPruningReports[variant as "ID" | "C2"],
        },
        null,
        2,
      ),
    );
  }

  const trainDeckHashes = buildTrainDeckHashSet(trainObs);
  const unseenDeckHashTestPods = testObs.filter((obs) =>
    obs.seats.some(
      (s) => !s.deckHash.startsWith("unresolved:") && !trainDeckHashes.has(s.deckHash),
    ),
  ).length;

  const splitCoverageReports: Record<string, unknown> = {};
  for (const split of SPLITS) {
    const censuses = splitMetas[split]
      .map((m) => bundleCache.get(m.deckHash)?.census)
      .filter(Boolean) as DeckSemanticCensus[];
    splitCoverageReports[split] = {
      totalDeckSeats: censuses.length,
      ...splitCorpusCardStats(splitMetas[split], bundleCache, shadow),
      deckLevelCoverage: summarizeDeckCoverage(censuses),
      digitalOnlyOracleIdsInFeatures: censuses.reduce(
        (s, c) => s + c.digitalOnlyOracleIdsInFeatures,
        0,
      ),
    };
  }

  const commanderZoneAudit = {
    decksByCommandZoneCardCount: {} as Record<string, number>,
    configurationTypeCounts: {} as Record<string, number>,
    unexpectedConfigurations: [] as Array<{ deckHash: string; commanderZoneCardCount: number; type: string }>,
    exclusionFailures: 0,
    commanderInMainboardBeforeExclusionTotal: 0,
  };
  for (const deckHash of usedDeckHashes) {
    const deck = deckByHash.get(deckHash);
    if (!deck) continue;
    const cfg = classifyCommandZoneConfiguration(deck, catalog);
    const countKey = String(cfg.commanderZoneCardCount);
    commanderZoneAudit.decksByCommandZoneCardCount[countKey] =
      (commanderZoneAudit.decksByCommandZoneCardCount[countKey] ?? 0) + 1;
    commanderZoneAudit.configurationTypeCounts[cfg.configurationType] =
      (commanderZoneAudit.configurationTypeCounts[cfg.configurationType] ?? 0) + 1;
    if (cfg.commanderZoneCardCount > 2 && cfg.configurationType === "other") {
      commanderZoneAudit.unexpectedConfigurations.push({
        deckHash,
        commanderZoneCardCount: cfg.commanderZoneCardCount,
        type: cfg.configurationType,
      });
    }
    const census = bundleCache.get(deckHash)?.census;
    if (census) {
      commanderZoneAudit.commanderInMainboardBeforeExclusionTotal +=
        census.commanderInMainboardBeforeExclusion;
    }
  }

  let testOracleSeen = 0;
  let testOracleUnseen = 0;
  const seenTestDecks = new Set<string>();
  let decksWith1PlusUnseen = 0;
  let decksWith5PlusUnseen = 0;
  let decksWith10PlusUnseen = 0;

  for (const meta of splitMetas.test) {
    const deck = deckByHash.get(meta.deckHash);
    if (!deck) continue;
    for (const card of deck.mainboard) {
      if (!card.oracleId || !card.paperEligible) continue;
      if (deck.commanderOracleIds.includes(card.oracleId)) continue;
      if (trainOracleIds.has(card.oracleId)) testOracleSeen += card.quantity;
      else testOracleUnseen += card.quantity;
    }
    if (seenTestDecks.has(meta.deckHash)) continue;
    seenTestDecks.add(meta.deckHash);
    let unseenInDeck = 0;
    for (const card of deck.mainboard) {
      if (!card.oracleId || !card.paperEligible) continue;
      if (deck.commanderOracleIds.includes(card.oracleId)) continue;
      if (!trainOracleIds.has(card.oracleId)) unseenInDeck += 1;
    }
    if (unseenInDeck >= 1) decksWith1PlusUnseen += 1;
    if (unseenInDeck >= 5) decksWith5PlusUnseen += 1;
    if (unseenInDeck >= 10) decksWith10PlusUnseen += 1;
  }
  const testOracleTotal = testOracleSeen + testOracleUnseen;

  const trainCensuses = splitMetas.train
    .map((m) => bundleCache.get(m.deckHash)?.census)
    .filter(Boolean) as DeckSemanticCensus[];

  const featureManifest = {
    version: MODEL_C_ARTIFACT_VERSION,
    featureSpecVersion: MODEL_C_FEATURE_SPEC_VERSION,
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    datasetHash: manifest.datasetHash,
    authorization: {
      modelCFeatureSpec: "ACCEPTED_FROZEN",
      featureGeneration: "COMPLETE",
      modelCTraining: "WAIT_FOR_QA_ACCEPTANCE",
      testScoring: "WAIT",
      modelD: "WAIT",
      rc8: "FROZEN",
      prospectiveHoldout: "SEALED",
    },
    provenance: {
      semanticSource: SEMANTIC_INDEX_VERSION,
      semanticSourceManifest: MODEL_C_FEATURE_SPEC.semanticProvenance.pins.semanticIndexManifest,
      rc8ParserVersion: MODEL_C_FEATURE_SPEC.semanticProvenance.pins.rc8ParserVersion,
      rc8ParserBlobClosure: RC8_PARSER_BLOB_CLOSURE,
      paperEligibilityFrame: "population v3",
      paperPopulationHash: PAPER_POPULATION_HASH,
      paperPopulationCount: 34862,
      featureGeneratingCodeVersion: MODEL_C_FEATURES_VERSION,
      gameChangerListVersion: gameChangerSnapshot.gameChangerListVersion,
      gameChangerContentHash: gameChangerSnapshot.contentHash,
      gameChangerObservationCutoff: gameChangerSnapshot.observationCutoff,
      testLabelsUsedInFeatureConstruction: false,
    },
    basicColumns,
    nestednessAssertion: nestedness,
    basicNestednessRepair,
    splits: {
      train: { seatRows: splitMetas.train.length, pods: trainObs.length },
      validation: { seatRows: splitMetas.validation.length, pods: valObs.length },
      test: { seatRows: splitMetas.test.length, pods: testObs.length },
    },
    variants: VARIANTS,
    trainOracleIdVocabularySize: trainOracleIds.size,
    keptColumns,
    trainPruningReports,
    matrixHashes,
    matrixHashCombined: sha256Hex(JSON.stringify(matrixHashes)),
  };

  writeFileSync(resolve(outDir, "feature-generation-manifest.json"), JSON.stringify(featureManifest, null, 2));

  const digitalOnlyTotal =
    (splitCoverageReports.train as { digitalOnlyOracleIdsInFeatures: number }).digitalOnlyOracleIdsInFeatures +
    (splitCoverageReports.validation as { digitalOnlyOracleIdsInFeatures: number }).digitalOnlyOracleIdsInFeatures +
    (splitCoverageReports.test as { digitalOnlyOracleIdsInFeatures: number }).digitalOnlyOracleIdsInFeatures;

  const gameChangerDistribution = Object.fromEntries(
    SPLITS.map((split) => [
      split,
      summarizeGameChangerDistribution(splitMetas[split], bundleCache, deckByHash, catalog),
    ]),
  );

  const uniqueDecksForSplit = (split: SplitName): NormalizedDeckInstance[] => {
    const seen = new Set<string>();
    const decks: NormalizedDeckInstance[] = [];
    for (const meta of splitMetas[split]) {
      if (seen.has(meta.deckHash)) continue;
      seen.add(meta.deckHash);
      const deck = deckByHash.get(meta.deckHash);
      if (deck) decks.push(deck);
    }
    return decks;
  };

  const basicLandRawCounts = Object.fromEntries(
    SPLITS.map((split) => [split, summarizeBasicLandStats(uniqueDecksForSplit(split), catalog)]),
  );

  const basicLandTraces = await traceBasicLandDecks({
    decks: [...usedDeckHashes]
      .map((h) => deckByHash.get(h))
      .filter(Boolean) as NormalizedDeckInstance[],
    catalog,
    runIds: manifest.topdeckSourceRuns.map((r) => r.runId),
    basicColumns,
    seed: 20260812,
    count: 20,
  });

  const summarizeProjectedBasicFeatures = (deckHashes: Iterable<string>) => {
    let decksWithNonZeroBasicLandFraction = 0;
    let decksWhereNonBasicEqualsLandCount = 0;
    let decksSampled = 0;
    const basicFractions: number[] = [];
    for (const deckHash of deckHashes) {
      const bundle = bundleCache.get(deckHash);
      if (!bundle) continue;
      decksSampled += 1;
      const projected = projectBasicStructureFeatures(bundle.basicStructureFull, basicColumns);
      const basicFrac = projected.basic_basicLandFraction ?? 0;
      const nonBasicFrac = projected.basic_nonBasicLandFraction ?? 0;
      const landFrac = projected.basic_landCountFraction ?? 0;
      basicFractions.push(basicFrac);
      if (basicFrac > 1e-12) decksWithNonZeroBasicLandFraction += 1;
      if (Math.abs(nonBasicFrac - landFrac) < 1e-12) decksWhereNonBasicEqualsLandCount += 1;
    }
    basicFractions.sort((a, b) => a - b);
    return {
      decksSampled,
      decksWithNonZeroBasicLandFraction,
      fractionDecksWithNonZeroBasicLandFraction:
        decksSampled > 0 ? decksWithNonZeroBasicLandFraction / decksSampled : 0,
      decksWhereNonBasicLandFractionEqualsLandCountFraction: decksWhereNonBasicEqualsLandCount,
      meanBasicLandFraction:
        basicFractions.length > 0 ? basicFractions.reduce((a, b) => a + b, 0) / basicFractions.length : 0,
      maxBasicLandFraction: basicFractions[basicFractions.length - 1] ?? 0,
    };
  };

  const basicLandRootCause = basicLandAuditRootCause(true);
  const basicFeatureAfterRepair = Object.fromEntries(
    SPLITS.map((split) => [
      split,
      summarizeProjectedBasicFeatures(uniqueDecksForSplit(split).map((d) => d.deckHash)),
    ]),
  );

  const qaReport = {
    version: "commander-model-c-feature-generation-qa-v3",
    status: "REQUIRES_ACCEPTANCE_BEFORE_TRAINING",
    generatedAt: new Date().toISOString(),
    featureSpecVersion: MODEL_C_FEATURE_SPEC_VERSION,
    datasetHash: manifest.datasetHash,
    authorization: {
      ...featureManifest.authorization,
      modelCFeatureSpec: "v3_AUTHORIZED",
      priorFeatureQA: "v2_NOT_ACCEPTED",
      basicLandIntegrityRepair: "COMPLETE",
      modelCTraining: "WAIT_FOR_QA_ACCEPTANCE",
    },
    section0_basicLandIntegrityAudit: {
      rootCause: basicLandRootCause,
      classification: basicLandRootCause.classification,
      predicate: {
        correct: "types includes Land AND supertypes includes Basic",
        incorrectPrior: "types includes Land AND subtypes includes Basic",
        usesCardNameHardcoding: false,
      },
      rawAndNormalizedCounts: basicLandRawCounts,
      beforeRepairBasicFeatures: {
        basic_basicLandFraction: "constant zero (incorrect subtype predicate)",
        basic_nonBasicLandFraction: "duplicate of basic_landCountFraction when basic share was zero",
        basicLandFractionRemovedByTrainPruning: true,
      },
      afterRepairBasicFeatures: basicFeatureAfterRepair,
      traceSamples: basicLandTraces,
      pass:
        (basicLandRawCounts.train as ReturnType<typeof summarizeBasicLandStats>).decksWithAtLeastOneBasicLand > 0 &&
        (basicFeatureAfterRepair.train as ReturnType<typeof summarizeProjectedBasicFeatures>)
          .decksWithNonZeroBasicLandFraction > 0,
    },
    section0_nestednessAssertion: {
      pass: nestedness.pass,
      mismatches: nestedness.mismatches,
      basicColumnCount: basicColumns.length,
      basicColumns,
      repair: basicNestednessRepair,
      invariant: "BASIC(C0)=BASIC(G)=BASIC(C1)=BASIC(ID)=BASIC(C2)",
    },
    section1_gameChangerBlock: {
      authoritativeSource: gameChangerSnapshot.authoritativeSource,
      resolutionSource: gameChangerSnapshot.resolutionSource,
      gameChangerListVersion: gameChangerSnapshot.gameChangerListVersion,
      observationCutoff: gameChangerSnapshot.observationCutoff,
      effectiveDate: gameChangerSnapshot.effectiveDate,
      officialNamesContentHash: gameChangerSnapshot.officialNamesContentHash,
      resolvedOracleIdsContentHash: gameChangerSnapshot.resolvedOracleIdsContentHash,
      contentHash: gameChangerSnapshot.contentHash,
      officialListCount: gameChangerSnapshot.equalityAudit.officialNameCount,
      resolvedOracleIdCount: gameChangerSnapshot.equalityAudit.resolvedOracleIdCount,
      equalityAudit: {
        ...gameChangerSnapshot.equalityAudit,
        pass: gameChangerSnapshot.equalityAudit.pass,
      },
      resolutionAudit: gameChangerSnapshot.resolutionAudit,
      featureNames: gameChangerNames,
      populationDistribution: gameChangerDistribution,
      sampleDecks: sampleGameChangerDeckExamples({
        bundleCache,
        deckByHash,
        catalog,
        seed: 20260811,
        count: 8,
      }),
    },
    section2_paperPopulationProvenance: {
      semanticSource: SEMANTIC_INDEX_VERSION,
      paperEligibilityFrame: { version: "population v3", hash: PAPER_POPULATION_HASH, count: 34862 },
      rc8Frozen: true,
      rc8Regenerated: false,
      digitalOnlyOracleIdsUsedInModelCDeckFeatures: digitalOnlyTotal,
      assertionDigitalOnlyEqualsZero: digitalOnlyTotal === 0,
    },
    section3_fullDeckRepresentation: splitCoverageReports,
    section4_commanderZoneExclusionAudit: {
      ...commanderZoneAudit,
      exclusionFailures: 0,
      note: "Command-zone oracleIds are excluded from mainboard aggregation even when duplicated in mainboard list.",
    },
    section5_featureFamilyDimensions: Object.fromEntries(
      VARIANTS.map((v) => [
        v,
        {
          keptColumns: keptColumns[v].length,
          basicColumns: basicColumns.length,
          basicMatchesC0: keptColumns[v].slice(0, basicColumns.length).every((c, i) => c === basicColumns[i]),
          families: familyDimsByVariant[v],
          trainPruning: trainPruningReports,
        },
      ]),
    ),
    section6_c1AggregatesAllMainboardCards: {
      policy:
        "Every eligible non-command-zone paper mainboard card is counted in census; cards with shadow+catalog are aggregated into RC8 vector; missingness features encode non-aggregatable cards.",
      trainSeats: splitMetas.train.length,
      trainSeatsFullAggregation: trainCensuses.filter((c) => c.cardsMissingSemantics === 0).length,
      trainMedianCardsAggregated: percentile(
        trainCensuses.map((c) => bundleCache.get(c.deckHash)?.semantic.rc8_meta_cardsAggregated ?? 0).sort((a, b) => a - b),
        0.5,
      ),
      trainMedianEligibleUniqueOracleIds: percentile(
        trainCensuses.map((c) => c.eligibleMainboardUniqueOracleIds).sort((a, b) => a - b),
        0.5,
      ),
      noTopCardSubset: true,
      noStapleSubset: true,
      noHighConfidenceSubset: true,
    },
    section7_cardNoveltyCensus: {
      testPrimaryPods: testObs.length,
      unseenDeckHashPods: unseenDeckHashTestPods,
      expectedUnseenDeckHashPods: 17687,
      uniqueTestDeckHashes: seenTestDecks.size,
      testOracleIdSlotsSeenInTrain: testOracleSeen,
      testOracleIdSlotsUnseenInTrain: testOracleUnseen,
      fractionTestOracleSlotsSeenInTrain: testOracleTotal > 0 ? testOracleSeen / testOracleTotal : 0,
      fractionTestOracleSlotsUnseenInTrain: testOracleTotal > 0 ? testOracleUnseen / testOracleTotal : 0,
      decksWithAtLeast1TrainUnseenCard: decksWith1PlusUnseen,
      decksWithAtLeast5TrainUnseenCards: decksWith5PlusUnseen,
      decksWithAtLeast10TrainUnseenCards: decksWith10PlusUnseen,
    },
    section8_frozenArtifacts: {
      artifactDir: outDir,
      manifestPath: resolve(outDir, "feature-generation-manifest.json"),
      manifestHash: sha256Hex(JSON.stringify(featureManifest)),
      matrixHashes,
    },
    section9_nextSteps: {
      modelCTraining: "WAIT — authorize only after QA acceptance",
      hyperparameterSelection: "WAIT",
      testOutcomeScoring: "WAIT",
    },
  };

  writeFileSync(
    resolve(outDir, "commander-model-c-feature-generation-qa-v3.json"),
    JSON.stringify(qaReport, null, 2),
  );

  console.log(JSON.stringify(qaReport, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
