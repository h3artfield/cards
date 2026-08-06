"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/api-client";
import {
  conicGradientFromSlices,
  formatColor,
  gameColor,
  priceTierColor,
  type InventoryAnalytics,
} from "@/lib/inventory/analytics";
import type { InventoryImportSnapshot } from "@/lib/inventory/import-snapshots";

function PieChart({
  title,
  slices,
  colorFor,
  metric,
}: {
  title: string;
  slices: InventoryAnalytics["byGame"];
  colorFor: (label: string) => string;
  metric: "units" | "value";
}) {
  if (!slices.length) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-4 text-sm text-slate-500">No inventory data yet.</p>
      </div>
    );
  }

  const gradient = conicGradientFromSlices(slices, colorFor, metric);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="mx-auto h-36 w-36 shrink-0 rounded-full ring-1 ring-slate-200"
          style={{ background: gradient }}
          aria-hidden
        />
        <ul className="min-w-0 flex-1 space-y-1.5 text-xs">
          {slices.map((slice) => {
            const pct = metric === "value" ? slice.valuePct : slice.pct;
            const detail =
              metric === "value"
                ? `$${slice.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                : `${slice.units.toLocaleString()} units`;
            return (
              <li key={slice.label} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(slice.label) }}
                  />
                  <span className="truncate text-slate-700">{slice.label}</span>
                </span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {pct.toFixed(1)}% · {detail}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ImportTrendChart({ snapshots }: { snapshots: InventoryImportSnapshot[] }) {
  const ordered = [...snapshots].reverse();
  if (ordered.length < 2) return null;

  const maxUnits = Math.max(...ordered.map((s) => s.totalUnits), 1);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">Import trend</p>
      <p className="text-xs text-slate-500">Units in stock after each CSV import</p>
      <div className="mt-4 flex items-end gap-1.5 overflow-x-auto pb-1">
        {ordered.map((snap) => {
          const height = Math.max(8, (snap.totalUnits / maxUnits) * 96);
          const label = new Date(snap.importedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
          return (
            <div
              key={snap.id}
              className="flex min-w-[2.5rem] flex-col items-center gap-1"
              title={`${label}: ${snap.totalUnits.toLocaleString()} units · +${snap.created} / ~${snap.updated} updated`}
            >
              <div
                className="w-8 rounded-t bg-sky-500/80"
                style={{ height: `${height}px` }}
              />
              <span className="text-[10px] text-slate-500">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function InventoryOwnerDashboard({ refreshKey }: { refreshKey: number }) {
  const [analytics, setAnalytics] = useState<InventoryAnalytics | null>(null);
  const [importTrends, setImportTrends] = useState<InventoryImportSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    adminFetch("/api/admin/inventory/analytics")
      .then((r) => r.json())
      .then((d) => {
        setAnalytics(d.analytics ?? null);
        setImportTrends(d.importTrends ?? []);
      })
      .catch(() => {
        setAnalytics(null);
        setImportTrends([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading && !analytics) {
    return (
      <p className="rounded-xl border bg-white p-4 text-sm text-slate-500 shadow-sm">
        Loading inventory dashboard…
      </p>
    );
  }

  if (!analytics || analytics.totalRows === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-gradient-to-br from-slate-900 to-slate-800 p-4 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          Store inventory snapshot
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div>
            <p className="text-2xl font-bold">{analytics.totalUnits.toLocaleString()}</p>
            <p className="text-xs text-slate-300">Units in stock</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{analytics.totalRows.toLocaleString()}</p>
            <p className="text-xs text-slate-300">
              SKUs ({analytics.catalogRows.toLocaleString()} catalog @ 0 qty)
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              ${analytics.totalListValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-slate-300">List value (in stock)</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              ${analytics.totalTcgLowValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-slate-300">
              TCG low value
              {analytics.tcgLowPricedRows < analytics.totalRows ? (
                <span className="block text-slate-400">
                  {analytics.tcgLowPricedRows.toLocaleString()} of{" "}
                  {analytics.totalRows.toLocaleString()} from CSV — re-import to
                  refresh
                </span>
              ) : null}
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              ${analytics.totalMarketValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-slate-300">TCG market value</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-700 pt-3 text-xs text-slate-300">
          <span>
            Shopify listed:{" "}
            <strong className="text-white">
              {analytics.listedShopifyRows.toLocaleString()}
            </strong>
          </span>
          <span>
            Images cached:{" "}
            <strong className="text-white">
              {analytics.imagesCachedRows.toLocaleString()}
            </strong>
          </span>
          <span>
            Images pending:{" "}
            <strong className="text-white">
              {analytics.imagesPendingRows.toLocaleString()}
            </strong>
          </span>
        </div>
      </div>

      <ImportTrendChart snapshots={importTrends} />

      <div className="grid gap-3 lg:grid-cols-2">
        <PieChart
          title="By price tier (% of units)"
          slices={analytics.byPriceTier}
          colorFor={priceTierColor}
          metric="units"
        />
        <PieChart
          title="By price tier (% of list value)"
          slices={analytics.byPriceTier}
          colorFor={priceTierColor}
          metric="value"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <PieChart
          title="By game (% of units)"
          slices={analytics.byGame}
          colorFor={gameColor}
          metric="units"
        />
        <PieChart
          title="By format (% of units)"
          slices={analytics.byFormat}
          colorFor={formatColor}
          metric="units"
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <PieChart
          title="By game (% of list value)"
          slices={analytics.byGame}
          colorFor={gameColor}
          metric="value"
        />
        <PieChart
          title="By format (% of list value)"
          slices={analytics.byFormat}
          colorFor={formatColor}
          metric="value"
        />
      </div>
    </div>
  );
}
