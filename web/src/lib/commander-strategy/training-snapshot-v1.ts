import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { topdeckArtifactPath, TOPDECK_DATA_DIR } from "./topdeck/artifact-paths";
import { PROSPECTIVE_HOLDOUT_CUTOFF_DATE } from "./commander-prospective-holdout-v1";

export const COMMANDER_SEMANTIC_TRAINING_12M_V1 = "commander-semantic-training-12m-v1";
export const EXPECTED_DATASET_HASH =
  "706a5fc9be961d812836a875388af92c513807ec5f4892ffbe4964f4205ad75c";

export const REQUESTED_SOURCE_WINDOW_START = "2025-09-01";
export const REQUESTED_SOURCE_WINDOW_END = "2026-08-31";
export const OBSERVATION_CUTOFF = PROSPECTIVE_HOLDOUT_CUTOFF_DATE;

export const OBSERVATION_WINDOW = {
  requestedSourceWindowStart: REQUESTED_SOURCE_WINDOW_START,
  requestedSourceWindowEnd: REQUESTED_SOURCE_WINDOW_END,
  observationCutoff: OBSERVATION_CUTOFF,
  eligibleRule: "tournamentDate <= observationCutoff",
  note:
    "Aug 12–31 is not part of training/test even though the nominal requested monthly window extends through Aug 31. Stored tournament IDs already obey this cutoff.",
  testPeriodLabel: "2026-05 through 2026-08-11",
  validationPeriodLabel: "2026-03 through 2026-04",
  trainPeriodLabel: "2025-09 through 2026-02",
} as const;

export type ChronologicalSplitSpec = {
  months: string[];
  tournamentIds: string[];
  tierAPodIds: string[];
  tierAPodCount: number;
};

export type TrainingSnapshotManifest = {
  version: typeof COMMANDER_SEMANTIC_TRAINING_12M_V1;
  datasetHash: string;
  tierAFullSemanticPods: number;
  tierAPodIds: string[];
  topdeckSourceRuns: Array<{ month: string; runId: string; rawDigest: string; normalizedDatasetHash: string }>;
  chronologicalSplits: {
    train: ChronologicalSplitSpec;
    validation: ChronologicalSplitSpec;
    test: ChronologicalSplitSpec;
    noTournamentLeakage: boolean;
    cohorts: Record<string, number>;
  };
  observationWindow?: typeof OBSERVATION_WINDOW;
  [key: string]: unknown;
};

const SNAPSHOT_DIR = resolve(TOPDECK_DATA_DIR, "training-snapshots", COMMANDER_SEMANTIC_TRAINING_12M_V1);

export function trainingSnapshotDir(): string {
  return SNAPSHOT_DIR;
}

export function loadTrainingSnapshotManifest(): TrainingSnapshotManifest {
  const path = topdeckArtifactPath("trainingSnapshot12m");
  if (!existsSync(path)) {
    throw new Error(`Missing training snapshot manifest: ${path}`);
  }
  const manifest = JSON.parse(readFileSync(path, "utf8")) as TrainingSnapshotManifest;
  if (manifest.datasetHash !== EXPECTED_DATASET_HASH) {
    throw new Error(
      `datasetHash mismatch: expected ${EXPECTED_DATASET_HASH}, got ${manifest.datasetHash}`,
    );
  }
  return manifest;
}

export function loadChronologicalSplits(): TrainingSnapshotManifest["chronologicalSplits"] {
  const splitsPath = resolve(SNAPSHOT_DIR, "chronological-splits-v1.json");
  if (existsSync(splitsPath)) {
    return JSON.parse(readFileSync(splitsPath, "utf8")) as TrainingSnapshotManifest["chronologicalSplits"];
  }
  return loadTrainingSnapshotManifest().chronologicalSplits;
}

export function isEligibleObservationDate(tournamentDate: string): boolean {
  return tournamentDate.slice(0, 10) <= OBSERVATION_CUTOFF;
}

export function modelArtifactDir(modelVersion: string): string {
  return resolve(SNAPSHOT_DIR, modelVersion);
}
