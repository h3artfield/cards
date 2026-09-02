import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import { resolve } from "node:path";
import { modelArtifactDir } from "../training-snapshot-v1";
import type { LoadedFeatureRow } from "../model-c/feature-matrix-io-v1";
import { MODEL_D_FEATURES_VERSION, type ModelDVariant } from "./types";

export { MODEL_D_FEATURES_VERSION };

export type ModelDFeatureNamesArtifact = {
  variant: ModelDVariant;
  frozenC2Columns: string[];
  opponentContextColumns: string[];
  semanticMatchupColumns: string[];
  dBlockColumns: string[];
  totalColumns: number;
};

export function featureMatrixPath(split: string, variant: ModelDVariant): string {
  return resolve(
    modelArtifactDir(MODEL_D_FEATURES_VERSION),
    `feature-matrix-${split}-${variant}.jsonl.gz`,
  );
}

export function featureNamesPath(variant: ModelDVariant): string {
  return resolve(modelArtifactDir(MODEL_D_FEATURES_VERSION), `feature-names-${variant}.json`);
}

export function loadFeatureNames(variant: ModelDVariant): ModelDFeatureNamesArtifact {
  const path = featureNamesPath(variant);
  if (!existsSync(path)) throw new Error(`Missing Model D feature names: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as ModelDFeatureNamesArtifact;
}

export function columnNamesForVariant(variant: ModelDVariant): string[] {
  const artifact = loadFeatureNames(variant);
  return [...artifact.frozenC2Columns, ...artifact.dBlockColumns];
}

export async function loadFeatureMatrixRows(input: {
  split: "train" | "validation" | "test";
  variant: ModelDVariant;
}): Promise<Map<string, LoadedFeatureRow>> {
  const path = featureMatrixPath(input.split, input.variant);
  if (!existsSync(path)) throw new Error(`Missing Model D feature matrix: ${path}`);

  const columnNames = columnNamesForVariant(input.variant);
  const denseNames = columnNames.filter((n) => !n.startsWith("card_id_"));
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
    const denseValues = denseNames.map((name) => denseByName[name] ?? 0);
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
