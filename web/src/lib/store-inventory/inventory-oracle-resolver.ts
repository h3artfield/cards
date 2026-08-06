import { deckBuilderStore } from "../deck-builder/deck-builder-store";
import {
  catalogCardFromScryfall,
  fetchScryfallByTcgplayerId,
} from "../deck-builder/scryfall-catalog";
import {
  fetchCardBySetCodeAndNumber,
  searchScryfallCard,
} from "../deck-builder/scryfall-set-resolver";
import { upsertCatalogOracleFromPrinting } from "../deck-builder/catalog-oracle-card";
import { scryfallFetch } from "../processing/scryfall-client";
import type { InventoryItem } from "../types";
import { normalizeCardNameForMatch } from "./clerk-tools/magic-commander-inventory";
import type { ResolutionSource } from "./entity-candidate-resolution";

export type OracleResolutionStatus =
  | "resolved_existing"
  | "resolved_runtime"
  | "ambiguous"
  | "unresolved"
  | "conflict";

export interface InventoryOracleResolution {
  oracleResolutionStatus: OracleResolutionStatus;
  oracleId?: string;
  canonicalName?: string;
  scryfallId?: string;
  resolutionSource?: ResolutionSource;
  candidates?: Array<{ oracleId: string; canonicalName: string }>;
}

function normalizeName(name: string): string {
  return normalizeCardNameForMatch(name);
}

async function cacheRuntimeResolution(input: {
  catalog: import("../deck-builder/types").CatalogCard;
}): Promise<void> {
  try {
    await deckBuilderStore.saveCatalogCard(input.catalog);
    await upsertCatalogOracleFromPrinting({
      catalog: input.catalog,
      getExistingOracle: (id) => deckBuilderStore.getCatalogOracleCard(id),
      saveOracle: (oracle) => deckBuilderStore.saveCatalogOracleCard(oracle),
    });
  } catch (err) {
    console.warn("[oracle-resolver] cache write failed", err);
  }
}

async function resolveByExactName(
  name: string,
): Promise<{ catalog: import("../deck-builder/types").CatalogCard; source: ResolutionSource } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const oracle = await deckBuilderStore.findCatalogOracleByCanonicalName(trimmed);
  if (oracle?.printingIds[0]) {
    const printing = await deckBuilderStore.getCatalogCard(oracle.printingIds[0]);
    if (printing?.oracleId) {
      return { catalog: printing, source: "local_oracle" };
    }
  }

  const localPrinting = await deckBuilderStore.findCatalogPrintingByExactName(trimmed);
  if (localPrinting?.oracleId) {
    return { catalog: localPrinting, source: "local_printing" };
  }

  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(trimmed)}`,
    );
    if (res.ok) {
      const raw = (await res.json()) as Record<string, unknown>;
      const catalog = catalogCardFromScryfall(raw);
      if (catalog?.oracleId) {
        await cacheRuntimeResolution({ catalog });
        return { catalog, source: "live_scryfall" };
      }
    }
  } catch {
    /* fall through */
  }

  const fuzzy = await searchScryfallCard(`!"${trimmed.replace(/"/g, "")}"`);
  if (fuzzy?.oracleId) {
    await cacheRuntimeResolution({ catalog: fuzzy });
    return { catalog: fuzzy, source: "live_scryfall" };
  }

  return null;
}

async function resolveBySetAndCollector(
  item: InventoryItem,
): Promise<{ catalog: import("../deck-builder/types").CatalogCard; source: ResolutionSource } | null> {
  const setName = item.setName?.trim();
  const cn = item.cardNumber?.trim();
  if (!setName || !cn) return null;

  const crosswalkId = item.catalogScryfallId?.trim();
  if (crosswalkId) {
    const cached = await deckBuilderStore.getCatalogCard(crosswalkId);
    if (cached?.oracleId) {
      return { catalog: cached, source: "crosswalk" };
    }
  }

  const bySet = await fetchCardBySetCodeAndNumber({
    setName,
    cardNumber: cn,
  });
  if (bySet?.oracleId) {
    await cacheRuntimeResolution({ catalog: bySet });
    return { catalog: bySet, source: "live_scryfall" };
  }

  return null;
}

async function resolveControlledFuzzy(
  name: string,
): Promise<
  | { status: "resolved"; catalog: import("../deck-builder/types").CatalogCard; source: ResolutionSource }
  | { status: "ambiguous"; candidates: Array<{ oracleId: string; canonicalName: string }> }
  | { status: "unresolved" }
> {
  const norm = normalizeName(name);
  if (!norm || norm.length < 4) return { status: "unresolved" };

  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`name:"${name}"`)}&unique=cards`,
    );
    if (!res.ok) return { status: "unresolved" };
    const body = (await res.json()) as { data?: Record<string, unknown>[] };
    const rows = body.data ?? [];
    const parsed = rows
      .map((raw) => catalogCardFromScryfall(raw))
      .filter((c): c is NonNullable<typeof c> => Boolean(c?.oracleId));

    const exact = parsed.filter(
      (c) => normalizeName(c.name) === norm,
    );
    if (exact.length === 1) {
      await cacheRuntimeResolution({ catalog: exact[0]! });
      return { catalog: exact[0]!, source: "live_scryfall", status: "resolved" };
    }
    if (exact.length > 1) {
      return {
        status: "ambiguous",
        candidates: exact.map((c) => ({
          oracleId: c.oracleId!,
          canonicalName: c.name,
        })),
      };
    }
  } catch {
    return { status: "unresolved" };
  }

  return { status: "unresolved" };
}

/** Runtime oracle resolution for inventory rows — independent of crosswalk backfill. */
export async function resolveInventoryOracleId(
  item: InventoryItem,
): Promise<InventoryOracleResolution> {
  const existing = item.catalogOracleId?.trim();
  if (existing) {
    return {
      oracleResolutionStatus: "resolved_existing",
      oracleId: existing,
      canonicalName: item.displayName,
      scryfallId: item.catalogScryfallId,
      resolutionSource: "local_oracle",
    };
  }

  const tcgplayerId = item.tcgplayerProductId?.trim();
  if (tcgplayerId) {
    if (item.storeId) {
      const crosswalks = await deckBuilderStore.listCrosswalks(item.storeId);
      const crosswalk = crosswalks.find(
        (cw) => cw.tcgplayerProductId === tcgplayerId,
      );
      if (crosswalk?.scryfallId) {
        const printing = await deckBuilderStore.getCatalogCard(crosswalk.scryfallId);
        if (printing?.oracleId) {
          return {
            oracleResolutionStatus: "resolved_existing",
            oracleId: printing.oracleId,
            canonicalName: printing.name,
            scryfallId: printing.id,
            resolutionSource: "crosswalk",
          };
        }
      }
    }

    const byTcg = await fetchScryfallByTcgplayerId(tcgplayerId);
    if (byTcg?.oracleId) {
      await cacheRuntimeResolution({ catalog: byTcg });
      return {
        oracleResolutionStatus: "resolved_runtime",
        oracleId: byTcg.oracleId,
        canonicalName: byTcg.name,
        scryfallId: byTcg.id,
        resolutionSource: "live_scryfall",
      };
    }
  }

  const bySet = await resolveBySetAndCollector(item);
  if (bySet) {
    return {
      oracleResolutionStatus: "resolved_runtime",
      oracleId: bySet.catalog.oracleId,
      canonicalName: bySet.catalog.name,
      scryfallId: bySet.catalog.id,
      resolutionSource: bySet.source,
    };
  }

  const displayName = item.displayName?.trim();
  if (displayName) {
    const exact = await resolveByExactName(displayName);
    if (exact) {
      return {
        oracleResolutionStatus: "resolved_runtime",
        oracleId: exact.catalog.oracleId,
        canonicalName: exact.catalog.name,
        scryfallId: exact.catalog.id,
        resolutionSource: exact.source,
      };
    }

    const fuzzy = await resolveControlledFuzzy(displayName);
    if (fuzzy.status === "resolved") {
      return {
        oracleResolutionStatus: "resolved_runtime",
        oracleId: fuzzy.catalog.oracleId,
        canonicalName: fuzzy.catalog.name,
        scryfallId: fuzzy.catalog.id,
        resolutionSource: fuzzy.source,
      };
    }
    if (fuzzy.status === "ambiguous") {
      return {
        oracleResolutionStatus: "ambiguous",
        candidates: fuzzy.candidates,
      };
    }
  }

  return { oracleResolutionStatus: "unresolved" };
}

export function isCustomerSafeOracleResolution(
  resolution: InventoryOracleResolution,
): boolean {
  return (
    resolution.oracleResolutionStatus === "resolved_existing" ||
    resolution.oracleResolutionStatus === "resolved_runtime"
  );
}
