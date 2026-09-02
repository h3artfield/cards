import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { TOPDECK_DATA_DIR } from "./topdeck/artifact-paths";

export const COMMANDER_PROSPECTIVE_HOLDOUT_V1 = "commander-prospective-holdout-v1";

/** Tournaments completed after this UTC date belong to prospective holdout, not training. */
export const PROSPECTIVE_HOLDOUT_CUTOFF_DATE = "2026-08-11";

export type ProspectiveHoldoutManifest = {
  version: typeof COMMANDER_PROSPECTIVE_HOLDOUT_V1;
  createdAt: string;
  updatedAt: string;
  cutoffDate: string;
  policy: string;
  tournamentIds: string[];
  podIds: string[];
  importRunIds: string[];
  note: string;
};

const HOLDOUT_PATH = resolve(TOPDECK_DATA_DIR, "commander-prospective-holdout-v1.json");

export function loadProspectiveHoldoutManifest(): ProspectiveHoldoutManifest {
  if (!existsSync(HOLDOUT_PATH)) {
    return {
      version: COMMANDER_PROSPECTIVE_HOLDOUT_V1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cutoffDate: PROSPECTIVE_HOLDOUT_CUTOFF_DATE,
      policy:
        "Completed TopDeck EDH tournaments with tournamentDate > cutoff are evaluation-only. Never merge into training snapshot without explicit dataset version bump.",
      tournamentIds: [],
      podIds: [],
      importRunIds: [],
      note: "Initialized at 12-month training snapshot freeze.",
    };
  }
  return JSON.parse(readFileSync(HOLDOUT_PATH, "utf8")) as ProspectiveHoldoutManifest;
}

export function saveProspectiveHoldoutManifest(manifest: ProspectiveHoldoutManifest): void {
  mkdirSync(resolve(HOLDOUT_PATH, ".."), { recursive: true });
  writeFileSync(
    HOLDOUT_PATH,
    JSON.stringify({ ...manifest, updatedAt: new Date().toISOString() }, null, 2),
  );
}

export function prospectiveHoldoutArtifactPath(): string {
  return HOLDOUT_PATH;
}
