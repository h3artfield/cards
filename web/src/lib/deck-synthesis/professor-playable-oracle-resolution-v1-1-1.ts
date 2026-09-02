/**
 * Playable Commander library oracle resolution — excludes art_series, tokens, emblems, etc.
 */
import type { GoldenCatalogOracleCard } from "../../../scripts/lib/load-golden-catalog-index";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  isCompetitiveDeckOracle,
  isCurrentlyCommanderLegal,
} from "../../../scripts/lib/load-deck-resolution-catalog";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import {
  canonicalizeDisplayName,
  normalizeCardNameForMatch,
} from "./professor-card-name-match-client-v4-15-1-v1";

export const PROFESSOR_PLAYABLE_ORACLE_RESOLUTION_V1_1_1_VERSION =
  "professor-playable-oracle-resolution-v1-1-1";

const NON_PLAYABLE_LAYOUTS = new Set([
  "token",
  "emblem",
  "vanguard",
  "scheme",
  "art_series",
  "plane",
  "planar",
]);

export function isPlayableCommanderLibraryOracle(
  catalog: DeckResolutionCatalog,
  oracleId: string,
): boolean {
  const card = catalog.byOracleId.get(oracleId);
  if (!card) return false;
  if (!isCurrentlyCommanderLegal(card)) return false;

  const layout = String(card.layout ?? "");
  if (NON_PLAYABLE_LAYOUTS.has(layout)) return false;

  const typeLine = String(card.typeLine ?? "").toLowerCase();
  if (/\btoken\b/.test(typeLine)) return false;

  const nonCompetitive = catalog.nonCompetitiveOracleReasons.get(oracleId);
  if (nonCompetitive && /art.?series|token|emblem|non.?card|playtest|vanguard|scheme/i.test(nonCompetitive)) {
    return false;
  }

  const paper = catalog.paperByOracleId.get(oracleId);
  if (paper?.paperPopulationFrame === "NON_CARD" || paper?.paperPopulationFrame === "MALFORMED") {
    return false;
  }

  return true;
}

function commanderLegalityRank(card: GoldenCatalogOracleCard): number {
  const cmd = card.legalities?.commander;
  if (cmd === "legal") return 3;
  if (cmd === "restricted") return 2;
  if (isCurrentlyCommanderLegal(card)) return 1;
  return 0;
}

function displayNameQualityRank(name: string): number {
  const canonical = canonicalizeDisplayName(name);
  if (canonical === name && !name.includes(" // ")) return 2;
  if (canonical !== name) return 1;
  return 0;
}

export function selectBestPlayableOracleMatch(
  matches: GoldenCatalogOracleCard[],
  catalog: DeckResolutionCatalog,
): GoldenCatalogOracleCard | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;

  const ranked = [...matches].sort((a, b) => {
    const competitiveDelta =
      Number(isCompetitiveDeckOracle(catalog, b.oracleId)) -
      Number(isCompetitiveDeckOracle(catalog, a.oracleId));
    if (competitiveDelta !== 0) return competitiveDelta;

    const legalityDelta = commanderLegalityRank(b) - commanderLegalityRank(a);
    if (legalityDelta !== 0) return legalityDelta;

    const displayDelta = displayNameQualityRank(b.canonicalName) - displayNameQualityRank(a.canonicalName);
    if (displayDelta !== 0) return displayDelta;

    return a.oracleId.localeCompare(b.oracleId);
  });

  return ranked[0] ?? null;
}

export function findPlayableCommanderLibraryMatches(args: {
  name: string;
  catalog: DeckResolutionCatalog;
  commanderColorIdentity?: string[];
}): GoldenCatalogOracleCard[] {
  const matchKey = normalizeCardNameForMatch(args.name);
  const candidates = args.catalog.byNormalizedName.get(matchKey) ?? [];
  return candidates.filter((card) => {
    if (!isPlayableCommanderLibraryOracle(args.catalog, card.oracleId)) return false;
    if (!args.commanderColorIdentity?.length) return true;
    const colors = card.colorIdentity ?? [];
    return commanderLegalInIdentity(colors, args.commanderColorIdentity);
  });
}

export function resolvePlayableExactNameInCatalog(args: {
  name: string;
  catalog: DeckResolutionCatalog;
  commanderColorIdentity?: string[];
}): {
  oracleId: string | null;
  canonicalName: string | null;
  resolved: boolean;
  commanderLegal: boolean;
  colorLegal: boolean;
} {
  const matches = findPlayableCommanderLibraryMatches(args);
  const winner = selectBestPlayableOracleMatch(matches, args.catalog);
  if (!winner) {
    return {
      oracleId: null,
      canonicalName: null,
      resolved: false,
      commanderLegal: false,
      colorLegal: false,
    };
  }

  const commanderLegal = isCurrentlyCommanderLegal(winner);
  const colorLegal = args.commanderColorIdentity?.length
    ? commanderLegalInIdentity(winner.colorIdentity ?? [], args.commanderColorIdentity)
    : true;

  return {
    oracleId: winner.oracleId,
    canonicalName: canonicalizeDisplayName(winner.canonicalName),
    resolved: true,
    commanderLegal,
    colorLegal,
  };
}

/** Eight archived v1.1 preferred-example regression names. */
export const PLAYABLE_EXACT_RESOLUTION_REGRESSION_NAMES_V111 = [
  "Farseek",
  "Cultivate",
  "Pest Infestation",
  "Yawgmoth, Thran Physician",
  "Bastion of Remembrance",
  "Toski, Bearer of Secrets",
  "Damnation",
  "Heroic Intervention",
] as const;
