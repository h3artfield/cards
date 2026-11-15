"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CustomerStoreNavV1 } from "@/components/CustomerStoreNavV1";
import { useCustomer } from "@/context/CustomerContext";
import {
  DEFAULT_INVENTORY_FILTERS,
  InventoryCardGrid,
  inventoryGameLabel,
  InventoryFilterBar,
  InventoryGameSourceBar,
  InventoryResultsToolbar,
  sortInventoryCards,
  appendInventoryColorParams,
  catalogSupportsGame,
  inventoryColorFiltersActive,
  legacyColorToFilterPatch,
  type InventoryFilterState,
  type InventoryGridCard,
} from "@/components/store-inventory/InventoryBrowseUI";
import { StoreClerkChat } from "@/components/store-inventory/StoreClerkChat";
import { ClerkDeckPanel } from "@/components/store-inventory/ClerkDeckPanel";
import {
  ClerkPicksPanel,
  type ClerkPickCard,
} from "@/components/store-inventory/ClerkPicksPanel";
import { GatheringDesk } from "@/components/store-inventory/GatheringDesk";import { InventoryDecklistImport } from "@/components/store-inventory/InventoryDecklistImport";
import type { GatheringCard } from "@/components/store-inventory/clerk-gathering";
import { gatheringCardToCartLine } from "@/components/store-inventory/clerk-gathering";
import type { ClerkDeckList } from "@/lib/store-inventory/clerk-types";
import { appendClerkSearchBaseParam, appendInventoryBrowseParams } from "@/lib/store-inventory/inventory-browse-filter-params";
import type { StoreInventorySemanticFilter } from "@/lib/deck-builder/store-inventory-semantic";
import { useCart } from "@/hooks/useCart";
import { usePile } from "@/hooks/usePile";

const BROWSE_PAGE_SIZE = 100;

function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type BrowseResponse = {
  items: InventoryGridCard[];
  total: number;
  page: number;
  totalPages: number;
  facets: {
    games: Record<string, number>;
    commanders: number;
    inStock: number;
  };
};

async function parseBrowseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      res.ok
        ? "Invalid inventory response"
        : text.slice(0, 120) || `HTTP ${res.status}`,
    );
  }
}

function browseFiltersActive(_filters: InventoryFilterState, _committedQ: string): boolean {
  return true;
}

function queryBaseNote(asked?: string, fallback?: string): string | null {
  const label = asked?.trim() || fallback?.trim();
  if (!label) return null;
  return `“${label}” is the base. Filters narrow this list.`;
}

function clerkGameToBrowseGame(game?: string): InventoryFilterState["game"] {
  if (game === "pokemon") return "pokemon";
  if (game === "riftbound") return "riftbound";
  return "magic";
}

function browseEmptyMessage(
  filters: InventoryFilterState,
  data: BrowseResponse | null,
): string {
  if (filters.source === "catalog") return "No printings match your search.";
  if (data?.facets?.inStock === 0) {
    return "No catalog inventory linked yet. Import TCGplayer or Shopify stock in admin, then run the inventory crosswalk.";
  }
  // facets.games omits games with no browseable rows instead of reporting 0, so
  // a missing key means the store has nothing of that game in stock.
  if (data && (data.facets?.games?.[filters.game] ?? 0) === 0) {
    return `This store has no ${inventoryGameLabel(filters.game)} cards in stock right now.`;
  }
  if (inventoryColorFiltersActive(filters) && data?.total === 0) {
    return "No cards match this color filter yet. Color data comes from Scryfall — run Admin → Deck Builder → Inventory crosswalk sync to link more cards.";
  }
  return "No cards match your search.";
}

export function StoreInventoryApp({
  slug,
  storeName: storeNameProp,
}: {
  slug: string;
  storeName?: string;
  logoUrl?: string | null;
}) {
  const { customer } = useCustomer();
  const [storeName, setStoreName] = useState(storeNameProp ?? titleFromSlug(slug));
  const [filters, setFilters] = useState<InventoryFilterState>({
    ...DEFAULT_INVENTORY_FILTERS,
    sortBy: "name",
  });
  const [debouncedQ, setDebouncedQ] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  const [clerkFilterNote, setClerkFilterNote] = useState<string | null>(null);
  const [clerkDeck, setClerkDeck] = useState<ClerkDeckList | null>(null);
  const [clerkPicks, setClerkPicks] = useState<ClerkPickCard[]>([]);
  const [queryBase, setQueryBase] = useState<StoreInventorySemanticFilter | undefined>();
  const queryBaseKey = queryBase ? JSON.stringify(queryBase) : "";
  const cart = useCart(slug);
  const pile = usePile(slug);
  const migratedPile = useRef(false);
  useEffect(() => {
    if (migratedPile.current) return;
    migratedPile.current = true;
    const present = new Set(cart.lines.map((line) => line.inventoryItemId));
    for (const card of pile.cards) {
      if (present.has(card.inventoryItemId)) continue;
      const line = gatheringCardToCartLine(card as GatheringCard);
      if (line) cart.add(line);
    }
    if (pile.cards.length > 0) pile.clear();
  }, [cart, pile]);

  const shownPicks = useMemo(
    () => sortInventoryCards(clerkPicks, filters.sortBy),
    [clerkPicks, filters.sortBy],
  );
  const cartQtyById = useMemo(() => {
    const quantities = new Map<string, number>();
    for (const line of cart.lines) {
      quantities.set(line.inventoryItemId, line.quantity);
    }
    return quantities;
  }, [cart.lines]);
  const cartIds = useMemo(() => new Set(cartQtyById.keys()), [cartQtyById]);

  function addCardToCart(card: GatheringCard) {
    const line = gatheringCardToCartLine(card);
    if (line) cart.add(line);
  }

  function addManyToCart(cards: Array<GatheringCard & { addQuantity?: number }>) {
    for (const card of cards) {
      const line = gatheringCardToCartLine(card);
      if (!line) continue;
      const copies = Math.max(1, Math.trunc(card.addQuantity ?? 1) || 1);
      cart.add({
        ...line,
        quantity: copies,
      });
    }
  }

  function toggleCart(card: GatheringCard) {
    const line = gatheringCardToCartLine(card);
    if (line) cart.add(line);
  }
  const [retryNonce, setRetryNonce] = useState(0);
  const [pasteListOpen, setPasteListOpen] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);

  const apiBase = `/api/store/${encodeURIComponent(slug)}`;

  const [textQueryFilters, setTextQueryFilters] = useState({
    rulesText: "",
    typeLine: "",
    manaCost: "",
  });

  useEffect(() => {
    const handle = setTimeout(() => {
      setTextQueryFilters((prev) => {
        const next = {
          rulesText: filters.rulesText.trim(),
          typeLine: filters.typeLine.trim(),
          manaCost: filters.manaCost.trim(),
        };
        if (
          prev.rulesText === next.rulesText &&
          prev.typeLine === next.typeLine &&
          prev.manaCost === next.manaCost
        ) {
          return prev;
        }
        return next;
      });
    }, 400);
    return () => clearTimeout(handle);
  }, [filters.rulesText, filters.typeLine, filters.manaCost]);

  useEffect(() => {
    if (storeNameProp) {
      setStoreName(storeNameProp);
      return;
    }

    const controller = new AbortController();
    fetch(`${apiBase}`, { signal: controller.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) return;
        setStoreName(body.store?.name ?? titleFromSlug(slug));
      })
      .catch(() => {
        /* keep slug-based title */
      });

    return () => controller.abort();
  }, [apiBase, slug, storeNameProp]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q.trim()), 500);
    return () => clearTimeout(t);
  }, [filters.q]);

  useEffect(() => {
    setCommittedQ(debouncedQ);
    setPage(1);
  }, [debouncedQ]);

  useEffect(() => {
    if (!data?.facets?.games) return;
    if ((data.facets.games[filters.game] ?? 0) > 0) return;
    const first = Object.entries(data.facets.games)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!first || first === filters.game) return;
    setFilters((f) => ({
      ...f,
      game: first,
      source: first === "magic" ? f.source : "inventory",
      cardType: first === "magic" ? f.cardType : "all",
    }));
    setPage(1);
  }, [data?.facets?.games, filters.game]);

  useEffect(() => {
    const query = committedQ.trim();
    const browseActive = browseFiltersActive(filters, query);
    if (!browseActive) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let timedOut = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 180_000);

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      page: String(page),
      limit: String(BROWSE_PAGE_SIZE),
      game: filters.game,
      type: filters.cardType,
      source: filters.source,
    });
    appendInventoryColorParams(params, filters);
    appendInventoryBrowseParams(params, { ...filters, ...textQueryFilters }, query);
    appendClerkSearchBaseParam(params, queryBase);

    fetch(`${apiBase}/inventory/browse?${params}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
    })
      .then(async (r) => {
        const body = await parseBrowseJson(r);
        if (!r.ok) throw new Error(String(body.error ?? "Failed to load inventory"));
        return body as BrowseResponse;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof Error && e.name === "AbortError") {
          if (timedOut) {
            setError(
              "Inventory is taking longer than expected. Try again — card images load separately and won't block results.",
            );
          }
          return;
        }
        setError(e instanceof Error ? e.message : "Load failed");
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    apiBase,
    page,
    filters.game,
    filters.source,
    filters.cardTypes.join(","),
    filters.oracleActions.join(","),
    filters.primitiveActions.join(","),
    filters.primitiveActionMode,
    filters.abilityTypes.join(","),
    filters.zones.join(","),
    filters.semanticOwners.join(","),
    filters.manaValuePreset,
    filters.selectedColors.join(","),
    filters.colorCount,
    filters.colorMode,
    filters.commanderColors.join(","),
    filters.cardType,
    filters.sortBy,
    filters.finish,
    filters.channel,
    filters.pokemonTypes.join(","),
    filters.pokemonCards.join(","),
    filters.pokemonStages.join(","),
    filters.pokemonTrainers.join(","),
    textQueryFilters.rulesText,
    textQueryFilters.typeLine,
    filters.typeLinePartial,
    textQueryFilters.manaCost,
    committedQ,
    queryBaseKey,
    retryNonce,
  ]);

  const commitSearch = useCallback((q: string) => {
    setCommittedQ(q.trim());
    setPage(1);
  }, []);

  function patchFilters(next: Partial<InventoryFilterState>) {
    setFilters((f) => {
      const merged = { ...f, ...next };
      // The clerk switches games without touching the source, which would
      // otherwise strand a catalog browse on a game the catalog has no data for.
      if (!catalogSupportsGame(merged.game)) merged.source = "inventory";
      if (next.game != null && next.game !== "pokemon") {
        merged.pokemonTypes = [];
        merged.pokemonCards = [];
        merged.pokemonStages = [];
        merged.pokemonTrainers = [];
      }
      return merged;
    });
    if (next.q != null) {
      setCommittedQ(next.q.trim());
    }
    if (
      next.q != null ||
      next.game != null ||
      next.source != null ||
      next.selectedColors != null ||
      next.colorCount != null ||
      next.colorMode != null ||
      next.commanderColors != null ||
      next.cardType != null ||
      next.cardTypes != null ||
      next.oracleActions != null ||
      next.primitiveActions != null ||
      next.primitiveActionMode != null ||
      next.abilityTypes != null ||
      next.zones != null ||
      next.semanticOwners != null ||
      next.manaValuePreset != null ||
      next.sortBy != null ||
      next.finish != null ||
      next.channel != null ||
      next.rulesText != null ||
      next.typeLine != null ||
      next.typeLinePartial != null ||
      next.manaCost != null ||
      next.pokemonTypes != null ||
      next.pokemonCards != null ||
      next.pokemonStages != null ||
      next.pokemonTrainers != null
    ) {
      setPage(1);
    }
  }

  return (
    <div
      className="storefront-theme flex min-h-screen flex-col bg-neutral-950 text-[var(--text)] lg:h-dvh lg:overflow-hidden"
      // The inline background/colour that used to sit here was a hard-coded
      // pure grey, which overrode the themed class and pinned this page to the
      // old palette. The class alone is enough; the belt-and-braces literal was
      // added for an iPad Safari CSS-chunk failure that the plain-CSS grid
      // rules above already cover.
      style={{ backgroundColor: "var(--ink-850)" }}
    >
      {customer ? (
        <div className="shrink-0 px-4 pt-3">
          <CustomerStoreNavV1 slug={slug} active="shop" loggedIn />
        </div>
      ) : null}
      <main
        className={`inventory-page-grid grid min-h-0 flex-1 grid-cols-1 gap-3 px-3 py-3 lg:overflow-hidden ${
          filtersCollapsed ? "inventory-filters-collapsed" : ""
        }`}
      >
        {filtersCollapsed ? null : (
        <div
          id="inventory-search-filters"
          className="min-h-0 min-w-0 space-y-2 lg:overflow-y-auto lg:pr-1"
        >
            <InventoryGameSourceBar
              filters={filters}
              onChange={patchFilters}
              facets={data?.facets}
              showBrowse={false}
            />
            <StoreClerkChat
              slug={slug}
              storeName={storeName}
              filters={filters}
              variant="queryBar"
              seedQuery={filters.q}
              onAddToGathering={addCardToCart}
              pasteListOpen={pasteListOpen}
              onPasteList={() => {
                setPasteListOpen((open) => !open);
              }}
              onApplyClerk={(clerk) => {
            if (clerk.clearSearch && !clerk.deckList && !clerk.browseFilterPatch) {
              setQueryBase(undefined);
              setClerkDeck(null);
              setClerkPicks([]);
              setHighlightIds(new Set());
              setClerkFilterNote(null);
              setData(null);
              patchFilters({ q: "" });
              return;
            }
            if (clerk.deckList) {
              setClerkDeck(clerk.deckList);
              setClerkPicks([]);
              setQueryBase(undefined);
              patchFilters({
                q: "",
                game: clerkGameToBrowseGame(clerk.deckList.game),
                selectedColors: [],
                colorCount: "all",
                cardType: "all",
              });
              setClerkFilterNote(
                clerk.deckList.game === "magic"
                  ? `${clerk.deckList.archetype} — ${clerk.deckList.mainDeckCount ?? clerk.deckList.inStockCards}/99 maindeck from stock`
                  : `${clerk.deckList.archetype} — ${clerk.deckList.inStockCards} deck cards highlighted below`,
              );
              if (clerk.highlightIds?.length) {
                setHighlightIds(new Set(clerk.highlightIds));
              }
              return;
            }

            setClerkDeck(null);
            const patch = clerk.browseFilterPatch;
            if (patch) {
              const next: Partial<InventoryFilterState> = { q: patch.q };
              if (patch.gameInQuery) next.game = patch.game;
              if (patch.colorInQuery) {
                next.selectedColors = patch.selectedColors;
                next.colorCount = patch.colorCount;
                if (patch.colorMode) next.colorMode = patch.colorMode;
              }
              if (patch.cardType && patch.cardType !== "all") next.cardType = patch.cardType;
              if (patch.typeLine) next.typeLine = patch.typeLine;
              if (patch.commanderColors?.length) {
                next.commanderColors = patch.commanderColors.filter(
                  (color): color is InventoryFilterState["commanderColors"][number] =>
                    color === "W" ||
                    color === "U" ||
                    color === "B" ||
                    color === "R" ||
                    color === "G" ||
                    color === "C",
                );
              }
              if (patch.manaValuePreset) next.manaValuePreset = patch.manaValuePreset;
              patchFilters(next);
              setCommittedQ(patch.q);
              setDebouncedQ(patch.q);
              setQueryBase(patch.baseSemantic);
              setData(null);
              setClerkPicks([]);
              setClerkFilterNote(queryBaseNote(clerk.asked, patch.q));
            } else if (clerk.clearBrowseFilters) {
              patchFilters({
                q: clerk.searchQuery ?? "",
                game: clerkGameToBrowseGame(clerk.game),
                selectedColors: [],
                colorCount: "all",
                cardType: "all",
              });
              setQueryBase(undefined);
              setData(null);
              setClerkPicks([]);
              setClerkFilterNote(queryBaseNote(clerk.asked, clerk.searchQuery));
            } else {
              setQueryBase(undefined);
              setData(null);
              setClerkPicks([]);
              patchFilters({
                ...(clerk.clearSearch ? { q: "" } : {}),
                ...(clerk.searchQuery != null && !clerk.clearSearch
                  ? { q: clerk.searchQuery }
                  : {}),
                ...(clerk.game ? { game: clerkGameToBrowseGame(clerk.game) } : {}),
                ...(clerk.color
                  ? legacyColorToFilterPatch(clerk.color)
                  : {}),
                ...(clerk.cardType ? { cardType: clerk.cardType } : {}),
              });
              if (clerk.searchQuery) {
                setClerkFilterNote(`Showing results for “${clerk.searchQuery}”`);
              } else {
                setClerkFilterNote(null);
              }
            }
            if (clerk.highlightIds?.length) {
              setHighlightIds(new Set(clerk.highlightIds));
            } else {
              setHighlightIds(new Set());
            }
          }}
            />

            <InventoryDecklistImport
              slug={slug}
              onAddMany={addManyToCart}
              open={pasteListOpen}
              onOpenChange={setPasteListOpen}
            />

            <InventoryFilterBar
              slug={slug}
              filters={filters}
              onChange={patchFilters}
              onSearchCommit={commitSearch}
              facets={data?.facets}
              showSearch={false}
              showSortAndFinish={false}
            />

          </div>
        )}

          <div className="flex min-h-0 min-w-0 flex-col gap-2 lg:overflow-hidden">
            {clerkFilterNote ? (
              <p className="shrink-0 text-xs text-indigo-400">{clerkFilterNote}</p>
            ) : null}

            <div className="flex shrink-0 items-start gap-2">
              <button
                type="button"
                aria-expanded={!filtersCollapsed}
                aria-controls="inventory-search-filters"
                onClick={() => setFiltersCollapsed((collapsed) => !collapsed)}
                className="shrink-0 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:border-neutral-500"
              >
                {filtersCollapsed ? "Show filters" : "Hide filters"}
              </button>
              <div className="min-w-0 flex-1">
            <InventoryResultsToolbar
              filters={filters}
              onChange={patchFilters}
              facets={data?.facets}
              shown={data?.total}
            />
              </div>
            </div>

            <div className="min-h-0 flex-1 lg:overflow-y-auto lg:pr-1">
            <div className="inventory-card-stage space-y-2">
            {clerkDeck ? (
              <ClerkDeckPanel deck={clerkDeck} onAddToGathering={addCardToCart} />
            ) : null}

            {clerkPicks.length > 0 ? (
              <ClerkPicksPanel
                title="Top matches — in stock now"
                picks={shownPicks}
                storeSlug={slug}
                onAddToGathering={addCardToCart}
              />
            ) : null}

            {error ? (
              <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
                <p>{error}</p>
                <button
                  type="button"
                  className="mt-2 underline"
                  onClick={() => {
                    setError(null);
                    setRetryNonce((n) => n + 1);
                  }}
                >
                  Retry
                </button>
              </div>
            ) : loading && !data ? (
              <p className="py-8 text-center text-sm text-neutral-500">
                Loading inventory…
              </p>
            ) : (
              <>
                {loading ? (
                  <p className="text-center text-xs text-neutral-500">Updating…</p>
                ) : null}
                <InventoryCardGrid
                  cards={data?.items ?? []}
                  highlightIds={highlightIds}
                  pileIds={cartIds}
                  pileQty={cartQtyById}
                  onSelect={toggleCart}
                  draggable
                  size="large"
                  storeSlug={slug}
                  emptyMessage={browseEmptyMessage(filters, data)}
                />

                {data && data.totalPages > 1 ? (
                  <div className="mt-6 flex items-center justify-between text-sm">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="text-neutral-400">
                      Page {data.page} of {data.totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={page >= data.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-lg border border-neutral-700 px-3 py-1.5 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                ) : null}
              </>
            )}
            </div>
            </div>

            <div className="lg:hidden">
              <GatheringDesk
                slug={slug}
                game={filters.game}
                onAdd={addCardToCart}
              />
            </div>
          </div>

          <aside className="hidden min-h-0 lg:flex lg:flex-col lg:overflow-hidden">
            <GatheringDesk
              slug={slug}
              game={filters.game}
              onAdd={addCardToCart}
              fillViewport
            />
          </aside>
      </main>
    </div>
  );
}

