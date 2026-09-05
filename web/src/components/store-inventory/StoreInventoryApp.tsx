"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCustomer } from "@/context/CustomerContext";
import {
  deckBuildReturnPath,
  deckBuildSignInHref,
} from "@/lib/store-inventory/deck-build-auth";
import { StoreBrandMark } from "@/components/StoreBrandMark";
import {
  DEFAULT_INVENTORY_FILTERS,
  InventoryCardGrid,
  InventoryFilterBar,
  InventoryGameSourceBar,
  appendInventoryColorParams,
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
import { GatheringDesk } from "@/components/store-inventory/GatheringDesk";
import { InventoryDecklistImport } from "@/components/store-inventory/InventoryDecklistImport";
import type { GatheringCard } from "@/components/store-inventory/clerk-gathering";
import type { ClerkDeckList } from "@/lib/store-inventory/clerk-types";
import { appendInventoryBrowseParams } from "@/lib/store-inventory/inventory-browse-filter-params";

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

function clerkGameToBrowseGame(game?: string): InventoryFilterState["game"] {
  if (game === "pokemon") return "pokemon";
  if (game === "riftbound") return "riftbound";
  return "magic";
}

export function StoreInventoryApp({
  slug,
  storeName: storeNameProp,
  logoUrl: logoUrlProp,
}: {
  slug: string;
  storeName?: string;
  logoUrl?: string | null;
}) {
  const router = useRouter();
  const { customer, loading: customerLoading } = useCustomer();
  const professorHref = deckBuildReturnPath(slug, "professor");
  const [storeName, setStoreName] = useState(storeNameProp ?? titleFromSlug(slug));
  const [logoUrl, setLogoUrl] = useState<string | null | undefined>(logoUrlProp);
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
  const [gatheredCards, setGatheredCards] = useState<GatheringCard[]>([]);
  const [retryNonce, setRetryNonce] = useState(0);
  const [pasteListOpen, setPasteListOpen] = useState(false);

  const addToGathering = useCallback((card: GatheringCard) => {
    setGatheredCards((prev) => {
      if (prev.some((c) => c.inventoryItemId === card.inventoryItemId)) {
        return prev;
      }
      return [...prev, card];
    });
  }, []);

  const addManyToGathering = useCallback((cards: GatheringCard[]) => {
    setGatheredCards((prev) => {
      const seen = new Set(prev.map((c) => c.inventoryItemId));
      const next = [...prev];
      for (const card of cards) {
        if (seen.has(card.inventoryItemId)) continue;
        seen.add(card.inventoryItemId);
        next.push(card);
      }
      return next;
    });
  }, []);

  const removeFromGathering = useCallback((inventoryItemId: string) => {
    setGatheredCards((prev) =>
      prev.filter((c) => c.inventoryItemId !== inventoryItemId),
    );
  }, []);

  // Touch devices never fire HTML5 drag, so tapping a card is the only way in
  // on a tablet. Toggling rather than adding keeps a second tap meaningful.
  const toggleGathering = useCallback((card: GatheringCard) => {
    setGatheredCards((prev) =>
      prev.some((c) => c.inventoryItemId === card.inventoryItemId)
        ? prev.filter((c) => c.inventoryItemId !== card.inventoryItemId)
        : [...prev, card],
    );
  }, []);

  const gatheredIds = useMemo(
    () => new Set(gatheredCards.map((c) => c.inventoryItemId)),
    [gatheredCards],
  );

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
    appendInventoryBrowseParams(params, filters, query);

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
      next.source != null ||
      next.selectedColors != null ||
      next.colorCount != null ||
      next.cardType != null ||
      next.cardTypes != null ||
      next.oracleActions != null ||
      next.primitiveActions != null ||
      next.primitiveActionMode != null ||
      next.abilityTypes != null ||
      next.zones != null ||
      next.semanticOwners != null ||
      next.manaValuePreset != null ||
      next.sortBy != null
    ) {
      setPage(1);
    }
  }

  function goToDeckBuilder() {
    if (customerLoading) return;
    if (!customer) {
      router.push(deckBuildSignInHref(slug, professorHref));
      return;
    }
    router.push(professorHref);
  }

  return (
    <div
      className="storefront-theme min-h-screen bg-neutral-950 text-[var(--text)]"
      // The inline background/colour that used to sit here was a hard-coded
      // pure grey, which overrode the themed class and pinned this page to the
      // old palette. The class alone is enough; the belt-and-braces literal was
      // added for an iPad Safari CSS-chunk failure that the plain-CSS grid
      // rules above already cover.
      style={{ backgroundColor: "var(--ink-850)" }}
    >
      <header className="border-b border-neutral-800 px-4 py-4">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            {/* A left-aligned app header, so this deliberately does not use the
                shared `auth` lockup: that variant centres itself, which is why
                the old header read as off-axis against the "Store home" link. */}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--text-hi)] sm:text-2xl">
                {storeName}
              </h1>
              <p className="mt-0.5 text-[11px] uppercase tracking-[0.18em] text-[var(--text-lo)]">
                Inventory
              </p>
              <p className="mt-2 text-xs text-[var(--text-lo)]">
                Powered by{" "}
                <Link href="/" className="transition hover:text-[var(--accent-hi)]">
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
            <TabButton active>Browse inventory</TabButton>
            <TabNavButton onClick={goToDeckBuilder}>Deck builder</TabNavButton>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0 space-y-4">
            <StoreClerkChat
              slug={slug}
              storeName={storeName}
              filters={filters}
              variant="queryBar"
              onAddToGathering={addToGathering}
              onPasteList={() => {
                setPasteListOpen(true);
                window.requestAnimationFrame(() => {
                  document.getElementById("inventory-paste-list")?.scrollIntoView({
                    behavior: "smooth",
                    block: "nearest",
                  });
                });
              }}
              onApplyClerk={(clerk) => {
            if (clerk.deckList) {
              setClerkDeck(clerk.deckList);
              setClerkPicks([]);
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
              patchFilters({
                q: patch.q,
                game: patch.game,
                selectedColors: patch.selectedColors,
                colorCount: patch.colorCount,
                cardType: patch.cardType,
              });
              setCommittedQ(patch.q);
              setDebouncedQ(patch.q);
              const picks = clerk.picks ?? [];
              setClerkPicks(picks);
              setClerkFilterNote(
                picks.length
                  ? `${picks.length} clerk pick${picks.length === 1 ? "" : "s"} · inventory filtered below`
                  : patch.q
                    ? `Showing inventory for “${patch.q}”`
                    : patch.selectedColors.length
                      ? `Showing ${patch.selectedColors.join("")} inventory below`
                      : null,
              );
            } else if (clerk.clearBrowseFilters) {
              patchFilters({
                q: clerk.searchQuery ?? "",
                game: clerkGameToBrowseGame(clerk.game),
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
              onAddMany={addManyToGathering}
              open={pasteListOpen}
              onOpenChange={setPasteListOpen}
            />

            <InventoryGameSourceBar
              filters={filters}
              onChange={patchFilters}
              facets={data?.facets}
            />
            <InventoryFilterBar
              slug={slug}
              filters={filters}
              onChange={patchFilters}
              onSearchCommit={commitSearch}
              facets={data?.facets}
              showSearch={false}
            />

            {clerkFilterNote ? (
              <p className="text-xs text-indigo-400">{clerkFilterNote}</p>
            ) : null}

            {data?.facets ? (
              <p className="text-xs text-neutral-500">
                {data.total.toLocaleString()} cards shown
                {filters.source === "catalog" ? " (all printings)" : ` (${filters.game})`}{" "}
                {filters.source === "inventory" ? (
                  <>
                    · {data.facets.inStock.toLocaleString()} total in stock at {storeName}
                  </>
                ) : null}
              </p>
            ) : null}

            {clerkDeck ? (
              <ClerkDeckPanel deck={clerkDeck} onAddToGathering={addToGathering} />
            ) : null}

            {clerkPicks.length > 0 ? (
              <ClerkPicksPanel
                title="Top matches — in stock now"
                picks={clerkPicks}
                onAddToGathering={addToGathering}
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
                  pileIds={gatheredIds}
                  onSelect={toggleGathering}
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

            <div className="xl:hidden">
              <GatheringDesk
                slug={slug}
                cards={gatheredCards}
                onAdd={addToGathering}
                onRemove={removeFromGathering}
                onClear={() => setGatheredCards([])}
              />
            </div>
          </div>

          <aside className="hidden xl:block xl:sticky xl:top-4 xl:self-start">
            <GatheringDesk
              slug={slug}
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
  children,
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`border-b-2 px-4 py-2 text-sm font-medium ${
        active
          ? "border-indigo-500 text-white"
          : "border-transparent text-neutral-400"
      }`}
    >
      {children}
    </span>
  );
}

function TabNavButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-b-2 border-transparent px-4 py-2 text-sm font-medium text-neutral-400 transition hover:text-neutral-200"
    >
      {children}
    </button>
  );
}
