import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { createGunzip } from "node:zlib";
import readline from "node:readline";
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { computeDeckHash } from "../deck-hash-v1";
import { resolveDeckAgainstCatalog } from "../deck-resolver-v1";
import type { DeckResolutionCatalog } from "../../../../scripts/lib/load-deck-resolution-catalog";
import { topdeckRawRunDir } from "../topdeck/artifact-paths";
import type { TopdeckDeckObj, TopdeckTournament } from "../topdeck/types";
import type { NormalizedDeckInstance } from "../types";
import { buildBasicStructureFeatures, isBasicLandCard } from "./basic-structure-v1";
import { getEligibleMainboardCards } from "./deck-mainboard-v1";
import { projectBasicStructureFeatures } from "./deck-features-v1";

export const TRACKED_BASIC_LAND_NAMES = [
  "Plains",
  "Island",
  "Swamp",
  "Mountain",
  "Forest",
  "Wastes",
  "Snow-Covered Plains",
  "Snow-Covered Island",
  "Snow-Covered Swamp",
  "Snow-Covered Mountain",
  "Snow-Covered Forest",
] as const;

export type BasicLandSplitStats = {
  uniqueDecks: number;
  decksWithAtLeastOneBasicLand: number;
  totalBasicLandQuantity: number;
  meanBasicsPerDeck: number;
  medianBasicsPerDeck: number;
  p95BasicsPerDeck: number;
  maxBasicsPerDeck: number;
  quantityByBasicLandName: Record<string, number>;
  quantityByCatalogBasicSupertype: Record<string, number>;
};

export type BasicLandTraceStep = {
  deckHash: string;
  rawTopDeckMainboardBasics: Array<{ name: string; quantity: number }>;
  rawTopDeckSource: { tid: string; playerId?: string; deckObjAvailable: boolean } | null;
  normalizedMainboardBasics: Array<{
    name: string;
    oracleId: string;
    quantity: number;
    catalogTypeLine: string;
    catalogSupertypes: string[];
    catalogTypes: string[];
    catalogSubtypes: string[];
  }>;
  basicFeatureVector: {
    basicLandFraction: number;
    nonBasicLandFraction: number;
    landCountFraction: number;
  };
  failureStage:
    | "none"
    | "missing_in_normalized"
    | "catalog_missing"
    | "predicate_misclassified_supertype";
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx] ?? 0;
}

function normalizeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function countBasicsInNormalizedDeck(input: {
  deck: NormalizedDeckInstance;
  catalog: DeckResolutionCatalog;
}): {
  totalBasicQty: number;
  byTrackedName: Record<string, number>;
  byCatalogName: Record<string, number>;
  basicOracleIds: string[];
} {
  const byTrackedName: Record<string, number> = Object.fromEntries(
    TRACKED_BASIC_LAND_NAMES.map((n) => [n, 0]),
  );
  const byCatalogName: Record<string, number> = {};
  const basicOracleIds: string[] = [];
  let totalBasicQty = 0;

  const commanderSet = new Set(input.deck.commanderOracleIds);
  for (const card of input.deck.mainboard) {
    if (!card.oracleId || card.resolutionStatus !== "resolved" || !card.paperEligible) continue;
    if (commanderSet.has(card.oracleId)) continue;
    const catalogCard = input.catalog.byOracleId.get(card.oracleId);
    if (!catalogCard || !isBasicLandCard(catalogCard)) continue;
    totalBasicQty += card.quantity;
    basicOracleIds.push(card.oracleId);
    byCatalogName[catalogCard.canonicalName] =
      (byCatalogName[catalogCard.canonicalName] ?? 0) + card.quantity;
    const tracked = TRACKED_BASIC_LAND_NAMES.find(
      (n) => normalizeNameKey(n) === normalizeNameKey(catalogCard.canonicalName),
    );
    if (tracked) byTrackedName[tracked] += card.quantity;
  }

  return { totalBasicQty, byTrackedName, byCatalogName, basicOracleIds };
}

export function summarizeBasicLandStats(decks: NormalizedDeckInstance[], catalog: DeckResolutionCatalog): BasicLandSplitStats {
  const perDeckTotals: number[] = [];
  const quantityByBasicLandName: Record<string, number> = Object.fromEntries(
    TRACKED_BASIC_LAND_NAMES.map((n) => [n, 0]),
  );
  const quantityByCatalogBasicSupertype: Record<string, number> = {};
  let decksWithBasics = 0;

  for (const deck of decks) {
    const counts = countBasicsInNormalizedDeck({ deck, catalog });
    perDeckTotals.push(counts.totalBasicQty);
    if (counts.totalBasicQty > 0) decksWithBasics += 1;
    for (const [name, qty] of Object.entries(counts.byTrackedName)) {
      quantityByBasicLandName[name] = (quantityByBasicLandName[name] ?? 0) + qty;
    }
    for (const [name, qty] of Object.entries(counts.byCatalogName)) {
      quantityByCatalogBasicSupertype[name] = (quantityByCatalogBasicSupertype[name] ?? 0) + qty;
    }
  }

  perDeckTotals.sort((a, b) => a - b);
  const totalQty = perDeckTotals.reduce((a, b) => a + b, 0);

  return {
    uniqueDecks: decks.length,
    decksWithAtLeastOneBasicLand: decksWithBasics,
    totalBasicLandQuantity: totalQty,
    meanBasicsPerDeck: decks.length > 0 ? totalQty / decks.length : 0,
    medianBasicsPerDeck: percentile(perDeckTotals, 0.5),
    p95BasicsPerDeck: percentile(perDeckTotals, 0.95),
    maxBasicsPerDeck: perDeckTotals[perDeckTotals.length - 1] ?? 0,
    quantityByBasicLandName,
    quantityByCatalogBasicSupertype,
  };
}

async function loadRawTournaments(runId: string): Promise<TopdeckTournament[]> {
  const rawPath = `${topdeckRawRunDir(runId)}/raw-tournaments.jsonl.gz`;
  if (!existsSync(rawPath)) return [];
  const tournaments: TopdeckTournament[] = [];
  const input = createReadStream(rawPath).pipe(createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as { tournament?: TopdeckTournament };
    if (row.tournament) tournaments.push(row.tournament);
  }
  return tournaments;
}

function rawMainboardBasics(deckObj: TopdeckDeckObj | null | undefined): Array<{ name: string; quantity: number }> {
  const out: Array<{ name: string; quantity: number }> = [];
  for (const [name, value] of Object.entries(deckObj?.Mainboard ?? {})) {
    const qty =
      typeof value === "number" ? value : (value?.count ?? value?.qty ?? 1);
    const key = normalizeNameKey(name);
    const isTracked = TRACKED_BASIC_LAND_NAMES.some((n) => normalizeNameKey(n) === key);
    const looksBasic =
      isTracked ||
      /^(snow-covered )?(plains|island|swamp|mountain|forest|wastes)$/i.test(name.trim());
    if (looksBasic) out.push({ name: name.trim(), quantity: qty });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function computeHashFromResolved(
  resolved: ReturnType<typeof resolveDeckAgainstCatalog>,
): string | null {
  const mainboard = resolved.mainboard
    .filter((c) => c.oracleId)
    .map((c) => ({ oracleId: c.oracleId!, quantity: c.quantity }));
  if (resolved.commanderOracleIds.length === 0 || mainboard.length === 0) return null;
  return computeDeckHash({ commanderOracleIds: resolved.commanderOracleIds, mainboard });
}

export async function traceBasicLandDecks(input: {
  decks: NormalizedDeckInstance[];
  catalog: DeckResolutionCatalog;
  runIds: string[];
  basicColumns: string[];
  seed: number;
  count: number;
}): Promise<BasicLandTraceStep[]> {
  const withBasics = input.decks
    .filter((d) => countBasicsInNormalizedDeck({ deck: d, catalog: input.catalog }).totalBasicQty > 0)
    .sort((a, b) => a.deckHash.localeCompare(b.deckHash));

  const rawIndex = new Map<
    string,
    { tid: string; playerId?: string; deckObjAvailable: boolean; mainboardBasics: Array<{ name: string; quantity: number }> }
  >();

  for (const runId of input.runIds) {
    const tournaments = await loadRawTournaments(runId);
    for (const tournament of tournaments) {
      const tid = tournament.TID ?? "unknown";
      const processRow = (
        playerId: string | undefined,
        decklist?: string | null,
        deckObj?: TopdeckDeckObj | null,
      ) => {
        if (!playerId) return;
        const resolved = resolveDeckAgainstCatalog({ deckObj, decklist, catalog: input.catalog });
        const hash = computeHashFromResolved(resolved);
        if (!hash) return;
        rawIndex.set(hash, {
          tid,
          playerId,
          deckObjAvailable: resolved.deckObjAvailable,
          mainboardBasics: rawMainboardBasics(deckObj),
        });
      };

      for (const row of tournament.standings ?? []) {
        processRow(row.id, row.decklist, row.deckObj);
      }
      for (const round of tournament.rounds ?? []) {
        for (const table of round.tables ?? []) {
          for (const player of table.players ?? []) {
            processRow(player.id, player.decklist, player.deckObj);
          }
        }
      }
    }
  }

  const traces: BasicLandTraceStep[] = [];
  for (let i = 0; i < input.count && i < withBasics.length; i += 1) {
    const idx = (i * 7919 + input.seed) % withBasics.length;
    const deck = withBasics[idx]!;
    const { cards } = getEligibleMainboardCards(deck);
    const fullBasic = buildBasicStructureFeatures({ cards, catalogByOracleId: input.catalog.byOracleId });
    const projected = projectBasicStructureFeatures(fullBasic, input.basicColumns);

    const normalizedMainboardBasics: BasicLandTraceStep["normalizedMainboardBasics"] = [];
    for (const row of cards) {
      const catalogCard = input.catalog.byOracleId.get(row.oracleId);
      if (!catalogCard) continue;
      if (!isBasicLandCard(catalogCard)) continue;
      normalizedMainboardBasics.push({
        name: catalogCard.canonicalName,
        oracleId: row.oracleId,
        quantity: row.quantity,
        catalogTypeLine: catalogCard.typeLine,
        catalogSupertypes: catalogCard.supertypes ?? [],
        catalogTypes: catalogCard.types ?? [],
        catalogSubtypes: catalogCard.subtypes ?? [],
      });
    }

    const raw = rawIndex.get(deck.deckHash) ?? null;
    let failureStage: BasicLandTraceStep["failureStage"] = "none";
    if (normalizedMainboardBasics.length > 0 && fullBasic.basic_basicLandFraction === 0) {
      failureStage = "predicate_misclassified_supertype";
    } else if (raw && raw.mainboardBasics.length > 0 && normalizedMainboardBasics.length === 0) {
      failureStage = "missing_in_normalized";
    } else if (normalizedMainboardBasics.some((c) => !input.catalog.byOracleId.get(c.oracleId))) {
      failureStage = "catalog_missing";
    }

    traces.push({
      deckHash: deck.deckHash,
      rawTopDeckMainboardBasics: raw?.mainboardBasics ?? [],
      rawTopDeckSource: raw
        ? { tid: raw.tid, playerId: raw.playerId, deckObjAvailable: raw.deckObjAvailable }
        : null,
      normalizedMainboardBasics,
      basicFeatureVector: {
        basicLandFraction: projected.basic_basicLandFraction ?? fullBasic.basic_basicLandFraction ?? 0,
        nonBasicLandFraction: projected.basic_nonBasicLandFraction ?? fullBasic.basic_nonBasicLandFraction ?? 0,
        landCountFraction: projected.basic_landCountFraction ?? fullBasic.basic_landCountFraction ?? 0,
      },
      failureStage,
    });
  }

  return traces;
}

export function basicLandAuditRootCause(beforePredicateUsedSubtypes: boolean): {
  classification: "A_feature_extraction_bug" | "B_upstream_corpus_bug";
  summary: string;
  predicateRepair: string;
} {
  return {
    classification: "A_feature_extraction_bug",
    summary: beforePredicateUsedSubtypes
      ? "Normalized decklists contain Basic-supertype lands, but buildBasicStructureFeatures tested subtypes.includes('Basic') instead of supertypes.includes('Basic'), forcing basicLandFraction to zero for every deck."
      : "Basic land predicate misclassified catalog cards.",
    predicateRepair:
      "isBasicLandCard(card) := types includes Land AND supertypes includes Basic (canonical catalog structure; no card-name hardcoding).",
  };
}

export function hashBasicLandNameList(names: readonly string[]): string {
  return createHash("sha256").update(names.join("\n")).digest("hex");
}
