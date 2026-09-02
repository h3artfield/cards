/** Normalize card name for dedup / lookup — matches inventory enrichment conventions. */
export function normalizeOracleName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}
