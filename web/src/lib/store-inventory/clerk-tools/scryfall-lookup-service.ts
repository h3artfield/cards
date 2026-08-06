import { isCommanderFormatLegal } from "../../deck-builder/commander-classification";
import { deckBuilderStore } from "../../deck-builder/deck-builder-store";
import { catalogCardFromScryfall } from "../../deck-builder/scryfall-catalog";
import { scryfallFetch } from "../../processing/scryfall-client";
import type { CardCatalogHit } from "../clerk-types";

export type CatalogLookupSource =
  | "cache_hit"
  | "local_oracle"
  | "local_printing"
  | "crosswalk"
  | "live_scryfall_exact"
  | "live_scryfall_fuzzy"
  | "unresolved";

export interface LookupAttemptMetrics {
  name: string;
  catalogSource: CatalogLookupSource;
  cacheHit: boolean;
  liveApiCallCount: number;
  latencyMs: number;
  oracleId?: string;
  entityResolutionStatus: "resolved" | "unresolved";
}

const POSITIVE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 15 * 60 * 1000;

const positiveCache = new Map<
  string,
  { hit: CardCatalogHit; expiresAt: number }
>();
const negativeCache = new Map<string, { expiresAt: number }>();
const inFlight = new Map<string, Promise<CardCatalogHit | null>>();

let sessionLiveCallCount = 0;
let sessionScryfall429Count = 0;
let perRequestBudget = 8;
let perRequestLiveCalls = 0;

const attemptLog: LookupAttemptMetrics[] = [];

function cacheKey(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeForMatch(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hitFromOracle(
  oracle: Awaited<ReturnType<typeof deckBuilderStore.getCatalogOracleCard>>,
  printing?: { id: string; setName?: string; imageNormal?: string } | null,
): CardCatalogHit | null {
  if (!oracle) return null;
  return {
    scryfallId: printing?.id ?? oracle.printingIds[0] ?? oracle.id,
    oracleId: oracle.id,
    name: oracle.canonicalName,
    setName: printing?.setName,
    colorIdentity: oracle.colorIdentity,
    typeLine: oracle.typeLine,
    canBeSoleCommander:
      oracle.commanderClassification?.canBeSoleCommander ??
      oracle.commanderEligibility.eligible,
    commanderFormatLegal: isCommanderFormatLegal(oracle.legalities),
    imageNormal: printing?.imageNormal,
  };
}

async function lookupLocal(name: string): Promise<{
  hit: CardCatalogHit | null;
  source: CatalogLookupSource;
}> {
  const trimmed = name.trim();
  if (!trimmed) return { hit: null, source: "unresolved" };

  const oracle = await deckBuilderStore.findCatalogOracleByNormalizedName(trimmed);
  if (oracle) {
    const printingId = oracle.printingIds[0];
    const printing = printingId
      ? await deckBuilderStore.getCatalogCard(printingId)
      : null;
    const hit = hitFromOracle(oracle, printing);
    if (hit) return { hit, source: "local_oracle" };
  }

  const printing = await deckBuilderStore.findCatalogPrintingByExactName(trimmed);
  if (printing?.oracleId) {
    const oracleDoc = await deckBuilderStore.getCatalogOracleCard(printing.oracleId);
    if (oracleDoc) {
      return {
        hit: hitFromOracle(oracleDoc, printing),
        source: "local_printing",
      };
    }
    return {
      hit: {
        scryfallId: printing.id,
        oracleId: printing.oracleId,
        name: printing.name,
        setName: printing.setName,
        colorIdentity: printing.colorIdentity,
        typeLine: printing.typeLine,
        commanderFormatLegal: printing.commanderFormatLegal,
        imageNormal: printing.imageNormal,
      },
      source: "local_printing",
    };
  }

  const normalized = normalizeForMatch(trimmed);
  if (normalized) {
    const state = await deckBuilderStore.findCatalogOracleByNormalizedName(trimmed);
    if (state) {
      const printingId = state.printingIds[0];
      const p = printingId ? await deckBuilderStore.getCatalogCard(printingId) : null;
      const hit = hitFromOracle(state, p);
      if (hit) return { hit, source: "crosswalk" };
    }
  }

  return { hit: null, source: "unresolved" };
}

async function lookupLive(
  name: string,
): Promise<{ hit: CardCatalogHit | null; source: CatalogLookupSource; liveCalls: number }> {
  if (perRequestLiveCalls >= perRequestBudget) {
    return { hit: null, source: "unresolved", liveCalls: 0 };
  }

  let liveCalls = 0;
  const trimmed = name.trim();

  try {
    liveCalls += 1;
    perRequestLiveCalls += 1;
    sessionLiveCallCount += 1;
    const exact = await scryfallFetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(trimmed)}`,
    );
    if (exact.ok) {
      const raw = (await exact.json()) as Record<string, unknown>;
      const card = catalogCardFromScryfall(raw);
      if (card) {
        return {
          hit: {
            scryfallId: card.id,
            oracleId: card.oracleId,
            name: card.name,
            setName: card.setName,
            colorIdentity: card.colorIdentity,
            typeLine: card.typeLine,
            commanderFormatLegal: card.commanderFormatLegal,
            imageNormal: card.imageNormal,
          },
          source: "live_scryfall_exact",
          liveCalls,
        };
      }
    }

    if (perRequestLiveCalls >= perRequestBudget) {
      return { hit: null, source: "unresolved", liveCalls };
    }

    liveCalls += 1;
    perRequestLiveCalls += 1;
    sessionLiveCallCount += 1;
    const fuzzy = await scryfallFetch(
      `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(trimmed)}`,
    );
    if (fuzzy.ok) {
      const raw = (await fuzzy.json()) as Record<string, unknown>;
      const card = catalogCardFromScryfall(raw);
      if (card) {
        return {
          hit: {
            scryfallId: card.id,
            oracleId: card.oracleId,
            name: card.name,
            setName: card.setName,
            colorIdentity: card.colorIdentity,
            typeLine: card.typeLine,
            commanderFormatLegal: card.commanderFormatLegal,
            imageNormal: card.imageNormal,
          },
          source: "live_scryfall_fuzzy",
          liveCalls,
        };
      }
    }
  } catch {
    return { hit: null, source: "unresolved", liveCalls };
  }

  return { hit: null, source: "unresolved", liveCalls };
}

async function resolveLookup(name: string): Promise<{
  hit: CardCatalogHit | null;
  source: CatalogLookupSource;
  cacheHit: boolean;
  liveApiCallCount: number;
}> {
  const key = cacheKey(name);
  const now = Date.now();
  const started = Date.now();

  const neg = negativeCache.get(key);
  if (neg && neg.expiresAt > now) {
    return {
      hit: null,
      source: "unresolved",
      cacheHit: true,
      liveApiCallCount: 0,
    };
  }

  const pos = positiveCache.get(key);
  if (pos && pos.expiresAt > now) {
    return {
      hit: pos.hit,
      source: "cache_hit",
      cacheHit: true,
      liveApiCallCount: 0,
    };
  }

  const local = await lookupLocal(name);
  if (local.hit) {
    positiveCache.set(key, { hit: local.hit, expiresAt: now + POSITIVE_TTL_MS });
    return {
      hit: local.hit,
      source: local.source,
      cacheHit: false,
      liveApiCallCount: 0,
    };
  }

  const live = await lookupLive(name);
  if (live.hit) {
    positiveCache.set(key, {
      hit: live.hit,
      expiresAt: now + POSITIVE_TTL_MS,
    });
    return {
      hit: live.hit,
      source: live.source,
      cacheHit: false,
      liveApiCallCount: live.liveCalls,
    };
  }

  negativeCache.set(key, { expiresAt: now + NEGATIVE_TTL_MS });
  return {
    hit: null,
    source: "unresolved",
    cacheHit: false,
    liveApiCallCount: live.liveCalls,
  };
}

/** Reset per-request live lookup budget (call at start of each clerk request / eval case). */
export function resetLookupBudget(maxLiveCalls = 8): void {
  perRequestBudget = maxLiveCalls;
  perRequestLiveCalls = 0;
}

export function clearLookupCaches(): void {
  positiveCache.clear();
  negativeCache.clear();
  inFlight.clear();
  attemptLog.length = 0;
  sessionLiveCallCount = 0;
  sessionScryfall429Count = 0;
  perRequestLiveCalls = 0;
}

export function getSessionLiveCallCount(): number {
  return sessionLiveCallCount;
}

export function getLookupAttemptLog(): LookupAttemptMetrics[] {
  return [...attemptLog];
}

export interface ServerLookupTrace {
  catalogLookupSources: string[];
  liveScryfallCallCount: number;
  scryfall429Count: number;
  localCatalogHitCount: number;
  printingCatalogHitCount: number;
  crosswalkHitCount: number;
  cacheHitCount: number;
  negativeCacheHitCount: number;
  runtimeResolutionCount: number;
  unresolvedEntityCount: number;
}

export function getServerLookupTrace(): ServerLookupTrace {
  const sources = attemptLog.map((a) => a.catalogSource);
  return {
    catalogLookupSources: [...new Set(sources)],
    liveScryfallCallCount: sessionLiveCallCount,
    scryfall429Count: sessionScryfall429Count,
    localCatalogHitCount: sources.filter((s) => s === "local_oracle").length,
    printingCatalogHitCount: sources.filter((s) => s === "local_printing").length,
    crosswalkHitCount: sources.filter((s) => s === "crosswalk").length,
    cacheHitCount: attemptLog.filter((a) => a.cacheHit && a.catalogSource === "cache_hit").length,
    negativeCacheHitCount: attemptLog.filter(
      (a) => a.cacheHit && a.catalogSource === "unresolved",
    ).length,
    runtimeResolutionCount: sources.filter(
      (s) => s === "live_scryfall_exact" || s === "live_scryfall_fuzzy",
    ).length,
    unresolvedEntityCount: attemptLog.filter((a) => a.entityResolutionStatus === "unresolved").length,
  };
}

export function recordScryfall429(): void {
  sessionScryfall429Count += 1;
}

export async function lookupCardByName(
  name: string,
): Promise<CardCatalogHit | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const key = cacheKey(trimmed);
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const started = Date.now();
    const result = await resolveLookup(trimmed);
    attemptLog.push({
      name: trimmed,
      catalogSource: result.source,
      cacheHit: result.cacheHit,
      liveApiCallCount: result.liveApiCallCount,
      latencyMs: Date.now() - started,
      oracleId: result.hit?.oracleId,
      entityResolutionStatus: result.hit?.oracleId ? "resolved" : "unresolved",
    });
    return result.hit;
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}
