import { UMAP } from "umap-js";
import {
  CLUSTER_COUNT,
  UMAP_MIN_DIST,
  UMAP_NEIGHBORS,
  UMAP_RANDOM_SEED,
} from "./types";

export type ProjectionResult = {
  coords3d: Array<[number, number, number]>;
  coords2d: Array<[number, number]>;
  algorithm: "UMAP";
  parameters: {
    nComponents: 3;
    nNeighbors: number;
    minDist: number;
    randomSeed: number;
    metric: "cosine";
  };
};

/** Deterministic PCA for 2D comparison view. */
export function projectPca2d(matrix: number[][], seed = UMAP_RANDOM_SEED): Array<[number, number]> {
  const n = matrix.length;
  const d = matrix[0]?.length ?? 0;
  if (n === 0 || d === 0) return [];

  const mean = new Array(d).fill(0);
  for (const row of matrix) {
    for (let j = 0; j < d; j++) mean[j] += row[j];
  }
  for (let j = 0; j < d; j++) mean[j] /= n;

  const centered = matrix.map((row) => row.map((v, j) => v - mean[j]));

  const rng = mulberry32(seed);
  const v1 = randomUnitVector(d, rng);
  const projected1 = centered.map((row) => dot(row, v1));
  const v2 = randomUnitVector(d, rng);
  const projected2 = centered.map((row) => dot(row, v2));

  return projected1.map((x, i) => [x, projected2[i] ?? 0]);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function randomUnitVector(dim: number, rng: () => number): number[] {
  const v = new Array(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    v[i] = rng() - 0.5;
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm) || 1;
  return v.map((x) => x / norm);
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export async function projectUmap3d(
  matrix: number[][],
  input?: { nNeighbors?: number; minDist?: number; randomSeed?: number },
): Promise<ProjectionResult> {
  const nNeighbors = input?.nNeighbors ?? UMAP_NEIGHBORS;
  const minDist = input?.minDist ?? UMAP_MIN_DIST;
  const randomSeed = input?.randomSeed ?? UMAP_RANDOM_SEED;

  const rng = mulberry32(randomSeed);

  const umap = new UMAP({
    nComponents: 3,
    nNeighbors: Math.min(nNeighbors, Math.max(2, matrix.length - 1)),
    minDist,
    random: rng,
    distanceFn: cosineDistanceFn,
  });

  const embedding = umap.fit(matrix);
  const coords3d = embedding.map((row) => [row[0] ?? 0, row[1] ?? 0, row[2] ?? 0] as [number, number, number]);
  const coords2d = projectPca2d(matrix, randomSeed);

  return {
    coords3d,
    coords2d,
    algorithm: "UMAP",
    parameters: {
      nComponents: 3,
      nNeighbors,
      minDist,
      randomSeed,
      metric: "cosine",
    },
  };
}

function cosineDistanceFn(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

export function kMeansCluster(
  matrix: number[][],
  k = CLUSTER_COUNT,
  seed = UMAP_RANDOM_SEED,
  maxIter = 25,
): number[] {
  const n = matrix.length;
  const d = matrix[0]?.length ?? 0;
  if (n === 0) return [];
  const kk = Math.min(k, n);
  const rng = mulberry32(seed);
  const centroids: number[][] = [];
  const used = new Set<number>();
  while (centroids.length < kk) {
    const idx = Math.floor(rng() * n);
    if (used.has(idx)) continue;
    used.add(idx);
    centroids.push([...matrix[idx]]);
  }

  const assignments = new Array(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < kk; c++) {
        const dist = euclidean(matrix[i], centroids[c]);
        if (dist < bestDist) {
          bestDist = dist;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed += 1;
      }
    }
    if (changed === 0) break;

    const sums = Array.from({ length: kk }, () => new Array(d).fill(0));
    const counts = new Array(kk).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c] += 1;
      for (let j = 0; j < d; j++) sums[c][j] += matrix[i][j];
    }
    for (let c = 0; c < kk; c++) {
      if (counts[c] === 0) continue;
      centroids[c] = sums[c].map((v) => v / counts[c]);
    }
  }
  return assignments;
}

function euclidean(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
}

export function computeTopNeighbors(
  matrix: number[][],
  k: number,
): Array<Array<{ index: number; distance: number }>> {
  const n = matrix.length;
  const out: Array<Array<{ index: number; distance: number }>> = [];
  for (let i = 0; i < n; i++) {
    const scores: Array<{ index: number; distance: number }> = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      scores.push({ index: j, distance: cosineDistanceFn(matrix[i], matrix[j]) });
    }
    scores.sort((a, b) => a.distance - b.distance);
    out.push(scores.slice(0, k));
  }
  return out;
}
