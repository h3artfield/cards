/** Normalize card rarity for store rule matching (MTG letters, full names, etc.). */
export function normalizeCardRarity(raw?: string): string | undefined {
  if (!raw) return undefined;
  const n = raw.toLowerCase().trim();
  if (!n) return undefined;
  if (n === "c" || n === "common") return "common";
  if (n === "u" || n === "uncommon") return "uncommon";
  if (n === "r" || n === "rare") return "rare";
  if (n.includes("mythic")) return "mythic";
  if (n.includes("special")) return "special";
  return n.replace(/\s+/g, " ");
}

export function parseRarityFilterList(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => normalizeCardRarity(String(item)))
      .filter(Boolean) as string[];
  }
  if (typeof raw === "string" && raw.trim()) {
    return raw
      .split(",")
      .map((part) => normalizeCardRarity(part))
      .filter(Boolean) as string[];
  }
  return [];
}

export function cardRarityMatchesFilter(
  cardRarity: string | undefined,
  allowed: string[],
): boolean {
  const normalized = normalizeCardRarity(cardRarity);
  if (!normalized || allowed.length === 0) return false;
  return allowed.some((entry) => {
    const target = normalizeCardRarity(entry);
    if (!target) return false;
    return (
      normalized === target ||
      normalized.includes(target) ||
      target.includes(normalized)
    );
  });
}
