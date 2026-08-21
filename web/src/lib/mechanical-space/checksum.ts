import { createHash } from "node:crypto";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function sha256Json(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** Deterministic checksum over oracleId + float32 vector bytes, oracleIds sorted. */
export function checksumOracleVectors(rows: Array<{ oracleId: string; vector: Float32Array | number[] }>): string {
  const hash = createHash("sha256");
  const sorted = [...rows].sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  for (const row of sorted) {
    hash.update(row.oracleId);
    hash.update("\0");
    const vec = row.vector instanceof Float32Array ? row.vector : Float32Array.from(row.vector);
    hash.update(Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function assertFiniteVector(vector: ArrayLike<number>, oracleId: string): { ok: true } | { ok: false; reason: string } {
  if (vector.length === 0) return { ok: false, reason: `empty vector for ${oracleId}` };
  let allZero = true;
  for (let i = 0; i < vector.length; i++) {
    const v = vector[i];
    if (!Number.isFinite(v)) return { ok: false, reason: `non-finite value at ${i} for ${oracleId}` };
    if (v !== 0) allZero = false;
  }
  if (allZero) return { ok: false, reason: `zero vector for ${oracleId}` };
  return { ok: true };
}
