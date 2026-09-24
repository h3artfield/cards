#!/usr/bin/env npx tsx
/**
 * Full frozen Model C evaluation report — TEST metrics, bootstrap CIs, cohorts, diagnostics.
 *
 * Usage:
 *   --report-only   Reformat frozen metrics + recompute cohort membership (no refit, no prediction changes)
 *   (default)       Full re-evaluation via TRAIN refit (legacy; not used for report corrections)
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  EXPECTED_DATASET_HASH,
  loadTrainingSnapshotManifest,
  modelArtifactDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import {
  filterPrimaryPodSize,
  loadSplitObservations,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import {
  BOOTSTRAP_REPLICATES,
  BOOTSTRAP_SEED,
} from "../src/lib/commander-strategy/model-b/bootstrap-v1";
import {
  buildGcCountByDeckHash,
  deckTrainUnseenCardCount,
  explicitLogLossComparison,
  filterByModelCCohort,
  NOVELTY_COHORT_PREDICATE,
  summarizeNoveltyCohortMembership,
  type ExplicitLogLossComparison,
} from "../src/lib/commander-strategy/model-c/evaluation-v1";
import { columnNamesForVariant } from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import { loadFeatureMatrixRows } from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import { MODEL_C_VERSION } from "../src/lib/commander-strategy/model-c/types";
import type { ModelAMetrics, ModelAPodObservation } from "../src/lib/commander-strategy/model-a/types";

loadProjectEnvLocal();

const MODEL_DIR = modelArtifactDir(MODEL_C_VERSION);
const REPORT_PATH = resolve(MODEL_DIR, "commander-model-c-evaluation-report-v1.json");
const REPORT_ONLY = process.argv.includes("--report-only");

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

type BootstrapRow = {
  deltaLogLoss: number;
  ciLower: number;
  ciUpper: number;
  significantAt95?: boolean;
  excludesZero?: boolean;
};

function standardizeBootstrapComparison(input: {
  baseline: string;
  challenger: string;
  row: BootstrapRow;
}): ExplicitLogLossComparison & {
  ciLower: number;
  ciUpper: number;
  significantAt95: boolean;
  excludesZero: boolean;
  convention: string;
} {
  return {
    label: `${input.challenger} vs ${input.baseline}`,
    baseline: input.baseline,
    challenger: input.challenger,
    baselineLogLoss: NaN,
    challengerLogLoss: NaN,
    deltaLogLoss: input.row.deltaLogLoss,
    challengerBetter: input.row.deltaLogLoss > 0,
    ciLower: input.row.ciLower,
    ciUpper: input.row.ciUpper,
    significantAt95: input.row.significantAt95 ?? (input.row.ciLower > 0 || input.row.ciUpper < 0),
    excludesZero: input.row.excludesZero ?? input.row.ciLower > 0,
    convention: "deltaLogLoss = loss(baseline) - loss(challenger); positive => challenger better",
  };
}

function parseBootstrapKey(key: string): { baseline: string; challenger: string } | null {
  const aliases: Record<string, string> = {
    B: "frozenModelB",
    F: "frequency",
    A: "frozenModelA",
  };
  const parts = key.split(" vs ");
  if (parts.length !== 2) return null;
  const challenger = aliases[parts[0]!] ?? parts[0]!;
  const baseline = aliases[parts[1]!] ?? parts[1]!;
  return { baseline, challenger };
}

function reformatBootstrapBlock(
  raw: Record<string, BootstrapRow>,
): Record<string, ReturnType<typeof standardizeBootstrapComparison>> {
  const out: Record<string, ReturnType<typeof standardizeBootstrapComparison>> = {};
  for (const [key, row] of Object.entries(raw)) {
    const parsed = parseBootstrapKey(key);
    if (!parsed) continue;
    out[`${parsed.challenger} vs ${parsed.baseline}`] = standardizeBootstrapComparison({
      ...parsed,
      row,
    });
  }
  return out;
}

function logLossFromMetrics(metrics: Record<string, { logLoss?: number }>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(metrics).map(([model, m]) => [model, m.logLoss ?? NaN]),
  );
}

function buildNoveltySection(input: {
  testAligned: ModelAPodObservation[];
  cohortFilterInput: Parameters<typeof filterByModelCCohort>[2];
  trainingReport: {
    metrics?: { testCohorts?: Record<string, Record<string, { logLoss?: number }>> };
  };
  cohortBootstrapCache: Record<string, BootstrapRow & { baseline: string; challenger: string }>;
}) {
  const thresholds = {
    cardNoveltyAtLeast1: 1,
    cardNoveltyAtLeast5: 5,
    cardNoveltyAtLeast10: 10,
  } as const;

  const out: Record<string, unknown> = {
    predicate: NOVELTY_COHORT_PREDICATE,
  };

  for (const [cohort, threshold] of Object.entries(thresholds)) {
    const cohortMetrics = input.trainingReport.metrics?.testCohorts?.[cohort] ?? {};
    const logLoss = Object.fromEntries(
      ["G", "C1", "ID", "C2"].map((model) => [model, cohortMetrics[model]?.logLoss ?? NaN]),
    );
    const filtered = filterByModelCCohort(
      input.testAligned,
      cohort as keyof typeof thresholds,
      input.cohortFilterInput,
    );
    const membership = summarizeNoveltyCohortMembership({
      observations: input.testAligned,
      trainOracleIds: input.cohortFilterInput.trainOracleIds,
      deckByHash: input.cohortFilterInput.deckByHash,
      threshold,
    });
    const comparisons: Record<string, ExplicitLogLossComparison> = {
      "C1 vs G": explicitLogLossComparison({ baseline: "G", challenger: "C1", logLossByModel: logLoss }),
      "C1 vs ID": explicitLogLossComparison({ baseline: "C1", challenger: "ID", logLossByModel: logLoss }),
      "C2 vs ID": explicitLogLossComparison({ baseline: "ID", challenger: "C2", logLossByModel: logLoss }),
    };
    const cache = input.cohortBootstrapCache[cohort];
    const bootstrapComparisons =
      cache &&
      ({
        "C1 vs ID": {
          ...explicitLogLossComparison({
            baseline: cache.baseline,
            challenger: cache.challenger,
            logLossByModel: logLoss,
          }),
          ...standardizeBootstrapComparison({
            baseline: cache.baseline,
            challenger: cache.challenger,
            row: cache,
          }),
        },
      } as Record<string, ReturnType<typeof standardizeBootstrapComparison>>);
    out[cohort] = {
      membership,
      podCount: filtered.length,
      logLoss,
      comparisons,
      bootstrapComparisons: bootstrapComparisons ?? {},
    };
  }
  return out;
}

function buildGcStrataSection(input: {
  testAligned: ModelAPodObservation[];
  cohortFilterInput: Parameters<typeof filterByModelCCohort>[2];
  frozenGc: Record<string, { podCount?: number; logLoss?: Record<string, number> }>;
}) {
  const bands = [
    "gameChangerCount0",
    "gameChangerCount1",
    "gameChangerCount2",
    "gameChangerCount3",
    "gameChangerCount4Plus",
  ] as const;
  const out: Record<string, unknown> = {};
  for (const band of bands) {
    const frozen = input.frozenGc[band];
    if (!frozen?.logLoss) continue;
    const filtered = filterByModelCCohort(input.testAligned, band, input.cohortFilterInput);
    out[band] = {
      podCount: filtered.length,
      logLoss: frozen.logLoss,
      comparisons: {
        "C1 vs G": explicitLogLossComparison({
          baseline: "G",
          challenger: "C1",
          logLossByModel: frozen.logLoss,
        }),
      },
    };
  }
  return out;
}

async function loadCohortContext() {
  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(manifest.topdeckSourceRuns.map((r) => r.month), {
    includeRawTournaments: false,
  });
  const train = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" }));
  const test = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "test" }));
  const testAligned = test.sort((a, b) => a.podId.localeCompare(b.podId));

  const deckByHash = new Map(
    corpus.combined.decks
      .filter((d) => d.deckHash && !d.deckHash.startsWith("unresolved:"))
      .map((d) => [d.deckHash, d] as const),
  );

  const trainOracleIds = new Set<string>();
  for (const obs of train) {
    for (const seat of obs.seats) {
      const deck = deckByHash.get(seat.deckHash);
      if (!deck) continue;
      const commanderSet = new Set(deck.commanderOracleIds);
      for (const card of deck.mainboard) {
        if (!card.oracleId || !card.paperEligible) continue;
        if (commanderSet.has(card.oracleId)) continue;
        trainOracleIds.add(card.oracleId);
      }
    }
  }

  const trainDeckHashes = new Set<string>();
  for (const obs of train) {
    for (const seat of obs.seats) {
      if (!seat.deckHash.startsWith("unresolved:")) trainDeckHashes.add(seat.deckHash);
    }
  }

  const featureRowsG = await loadFeatureMatrixRows({ split: "test", variant: "G" });
  const gcCountByDeckHash = buildGcCountByDeckHash(
    featureRowsG,
    columnNamesForVariant("G").filter((n) => !n.startsWith("card_id_")),
  );

  return {
    testAligned,
    cohortFilterInput: {
      trainDeckHashes,
      trainPlayers: new Set(train.flatMap((o) => o.seats.map((s) => s.playerHash))),
      trainPlayerAppearances: new Map<string, number>(),
      trainOracleIds,
      deckByHash,
      featureRowsByKey: featureRowsG,
      gcCountByDeckHash,
    },
  };
}

async function regenerateReportOnly() {
  if (!existsSync(REPORT_PATH)) {
    throw new Error(`Missing frozen report: ${REPORT_PATH}`);
  }
  const frozen = JSON.parse(readFileSync(REPORT_PATH, "utf8")) as Record<string, unknown>;
  const trainingReport = JSON.parse(
    readFileSync(resolve(MODEL_DIR, "model-c-report.json"), "utf8"),
  ) as {
    metrics?: { testCohorts?: Record<string, Record<string, { logLoss?: number }>> };
  };
  const cohortBootstrapCache = JSON.parse(
    readFileSync(resolve(MODEL_DIR, "evaluation-report-cohort-bootstrap-v1.json"), "utf8"),
  ) as Record<string, BootstrapRow & { baseline: string; challenger: string }>;
  const { testAligned, cohortFilterInput } = await loadCohortContext();

  const report = {
    ...frozen,
    version: "commander-model-c-evaluation-report-v1.1",
    status: "ACCEPTED_FROZEN",
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    reportCorrection: {
      version: "v1.1-novelty-comparison-naming",
      retrainedModelC: false,
      predictionsChanged: false,
      note: "Section 4 comparison fields standardized; novelty cohort predicate frozen; no metric recomputation.",
    },
    authorization: {
      modelC: "ACCEPTED_FROZEN",
      modelCReportCorrection: "COMPLETE",
      modelD: "SPECIFICATION_AUTHORIZED",
      modelDTraining: "WAIT",
      rc8: "FROZEN",
      prospectiveHoldout: "SEALED",
    },
    comparisonConvention: {
      deltaLogLoss: "loss(baseline) - loss(challenger)",
      positiveDeltaMeans: "challenger has lower log loss (better)",
      note: "Do not infer comparisons from ad-hoc arithmetic column names like C1-ID.",
    },
    modelCFrozenInterpretation: {
      "C0 vs B": "Ordinary deck construction adds stable predictive signal.",
      "G vs C0": "Official Game Changer information adds a small stable increment.",
      "C1 vs G": "RC8 full-deck semantics add a substantial additional increment [PRIMARY SEMANTIC TEST PASSED].",
      "ID vs C1":
        "Exact card identity remains materially stronger than the current compressed semantic representation.",
      "C2 vs ID":
        "Semantic representation provides a small but statistically stable increment even after exact card identity is known.",
      disclaimers: [
        "ID coefficients are predictive associations, not causal card power ratings.",
        "Do not modify RC8 based on Model C TEST diagnostics.",
      ],
    },
    section1_bootstrapAllTest: {
      ...(frozen.section1_bootstrapAllTest as object),
      comparisons: reformatBootstrapBlock(
        ((frozen.section1_bootstrapAllTest as { comparisons?: Record<string, BootstrapRow> })
          ?.comparisons ?? {}) as Record<string, BootstrapRow>,
      ),
    },
    section3_unseenDeckHashCohort: {
      ...(frozen.section3_unseenDeckHashCohort as object),
      bootstrapComparisons: reformatBootstrapBlock(
        ((frozen.section3_unseenDeckHashCohort as { bootstrapComparisons?: Record<string, BootstrapRow> })
          ?.bootstrapComparisons ?? {}) as Record<string, BootstrapRow>,
      ),
    },
    section4_novelCardCohorts: buildNoveltySection({
      testAligned,
      cohortFilterInput,
      trainingReport,
      cohortBootstrapCache,
    }),
    section5_gameChangerStrata: buildGcStrataSection({
      testAligned,
      cohortFilterInput,
      frozenGc: (frozen.section5_gameChangerStrata ?? {}) as Record<
        string,
        { podCount?: number; logLoss?: Record<string, number> }
      >,
    }),
    priorTrainingReportHash: createHash("sha256")
      .update(readFileSync(resolve(MODEL_DIR, "model-c-report.json"), "utf8"))
      .digest("hex"),
    priorEvaluationReportHash: frozen.reportHash ?? null,
    reportHash: "",
  };

  report.reportHash = createHash("sha256")
    .update(JSON.stringify({ ...report, reportHash: undefined }))
    .digest("hex");

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`Wrote ${REPORT_PATH} (report-only correction)`);
  console.log(
    JSON.stringify(
      {
        section4_atLeast10: (report.section4_novelCardCohorts as Record<string, unknown>)
          .cardNoveltyAtLeast10,
      },
      null,
      2,
    ),
  );
}

async function main() {
  if (REPORT_ONLY) {
    await regenerateReportOnly();
    return;
  }
  console.error("Full refit mode removed from report corrections. Use --report-only.");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
