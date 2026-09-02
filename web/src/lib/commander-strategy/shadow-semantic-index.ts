import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import type { ShadowSemanticInput } from "@/lib/semantic-visualization/shadow-input";
import { semanticMapArtifactPath } from "@/lib/semantic-visualization/artifact-paths";

import { RC8_PARSER_BLOB_CLOSURE } from "./semantic-universe-v1";

export type ShadowSemanticIndex = {
  byOracleId: Map<string, ShadowSemanticInput>;
  parserVersion: string;
  parserBlobClosure: string;
  semanticVersion: string;
  loadedCount: number;
};

export async function loadShadowSemanticIndex(
  shadowParsePath?: string,
): Promise<ShadowSemanticIndex> {
  const path = shadowParsePath ?? semanticMapArtifactPath("shadowParse");
  const byOracleId = new Map<string, ShadowSemanticInput>();
  let parserVersion = "rc8-shadow-unknown";
  let parserBlobClosure = RC8_PARSER_BLOB_CLOSURE;
  let semanticVersion = "rc8-shadow-unknown";

  const input = createReadStream(path).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {
      oracleId: string;
      canonicalName?: string;
      parserVersion?: string;
      publishable?: boolean;
      structuralInvalid?: boolean;
      needsReviewActions?: ShadowSemanticInput["needsReviewActions"];
      semantic?: ShadowSemanticInput["semantic"];
      semanticVersion?: string;
    };
    if (!row.oracleId || !row.semantic) continue;
    const input: ShadowSemanticInput = {
      oracleId: row.oracleId,
      canonicalName: row.canonicalName ?? row.oracleId,
      parserVersion: row.parserVersion ?? parserVersion,
      publishable: row.publishable ?? false,
      structuralInvalid: row.structuralInvalid ?? false,
      needsReviewActions: row.needsReviewActions ?? [],
      semantic: row.semantic,
    };
    byOracleId.set(row.oracleId, input);
    if (row.parserVersion) parserVersion = row.parserVersion;
    if (row.semanticVersion) semanticVersion = row.semanticVersion;
  }

  return { byOracleId, parserVersion, parserBlobClosure, semanticVersion, loadedCount: byOracleId.size };
}

export function aggregateVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0);
  for (const vec of vectors) {
    for (let i = 0; i < dim; i += 1) out[i] += vec[i] ?? 0;
  }
  for (let i = 0; i < dim; i += 1) out[i] /= vectors.length;
  return out;
}

export function aggregateKeyedVectors(
  vectors: Array<Record<string, number>>,
): Record<string, number> {
  const totals = new Map<string, number>();
  let count = 0;
  for (const vec of vectors) {
    count += 1;
    for (const [k, v] of Object.entries(vec)) {
      totals.set(k, (totals.get(k) ?? 0) + v);
    }
  }
  if (count === 0) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of totals) out[k] = v / count;
  return out;
}

export function sumKeyedVectors(
  vectors: Array<Record<string, number>>,
  normalize = true,
): Record<string, number> {
  const totals = new Map<string, number>();
  for (const vec of vectors) {
    for (const [k, v] of Object.entries(vec)) {
      totals.set(k, (totals.get(k) ?? 0) + v);
    }
  }
  const out: Record<string, number> = {};
  const denom = normalize && vectors.length > 0 ? vectors.length : 1;
  for (const [k, v] of totals) out[k] = v / denom;
  return out;
}
