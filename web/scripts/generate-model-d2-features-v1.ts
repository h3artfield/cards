#!/usr/bin/env npx tsx
/**
 * Model D2 — TRAIN + VALIDATION feature generation + QA (no training, no TEST).
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import readline from "node:readline";
import { loadProjectEnvLocal } from "./lib/script-env";
import { lookupGoldenByName } from "./lib/load-golden-catalog-index";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  filterPrimaryPodSize,
  loadSplitObservations,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import type { ModelAPodObservation } from "../src/lib/commander-strategy/model-a/types";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import {
  EXPECTED_DATASET_HASH,
  loadTrainingSnapshotManifest,
  modelArtifactDir,
  trainingSnapshotDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import {
  columnNamesForVariant as c2ColumnNames,
  featureMatrixPath as c2FeatureMatrixPath,
} from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import { buildDeckInteractionProfileV2_1 } from "../src/lib/commander-strategy/interaction-profile-v2.1/deck-interaction-profile-v2.1";
import { MATCHUP_PAIRINGS_V2_1 } from "../src/lib/commander-strategy/interaction-profile-v2.1/matchup-ontology-v2.1";
import {
  assertFeatureNesting,
  checkNumericIntegrity,
  computeColumnVariance,
  findDuplicateColumns,
  findNearDuplicateColumns,
  modelD2VariantFeatureNames,
  sanitizeFeatureMap,
} from "../src/lib/commander-strategy/model-d2/feature-matrix-v1";
import {
  MODEL_D2_FEATURE_SPEC,
  MODEL_D2_FEATURE_SPEC_VERSION,
} from "../src/lib/commander-strategy/model-d2/model-d2-feature-spec-v1";
import { OPPONENT_REDUCERS, VARIANCE_CONVENTION } from "../src/lib/commander-strategy/model-d2/opponent-reducers-v1";
import {
  assertPermutationInvariant,
  buildPodIpv2FeaturesForSeat,
  interactionFeatureNames,
  opponentMarginalFeatureNames,
  recomputeInteractionFeature,
  selfProfileFeatureNames,
} from "../src/lib/commander-strategy/model-d2/pod-ipv2-features-v1";
import { MODEL_D2_FEATURES_VERSION, type ModelD2Variant } from "../src/lib/commander-strategy/model-d2/types";
import type { DeckInteractionProfileV2_1 } from "../src/lib/commander-strategy/interaction-profile-v2.1/types";
import type { NormalizedDeckInstance } from "../src/lib/commander-strategy/types";

loadProjectEnvLocal();

const VARIANTS: ModelD2Variant[] = ["P0", "P1", "D2"];
const SPLITS = ["train", "validation"] as const;
const ARTIFACT_DIR = modelArtifactDir(MODEL_D2_FEATURES_VERSION);

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function loadC2RowMap(split: (typeof SPLITS)[number]) {
  const path = c2FeatureMatrixPath(split, "C2");
  const columnNames = c2ColumnNames("C2");
  const denseNames = columnNames.filter((n) => !n.startsWith("card_id_"));
  const map = new Map<
    string,
    { denseValues: number[]; sparseCardIdentity?: Record<string, number> }
  >();
  const input = createReadStream(path).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const raw = JSON.parse(line) as Record<string, unknown>;
    const rowKey = String(raw.rowKey);
    const denseColumns = raw.denseColumns as string[];
    const denseFeatures = raw.denseFeatures as number[];
    const denseByName = Object.fromEntries(denseColumns.map((name, i) => [name, denseFeatures[i] ?? 0]));
    const denseValues = denseNames.map((name) => denseByName[name] ?? 0);
    map.set(rowKey, {
      denseValues,
      sparseCardIdentity: raw.sparseCardIdentity as Record<string, number> | undefined,
    });
  }
  return { map, denseNames, columnNames };
}

async function writeMatrix(input: {
  split: (typeof SPLITS)[number];
  variant: ModelD2Variant;
  rows: Array<Record<string, unknown>>;
}) {
  const path = resolve(ARTIFACT_DIR, `feature-matrix-${input.split}-${input.variant}.jsonl.gz`);
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  await pipeline(
    (async function* () {
      for (const row of input.rows) yield `${JSON.stringify(row)}\n`;
    })(),
    createGzip(),
    createWriteStream(path),
  );
  return path;
}

function buildDeckProfile(
  deck: NormalizedDeckInstance,
  catalog: Awaited<ReturnType<typeof loadDeckResolutionCatalog>>,
  shadow: ReturnType<typeof loadShadowSemanticIndex>,
): DeckInteractionProfileV2_1 {
  return buildDeckInteractionProfileV2_1({
    mainboard: deck.mainboard.map((c) => ({
      oracleId: c.oracleId,
      quantity: c.quantity,
      paperEligible: c.paperEligible,
    })),
    commandZoneOracleIds: deck.commanderOracleIds,
    catalog,
    shadowIndex: shadow,
  });
}

type GeneratedRow = {
  rowKey: string;
  podId: string;
  seatIndex: number;
  deckHash: string;
  split: string;
  podSize: number;
  denseColumns: string[];
  denseFeatures: number[];
  sparseCardIdentity?: Record<string, number>;
  selfProfile: Record<string, number>;
  opponentMarginal: Record<string, number>;
  interaction: Record<string, number>;
};

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(manifest.topdeckSourceRuns.map((r) => r.month), {
    includeRawTournaments: false,
  });
  const catalog = await loadDeckResolutionCatalog();
  const shadow = await loadShadowSemanticIndex();

  const deckByHash = new Map<string, NormalizedDeckInstance>(
    corpus.combined.decks
      .filter((d) => d.deckHash && !d.deckHash.startsWith("unresolved:"))
      .map((d) => [d.deckHash, d]),
  );

  const profileCache = new Map<string, DeckInteractionProfileV2_1>();
  function getProfile(deckHash: string): DeckInteractionProfileV2_1 | null {
    if (profileCache.has(deckHash)) return profileCache.get(deckHash)!;
    const deck = deckByHash.get(deckHash);
    if (!deck) return null;
    const profile = buildDeckProfile(deck, catalog, shadow);
    profileCache.set(deckHash, profile);
    return profile;
  }

  const splitObs: Record<(typeof SPLITS)[number], ModelAPodObservation[]> = {
    train: filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" })),
    validation: filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "validation" })),
  };

  const nesting = assertFeatureNesting();
  const featureCounts = {
    frozenC2Dense: c2ColumnNames("C2").filter((n) => !n.startsWith("card_id_")).length,
    frozenC2Sparse: c2ColumnNames("C2").filter((n) => n.startsWith("card_id_")).length,
    selfProfile: selfProfileFeatureNames().length,
    opponentMarginal: opponentMarginalFeatureNames().length,
    interaction: interactionFeatureNames().length,
    P0Added: selfProfileFeatureNames().length,
    P1Added: opponentMarginalFeatureNames().length,
    D2Added: interactionFeatureNames().length,
    P0Ipv2Total: selfProfileFeatureNames().length,
    P1Ipv2Total: selfProfileFeatureNames().length + opponentMarginalFeatureNames().length,
    D2Ipv2Total:
      selfProfileFeatureNames().length +
      opponentMarginalFeatureNames().length +
      interactionFeatureNames().length,
  };

  // Pass 1 — generate TRAIN rows + collect column samples for pruning
  const trainRows: GeneratedRow[] = [];
  const columnSamples = new Map<string, number[]>();
  for (const col of interactionFeatureNames()) columnSamples.set(col, []);
  for (const col of opponentMarginalFeatureNames()) columnSamples.set(col, []);
  for (const col of selfProfileFeatureNames()) columnSamples.set(col, []);

  let nanInfViolations = 0;
  let permutationFailures = 0;
  const permutationSamples: Array<{ podId: string; seatIndex: number; pass: boolean }> = [];
  let reconstructionFailures = 0;
  let reconstructionSamples = 0;

  const { map: c2Train, denseNames: c2DenseNames, columnNames: c2Cols } = await loadC2RowMap("train");

  for (const obs of splitObs.train) {
    const seatProfiles = obs.seats.map((s) => getProfile(s.deckHash)).filter(Boolean) as DeckInteractionProfileV2_1[];
    if (seatProfiles.length !== obs.seats.length) continue;

    for (let seatIndex = 0; seatIndex < obs.seats.length; seatIndex += 1) {
      const rowKey = `${obs.podId}:${seatIndex}`;
      const c2 = c2Train.get(rowKey);
      if (!c2) continue;

      const blocks = buildPodIpv2FeaturesForSeat({ seatIndex, seatProfiles });
      const sanitizedSelf = sanitizeFeatureMap(blocks.selfProfile);
      const sanitizedOpp = sanitizeFeatureMap(blocks.opponentMarginal);
      const sanitizedInt = sanitizeFeatureMap(blocks.interaction);

      for (const [k, v] of Object.entries(sanitizedSelf)) columnSamples.get(k)?.push(v);
      for (const [k, v] of Object.entries(sanitizedOpp)) columnSamples.get(k)?.push(v);
      for (const [k, v] of Object.entries(sanitizedInt)) columnSamples.get(k)?.push(v);

      const integrity = checkNumericIntegrity({ ...sanitizedSelf, ...sanitizedOpp, ...sanitizedInt });
      if (integrity.nanCount + integrity.infCount > 0) nanInfViolations += 1;

      if (permutationSamples.length < 200) {
        const perm = assertPermutationInvariant({ seatIndex, seatProfiles });
        permutationSamples.push({ podId: obs.podId, seatIndex, pass: perm.pass });
        if (!perm.pass) permutationFailures += 1;
      }

      if (reconstructionSamples < 100) {
        const myMerged = { ...seatProfiles[seatIndex]!.mainboard, ...seatProfiles[seatIndex]!.commandZone };
        const oppMerged = seatProfiles
          .filter((_, i) => i !== seatIndex)
          .map((p) => ({ ...p.mainboard, ...p.commandZone }));
        for (const pairing of MATCHUP_PAIRINGS_V2_1.slice(0, 3)) {
          for (const reducer of OPPONENT_REDUCERS) {
            const key = `${pairing.termKey}_${reducer}`;
            const expected = sanitizedInt[key] ?? 0;
            const actual = recomputeInteractionFeature({
              pairing,
              reducer,
              myProfile: myMerged,
              opponentProfiles: oppMerged,
            });
            if (Math.abs(expected - actual) > 1e-10) reconstructionFailures += 1;
            reconstructionSamples += 1;
          }
        }
      }

      trainRows.push({
        rowKey,
        podId: obs.podId,
        seatIndex,
        deckHash: obs.seats[seatIndex]!.deckHash,
        split: "train",
        podSize: obs.seats.length,
        denseColumns: [],
        denseFeatures: [],
        sparseCardIdentity: c2.sparseCardIdentity,
        selfProfile: sanitizedSelf,
        opponentMarginal: sanitizedOpp,
        interaction: sanitizedInt,
        ...{ _c2Dense: c2.denseValues },
      } as GeneratedRow & { _c2Dense: number[] });
    }
  }

  // Prune zero-variance columns (TRAIN-only, deterministic)
  const prunedColumns: string[] = [];
  const activeSelf = selfProfileFeatureNames().filter((k) => {
    const v = computeColumnVariance(columnSamples.get(k) ?? []);
    if (v === 0) {
      prunedColumns.push(k);
      return false;
    }
    return true;
  });
  const activeOppMarg = opponentMarginalFeatureNames().filter((k) => {
    const v = computeColumnVariance(columnSamples.get(k) ?? []);
    if (v === 0) {
      prunedColumns.push(k);
      return false;
    }
    return true;
  });
  const activeInteraction = interactionFeatureNames().filter((k) => {
    const v = computeColumnVariance(columnSamples.get(k) ?? []);
    if (v === 0) {
      prunedColumns.push(k);
      return false;
    }
    return true;
  });

  const activeIpv2ByVariant: Record<ModelD2Variant, string[]> = {
    P0: activeSelf,
    P1: [...activeSelf, ...activeOppMarg],
    D2: [...activeSelf, ...activeOppMarg, ...activeInteraction],
  };

  const matrixHashes: Record<string, string> = {};
  const splitRowCounts: Record<string, number> = {};

  async function emitSplit(split: (typeof SPLITS)[number]) {
    const { map: c2Rows, denseNames, columnNames: c2ColumnNamesFull } = await loadC2RowMap(split);
    const obsList = splitObs[split];

    for (const variant of VARIANTS) {
      const ipv2Names = activeIpv2ByVariant[variant];
      const denseColumns = [...denseNames, ...ipv2Names];
      const outRows: Array<Record<string, unknown>> = [];

      for (const obs of obsList) {
        const seatProfiles = obs.seats.map((s) => getProfile(s.deckHash)).filter(Boolean) as DeckInteractionProfileV2_1[];
        if (seatProfiles.length !== obs.seats.length) continue;

        for (let seatIndex = 0; seatIndex < obs.seats.length; seatIndex += 1) {
          const rowKey = `${obs.podId}:${seatIndex}`;
          const c2 = c2Rows.get(rowKey);
          if (!c2) continue;

          const blocks = buildPodIpv2FeaturesForSeat({ seatIndex, seatProfiles });
          const selfMap = sanitizeFeatureMap(blocks.selfProfile);
          const oppMap = sanitizeFeatureMap(blocks.opponentMarginal);
          const intMap = sanitizeFeatureMap(blocks.interaction);

          const ipv2Values = ipv2Names.map((name) => {
            if (selfMap[name] !== undefined) return selfMap[name]!;
            if (oppMap[name] !== undefined) return oppMap[name]!;
            return intMap[name] ?? 0;
          });

          outRows.push({
            rowKey,
            podId: obs.podId,
            seatIndex,
            deckHash: obs.seats[seatIndex]!.deckHash,
            split,
            variant,
            podSize: obs.seats.length,
            denseColumns,
            denseFeatures: [...c2.denseValues, ...ipv2Values],
            sparseCardIdentity: c2.sparseCardIdentity,
            c2ColumnCount: c2ColumnNamesFull.length,
            ipv2ColumnCount: ipv2Names.length,
            totalDenseColumnCount: denseColumns.length,
          });
        }
      }

      const path = await writeMatrix({ split, variant, rows: outRows });
      matrixHashes[`${split}-${variant}`] = sha256File(path);
      splitRowCounts[`${split}-${variant}`] = outRows.length;

      writeFileSync(
        resolve(ARTIFACT_DIR, `feature-names-${variant}.json`),
        JSON.stringify(
          {
            variant,
            frozenC2Columns: c2ColumnNamesFull,
            frozenC2DenseColumns: denseNames,
            selfProfileColumns: activeSelf,
            opponentMarginalColumns: variant !== "P0" ? activeOppMarg : [],
            interactionColumns: variant === "D2" ? activeInteraction : [],
            ipv2BlockColumns: ipv2Names,
            prunedColumns,
            totalDenseColumns: denseNames.length + ipv2Names.length,
            totalColumnsIncludingSparse: c2ColumnNamesFull.length + ipv2Names.length,
          },
          null,
          2,
        ),
      );
    }
  }

  await emitSplit("train");
  await emitSplit("validation");

  // Variance census on TRAIN (post-prune)
  const trainInteractionCensus = activeInteraction.map((col) => {
    const vals = columnSamples.get(col) ?? [];
    const n = vals.length;
    const mean = n > 0 ? vals.reduce((a, b) => a + b, 0) / n : 0;
    const variance = computeColumnVariance(vals);
    const sorted = [...vals].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.floor((n - 1) * p)] ?? 0;
    return {
      column: col,
      count: n,
      mean,
      variance,
      fractionZero: n > 0 ? vals.filter((v) => v === 0).length / n : 0,
      p50: q(0.5),
      p95: q(0.95),
    };
  });

  const trainOppMargCensus = activeOppMarg.map((col) => {
    const vals = columnSamples.get(col) ?? [];
    const variance = computeColumnVariance(vals);
    return { column: col, variance, fractionZero: vals.filter((v) => v === 0).length / Math.max(vals.length, 1) };
  });

  // 3p / 4p reducer audit
  const podReducerAudit: Record<string, Record<string, { count: number; mean: number; variance: number }>> = {};
  for (const podSize of [3, 4]) {
    podReducerAudit[String(podSize)] = {};
    for (const col of activeInteraction.filter((c) => c.endsWith("_varianceAcrossOpponents"))) {
      const vals: number[] = [];
      for (const obs of splitObs.train) {
        if (obs.seats.length !== podSize) continue;
        const seatProfiles = obs.seats.map((s) => getProfile(s.deckHash)).filter(Boolean) as DeckInteractionProfileV2_1[];
        if (seatProfiles.length !== podSize) continue;
        for (let seatIndex = 0; seatIndex < podSize; seatIndex += 1) {
          const blocks = buildPodIpv2FeaturesForSeat({ seatIndex, seatProfiles });
          vals.push(blocks.interaction[col] ?? 0);
        }
      }
      podReducerAudit[String(podSize)]![col] = {
        count: vals.length,
        mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
        variance: computeColumnVariance(vals),
      };
    }
  }

  // Pair-direction swap (deck-vs-deck synthetic 2-seat pods)
  function profileFromNames(names: string[], qty = 10): DeckInteractionProfileV2_1 {
    const ids = names
      .map((n) => lookupGoldenByName(catalog, n)?.oracleId)
      .filter(Boolean) as string[];
    return buildDeckInteractionProfileV2_1({
      mainboard: ids.map((oracleId) => ({ oracleId, quantity: qty, paperEligible: true })),
      commandZoneOracleIds: [],
      catalog,
      shadowIndex: shadow,
    });
  }

  const pairDirectionTests: Array<{ label: string; pass: boolean; detail: string }> = [];
  const gyA = profileFromNames(["Reanimate", "Animate Dead", "Living Death"]);
  const gyB = profileFromNames(["Rest in Peace", "Soul-Guide Lantern"]);
  const featA = buildPodIpv2FeaturesForSeat({ seatIndex: 0, seatProfiles: [gyA, gyB] });
  const featB = buildPodIpv2FeaturesForSeat({ seatIndex: 1, seatProfiles: [gyA, gyB] });
  const aMyDisrupts = featA.interaction.d2_myMbGyDisrupt_x_oppMbGyReliance_meanAcrossOpponents ?? 0;
  const bOppDisrupts = featB.interaction.d2_oppGyDisrupt_x_myMbGyReliance_meanAcrossOpponents ?? 0;
  pairDirectionTests.push({
    label: "GY cross-direction swap (A myDisruptsOpp vs B oppDisruptsMy)",
    pass: Math.abs(aMyDisrupts - bOppDisrupts) < 1e-10,
    detail: `A=${aMyDisrupts}, B=${bOppDisrupts}`,
  });

  const dupCheck = findDuplicateColumns(activeIpv2ByVariant.D2);
  const nearDup = findNearDuplicateColumns({
    columnNames: activeIpv2ByVariant.D2,
    rowValues: trainRows.slice(0, Math.min(500, trainRows.length)).map((r) =>
      activeIpv2ByVariant.D2.map((name) => {
        if (r.selfProfile[name] !== undefined) return r.selfProfile[name]!;
        if (r.opponentMarginal[name] !== undefined) return r.opponentMarginal[name]!;
        return r.interaction[name] ?? 0;
      }),
    ),
    tolerance: 1e-12,
  });

  const qaVerdict =
    nesting.pass &&
    permutationFailures === 0 &&
    nanInfViolations === 0 &&
    reconstructionFailures === 0 &&
    pairDirectionTests.every((t) => t.pass) &&
    dupCheck.pass &&
    prunedColumns.length === 0
      ? "PASS"
      : prunedColumns.length > 0
        ? "PASS_WITH_PRUNED_COLUMNS"
        : "FAIL";

  const qaReport = {
    version: "commander-model-d2-feature-generation-qa-v1",
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    datasetHash: EXPECTED_DATASET_HASH,
    featureSpecVersion: MODEL_D2_FEATURE_SPEC_VERSION,
    featureArtifactVersion: MODEL_D2_FEATURES_VERSION,
    authorization: MODEL_D2_FEATURE_SPEC.authorization,
    ladder: MODEL_D2_FEATURE_SPEC.ladder,
    primaryRpsTest: MODEL_D2_FEATURE_SPEC.primaryRpsTest,
    featureCounts: {
      ...featureCounts,
      activeSelf: activeSelf.length,
      activeOpponentMarginal: activeOppMarg.length,
      activeInteraction: activeInteraction.length,
      prunedColumnCount: prunedColumns.length,
    },
    nestingAssertions: nesting,
    varianceConvention: VARIANCE_CONVENTION,
    prunedColumns,
    trainInteractionVarianceCensus: trainInteractionCensus,
    trainOpponentMarginalVarianceCensus: trainOppMargCensus,
    podReducerAudit,
    pairDirectionInvariant: { tests: pairDirectionTests, pass: pairDirectionTests.every((t) => t.pass) },
    reconstructionInvariant: {
      samplesChecked: reconstructionSamples,
      failures: reconstructionFailures,
      pass: reconstructionFailures === 0,
    },
    permutationInvariance: {
      samplesChecked: permutationSamples.length,
      failures: permutationFailures,
      pass: permutationFailures === 0,
    },
    numericIntegrity: { nanInfRowViolations: nanInfViolations, pass: nanInfViolations === 0 },
    duplicateReport: { exact: dupCheck, nearDuplicatePairs: nearDup.slice(0, 20) },
    matrixHashes,
    splitRowCounts,
    splitsGenerated: SPLITS,
    testGenerated: false,
    holdoutGenerated: false,
    qaVerdict,
  };

  writeFileSync(resolve(ARTIFACT_DIR, "commander-model-d2-feature-generation-qa-v1.json"), JSON.stringify(qaReport, null, 2));
  writeFileSync(
    resolve(ARTIFACT_DIR, "feature-generation-manifest.json"),
    JSON.stringify(
      {
        artifactVersion: MODEL_D2_FEATURES_VERSION,
        specVersion: MODEL_D2_FEATURE_SPEC_VERSION,
        generatedAt: qaReport.generatedAt,
        gitSha: qaReport.gitSha,
        datasetHash: EXPECTED_DATASET_HASH,
        variants: VARIANTS,
        splits: SPLITS,
        matrixHashes,
        prunedColumns,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    resolve(trainingSnapshotDir(), "commander-model-d2-feature-spec-v1.json"),
    JSON.stringify({ ...MODEL_D2_FEATURE_SPEC, gitSha: gitSha(), frozenAt: qaReport.generatedAt }, null, 2),
  );

  console.log(
    JSON.stringify(
      {
        qaVerdict,
        featureCounts: qaReport.featureCounts,
        matrixHashes,
        prunedColumns: prunedColumns.length,
        pairDirectionPass: qaReport.pairDirectionInvariant.pass,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
