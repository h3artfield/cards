import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import { resolve } from "node:path";
import { modelArtifactDir } from "../training-snapshot-v1";
import type { ModelCVariant } from "./types";

export const MODEL_C_FEATURES_ARTIFACT_VERSION = "commander-model-c-features-v3";

export type LoadedFeatureRow = {
  rowKey: string;
  podId: string;
  seatIndex: number;
  deckHash: string;
  split: "train" | "validation" | "test";
  /** Standardized-model dense vector aligned to columnNames. */
  denseValues: number[];
  /** Raw card-id presence for sparse variants (pre-support-filter). */
  sparseCardIdentity?: Record<string, number>;
};

export type FeatureNamesArtifact = {
  variant: ModelCVariant;
  basicColumns: string[];
  columns: Array<{ name: string }>;
};

export function featureMatrixPath(split: string, variant: ModelCVariant): string {
  return resolve(
    modelArtifactDir(MODEL_C_FEATURES_ARTIFACT_VERSION),
    `feature-matrix-${split}-${variant}.jsonl.gz`,
  );
}

export function featureNamesPath(variant: ModelCVariant): string {
  return resolve(modelArtifactDir(MODEL_C_FEATURES_ARTIFACT_VERSION), `feature-names-${variant}.json`);
}

export function loadFeatureNames(variant: ModelCVariant): FeatureNamesArtifact {
  const path = featureNamesPath(variant);
  if (!existsSync(path)) throw new Error(`Missing feature names: ${path}`);
  return JSON.parse(readFileSync(path, "utf8")) as FeatureNamesArtifact;
}

export function columnNamesForVariant(variant: ModelCVariant): string[] {
  const artifact = loadFeatureNames(variant);
  return artifact.columns.map((c) => c.name);
}

async function loadJsonlGzRows(path: string): Promise<Array<Record<string, unknown>>> {
  if (!existsSync(path)) throw new Error(`Missing feature matrix: ${path}`);
  const rows: Array<Record<string, unknown>> = [];
  const input = createReadStream(path).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as Record<string, unknown>);
  }
  return rows;
}

export async function loadFeatureMatrixRows(input: {
  split: "train" | "validation" | "test";
  variant: ModelCVariant;
}): Promise<Map<string, LoadedFeatureRow>> {
  const path = featureMatrixPath(input.split, input.variant);
  const rawRows = await loadJsonlGzRows(path);
  const columnNames = columnNamesForVariant(input.variant);
  const isSparse = input.variant === "ID" || input.variant === "C2";
  const map = new Map<string, LoadedFeatureRow>();

  for (const raw of rawRows) {
    const rowKey = String(raw.rowKey);
    if (isSparse) {
      const denseColumnNames = columnNames.filter((name) => !name.startsWith("card_id_"));
      const denseColumns = raw.denseColumns as string[];
      const denseFeatures = raw.denseFeatures as number[];
      const denseByName = Object.fromEntries(denseColumns.map((name, i) => [name, denseFeatures[i] ?? 0]));
      const denseValues = denseColumnNames.map((name) => denseByName[name] ?? 0);
      map.set(rowKey, {
        rowKey,
        podId: String(raw.podId),
        seatIndex: Number(raw.seatIndex),
        deckHash: String(raw.deckHash),
        split: raw.split as LoadedFeatureRow["split"],
        denseValues,
        sparseCardIdentity: (raw.sparseCardIdentity as Record<string, number>) ?? {},
      });
    } else {
      const features = raw.features as number[];
      map.set(rowKey, {
        rowKey,
        podId: String(raw.podId),
        seatIndex: Number(raw.seatIndex),
        deckHash: String(raw.deckHash),
        split: raw.split as LoadedFeatureRow["split"],
        denseValues: features,
      });
    }
  }
  return map;
}

export function featureBlockForColumn(name: string): "BASIC" | "GAME_CHANGER" | "RC8" | "CARD_ID" {
  if (name.startsWith("basic_")) return "BASIC";
  if (name.startsWith("gc_")) return "GAME_CHANGER";
  if (name.startsWith("card_id_")) return "CARD_ID";
  return "RC8";
}

export function blockColumnIndices(columnNames: string[]): Record<string, number[]> {
  const blocks: Record<string, number[]> = {
    BASIC: [],
    GAME_CHANGER: [],
    RC8: [],
    CARD_ID: [],
  };
  columnNames.forEach((name, idx) => {
    blocks[featureBlockForColumn(name)]!.push(idx);
  });
  return blocks;
}
