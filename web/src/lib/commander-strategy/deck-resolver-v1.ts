import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  isCurrentlyCommanderLegal,
  paperMetaForOracle,
} from "../../../scripts/lib/load-deck-resolution-catalog";
import { normalizeDeckObjCardKey } from "./deck-obj-key-normalization-v1";
import { resolveCatalogCardByName } from "./resolve-catalog-card-by-name";
import type { ResolvedCommander, ResolvedDeckCard } from "./types";

export type TopdeckDeckObj = {
  Commanders?: Record<string, number | { count?: number; qty?: number }>;
  Mainboard?: Record<string, number | { count?: number; qty?: number }>;
  Sideboard?: Record<string, number | { count?: number; qty?: number }>;
};

export type ParsedDecklistSections = {
  commanders: Array<{ name: string; quantity: number }>;
  mainboard: Array<{ name: string; quantity: number }>;
  commanderSource: "deckObj" | "parsed_text" | "unknown";
  structuredCommanderAvailable: boolean;
  parsedTextCommanderAvailable: boolean;
};

const SECTION_MARKERS = [
  { key: "commanders" as const, patterns: [/^~~?commanders?~~?$/i, /^commanders?:?$/i] },
  { key: "mainboard" as const, patterns: [/^~~?mainboard~~?$/i, /^main(?:board)?:?$/i, /^deck:?$/i] },
  { key: "sideboard" as const, patterns: [/^~~?sideboard~~?$/i, /^side(?:board)?:?$/i] },
];

function qtyFromDeckObjValue(value: number | { count?: number; qty?: number } | undefined): number {
  if (typeof value === "number") return value;
  if (!value) return 1;
  return value.count ?? value.qty ?? 1;
}

export function parseDeckObj(deckObj: TopdeckDeckObj | null | undefined): ParsedDecklistSections {
  const commanders: Array<{ name: string; quantity: number }> = [];
  const mainboard: Array<{ name: string; quantity: number }> = [];
  const hasStructuredCommanders = Boolean(deckObj?.Commanders && Object.keys(deckObj.Commanders).length > 0);
  if (!deckObj) {
    return {
      commanders,
      mainboard,
      commanderSource: "unknown",
      structuredCommanderAvailable: false,
      parsedTextCommanderAvailable: false,
    };
  }

  for (const [name, value] of Object.entries(deckObj.Commanders ?? {})) {
    commanders.push({
      name: normalizeDeckObjCardKey(name).normalizedKey,
      quantity: qtyFromDeckObjValue(value),
    });
  }
  for (const [name, value] of Object.entries(deckObj.Mainboard ?? {})) {
    mainboard.push({
      name: normalizeDeckObjCardKey(name).normalizedKey,
      quantity: qtyFromDeckObjValue(value),
    });
  }
  return {
    commanders,
    mainboard,
    commanderSource: hasStructuredCommanders ? "deckObj" : "unknown",
    structuredCommanderAvailable: hasStructuredCommanders,
    parsedTextCommanderAvailable: false,
  };
}

export function parseDecklistText(decklist: string | null | undefined): ParsedDecklistSections {
  const commanders: Array<{ name: string; quantity: number }> = [];
  const mainboard: Array<{ name: string; quantity: number }> = [];
  if (!decklist?.trim()) {
    return {
      commanders,
      mainboard,
      commanderSource: "unknown",
      structuredCommanderAvailable: false,
      parsedTextCommanderAvailable: false,
    };
  }

  let section: "commanders" | "mainboard" | "sideboard" | null = null;
  for (const rawLine of decklist.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("#")) continue;

    const marker = SECTION_MARKERS.find((m) => m.patterns.some((p) => p.test(line)));
    if (marker) {
      section = marker.key === "sideboard" ? "sideboard" : marker.key;
      continue;
    }

    const match = line.match(/^(\d+)\s+x?\s*(.+)$/i) ?? line.match(/^(.+?)\s+x(\d+)$/i);
    if (!match) continue;
    const quantity =
      match[1] && /^\d+$/.test(match[1]) ? Number.parseInt(match[1], 10) : Number.parseInt(match[2], 10);
    const name = (match[1] && /^\d+$/.test(match[1]) ? match[2] : match[1]).trim();
    if (!name || !Number.isFinite(quantity) || quantity <= 0) continue;

    if (section === "commanders") commanders.push({ name, quantity });
    else if (section === "mainboard" || section === null) mainboard.push({ name, quantity });
  }

  return {
    commanders,
    mainboard,
    commanderSource: commanders.length > 0 ? "parsed_text" : "unknown",
    structuredCommanderAvailable: false,
    parsedTextCommanderAvailable: commanders.length > 0,
  };
}

function resolveCard(
  name: string,
  quantity: number,
  catalog: DeckResolutionCatalog,
): ResolvedDeckCard {
  const { normalizedKey } = normalizeDeckObjCardKey(name);
  const normalizedName = normalizeOracleName(normalizedKey);
  const lookup = resolveCatalogCardByName(normalizedKey, catalog);
  const card = lookup.status === "resolved" ? lookup.card : null;

  if (!card) {
    return {
      sourceName: name,
      quantity,
      normalizedName,
      rawCatalogIdentity: false,
      paperEligible: false,
      currentlyCommanderLegal: false,
      appearedInHistoricalDeck: true,
      paperPopulationFrame: "UNKNOWN",
      resolutionStatus: "unresolved",
    };
  }

  const paper = paperMetaForOracle(catalog, card.oracleId);
  return {
    sourceName: name,
    quantity,
    normalizedName,
    oracleId: card.oracleId,
    canonicalOracleName: card.canonicalName,
    resolutionMethod: lookup.status === "resolved" ? lookup.matchKind : undefined,
    rawCatalogIdentity: true,
    paperEligible: paper.paperEligible,
    currentlyCommanderLegal: isCurrentlyCommanderLegal(card),
    appearedInHistoricalDeck: true,
    paperPopulationFrame: paper.paperPopulationFrame,
    resolutionStatus: "resolved",
  };
}

function resolveCommander(
  name: string,
  catalog: DeckResolutionCatalog,
  commanderSource: ResolvedCommander["commanderSource"],
): ResolvedCommander {
  const { normalizedKey } = normalizeDeckObjCardKey(name);
  const normalizedName = normalizeOracleName(normalizedKey);
  const lookup = resolveCatalogCardByName(normalizedKey, catalog);
  const card = lookup.status === "resolved" ? lookup.card : null;

  if (!card) {
    return {
      sourceName: name,
      normalizedName,
      rawCatalogIdentity: false,
      paperEligible: false,
      currentlyCommanderLegal: false,
      appearedInHistoricalDeck: true,
      paperPopulationFrame: "UNKNOWN",
      resolutionStatus: "unresolved",
      commanderSource,
    };
  }

  const paper = paperMetaForOracle(catalog, card.oracleId);
  return {
    sourceName: name,
    normalizedName,
    oracleId: card.oracleId,
    canonicalOracleName: card.canonicalName,
    resolutionMethod: lookup.status === "resolved" ? lookup.matchKind : undefined,
    rawCatalogIdentity: true,
    paperEligible: paper.paperEligible,
    currentlyCommanderLegal: isCurrentlyCommanderLegal(card),
    appearedInHistoricalDeck: true,
    paperPopulationFrame: paper.paperPopulationFrame,
    resolutionStatus: "resolved",
    commanderSource,
  };
}

export function resolveDeckAgainstCatalog(input: {
  deckObj?: TopdeckDeckObj | null;
  decklist?: string | null;
  catalog: DeckResolutionCatalog;
}): {
  commanders: ResolvedCommander[];
  mainboard: ResolvedDeckCard[];
  commanderOracleIds: string[];
  commanderResolutionStatus: "resolved" | "partial" | "unresolved";
  unresolvedCards: string[];
  cardResolutionRate: number;
  deckObjAvailable: boolean;
  decklistAvailable: boolean;
  structuredCommanderAvailable: boolean;
  parsedTextCommanderAvailable: boolean;
  digitalOnlyCardCount: number;
  nonPaperCardCount: number;
} {
  const deckObjAvailable = Boolean(input.deckObj?.Commanders || input.deckObj?.Mainboard);
  const decklistAvailable = Boolean(input.decklist?.trim());

  const fromObj = deckObjAvailable ? parseDeckObj(input.deckObj) : null;
  const fromText = parseDecklistText(input.decklist);

  const parsed =
    fromObj && (fromObj.commanders.length > 0 || fromObj.mainboard.length > 0) ? fromObj : fromText;

  const commanders = parsed.commanders.map((c) =>
    resolveCommander(c.name, input.catalog, parsed.commanderSource),
  );
  const mainboard = parsed.mainboard.map((c) => resolveCard(c.name, c.quantity, input.catalog));

  const commanderOracleIds = commanders
    .map((c) => c.oracleId)
    .filter((id): id is string => Boolean(id));

  const resolvedCommanders = commanders.filter((c) => c.resolutionStatus === "resolved").length;
  let commanderResolutionStatus: "resolved" | "partial" | "unresolved" = "unresolved";
  if (commanders.length === 0) commanderResolutionStatus = "unresolved";
  else if (resolvedCommanders === commanders.length) commanderResolutionStatus = "resolved";
  else if (resolvedCommanders > 0) commanderResolutionStatus = "partial";

  const unresolvedCards = mainboard
    .filter((c) => c.resolutionStatus === "unresolved")
    .map((c) => c.sourceName);

  const totalCards = mainboard.length + commanders.length;
  const resolvedCards =
    mainboard.filter((c) => c.resolutionStatus === "resolved").length + resolvedCommanders;
  const cardResolutionRate = totalCards > 0 ? resolvedCards / totalCards : 0;

  let digitalOnlyCardCount = 0;
  let nonPaperCardCount = 0;
  for (const card of [...mainboard, ...commanders]) {
    if (card.resolutionStatus !== "resolved") continue;
    if (card.paperPopulationFrame === "DIGITAL_ONLY") digitalOnlyCardCount += 1;
    if (!card.paperEligible) nonPaperCardCount += 1;
  }

  return {
    commanders,
    mainboard,
    commanderOracleIds,
    commanderResolutionStatus,
    unresolvedCards,
    cardResolutionRate,
    deckObjAvailable,
    decklistAvailable,
    structuredCommanderAvailable: parsed.structuredCommanderAvailable,
    parsedTextCommanderAvailable: parsed.parsedTextCommanderAvailable,
    digitalOnlyCardCount,
    nonPaperCardCount,
  };
}

export function commanderDisplayName(
  commanders: ResolvedCommander[],
  catalog: DeckResolutionCatalog,
): string {
  return commanders
    .map((c) => {
      if (c.oracleId) {
        const card = catalog.byOracleId.get(c.oracleId);
        return card?.canonicalName ?? c.sourceName;
      }
      return c.sourceName;
    })
    .join(" // ");
}

export type { GoldenCatalogOracleCard };
