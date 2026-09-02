import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import { resolve } from "node:path";
import { modelArtifactDir } from "../training-snapshot-v1";
import type { LoadedFeatureRow } from "../model-c/feature-matrix-io-v1";
import { MODEL_D2_FEATURES_VERSION, type ModelD2Variant } from "./types";

export { MODEL_D2_FEATURES_VERSION };

export type ModelD2FeatureNamesArtifact = {
  variant: ModelD2Variant;
  frozenC2DenseColumns: string[];
  frozenC2Columns: string[];
  selfProfileColumns: string[];
  opponentMarginalColumns: string[];
  interactionColumns: string[];
  ipv2BlockColumns: string[];
  prunedColumns: string[];
  totalDenseColumns: number;
};

export function featureMatrixPath(split: string, variant: ModelD2Variant): string {
  return resolve(
    modelArtifactDir(MODEL_D2_FEATURES_VERSION),
    `feature-matrix-${split}-${variant}.jsonl.gz`,
  );
}

export function featureNamesPath(variant: ModelD2Variant): string {
  return resolve(modelArtifactDir(MODEL_D2_FEATURES_VERSION), `feature-names-${variant}.json`);
}

export function loadFeatureNames(variant: ModelD2Variant): ModelD2FeatureNamesArtifact {
  const path = featureNamesPath(variant);
  if (!existsSync(path)) throw new Error(`Missing Model D2 feature names: ${path}`);
  const raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  return {
    variant,
    frozenC2DenseColumns: (raw.frozenC2DenseColumns as string[]) ?? [],
    frozenC2Columns: (raw.frozenC2Columns as string[]) ?? [],
    selfProfileColumns: (raw.selfProfileColumns as string[]) ?? [],
    opponentMarginalColumns: (raw.opponentMarginalColumns as string[]) ?? [],
    interactionColumns: (raw.interactionColumns as string[]) ?? [],
    ipv2BlockColumns: (raw.ipv2BlockColumns as string[]) ?? [],
    prunedColumns: (raw.prunedColumns as string[]) ?? [],
    totalDenseColumns: Number(raw.totalDenseColumns ?? 0),
  };
}

export function columnNamesForVariant(variant: ModelD2Variant): string[] {
  const artifact = loadFeatureNames(variant);
  return [...artifact.frozenC2DenseColumns, ...artifact.ipv2BlockColumns];
}

export async function loadFeatureMatrixRows(input: {
  split: "train" | "validation";
  variant: ModelD2Variant;
}): Promise<Map<string, LoadedFeatureRow>> {
  const path = featureMatrixPath(input.split, input.variant);
  if (!existsSync(path)) throw new Error(`Missing Model D2 feature matrix: ${path}`);

  const columnNames = columnNamesForVariant(input.variant);
  const map = new Map<string, LoadedFeatureRow>();

  const stream = createReadStream(path).pipe(createGunzip());
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const raw = JSON.parse(line) as Record<string, unknown>;
    const rowKey = String(raw.rowKey);
    const denseColumns = raw.denseColumns as string[];
    const denseFeatures = raw.denseFeatures as number[];
    const denseByName = Object.fromEntries(denseColumns.map((name, i) => [name, denseFeatures[i] ?? 0]));
    const denseValues = columnNames.map((name) => denseByName[name] ?? 0);
    map.set(rowKey, {
      rowKey,
      podId: String(raw.podId),
      seatIndex: Number(raw.seatIndex),
      deckHash: String(raw.deckHash),
      split: input.split,
      denseValues,
      sparseCardIdentity: raw.sparseCardIdentity as Record<string, number> | undefined,
    });
  }
  return map;
}
