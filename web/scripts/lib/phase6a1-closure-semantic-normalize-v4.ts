/**
 * Normalization helpers for cross-benchmark duplicate detection (v4).
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys(obj[k]);
        return acc;
      }, {});
  }
  return value;
}

export function normalizeSnapshotForDuplicateCheck(snapshot: Record<string, unknown>): string {
  const clone = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;
  delete clone.caseId;
  delete clone.commanders;
  return JSON.stringify(sortKeys(clone));
}

export function loadSnapshotFingerprints(snapshotDir: string): Map<string, string> {
  const files = readdirSync(snapshotDir).filter((f) => f.endsWith(".json") && f !== "manifest.json");
  const map = new Map<string, string>();
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(snapshotDir, file), "utf8")) as Record<string, unknown>;
    map.set(file, normalizeSnapshotForDuplicateCheck(parsed));
  }
  return map;
}

export function findNormalizedDuplicates(
  leftDir: string,
  rightDir: string,
): Array<{ left: string; right: string }> {
  const left = loadSnapshotFingerprints(leftDir);
  const right = loadSnapshotFingerprints(rightDir);
  const hits: Array<{ left: string; right: string }> = [];
  for (const [lFile, lFp] of left) {
    for (const [rFile, rFp] of right) {
      if (lFp === rFp) hits.push({ left: lFile, right: rFile });
    }
  }
  return hits;
}
