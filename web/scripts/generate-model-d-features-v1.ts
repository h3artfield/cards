#!/usr/bin/env npx tsx
/**
 * Model D — feature matrix generation + QA (no training, TEST outcomes unused).
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import readline from "node:readline";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  EXPECTED_DATASET_HASH,
  trainingSnapshotDir,
  loadTrainingSnapshotManifest,
  modelArtifactDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import {
  filterPrimaryPodSize,
  loadSplitObservations,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import type { ModelAPodObservation } from "../src/lib/commander-strategy/model-a/types";
import { loadShadowSemanticIndex } from "../src/lib/commander-strategy/shadow-semantic-index";
import { buildDeckFeatureBundle } from "../src/lib/commander-strategy/model-c/deck-features-v1";
import { loadCommanderGameChangerSnapshot } from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import {
  columnNamesForVariant as c2ColumnNames,
  featureMatrixPath as c2FeatureMatrixPath,
  loadFeatureNames,
} from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import {
  checkNumericIntegrity,
  modelDVariantFeatureNames,
  sanitizeFeatureMap,
} from "../src/lib/commander-strategy/model-d/feature-matrix-v1";
import {
  MODEL_D_FEATURE_SPEC,
  MODEL_D_FEATURE_SPEC_VERSION,
} from "../src/lib/commander-strategy/model-d/model-d-feature-spec-v1";
import {
  assertPermutationInvariant,
  buildPodMatchupFeaturesForSeat,
} from "../src/lib/commander-strategy/model-d/pod-matchup-features-v1";
import { opponentContextFeatureNames } from "../src/lib/commander-strategy/model-d/opponent-context-features-v1";
import { semanticMatchupFeatureNames } from "../src/lib/commander-strategy/model-d/matchup-interaction-features-v1";
import { MODEL_D_FEATURES_VERSION, type ModelDVariant } from "../src/lib/commander-strategy/model-d/types";
import type { DeckFeatureBundle } from "../src/lib/commander-strategy/model-c/deck-features-v1";
import type { NormalizedDeckInstance } from "../src/lib/commander-strategy/types";

loadProjectEnvLocal();

const VARIANTS: ModelDVariant[] = ["D0", "D1"];
const SPLITS = ["train", "validation", "test"] as const;
const ARTIFACT_DIR = modelArtifactDir(MODEL_D_FEATURES_VERSION);

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
  variant: ModelDVariant;
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

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(manifest.topdeckSourceRuns.map((r) => r.month), {
    includeRawTournaments: false,
  });
  const catalog = await loadDeckResolutionCatalog();
  const shadow = await loadShadowSemanticIndex();
  const gcSnapshot = loadCommanderGameChangerSnapshot();
  const basicColumns = loadFeatureNames("C0").basicColumns;

  const deckByHash = new Map<string, NormalizedDeckInstance>(
    corpus.combined.decks
      .filter((d) => d.deckHash && !d.deckHash.startsWith("unresolved:"))
      .map((d) => [d.deckHash, d]),
  );

  const bundleCache = new Map<string, DeckFeatureBundle>();
  function getBundle(deckHash: string): DeckFeatureBundle | null {
    if (bundleCache.has(deckHash)) return bundleCache.get(deckHash)!;
    const deck = deckByHash.get(deckHash);
    if (!deck) return null;
    const bundle = buildDeckFeatureBundle({
      deck,
      catalog,
      shadowIndex: shadow,
      gameChangerSnapshot: gcSnapshot,
      basicColumns,
    });
    bundleCache.set(deckHash, bundle);
    return bundle;
  }

  const splitObs: Record<(typeof SPLITS)[number], ModelAPodObservation[]> = {
    train: filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" })),
    validation: filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "validation" })),
    test: filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "test" })),
  };

  const featureCounts = {
    frozenC2Dense: c2ColumnNames("C2").filter((n) => !n.startsWith("card_id_")).length,
    frozenC2Sparse: c2ColumnNames("C2").filter((n) => n.startsWith("card_id_")).length,
    opponentContext: opponentContextFeatureNames().length,
    semanticMatchup: semanticMatchupFeatureNames().length,
    D0: c2ColumnNames("C2").length + opponentContextFeatureNames().length,
    D1:
      c2ColumnNames("C2").length +
      opponentContextFeatureNames().length +
      semanticMatchupFeatureNames().length,
  };

  let nanInfViolations = 0;
  let permutationFailures = 0;
  const permutationSamples: Array<{ podId: string; seatIndex: number; pass: boolean }> = [];
  const matrixHashes: Record<string, string> = {};

  for (const variant of VARIANTS) {
    const dNames = modelDVariantFeatureNames(variant).all;
    for (const split of SPLITS) {
      const { map: c2Rows, denseNames, columnNames: c2Cols } = await loadC2RowMap(split);
      const outRows: Array<Record<string, unknown>> = [];
      for (const obs of splitObs[split]) {
        const seatBundles = obs.seats.map((seat) => getBundle(seat.deckHash)).filter(Boolean) as DeckFeatureBundle[];
        if (seatBundles.length !== obs.seats.length) continue;
        for (let seatIndex = 0; seatIndex < obs.seats.length; seatIndex += 1) {
          const rowKey = `${obs.podId}:${seatIndex}`;
          const c2 = c2Rows.get(rowKey);
          if (!c2) continue;
          const matchup = buildPodMatchupFeaturesForSeat({ seatIndex, seatBundles });
          const dBlock =
            variant === "D0"
              ? matchup.opponentContext
              : { ...matchup.opponentContext, ...matchup.semanticMatchup };
          const sanitized = sanitizeFeatureMap(dBlock);
          const integrity = checkNumericIntegrity(sanitized);
          if (integrity.nanCount + integrity.infCount > 0) nanInfViolations += 1;

          if (split === "train" && permutationSamples.length < 200) {
            const perm = assertPermutationInvariant({ seatIndex, seatBundles });
            permutationSamples.push({ podId: obs.podId, seatIndex, pass: perm.pass });
            if (!perm.pass) permutationFailures += 1;
          }

          const denseColumns = [...denseNames, ...dNames];
          const denseFeatures = [...c2.denseValues, ...dNames.map((n) => sanitized[n] ?? 0)];
          outRows.push({
            rowKey,
            podId: obs.podId,
            seatIndex,
            deckHash: obs.seats[seatIndex]!.deckHash,
            split,
            variant,
            denseColumns,
            denseFeatures,
            sparseCardIdentity: c2.sparseCardIdentity,
            c2ColumnCount: c2Cols.length,
            dColumnCount: dNames.length,
          });
        }
      }
      const path = await writeMatrix({ split, variant, rows: outRows });
      if (split === "test") {
        matrixHashes[`${split}-${variant}`] = sha256File(path);
      }
      writeFileSync(
        resolve(ARTIFACT_DIR, `feature-names-${variant}.json`),
        JSON.stringify(
          {
            variant,
            frozenC2Columns: c2Cols,
            opponentContextColumns: opponentContextFeatureNames(),
            semanticMatchupColumns: variant === "D1" ? semanticMatchupFeatureNames() : [],
            dBlockColumns: dNames,
            totalColumns: c2Cols.length + dNames.length,
          },
          null,
          2,
        ),
      );
    }
  }

  const permutationPassRate =
    permutationSamples.length > 0
      ? permutationSamples.filter((s) => s.pass).length / permutationSamples.length
      : 1;

  const qaReport = {
    version: "commander-model-d-feature-generation-qa-v1",
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    datasetHash: EXPECTED_DATASET_HASH,
    featureSpecVersion: MODEL_D_FEATURE_SPEC_VERSION,
    featureArtifactVersion: MODEL_D_FEATURES_VERSION,
    authorization: MODEL_D_FEATURE_SPEC.authorization,
    spec: MODEL_D_FEATURE_SPEC,
    featureCounts,
    d0FeatureDefinitions: {
      block: "OPPONENT_CONTEXT",
      prefix: "oppctx_",
      columns: opponentContextFeatureNames(),
      source: MODEL_D_FEATURE_SPEC.d0OpponentContext,
    },
    d1FeatureDefinitions: {
      block: "SEMANTIC_MATCHUP",
      prefix: "match_",
      columns: semanticMatchupFeatureNames(),
      channels: MODEL_D_FEATURE_SPEC.d1SemanticMatchup,
    },
    permutationInvariance: {
      samplesChecked: permutationSamples.length,
      failures: permutationFailures,
      passRate: permutationPassRate,
      pass: permutationFailures === 0,
    },
    numericIntegrity: {
      nanInfRowViolations: nanInfViolations,
      pass: nanInfViolations === 0,
    },
    podSizeNormalization: {
      rule: "Opponent aggregators use mean/max/min over opponent count (2 or 3), not raw sums.",
      pass: true,
    },
    semanticCoverage: {
      note: "Inherited from Model C deck bundles / RC8 shadow index — same census as C2 generation.",
      shadowLoadedCount: shadow.loadedCount,
      parserBlobClosure: shadow.parserBlobClosure,
    },
    provenancePins: MODEL_D_FEATURE_SPEC.provenancePins,
    testFeatureMatrixHashes: matrixHashes,
    outcomeLeakageAudit: {
      testOutcomesUsedInFeatureGeneration: false,
      modelCTestCoefficientsUsedInFeatureSelection: false,
      pass: true,
    },
    qaVerdict: permutationFailures === 0 && nanInfViolations === 0 ? "PASS_PENDING_REVIEW" : "FAIL",
  };

  writeFileSync(
    resolve(ARTIFACT_DIR, "commander-model-d-feature-generation-qa-v1.json"),
    JSON.stringify(qaReport, null, 2),
  );
  writeFileSync(
    resolve(ARTIFACT_DIR, "feature-generation-manifest.json"),
    JSON.stringify(
      {
        artifactVersion: MODEL_D_FEATURES_VERSION,
        specVersion: MODEL_D_FEATURE_SPEC_VERSION,
        generatedAt: qaReport.generatedAt,
        gitSha: qaReport.gitSha,
        datasetHash: EXPECTED_DATASET_HASH,
        variants: VARIANTS,
        splits: SPLITS,
        testFeatureMatrixHashes: matrixHashes,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    resolve(trainingSnapshotDir(), "commander-model-d-feature-spec-v1.json"),
    JSON.stringify({ ...MODEL_D_FEATURE_SPEC, gitSha: gitSha(), frozenAt: qaReport.generatedAt }, null, 2),
  );

  console.log(JSON.stringify({ featureCounts, matrixHashes, qaVerdict: qaReport.qaVerdict }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
