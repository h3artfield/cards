"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminSectionTabs } from "@/components/admin/AdminSectionTabs";
import { adminFetch } from "@/lib/api-client";
import { useAdmin } from "@/context/AdminContext";
import type { BuybackTransaction, InventoryItem, ScannedCard } from "@/lib/types";
import { ShopifyInventoryExportPanel } from "@/components/admin/ShopifyInventoryExportPanel";
import { ShopifyInventoryImportPanel } from "@/components/admin/ShopifyInventoryImportPanel";
import { TcgplayerInventoryImportPanel } from "@/components/admin/TcgplayerInventoryImportPanel";
import { InventoryOwnerDashboard } from "@/components/admin/InventoryOwnerDashboard";
import { InventoryBrowser } from "@/components/admin/InventoryBrowser";
import { DeckBuilderSyncPanel } from "@/components/admin/DeckBuilderSyncPanel";
import {
  inventoryEffectiveQuantity,
  isBuybackInventoryItem,
} from "@/lib/inventory/status";

const INVENTORY_VIEWS = [
  { id: "stock", label: "On hand" },
  { id: "sold", label: "Sold" },
  { id: "purchases", label: "Purchases" },
] as const;

type InventoryView = (typeof INVENTORY_VIEWS)[number]["id"];

interface PurchaseTotals {
  cashTotal: number;
  tradeTotal: number;
  cashCount: number;
  tradeCount: number;
  cancelledCount: number;
}

export function ReportsInventorySection({
  initialView = "stock",
  onViewChange,
}: {
  initialView?: InventoryView;
  onViewChange?: (view: InventoryView) => void;
}) {
  const { loading: authLoading, activeStore } = useAdmin();
  const [view, setView] = useState<InventoryView>(initialView);
  const [onHandItems, setOnHandItems] = useState<InventoryItem[]>([]);
  const [onHandCards, setOnHandCards] = useState<ScannedCard[]>([]);
  const [soldItems, setSoldItems] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<BuybackTransaction[]>([]);
  const [totals, setTotals] = useState<PurchaseTotals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);

  function reloadInventory() {
    if (authLoading || !activeStore) return;
    setDashboardRefreshKey((k) => k + 1);
    Promise.all([
      adminFetch("/api/admin/inventory?status=on_hand").then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load inventory");
        setOnHandItems(data.items ?? []);
        setOnHandCards(data.cards ?? []);
      }),
      adminFetch("/api/admin/inventory?status=sold").then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load sold inventory");
        setSoldItems(data.items ?? []);
      }),
    ]).catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  }

  useEffect(() => {
    if (authLoading || !activeStore) return;
    setLoading(true);
    setError(null);
    Promise.all([
      adminFetch("/api/admin/inventory?status=on_hand").then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load inventory");
        setOnHandItems(data.items ?? []);
        setOnHandCards(data.cards ?? []);
      }),
      adminFetch("/api/admin/inventory?status=sold").then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load sold inventory");
        setSoldItems(data.items ?? []);
      }),
      adminFetch("/api/admin/purchases").then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load purchases");
        setTransactions(data.transactions ?? []);
        setTotals(data.totals ?? null);
      }),
    ])
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"))
      .finally(() => setLoading(false));
  }, [authLoading, activeStore]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  function switchView(next: InventoryView) {
    setView(next);
    onViewChange?.(next);
  }

  const totalPaid = onHandItems.reduce((s, i) => s + (i.purchasePrice ?? 0), 0);
  const totalMarket = onHandItems.reduce(
    (s, i) => s + (i.marketPrice ?? i.listPrice ?? 0) * inventoryEffectiveQuantity(i),
    0,
  );
  const totalUnits = onHandItems.reduce(
    (s, i) => s + inventoryEffectiveQuantity(i),
    0,
  );
  const buybackOnHand = onHandItems.filter(isBuybackInventoryItem);
  const soldTotal = soldItems.reduce((s, i) => s + (i.soldPrice ?? 0), 0);

  if (loading) return <p className="text-slate-500">Loading inventory report…</p>;
  if (error) {
    return (
      <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
    );
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Units on hand</p>
          <p className="text-2xl font-bold text-slate-900">{totalUnits}</p>
          <p className="text-xs text-slate-500">{onHandItems.length} rows</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Sold</p>
          <p className="text-2xl font-bold text-slate-900">{soldItems.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Total paid</p>
          <p className="text-2xl font-bold text-slate-900">${totalPaid.toFixed(2)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">Market value</p>
          <p className="text-2xl font-bold text-slate-900">${totalMarket.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-4">
        <InventoryOwnerDashboard refreshKey={dashboardRefreshKey} />
      </div>

      <div className="mt-4">
        <AdminSectionTabs
          sections={[...INVENTORY_VIEWS]}
          active={view}
          onChange={(id) => switchView(id as InventoryView)}
        />
      </div>

      {view === "stock" ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <TcgplayerInventoryImportPanel onImported={reloadInventory} />
            <ShopifyInventoryImportPanel onImported={reloadInventory} />
          </div>

          {buybackOnHand.length > 0 ? (
            <ShopifyInventoryExportPanel
              items={onHandItems}
              cards={onHandCards}
              onExported={reloadInventory}
            />
          ) : null}

          <InventoryBrowser refreshKey={dashboardRefreshKey} />

          <DeckBuilderSyncPanel />

          {onHandItems.length === 0 ? (
            <p className="text-center text-sm text-slate-500">
              No inventory on hand yet. Import from TCGplayer or Shopify above, or complete a
              buyback order with Cash or Trade.
            </p>
          ) : null}
        </div>
      ) : view === "sold" ? (
        <div className="mt-4">
          {soldItems.length === 0 ? (
            <p className="text-center text-slate-500">
              No sold cards yet. When Shopify marks an order paid, matching inventory
              will appear here automatically.
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-slate-600">
                Total sold revenue:{" "}
                <span className="font-semibold text-slate-900">
                  ${soldTotal.toFixed(2)}
                </span>
              </p>
              <ul className="space-y-2">
                {soldItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {item.frontImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.frontImageUrl}
                          alt=""
                          className="h-12 w-9 shrink-0 rounded object-cover"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-slate-900">
                          {item.displayName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.setName ?? item.orderNumber}
                          {item.cardNumber ? ` · #${item.cardNumber}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-emerald-700">
                        ${(item.soldPrice ?? 0).toFixed(2)}
                      </p>
                      <p className="text-xs capitalize text-slate-500">
                        {item.soldChannel ?? "shopify"}
                        {item.soldAt
                          ? ` · ${new Date(item.soldAt).toLocaleString()}`
                          : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="mt-4">
          {totals && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase text-gray-500">Cash paid</p>
                <p className="text-2xl font-bold text-gray-900">
                  ${totals.cashTotal.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">{totals.cashCount} orders</p>
              </div>
              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase text-gray-500">
                  Trade credit
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  ${totals.tradeTotal.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500">{totals.tradeCount} orders</p>
              </div>
              <div className="rounded-xl border bg-white p-4">
                <p className="text-xs font-semibold uppercase text-gray-500">Cancelled</p>
                <p className="text-2xl font-bold text-gray-900">
                  {totals.cancelledCount}
                </p>
                <p className="text-xs text-gray-500">no purchase</p>
              </div>
            </div>
          )}

          {transactions.length === 0 ? (
            <p className="mt-8 text-center text-gray-500">No completed purchases yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {transactions.map((tx) => (
                <li
                  key={tx.id}
                  className="rounded-xl border bg-white px-4 py-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/admin/orders/${tx.orderId}`}
                      className="font-medium text-indigo-600 hover:underline"
                    >
                      {tx.orderNumber}
                    </Link>
                    <span className="font-medium">
                      {tx.type === "cancelled" ? "—" : `$${tx.amount.toFixed(2)}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {new Date(tx.createdAt).toLocaleString()} ·{" "}
                    <span className="capitalize">{tx.type}</span> · {tx.cardCount} cards
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
