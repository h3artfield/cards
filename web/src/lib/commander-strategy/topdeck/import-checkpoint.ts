import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { topdeckArtifactPath } from "./artifact-paths";

export type ConfigCheckpoint = {
  version: "topdeck-import-checkpoint-v2";
  configKey: string;
  completedFetchWindows: string[];
  missingIntervals: string[];
  lastRunId?: string;
  updatedAt?: string;
};

function checkpointPathForConfig(configKey: string): string {
  const safe = configKey.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `${topdeckArtifactPath("checkpoint").replace(/[^/\\]+$/, "")}/checkpoints/${safe}.json`;
}

export function loadConfigCheckpoint(configKey: string): ConfigCheckpoint {
  const path = checkpointPathForConfig(configKey);
  if (!existsSync(path)) {
    return {
      version: "topdeck-import-checkpoint-v2",
      configKey,
      completedFetchWindows: [],
      missingIntervals: [],
    };
  }
  return JSON.parse(readFileSync(path, "utf8")) as ConfigCheckpoint;
}

export function saveConfigCheckpoint(checkpoint: ConfigCheckpoint): void {
  const path = checkpointPathForConfig(checkpoint.configKey);
  mkdirSync(path.replace(/[^/\\]+$/, ""), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ ...checkpoint, updatedAt: new Date().toISOString() }, null, 2),
  );
}

/** Explicit --start imports never read unrelated global checkpoints. */
export function remainingIntervals(
  allWindows: string[],
  checkpoint: ConfigCheckpoint,
): { pending: string[]; alreadyComplete: string[] } {
  const done = new Set(checkpoint.completedFetchWindows);
  const pending = allWindows.filter((w) => !done.has(w));
  const alreadyComplete = allWindows.filter((w) => done.has(w));
  return { pending, alreadyComplete };
}
