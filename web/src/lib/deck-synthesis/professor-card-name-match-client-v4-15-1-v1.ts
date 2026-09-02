/**
 * Client-safe card name normalization for Professor UI — no catalog/firebase/node imports.
 */
import { normalizeOracleName } from "../deck-builder/golden-catalog/normalize-name";

const FACE_SEPARATOR = " // ";

/** Strip duplicate "// face" artifacts; preserve real multi-face card names. */
export function canonicalizeDisplayName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "";
  if (!trimmed.includes(FACE_SEPARATOR)) return trimmed;

  const faces = trimmed.split(FACE_SEPARATOR).map((part) => part.trim()).filter(Boolean);
  if (faces.length <= 1) return faces[0] ?? trimmed;

  const normalizedFaces = faces.map((face) => normalizeOracleName(face));
  const allSame = normalizedFaces.every((face) => face === normalizedFaces[0]);
  if (allSame) return faces[0]!;

  return trimmed;
}

export function normalizeCardNameForMatch(name: string | null | undefined): string {
  return normalizeOracleName(canonicalizeDisplayName(name));
}
