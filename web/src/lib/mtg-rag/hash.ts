import { createHash } from "crypto";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function chunkIdFromParts(parts: string[]): string {
  return sha256Hex(parts.join("\0"));
}

export function aliasHashFromNormalized(normalizedAlias: string): string {
  return sha256Hex(normalizedAlias.trim().toLowerCase());
}

export function normalizeAlias(alias: string): string {
  return alias.trim().toLowerCase().replace(/\s+/g, " ");
}
