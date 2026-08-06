"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import { inventoryImageProxyPath } from "@/lib/inventory/resolve-display-image";
import { isFirebaseStorageUrl } from "@/lib/inventory/image-url";
import {
  inventoryEffectiveQuantity,
  isInventoryListed,
} from "@/lib/inventory/status";
import type { InventoryItem } from "@/lib/types";

type StockFilter = "all" | "in_stock" | "catalog";
type ListedFilter = "all" | "listed" | "unlisted";

interface BrowseResponse {
  items: InventoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  imagesPending?: number;
  imagesRetryable?: number;
  tcgLowsPending?: number;
}

export function InventoryBrowser({ refreshKey }: { refreshKey: number }) {
  const { activeStore } = useAdmin();
  const storeSlug = activeStore?.storeSlug;
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [stock, setStock] = useState<StockFilter>("all");
  const [listed, setListed] = useState<ListedFilter>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caching, setCaching] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);
  const [pricingLow, setPricingLow] = useState(false);
  const [brokenThumbs, setBrokenThumbs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, stock, listed]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      limit: "48",
      stock,
      listed,
    });
    if (debouncedQ) params.set("q", debouncedQ);

    adminFetch(`/api/admin/inventory/browse?${params}`)
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Browse failed");
        setData(body);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Browse failed");
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [debouncedQ, stock, listed, page]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function retryFailedImages() {
    setCaching(true);
    setCacheStatus("Resetting missed images for retry…");
    try {
      const res = await adminFetch("/api/admin/inventory/retry-failed-images", {
        method: "POST",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Retry reset failed");
      setCacheStatus(
        `Reset ${body.cleared?.toLocaleString() ?? 0} missed items — starting cache…`,
      );
      await cacheImages(true);
    } catch (e) {
      setCacheStatus(e instanceof Error ? e.message : "Retry failed");
      setCaching(false);
    }
  }

  async function refreshTcgLows(continueLoop = false) {
    setPricingLow(true);
    setCacheStatus("Fetching TCG lowest listing prices…");
    let remaining = continueLoop ? (data?.tcgLowsPending ?? 1) : 1;
    let totalUpdated = 0;
    let batchNum = 0;

    try {
      while (remaining > 0) {
        batchNum += 1;
        setCacheStatus(
          `TCG low batch ${batchNum} (${remaining.toLocaleString()} pending)…`,
        );
        const res = await adminFetch("/api/admin/inventory/backfill-tcg-lows", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 10 }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "TCG low refresh failed");

        const batch = body.batch as {
          updated: number;
          remaining: number;
        };
        totalUpdated += batch.updated;
        remaining = batch.remaining;
        setCacheStatus(
          `TCG low batch ${batchNum} — ${totalUpdated.toLocaleString()} priced · ${remaining.toLocaleString()} left`,
        );
        if (!continueLoop || remaining <= 0) break;
        if (batch.updated === 0) break;
      }
      load();
    } catch (e) {
      setCacheStatus(e instanceof Error ? e.message : "TCG low refresh failed");
    } finally {
      setPricingLow(false);
    }
  }

  const working = caching || pricingLow;

  async function backfillFromCatalog(continueLoop = false) {
    setCaching(true);
    setCacheStatus("Backfilling from catalog (Scryfall art in DB)…");
    let remaining = 1;
    let totalCached = 0;
    let batchNum = 0;

    try {
      do {
        batchNum += 1;
        const res = await adminFetch(
          "/api/admin/inventory/backfill-from-catalog",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ limit: 20 }),
          },
        );
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Catalog backfill failed");
        totalCached += body.cached ?? 0;
        remaining = body.remaining ?? 0;
        setCacheStatus(
          `Catalog batch ${batchNum} — ${totalCached} saved · ${remaining.toLocaleString()} crosswalk rows left`,
        );
        if (!continueLoop || remaining <= 0) break;
        if ((body.cached ?? 0) === 0) break;
      } while (remaining > 0);
      load();
    } catch (e) {
      setCacheStatus(e instanceof Error ? e.message : "Catalog backfill failed");
    } finally {
      setCaching(false);
    }
  }

  function inventoryThumbSrc(item: { id: string; frontImageUrl?: string }) {
    if (isFirebaseStorageUrl(item.frontImageUrl)) return item.frontImageUrl!;
    if (storeSlug) return inventoryImageProxyPath(storeSlug, item.id);
    return item.frontImageUrl;
  }

  async function parseAdminJson(res: Response): Promise<Record<string, unknown>> {
    const text = await res.text();
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(
        text.trim().slice(0, 160) ||
          `Server error (${res.status}) — try again; progress is saved each run`,
      );
    }
  }

  async function cacheImages(continueLoop = false) {
    setCaching(true);
    setCacheStatus("Starting image cache…");
    let remaining = continueLoop ? (data?.imagesPending ?? 1) : 1;
    let totalCached = 0;
    let totalFailed = 0;
    let runNum = 0;

    try {
      while (remaining > 0) {
        runNum += 1;
        setCacheStatus(
          `Run ${runNum}: caching ~1 min (${remaining.toLocaleString()} pending)…`,
        );
        const res = await adminFetch("/api/admin/inventory/backfill-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 15, budgetMs: 50_000 }),
        });
        const body = await parseAdminJson(res);
        if (!res.ok) {
          throw new Error(String(body.error ?? "Image cache failed"));
        }

        const batch = body.batch as {
          cached: number;
          failed: number;
          remaining: number;
          processed: number;
        };
        totalCached += batch.cached;
        totalFailed += batch.failed;
        remaining = batch.remaining;
        setCacheStatus(
          `Run ${runNum} done — ${totalCached.toLocaleString()} cached, ${totalFailed.toLocaleString()} unavailable · ${remaining.toLocaleString()} left`,
        );
        if (!continueLoop || remaining <= 0) break;
        if (batch.processed === 0) break;
      }
      load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Image cache failed";
      setCacheStatus(
        `${msg} — click Cache all to storage again to continue`,
      );
      load();
    } finally {
      setCaching(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Inventory browser</p>
          <p className="text-xs text-slate-500">
            TCGplayer & Shopify imports — {data?.total.toLocaleString() ?? "…"} rows
            (buyback scans are listed separately above). Images load via catalog/proxy
            and save to storage automatically.
          </p>
        </div>
        {(data?.imagesPending ?? 0) > 0 ||
        (data?.imagesRetryable ?? 0) > 0 ||
        (data?.tcgLowsPending ?? 0) > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {(data?.imagesPending ?? 0) > 0 ? (
              <p className="max-w-xs text-xs text-amber-700">
                {data?.imagesPending?.toLocaleString()} images still need caching
              </p>
            ) : null}
            {(data?.imagesRetryable ?? 0) > 0 ? (
              <p className="max-w-md text-xs text-slate-600">
                {data?.imagesRetryable?.toLocaleString()} failed to save to storage
                (TCGplayer blocks server fetches) — click Retry to re-run via
                Scryfall/catalog
              </p>
            ) : null}
            {(data?.tcgLowsPending ?? 0) > 0 ? (
              <p className="max-w-xs text-xs text-slate-600">
                {data?.tcgLowsPending?.toLocaleString()} rows need TCG low price
              </p>
            ) : null}
            {(data?.imagesPending ?? 0) > 0 ? (
              <Button
                type="button"
                variant="secondary"
                disabled={working}
                onClick={() => cacheImages(true)}
              >
                {caching ? "Caching…" : "Cache all to storage"}
              </Button>
            ) : null}
            {(data?.imagesRetryable ?? 0) > 0 ? (
              <Button
                type="button"
                variant="secondary"
                disabled={working}
                onClick={() => retryFailedImages()}
              >
                {caching ? "Working…" : "Retry missed images"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              disabled={working}
              onClick={() => backfillFromCatalog(true)}
            >
              {caching ? "Working…" : "Save from catalog"}
            </Button>
            {(data?.tcgLowsPending ?? 0) > 0 ? (
              <Button
                type="button"
                variant="secondary"
                disabled={working}
                onClick={() => refreshTcgLows(true)}
              >
                {pricingLow ? "Pricing…" : "Refresh TCG lows"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {cacheStatus ? (
        <p className="mt-2 text-xs text-slate-600">{cacheStatus}</p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, set, ID, condition…"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />
        <select
          value={stock}
          onChange={(e) => setStock(e.target.value as StockFilter)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="all">All stock</option>
          <option value="in_stock">In stock only</option>
          <option value="catalog">Catalog @ 0 qty</option>
        </select>
        <select
          value={listed}
          onChange={(e) => setListed(e.target.value as ListedFilter)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="all">All listing status</option>
          <option value="listed">Listed (Shopify)</option>
          <option value="unlisted">Not listed</option>
        </select>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>
      ) : null}

      {loading && !data ? (
        <p className="mt-4 text-sm text-slate-500">Loading inventory…</p>
      ) : null}

      {data && data.items.length === 0 ? (
        <p className="mt-4 text-center text-sm text-slate-500">
          No items match your filters.
        </p>
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => {
              const qty = inventoryEffectiveQuantity(item);
              const listedOnShopify = isInventoryListed(item);
              return (
                <li
                  key={item.id}
                  className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm"
                >
                  {inventoryThumbSrc(item) && !brokenThumbs.has(item.id) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={inventoryThumbSrc(item)}
                      alt=""
                      className="h-20 w-14 shrink-0 rounded object-cover ring-1 ring-slate-200"
                      loading="lazy"
                      onError={() =>
                        setBrokenThumbs((prev) => new Set(prev).add(item.id))
                      }
                    />
                  ) : (
                    <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded bg-slate-200 text-[10px] text-slate-500">
                      No img
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium text-slate-900">
                      {item.displayName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.setName ?? item.productLine ?? "—"}
                      {item.tcgplayerCondition
                        ? ` · ${item.tcgplayerCondition}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-slate-600">
                      Qty {qty}
                      {item.listPrice != null
                        ? ` · $${item.listPrice.toFixed(2)}`
                        : ""}
                      {item.tcgplayerProductId
                        ? ` · #${item.tcgplayerProductId}`
                        : ""}
                    </p>
                    {listedOnShopify ? (
                      <span className="mt-1 inline-block rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
                        Shopify
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>

          {data.totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between gap-2 text-sm">
              <p className="text-slate-500">
                Page {data.page} of {data.totalPages} · {data.total.toLocaleString()}{" "}
                total
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={page >= data.totalPages || loading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
