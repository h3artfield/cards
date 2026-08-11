import { createGunzip, gunzipSync } from "node:zlib";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import readline from "node:readline";
import type {
  SemanticMapClusterSummary,
  SemanticMapManifest,
  SemanticMapPoint,
} from "./types";
import { semanticMapArtifactPath } from "./artifact-paths";

type NeighborRow = {
  oracleId: string;
  neighbors: Array<{ oracleId: string; distance: number }>;
};

let cachedManifest: SemanticMapManifest | null = null;
let cachedPoints: SemanticMapPoint[] | null = null;
let cachedNeighbors: Map<string, Array<{ oracleId: string; distance: number }>> | null = null;
let cachedClusters: SemanticMapClusterSummary[] | null = null;
let cachedPointsById: Map<string, SemanticMapPoint> | null = null;
let cachedNameIndex: Map<string, SemanticMapPoint[]> | null = null;

export function semanticMapArtifactsAvailable(): boolean {
  return (
    existsSync(semanticMapArtifactPath("manifest")) &&
    existsSync(semanticMapArtifactPath("points"))
  );
}

export function loadSemanticMapManifest(): SemanticMapManifest {
  if (cachedManifest) return cachedManifest;
  const raw = readFileSync(semanticMapArtifactPath("manifest"), "utf8");
  cachedManifest = JSON.parse(raw) as SemanticMapManifest;
  return cachedManifest;
}

export function loadSemanticMapPoints(): SemanticMapPoint[] {
  if (cachedPoints) return cachedPoints;
  const buf = gunzipSync(readFileSync(semanticMapArtifactPath("points")));
  cachedPoints = JSON.parse(buf.toString("utf8")) as SemanticMapPoint[];
  cachedPointsById = new Map(cachedPoints.map((p) => [p.oracleId, p]));
  cachedNameIndex = new Map();
  for (const p of cachedPoints) {
    const key = p.normalizedName;
    const bucket = cachedNameIndex.get(key) ?? [];
    bucket.push(p);
    cachedNameIndex.set(key, bucket);
  }
  return cachedPoints;
}

export function getSemanticMapPoint(oracleId: string): SemanticMapPoint | undefined {
  loadSemanticMapPoints();
  return cachedPointsById?.get(oracleId);
}

export function searchSemanticMapPoints(query: string, limit = 20): SemanticMapPoint[] {
  loadSemanticMapPoints();
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const results: SemanticMapPoint[] = [];
  for (const p of cachedPoints ?? []) {
    if (p.name.toLowerCase().includes(q) || p.normalizedName.includes(q.replace(/[^a-z0-9]/g, ""))) {
      results.push(p);
      if (results.length >= limit) break;
    }
  }
  return results;
}

export async function loadSemanticMapNeighbors(): Promise<
  Map<string, Array<{ oracleId: string; distance: number }>>
> {
  if (cachedNeighbors) return cachedNeighbors;
  cachedNeighbors = new Map();
  const path = semanticMapArtifactPath("neighbors");
  if (!existsSync(path)) return cachedNeighbors;

  const input = createReadStream(path).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as NeighborRow;
    cachedNeighbors.set(row.oracleId, row.neighbors);
  }
  return cachedNeighbors;
}

export function loadSemanticMapClusters(): SemanticMapClusterSummary[] {
  if (cachedClusters) return cachedClusters;
  const path = semanticMapArtifactPath("clusters");
  if (!existsSync(path)) {
    cachedClusters = [];
    return cachedClusters;
  }
  cachedClusters = JSON.parse(readFileSync(path, "utf8")) as SemanticMapClusterSummary[];
  return cachedClusters;
}

export function clearSemanticMapArtifactCache(): void {
  cachedManifest = null;
  cachedPoints = null;
  cachedNeighbors = null;
  cachedClusters = null;
  cachedPointsById = null;
  cachedNameIndex = null;
}
