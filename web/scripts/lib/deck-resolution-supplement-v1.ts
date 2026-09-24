/**
 * Competitive tournament deck identity rules from Scryfall default_cards printing metadata.
 * Structural only — no card-specific exceptions.
 */
import { printingHasPaperGames } from "./catalog-paper-eligibility-v1";

const NON_PLAYABLE_LAYOUTS = new Set(["token", "emblem", "vanguard", "scheme", "art_series"]);

export function extractPrintingName(raw: Record<string, unknown>): string | undefined {
  const top = raw.name as string | undefined;
  if (top?.trim()) return top.trim();
  const faces = raw.card_faces as Array<{ name?: string }> | undefined;
  return faces?.[0]?.name?.trim();
}

export function extractFlavorName(raw: Record<string, unknown>): string | undefined {
  const flavor = raw.flavor_name as string | undefined;
  return flavor?.trim() || undefined;
}

/** Scryfall printed_name — alternate face name on UB / localized printings. */
export function extractPrintedName(raw: Record<string, unknown>): string | undefined {
  const printed = raw.printed_name as string | undefined;
  return printed?.trim() || undefined;
}

export function isPlaytestOrNonCompetitivePrinting(raw: Record<string, unknown>): boolean {
  if (!printingHasPaperGames(raw)) return true;
  const layout = String(raw.layout ?? "");
  if (NON_PLAYABLE_LAYOUTS.has(layout)) return true;

  const setType = String(raw.set_type ?? "").toLowerCase();
  const setName = String(raw.set_name ?? "").toLowerCase();
  const typeLine = String(raw.type_line ?? "").toLowerCase();

  if (typeLine.includes("token")) return true;
  if (setName.includes("playtest")) return true;
  if (setName.includes("mystery booster playtest")) return true;
  if (setType === "funny" && (setName.includes("playtest") || setName.includes("playtest cards"))) {
    return true;
  }

  return false;
}

export function isCompetitiveTournamentPrinting(raw: Record<string, unknown>): boolean {
  return printingHasPaperGames(raw) && !isPlaytestOrNonCompetitivePrinting(raw);
}

export type OfficialNameAliasRow = {
  normalizedAlias: string;
  aliasDisplayName: string;
  oracleId: string;
  canonicalOracleName: string;
  aliasKind: "printing_name" | "flavor_name" | "printed_name";
  evidenceSetCode: string;
  evidenceSetName?: string;
  /** Whether alias evidence row itself has paper in games[] (OM1 crossover rows are often mtgo-only). */
  evidenceHasPaperPrinting: boolean;
};

export type DeckResolutionSupplement = {
  version: "deck-resolution-supplement-v2";
  generatedAt: string;
  bulkUpdatedAt: string;
  bulkContentHash: string;
  bulkCachePath?: string;
  officialNameAliases: OfficialNameAliasRow[];
  aliasConflictCount: number;
  /** Ambiguous alias strings excluded from the supplement (competing oracle targets). */
  aliasConflicts?: Array<{
    normalizedAlias: string;
    competing: OfficialNameAliasRow[];
    exclusionReason: string;
  }>;
  competitiveDeckOracleIds: string[];
  nonCompetitiveOracleReasons: Array<{ oracleId: string; reason: string }>;
  aliasExtractionNotes: string[];
};
