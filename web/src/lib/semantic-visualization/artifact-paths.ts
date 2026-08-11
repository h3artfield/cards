import { resolve } from "node:path";

export const SEMANTIC_VISUALIZATION_DIR = resolve(
  process.cwd(),
  "data/milestones/catalog-shadow",
);

export const SEMANTIC_MAP_ARTIFACTS = {
  manifest: "catalog-semantic-visualization-v1-manifest.json",
  points: "catalog-semantic-visualization-v1-points.json.gz",
  neighbors: "catalog-semantic-visualization-v1-neighbors.jsonl.gz",
  clusters: "catalog-semantic-visualization-v1-clusters.json",
  shadowManifest: "catalog-shadow-parse-rc8-firestore-v2-manifest.json",
  shadowParse: "catalog-shadow-parse-rc8-firestore-v2.jsonl.gz",
} as const;

export function semanticMapArtifactPath(name: keyof typeof SEMANTIC_MAP_ARTIFACTS): string {
  return resolve(SEMANTIC_VISUALIZATION_DIR, SEMANTIC_MAP_ARTIFACTS[name]);
}
