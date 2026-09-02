import { resolve } from "node:path";

export const TOPDECK_DATA_DIR = resolve(process.cwd(), "data/milestones/topdeck");

export const TOPDECK_ARTIFACTS = {
  checkpoint: "topdeck-import-checkpoint-v1.json",
  latestRunManifest: "topdeck-import-latest-run-v1.json",
  qaReport: "topdeck-ingestion-qa-v1.json",
  deckProfilesManifest: "deck-semantic-profiles-v1-manifest.json",
  deckProfilesSample: "deck-semantic-profiles-v1-sample.json",
  historicalImport: "topdeck-historical-import-v1.json",
  augustQaReport: "topdeck-ingestion-qa-august-2026-v1.json",
  combinedQaReport: "topdeck-combined-training-corpus-qa-june-august-2026-v3.json",
  twelveMonthQaReport: "topdeck-12month-training-corpus-qa-v1.json",
  backfillProgress: "topdeck-12month-backfill-progress-v1.json",
  prospectiveHoldout: "commander-prospective-holdout-v1.json",
  trainingSnapshot12m: "training-snapshots/commander-semantic-training-12m-v1/manifest.json",
} as const;

export function topdeckArtifactPath(name: keyof typeof TOPDECK_ARTIFACTS): string {
  return resolve(TOPDECK_DATA_DIR, TOPDECK_ARTIFACTS[name]);
}

export function topdeckRawRunDir(runId: string): string {
  return resolve(TOPDECK_DATA_DIR, "topdeckImportRuns", runId);
}
