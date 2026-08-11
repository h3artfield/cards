/**
 * Build RC8 semantic visualization artifacts (feature vectors → UMAP → clusters → neighbors).
 *
 * Run: cd web && npx tsx scripts/build-catalog-semantic-visualization-v1.ts
 * Optional: --limit=500 for smoke test
 */
import { createHash } from "node:crypto";
import { createGunzip, createGzip } from "node:zlib";
import { createReadStream, createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import readline from "node:readline";
import { loadEnvLocal } from "./lib/script-env";
import type { CatalogShadowParseRecord } from "./lib/catalog-shadow-parse-record-v1";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import {
  buildCardFeatureBundle,
  normalizeFeatureMatrix,
} from "../src/lib/semantic-visualization/feature-vector-v1";
import { normalizeCardName } from "../src/lib/semantic-visualization/filters-v1";
import { qualityStatusFromShadow } from "../src/lib/semantic-visualization/shadow-input";
import {
  computeTopNeighbors,
  kMeansCluster,
  projectUmap3d,
} from "../src/lib/semantic-visualization/projection-v1";
import {
  CLUSTER_COUNT,
  DERIVED_FEATURE_VERSION,
  FEATURE_VECTOR_VERSION,
  NEIGHBOR_COUNT,
  PROJECTION_VERSION,
  SEMANTIC_VISUALIZATION_VERSION,
  UMAP_RANDOM_SEED,
} from "../src/lib/semantic-visualization/types";
import type { SemanticMapClusterSummary, SemanticMapPoint } from "../src/lib/semantic-visualization/types";
import { SEMANTIC_MAP_ARTIFACTS } from "../src/lib/semantic-visualization/artifact-paths";

loadEnvLocal();

const OUT_DIR = resolve("data/milestones/catalog-shadow");
const SHADOW_MANIFEST_PATH = resolve(OUT_DIR, SEMANTIC_MAP_ARTIFACTS.shadowManifest);

function argValue(prefix: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`${prefix}=`))?.split("=").slice(1).join("=");
}

async function readShadowRecords(limit?: number): Promise<CatalogShadowParseRecord[]> {
  const manifest = JSON.parse(readFileSync(SHADOW_MANIFEST_PATH, "utf8")) as { artifactPath: string };
  const artifactPath = resolve(manifest.artifactPath);
  const input = createReadStream(artifactPath).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const rows: CatalogShadowParseRecord[] = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as CatalogShadowParseRecord);
    if (limit != null && rows.length >= limit) break;
  }
  return rows;
}

function buildClusterSummaries(
  points: SemanticMapPoint[],
  k: number,
): SemanticMapClusterSummary[] {
  const byCluster = new Map<number, SemanticMapPoint[]>();
  for (const p of points) {
    const bucket = byCluster.get(p.clusterId) ?? [];
    bucket.push(p);
    byCluster.set(p.clusterId, bucket);
  }

  const summaries: SemanticMapClusterSummary[] = [];
  for (const [clusterId, members] of byCluster) {
    const actionCounts = new Map<string, number>();
    const roleCounts = new Map<string, number>();
    const abilityCounts = new Map<string, number>();

    for (const m of members) {
      for (const a of m.topActions) actionCounts.set(a, (actionCounts.get(a) ?? 0) + 1);
      for (const r of m.derivedRoles) roleCounts.set(r, (roleCounts.get(r) ?? 0) + 1);
      for (const t of m.abilityTypes) abilityCounts.set(t, (abilityCounts.get(t) ?? 0) + 1);
    }

    const topN = (map: Map<string, number>, label: string) =>
      [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([value, count]) => ({ [label]: value, count })) as Array<Record<string, string | number>>;

    summaries.push({
      clusterId,
      size: members.length,
      topActions: [...actionCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([action, count]) => ({ action, count })),
      topDerivedRoles: [...roleCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([role, count]) => ({ role, count })),
      topAbilityTypes: [...abilityCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([abilityType, count]) => ({ abilityType, count })),
      representativeCards: members.slice(0, 5).map((m) => ({ oracleId: m.oracleId, name: m.name })),
    });
  }

  return summaries.sort((a, b) => a.clusterId - b.clusterId);
}

async function main() {
  const limitRaw = argValue("--limit");
  const limit = limitRaw ? parseInt(limitRaw, 10) : undefined;

  console.error("Loading golden catalog index…");
  const catalog = await loadGoldenCatalogIndex();

  console.error(`Reading shadow parse records${limit ? ` (limit ${limit})` : ""}…`);
  const shadowRows = await readShadowRecords(limit);

  const bundles: ReturnType<typeof buildCardFeatureBundle>[] = [];
  const skipped: string[] = [];

  for (const shadow of shadowRows) {
    const card = catalog.byOracleId.get(shadow.oracleId);
    if (!card) {
      skipped.push(shadow.oracleId);
      continue;
    }
    bundles.push(buildCardFeatureBundle({ shadow, card }));
  }

  if (skipped.length) {
    console.error(`Warning: skipped ${skipped.length} shadow rows without golden catalog metadata`);
  }

  console.error(`Built ${bundles.length} feature bundles`);
  const rawMatrix = bundles.map((b) => b.combinedVector);
  const normalized = normalizeFeatureMatrix(rawMatrix);

  console.error("Running UMAP 3D projection…");
  const projection = await projectUmap3d(normalized);

  console.error("Clustering…");
  const clusterIds = kMeansCluster(normalized, CLUSTER_COUNT, UMAP_RANDOM_SEED);

  console.error(`Computing top-${NEIGHBOR_COUNT} semantic neighbors…`);
  const neighborIndices = computeTopNeighbors(normalized, NEIGHBOR_COUNT);

  const points: SemanticMapPoint[] = bundles.map((bundle, i) => {
    const card = catalog.byOracleId.get(bundle.oracleId)!;
    const shadow = shadowRows.find((s) => s.oracleId === bundle.oracleId)!;
    const [x, y, z] = projection.coords3d[i] ?? [0, 0, 0];
    const [x2, y2] = projection.coords2d[i] ?? [0, 0];
    const qualityStatus = qualityStatusFromShadow(shadow);

    return {
      oracleId: bundle.oracleId,
      name: card.canonicalName,
      x,
      y,
      z,
      x2,
      y2,
      clusterId: clusterIds[i] ?? 0,
      colorIdentity: card.colorIdentity ?? [],
      manaValue: card.manaValue ?? card.cmc ?? 0,
      manaCost: card.manaCost,
      typeLine: card.typeLine ?? "",
      types: card.types ?? [],
      subtypes: card.subtypes ?? [],
      layout: card.layout,
      commanderEligible: Boolean(card.commanderEligibility?.canBeSoleCommander),
      power: card.cardFaces?.[0]?.power,
      toughness: card.cardFaces?.[0]?.toughness,
      publishable: shadow.publishable,
      hasNeedsReview: shadow.needsReviewActions.length > 0,
      structuralInvalid: shadow.structuralInvalid,
      qualityStatus,
      topActions: bundle.topActions,
      abilityTypes: bundle.abilityTypes,
      zones: bundle.zones,
      semanticOwners: bundle.semanticOwners,
      derivedRoles: bundle.derivedRoles,
      normalizedName: normalizeCardName(card.canonicalName),
    };
  });

  mkdirSync(OUT_DIR, { recursive: true });

  const pointsJson = JSON.stringify(points);
  const pointsPath = resolve(OUT_DIR, SEMANTIC_MAP_ARTIFACTS.points);
  const gzip = createGzip();
  const out = createWriteStream(pointsPath);
  await pipeline(Readable.from([pointsJson]), gzip, out);

  const neighborsPath = resolve(OUT_DIR, SEMANTIC_MAP_ARTIFACTS.neighbors);
  const neighborLines = neighborIndices
    .map((list, i) => {
      const oracleId = bundles[i].oracleId;
      const neighbors = list.map(({ index, distance }) => ({
        oracleId: bundles[index].oracleId,
        distance: Math.round(distance * 1_000_000) / 1_000_000,
      }));
      return `${JSON.stringify({ oracleId, neighbors })}\n`;
    })
    .join("");
  const neighborsGzip = createGzip();
  const neighborsOut = createWriteStream(neighborsPath);
  await pipeline(Readable.from([neighborLines]), neighborsGzip, neighborsOut);

  const clusters = buildClusterSummaries(points, CLUSTER_COUNT);
  const clustersPath = resolve(OUT_DIR, SEMANTIC_MAP_ARTIFACTS.clusters);
  writeFileSync(clustersPath, `${JSON.stringify(clusters, null, 2)}\n`);

  const shadowManifest = JSON.parse(readFileSync(SHADOW_MANIFEST_PATH, "utf8")) as {
    parserVersion: string;
    contentHash?: string;
    artifactPath: string;
  };

  const manifest = {
    artifactType: "CatalogSemanticVisualizationManifest",
    version: SEMANTIC_VISUALIZATION_VERSION,
    generatedAt: new Date().toISOString(),
    status: "EXPERIMENTAL",
    label: "RC8 Semantic Map — Experimental",
    disclaimer:
      "Position represents similarity in the current RC8 semantic model. Spatial proximity is exploratory and does not by itself imply a confirmed gameplay synergy. Similarity ≠ synergy.",
    shadowParseManifestPath: SHADOW_MANIFEST_PATH.replace(/\\/g, "/"),
    shadowParseContentHash: shadowManifest.contentHash,
    parserVersion: shadowManifest.parserVersion,
    populationCount: points.length,
    embeddingVersion: `${FEATURE_VECTOR_VERSION}+${DERIVED_FEATURE_VERSION}`,
    featureVectorVersion: FEATURE_VECTOR_VERSION,
    derivedFeatureVersion: DERIVED_FEATURE_VERSION,
    projectionAlgorithm: "UMAP",
    projectionVersion: PROJECTION_VERSION,
    projectionParameters: projection.parameters,
    pca2dVersion: "pca-2d-v1",
    clusterVersion: "kmeans-v1",
    clusterCount: CLUSTER_COUNT,
    randomSeed: UMAP_RANDOM_SEED,
    pointsArtifactPath: pointsPath.replace(/\\/g, "/"),
    neighborsArtifactPath: neighborsPath.replace(/\\/g, "/"),
    clustersArtifactPath: clustersPath.replace(/\\/g, "/"),
    contentHash: createHash("sha256").update(pointsJson).update(neighborLines).digest("hex"),
  };

  const manifestPath = resolve(OUT_DIR, SEMANTIC_MAP_ARTIFACTS.manifest);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.error(`Wrote ${points.length} points → ${pointsPath}`);
  console.error(`Manifest → ${manifestPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
