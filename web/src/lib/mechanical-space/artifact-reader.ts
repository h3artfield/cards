import { existsSync, readFileSync } from "node:fs";
import { mechanicalSpacePath } from "./artifact-paths";

export function readJsonIfExists<T>(...parts: string[]): T | null {
  const path = mechanicalSpacePath(...parts);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readJsonlIfExists<T>(...parts: string[]): T[] {
  const path = mechanicalSpacePath(...parts);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

export type SnapshotIndexRow = {
  i: number;
  oracleId: string;
  name: string;
  typeLine?: string;
  oracleText?: string;
};

let snapshotIndexCache: SnapshotIndexRow[] | null = null;
let snapshotById: Map<string, SnapshotIndexRow> | null = null;

export function loadSnapshotIndex(): SnapshotIndexRow[] {
  if (snapshotIndexCache) return snapshotIndexCache;
  snapshotIndexCache = readJsonlIfExists<SnapshotIndexRow>("semantic-oracle-snapshot-v1", "index.jsonl");
  snapshotById = new Map(snapshotIndexCache.map((r) => [r.oracleId, r]));
  return snapshotIndexCache;
}

export function getSnapshotRow(oracleId: string): SnapshotIndexRow | undefined {
  loadSnapshotIndex();
  return snapshotById?.get(oracleId);
}

export function searchSnapshot(query: string, limit = 20): SnapshotIndexRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return loadSnapshotIndex()
    .filter((r) => r.name.toLowerCase().includes(q) || r.oracleId === q)
    .slice(0, limit);
}
