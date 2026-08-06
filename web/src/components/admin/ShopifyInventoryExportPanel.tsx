"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import {
  resolveDefaultShopifyExportPrice,
  resolveShopifyListingMarketPrice,
} from "@/lib/shopify/product-builder";
import {
  isShopifyAlreadyExported,
  shopifyInventoryExportEligibility,
  shopifyExportStatusDisplay,
} from "@/lib/shopify/eligibility";
import { isBuybackInventoryItem } from "@/lib/inventory/status";
import type { InventoryItem, ScannedCard } from "@/lib/types";
import type {
  ShopifyExportCardResult,
  ShopifyIntegrationPublic,
} from "@/lib/shopify/types";

type PriceRow = {
  cardId: string;
  exportPrice: string;
  eligible: boolean;
  reason: string;
  label: string;
  marketPrice?: number;
  requiresManual: boolean;
  alreadyExported: boolean;
  reexport: boolean;
};

export function ShopifyInventoryExportPanel({
  items,
  cards,
  onExported,
}: {
  items: InventoryItem[];
  cards: ScannedCard[];
  onExported: () => void;
}) {
  const [shopify, setShopify] = useState<ShopifyIntegrationPublic | null>(null);
  const [shopifyLoading, setShopifyLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportResults, setExportResults] = useState<
    Array<{ label: string; result: ShopifyExportCardResult }>
  >([]);
  const [productStatus, setProductStatus] = useState<"DRAFT" | "ACTIVE">("DRAFT");
  const [priceRows, setPriceRows] = useState<PriceRow[]>([]);

  const cardsById = useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards],
  );

  useEffect(() => {
    setShopifyLoading(true);
    adminFetch("/api/admin/shopify/settings")
      .then((r) => r.json())
      .then((d) => {
        setShopify(d.shopify ?? null);
        if (d.shopify?.defaultProductStatus) {
          setProductStatus(d.shopify.defaultProductStatus);
        }
      })
      .catch(() => setShopify(null))
      .finally(() => setShopifyLoading(false));
  }, []);

  const buybackItems = useMemo(
    () => items.filter((item) => isBuybackInventoryItem(item) && item.cardId),
    [items],
  );

  const eligibleItems = useMemo(() => {
    if (!shopify?.enabled) return [];
    return buybackItems.filter((item) => {
      const card = cardsById.get(item.cardId!);
      return shopifyInventoryExportEligibility(
        card,
        item,
        shopify as never,
      ).eligible;
    });
  }, [buybackItems, cardsById, shopify]);

  function buildPriceRows(ids: Set<string>, reexport = false): PriceRow[] {
    return buybackItems
      .filter((item) => item.cardId && ids.has(item.cardId))
      .map((item) => {
        const card = cardsById.get(item.cardId!);
        const allowReexport = reexport && Boolean(card && isShopifyAlreadyExported(card));
        const el = shopifyInventoryExportEligibility(
          card,
          item,
          shopify as never,
          { allowReexport },
        );
        const pricing =
          shopify && card
            ? resolveDefaultShopifyExportPrice(card, shopify as never)
            : { price: item.marketPrice ?? null, requiresManual: true };
        return {
          cardId: item.cardId!,
          exportPrice:
            pricing.price != null ? String(pricing.price.toFixed(2)) : "",
          eligible: el.eligible,
          reason: el.message,
          label: item.displayName,
          marketPrice:
            (card ? resolveShopifyListingMarketPrice(card) : undefined) ??
            item.marketPrice,
          requiresManual: pricing.requiresManual,
          alreadyExported: card ? isShopifyAlreadyExported(card) : false,
          reexport: allowReexport,
        };
      });
  }

  function toggle(cardId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }

  function selectAllEligible() {
    setSelected(new Set(eligibleItems.map((i) => i.cardId!)));
  }

  function openExportModal(reexportCardIds?: Set<string>) {
    const ids =
      reexportCardIds ??
      (selected.size > 0
        ? selected
        : new Set(eligibleItems.map((i) => i.cardId!)));
    setSelected(ids);
    setPriceRows(buildPriceRows(ids, Boolean(reexportCardIds?.size)));
    setOpen(true);
    setError(null);
    setExportResults([]);
  }

  function openReexportModal(cardId: string) {
    openExportModal(new Set([cardId]));
  }

  async function runExport() {
    setExporting(true);
    setError(null);
    setExportResults([]);
    const exportItems = priceRows
      .filter((r) => r.eligible && (!r.alreadyExported || r.reexport))
      .map((r) => ({
        cardId: r.cardId,
        exportPrice: parseFloat(r.exportPrice),
        reexport: r.reexport,
      }))
      .filter((r) => r.exportPrice > 0);

    if (!exportItems.length) {
      setError("Enter a valid export price for at least one eligible card.");
      setExporting(false);
      return;
    }

    const res = await adminFetch("/api/admin/shopify/export", {
      method: "POST",
      body: JSON.stringify({
        items: exportItems,
        productStatus,
      }),
    });
    const data = await res.json();
    setExporting(false);
    if (!res.ok) {
      setError(data.error ?? "Export failed");
      return;
    }

    const results = (data.results ?? []) as ShopifyExportCardResult[];
    const labeledResults = results.map((result) => ({
      label:
        priceRows.find((row) => row.cardId === result.cardId)?.label ??
        result.cardId,
      result,
    }));
    setExportResults(labeledResults);

    const failures = labeledResults.filter(({ result }) => !result.ok);
    if (failures.length) {
      setError(
        `${failures.length} of ${labeledResults.length} export(s) failed. See details below.`,
      );
      onExported();
      return;
    }

    setOpen(false);
    setSelected(new Set());
    onExported();
  }

  const shopifyEnabled = Boolean(shopify?.enabled);

  return (
    <div className="mt-4">
      {shopifyLoading ? (
        <p className="mb-3 text-xs text-slate-500">Loading export options…</p>
      ) : shopifyEnabled ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-emerald-950">Shopify export</h3>
              <p className="mt-1 text-xs text-emerald-900/80">
                Select purchased cards on hand to create Shopify draft products.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={selectAllEligible}>
                Select all eligible ({eligibleItems.length})
              </Button>
              <Button
                onClick={() => openExportModal()}
                disabled={!eligibleItems.length && selected.size === 0}
              >
                Add selected to Shopify
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Enable Shopify under{" "}
          <Link href="/admin/settings" className="font-medium text-indigo-600 hover:underline">
            Settings
          </Link>{" "}
          to export on-hand cards as products.
        </div>
      )}

      <ul className="space-y-3">
        {buybackItems.map((item) => {
          const card = cardsById.get(item.cardId!);
          const el = shopifyEnabled
            ? shopifyInventoryExportEligibility(card, item, shopify as never)
            : null;
          const exported = card ? isShopifyAlreadyExported(card) : false;
          const exportStatus = shopifyExportStatusDisplay(card?.shopifyExport);
          const imageUrl = item.frontImageUrl ?? card?.frontImageUrl;
          const cardId = item.cardId!;
          return (
            <li
              key={item.id}
              className="flex flex-wrap gap-3 rounded-xl border bg-white p-4 shadow-sm"
            >
              {shopifyEnabled && (
                <input
                  type="checkbox"
                  checked={selected.has(cardId)}
                  disabled={!el?.eligible}
                  onChange={() => toggle(cardId)}
                  className="mt-1 rounded"
                  aria-label={`Select ${item.displayName}`}
                />
              )}
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-24 w-16 shrink-0 rounded object-cover ring-1 ring-gray-200"
                />
              ) : (
                <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded bg-slate-100 text-xs text-slate-400 ring-1 ring-gray-200">
                  No img
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">{item.displayName}</p>
                <p className="text-sm text-gray-600">
                  {item.category ?? "—"} · {item.setName ?? "—"} ·{" "}
                  {item.cardNumber ?? "—"}
                </p>
                <p className="mt-1 text-sm">
                  Paid ${(item.purchasePrice ?? 0).toFixed(2)}{" "}
                  <span className="capitalize text-gray-500">
                    ({item.purchaseType ?? "—"})
                  </span>
                  {item.marketPrice != null && (
                    <span className="text-gray-500">
                      {" "}
                      · Market ${item.marketPrice.toFixed(2)}
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Acquired {new Date(item.acquiredAt).toLocaleString()}
                  {item.orderId && item.orderNumber ? (
                    <>
                      {" "}
                      ·{" "}
                      <Link
                        href={`/admin/orders/${item.orderId}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {item.orderNumber}
                      </Link>
                    </>
                  ) : null}
                </p>
                {shopifyEnabled && (
                  <div className="mt-1 space-y-0.5">
                    <p
                      className={`text-xs ${
                        exportStatus.tone === "success"
                          ? "text-emerald-700"
                          : exportStatus.tone === "error"
                            ? "text-red-700"
                            : exportStatus.tone === "warning"
                              ? "text-amber-700"
                              : exported
                                ? "text-emerald-700"
                                : el?.eligible
                                  ? "text-gray-600"
                                  : "text-gray-400"
                      }`}
                    >
                      {exportStatus.label}
                      {!el?.eligible && !exported ? ` · ${el?.message}` : ""}
                    </p>
                    {exportStatus.error && (
                      <p
                        className="text-xs text-red-600"
                        title={exportStatus.error}
                      >
                        {exportStatus.error}
                      </p>
                    )}
                    {exportStatus.lastAttemptAt && (
                      <p className="text-xs text-gray-400">
                        Last attempt{" "}
                        {new Date(exportStatus.lastAttemptAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
              {card?.shopifyExport?.productAdminUrl && !exported && (
                <a
                  href={card.shopifyExport.productAdminUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="self-start text-xs font-medium text-indigo-600 hover:underline"
                >
                  Open in Shopify
                </a>
              )}
              {shopifyEnabled && exported && (
                <Button
                  variant="secondary"
                  className="self-start px-3 py-1.5 text-xs"
                  onClick={() => openReexportModal(cardId)}
                >
                  Export again
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {open && (
        <div className="fixed inset-0 z-[9990] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-4 shadow-xl">
            <h4 className="text-lg font-semibold text-gray-900">
              {priceRows.some((r) => r.reexport)
                ? "Export again to Shopify"
                : "Export to Shopify"}
            </h4>
            <p className="mt-1 text-sm text-gray-600">
              {priceRows.some((r) => r.reexport)
                ? "Creates a new Shopify product. Remove the old listing from Shopify first if it still exists."
                : "Review listing prices before creating products."}
            </p>

            <label className="mt-4 block text-sm">
              Product status
              <select
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 sm:max-w-xs"
                value={productStatus}
                onChange={(e) =>
                  setProductStatus(e.target.value as "DRAFT" | "ACTIVE")
                }
              >
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
              </select>
            </label>

            <div className="mt-4 space-y-3">
              {priceRows.map((row, idx) => (
                <div
                  key={row.cardId}
                  className="rounded-lg border border-gray-200 p-3 text-sm"
                >
                  <p className="font-medium text-gray-900">{row.label}</p>
                  {row.reexport && (
                    <p className="mt-1 text-xs text-amber-700">
                      Re-export — will create a new Shopify listing.
                    </p>
                  )}
                  {!row.eligible ? (
                    <p className="mt-1 text-xs text-red-600">{row.reason}</p>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-gray-600">
                        Market ${row.marketPrice?.toFixed(2) ?? "—"}
                      </p>
                      <label className="mt-2 block text-xs font-medium text-gray-700">
                        Shopify listing price
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 sm:max-w-[8rem]"
                          value={row.exportPrice}
                          onChange={(e) => {
                            const next = [...priceRows];
                            next[idx] = { ...row, exportPrice: e.target.value };
                            setPriceRows(next);
                          }}
                        />
                        {row.requiresManual && !row.exportPrice && (
                          <span className="mt-1 block text-amber-700">
                            Manual price required
                          </span>
                        )}
                      </label>
                    </>
                  )}
                </div>
              ))}
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            {exportResults.length > 0 && (
              <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                <p className="font-medium text-gray-900">Export results</p>
                <ul className="mt-2 space-y-2">
                  {exportResults.map(({ label, result }) => (
                    <li key={result.cardId} className="text-xs">
                      <span className="font-medium text-gray-800">{label}</span>
                      {": "}
                      <span
                        className={
                          result.ok ? "text-emerald-700" : "text-red-600"
                        }
                      >
                        {result.ok
                          ? "Created in Shopify"
                          : result.error ?? result.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button disabled={exporting} onClick={() => void runExport()}>
                {exporting ? "Creating…" : "Create Shopify products"}
              </Button>
              <Button variant="ghost" disabled={exporting} onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
