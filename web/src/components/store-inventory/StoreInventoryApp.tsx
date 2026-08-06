"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { StoreBrandMark } from "@/components/StoreBrandMark";
import {
  DEFAULT_INVENTORY_FILTERS,
  InventoryCardGrid,
  InventoryFilterBar,
  appendInventoryColorParams,
  inventoryColorFiltersActive,
  legacyColorToFilterPatch,
  type InventoryFilterState,
  type InventoryGridCard,
} from "@/components/store-inventory/InventoryBrowseUI";
import { DeckBuilderApp } from "@/components/deck-builder/DeckBuilderApp";
import { StoreClerkChat } from "@/components/store-inventory/StoreClerkChat";
import { ClerkDeckPanel } from "@/components/store-inventory/ClerkDeckPanel";
import {
  ClerkPicksPanel,
  type ClerkPickCard,
} from "@/components/store-inventory/ClerkPicksPanel";
import { GatheringDesk } from "@/components/store-inventory/GatheringDesk";
import type { GatheringCard } from "@/components/store-inventory/clerk-gathering";
import type { ClerkDeckList } from "@/lib/store-inventory/clerk-types";

type Tab = "browse" | "deck-builder";

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

function browseFiltersActive(filters: InventoryFilterState, committedQ: string): boolean {
  return (
    Boolean(committedQ.trim()) ||
    inventoryColorFiltersActive(filters) ||
    filters.cardType !== "all" ||
    filters.sortBy !== "name"
  );
}

export function StoreInventoryApp({
  slug,
  storeName: storeNameProp,
  logoUrl: logoUrlProp,
  initialTab = "browse",
}: {
  slug: string;
  storeName?: string;
  logoUrl?: string | null;
  initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [storeName, setStoreName] = useState(storeNameProp ?? titleFromSlug(slug));
  const [logoUrl, setLogoUrl] = useState<string | null | undefined>(logoUrlProp);
  const [filters, setFilters] = useState<InventoryFilterState>({
    ...DEFAULT_INVENTORY_FILTERS,
    game: "magic",
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
  const [gatheredCards, setGatheredCards] = useState<GatheringCard[]>([]);
  const [retryNonce, setRetryNonce] = useState(0);

  const addToGathering = useCallback((card: GatheringCard) => {
    setGatheredCards((prev) => {
      if (prev.some((c) => c.inventoryItemId === card.inventoryItemId)) {
        return prev;
      }
      return [...prev, card];
    });
  }, []);

  const removeFromGathering = useCallback((inventoryItemId: string) => {
    setGatheredCards((prev) =>
      prev.filter((c) => c.inventoryItemId !== inventoryItemId),
    );
  }, []);

  const apiBase = `/api/store/${encodeURIComponent(slug)}`;

  useEffect(() => {
    if (storeNameProp && logoUrlProp !== undefined) {
      setStoreName(storeNameProp);
      setLogoUrl(logoUrlProp);
      return;
    }

    const controller = new AbortController();
    fetch(`${apiBase}`, { signal: controller.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) return;
        setStoreName(body.store?.name ?? titleFromSlug(slug));
        setLogoUrl(body.store?.logoUrl ?? null);
      })
      .catch(() => {
        /* keep slug-based title */
      });

    return () => controller.abort();
  }, [apiBase, slug, storeNameProp, logoUrlProp]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q.trim()), 500);
    return () => clearTimeout(t);
  }, [filters.q]);

  useEffect(() => {
    setCommittedQ(debouncedQ);
    setPage(1);
  }, [debouncedQ]);

  useEffect(() => {
    if (tab !== "browse") return;

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
      limit: "48",
      game: filters.game,
      type: filters.cardType,
    });
    appendInventoryColorParams(params, filters);
    if (query) params.set("q", query);
    if (filters.sortBy !== "name") params.set("sort", filters.sortBy);

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
    tab,
    apiBase,
    page,
    filters.game,
    filters.selectedColors.join(","),
    filters.colorCount,
    filters.cardType,
    filters.sortBy,
    committedQ,
    retryNonce,
  ]);

  const commitSearch = useCallback((q: string) => {
    setCommittedQ(q.trim());
    setPage(1);
  }, []);

  function patchFilters(next: Partial<InventoryFilterState>) {
    setFilters((f) => ({ ...f, ...next }));
    if (next.q != null) {
      setCommittedQ(next.q.trim());
    }
    if (
      next.q != null ||
      next.game != null ||
      next.selectedColors != null ||
      next.colorCount != null ||
      next.cardType != null ||
      next.sortBy != null
    ) {
      setPage(1);
    }
  }

  if (tab === "deck-builder") {
    return (
      <DeckBuilderApp
        slug={slug}
        storeName={storeName}
        logoUrl={logoUrl}
        inventoryFirst
        onBackToInventory={() => setTab("browse")}
      />
    );
  }

  return (
    <div
      className="min-h-screen bg-neutral-950 text-white"
      style={{ backgroundColor: "#0a0a0a", color: "#fff" }}
    >
      <header className="border-b border-neutral-800 px-4 py-4">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <StoreBrandMark
                storeName={storeName}
                logoUrl={logoUrl}
                variant="auth"
                subtitle="Inventory"
              />
              <p className="mt-1 text-center text-xs text-neutral-500 sm:text-left">
                Powered by{" "}
                <Link href="/" className="text-neutral-400 hover:text-white">
                  Card Scanner 9000
                </Link>
              </p>
            </div>
            <Link
              href={`/s/${slug}`}
              className="text-sm text-neutral-400 hover:text-white"
            >
              ← Store home
            </Link>
          </div>

          <div className="mt-4 flex gap-2 border-b border-neutral-800 pb-0">
            <TabButton active onClick={() => setTab("browse")}>
              Browse inventory
            </TabButton>
            <TabButton active={false} onClick={() => setTab("deck-builder")}>
              Deck builder
            </TabButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
        <StoreClerkChat
          slug={slug}
          storeName={storeName}
          filters={filters}
          onAddToGathering={addToGathering}
          onApplyClerk={(clerk) => {
            if (clerk.deckList) {
              setClerkDeck(clerk.deckList);
              setClerkPicks([]);
              patchFilters({
                q: "",
                game: clerk.deckList.game === "magic" ? "magic" : "pokemon",
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
            if (clerk.clearBrowseFilters) {
              patchFilters({
                q: clerk.searchQuery ?? "",
                game: clerk.game ?? "magic",
                selectedColors: [],
                colorCount: "all",
                cardType: "all",
              });
              const picks = clerk.picks ?? [];
              setClerkPicks(picks);
              setClerkFilterNote(
                picks.length
                  ? `${picks.length} clerk pick${picks.length === 1 ? "" : "s"} shown below${clerk.searchQuery ? ` · browse filtered to “${clerk.searchQuery}”` : ""}`
                  : clerk.searchQuery
                    ? `Showing results for “${clerk.searchQuery}”`
                    : null,
              );
            } else {
              setClerkPicks([]);
              patchFilters({
                ...(clerk.clearSearch ? { q: "" } : {}),
                ...(clerk.searchQuery != null && !clerk.clearSearch
                  ? { q: clerk.searchQuery }
                  : {}),
                ...(clerk.game ? { game: clerk.game } : {}),
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

        <div className="mt-4 xl:hidden">
          <GatheringDesk
            cards={gatheredCards}
            onAdd={addToGathering}
            onRemove={removeFromGathering}
            onClear={() => setGatheredCards([])}
          />
        </div>

        {clerkDeck ? (
          <ClerkDeckPanel deck={clerkDeck} onAddToGathering={addToGathering} />
        ) : null}

        {clerkPicks.length > 0 ? (
          <ClerkPicksPanel
            title="Clerk picks — in stock now"
            picks={clerkPicks}
            onAddToGathering={addToGathering}
          />
        ) : null}

        <div className="mt-4">
          <InventoryFilterBar
            slug={slug}
            filters={filters}
            onChange={patchFilters}
            onSearchCommit={commitSearch}
            facets={data?.facets}
            showSearch
          />
        </div>

        {clerkFilterNote ? (
          <p className="mt-2 text-xs text-indigo-400">{clerkFilterNote}</p>
        ) : null}

        {data?.facets && browseFiltersActive(filters, committedQ) ? (
          <p className="mt-3 text-xs text-neutral-500">
            {data.total.toLocaleString()} cards shown
            {filters.game !== "all"
              ? ` (${filters.game})`
              : ""}{" "}
            · {data.facets.inStock.toLocaleString()} total in stock at{" "}
            {storeName}
          </p>
        ) : null}

        {!browseFiltersActive(filters, committedQ) ? (
          <p className="mt-8 text-center text-sm text-neutral-500">
            Search for a card, pick a color, or change sort to browse inventory
            — or ask the clerk for picks.
          </p>
        ) : error ? (
          <div className="mt-4 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
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
          <p className="mt-8 text-center text-sm text-neutral-500">
            Loading inventory…
          </p>
        ) : (
          <>
            {loading ? (
              <p className="mt-4 text-center text-xs text-neutral-500">
                Updating…
              </p>
            ) : null}
            <div className="mt-4">
              <InventoryCardGrid
                cards={data?.items ?? []}
                highlightIds={highlightIds}
                draggable
                size="large"
                emptyMessage={
                  data?.facets?.inStock === 0
                    ? "No catalog inventory linked yet. Import TCGplayer or Shopify stock in admin, then run the inventory crosswalk."
                    : inventoryColorFiltersActive(filters) && data?.total === 0
                      ? "No cards match this color filter yet. Color data comes from Scryfall — run Admin → Deck Builder → Inventory crosswalk sync to link more cards."
                      : "No cards match your search."
                }
              />
            </div>

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

          <aside className="hidden xl:block xl:sticky xl:top-4 xl:self-start">
            <GatheringDesk
              cards={gatheredCards}
              onAdd={addToGathering}
              onRemove={removeFromGathering}
              onClear={() => setGatheredCards([])}
            />
          </aside>
        </div>
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-indigo-500 text-white"
          : "border-transparent text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}
