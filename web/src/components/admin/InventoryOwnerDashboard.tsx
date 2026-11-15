"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/api-client";
import {
  conicGradientFromSlices,
  gameColor,
  placementColor,
  priceTierColor,
  type InventoryAnalytics,
  type LocationStats,
} from "@/lib/inventory/analytics";
import type { InventoryImportSnapshot } from "@/lib/inventory/import-snapshots";
import { SHELF_CONTENTS_V1 } from "@/lib/inventory/shelf-location";

type Metric = "units" | "value";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function MetricToggle({ metric, onChange }: { metric: Metric; onChange: (m: Metric) => void }) {
  return (
    <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-[11px]">
      {(["units", "value"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`rounded px-2 py-0.5 font-medium ${
            metric === m ? "bg-indigo-600 font-semibold text-slate-50" : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {m === "units" ? "Units" : "Value"}
        </button>
      ))}
    </div>
  );
}

function PieChart({
  title,
  slices,
  colorFor,
  selected,
  onSelect,
}: {
  title: string;
  slices: InventoryAnalytics["byGame"];
  colorFor: (label: string) => string;
  selected?: string;
  onSelect?: (label: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>("units");
  const visible = slices.filter((s) => (metric === "value" ? s.value : s.units) > 0);

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <MetricToggle metric={metric} onChange={setMetric} />
      </div>
      {visible.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No inventory data yet.</p>
      ) : (
        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-20 w-20 shrink-0 rounded-full ring-1 ring-slate-200"
            style={{ background: conicGradientFromSlices(visible, colorFor, metric) }}
            aria-hidden
          />
          <ul className="min-w-0 flex-1 space-y-0.5 text-xs">
            {visible.map((slice) => {
              const pct = metric === "value" ? slice.valuePct : slice.pct;
              const detail = metric === "value" ? money(slice.value) : slice.units.toLocaleString();
              const active = selected === slice.label;
              const content = (
                <>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colorFor(slice.label) }}
                    />
                    <span className={`truncate ${active ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                      {slice.label}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {pct.toFixed(1)}% · {detail}
                  </span>
                </>
              );
              return (
                <li key={slice.label}>
                  {onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(slice.label)}
                      className={`flex w-full items-center justify-between gap-2 rounded px-1 text-left hover:bg-slate-100 ${
                        active ? "bg-slate-100" : ""
                      }`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-center justify-between gap-2 px-1">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ImportTrendChart({ snapshots }: { snapshots: InventoryImportSnapshot[] }) {
  const ordered = [...snapshots].reverse();
  if (ordered.length < 2) return null;

  const maxUnits = Math.max(...ordered.map((s) => s.totalUnits), 1);

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">
        Import trend <span className="text-xs font-normal text-slate-500">· units in stock after each import</span>
      </p>
      <div className="mt-2 flex items-end gap-1.5 overflow-x-auto pb-1">
        {ordered.map((snap) => {
          const height = Math.max(6, (snap.totalUnits / maxUnits) * 48);
          const label = new Date(snap.importedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
          return (
            <div
              key={snap.id}
              className="flex min-w-[2.5rem] flex-col items-center gap-1"
              title={`${label}: ${snap.totalUnits.toLocaleString()} units · +${snap.created} new / ${snap.updated} updated`}
            >
              <span className="text-[10px] tabular-nums text-slate-500">{snap.totalUnits.toLocaleString()}</span>
              <div className="w-7 rounded-t bg-sky-500/80" style={{ height: `${height}px` }} />
              <span className="text-[10px] text-slate-500">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function signedPct(n: number): string {
  const rounded = Math.round(n);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function LocationTable({
  kind,
  onKindChange,
  locations,
}: {
  kind: "case" | "binder";
  onKindChange: (k: "case" | "binder") => void;
  locations: LocationStats[];
}) {
  const rows = locations.filter((l) => l.kind === kind);
  const stocked = rows.filter((l) => l.units > 0);
  const totalUnits = rows.reduce((s, l) => s + l.units, 0);
  const totalValue = rows.reduce((s, l) => s + l.value, 0);
  const avg = stocked.length ? totalUnits / stocked.length : 0;
  const maxUnits = Math.max(...rows.map((l) => l.units), 1);
  const totalSold = rows.reduce((s, l) => s + l.sold30, 0);

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-xs">
          {(["case", "binder"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onKindChange(k)}
              className={`rounded px-3 py-1 font-medium ${
                kind === k ? "bg-indigo-600 font-semibold text-slate-50" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {k === "case" ? "Cases" : "Binders"}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {totalUnits.toLocaleString()} units · {money(totalValue)} · avg{" "}
          {Math.round(avg).toLocaleString()} per {kind === "case" ? "shelf" : "binder"}
        </p>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
              <th className="py-1 pr-2 font-medium">{kind === "case" ? "Shelf" : "Binder"}</th>
              <th className="py-1 pr-2 text-right font-medium">Units</th>
              <th className="py-1 pr-2 text-right font-medium">Value</th>
              <th className="w-1/4 py-1 pr-2 font-medium">Share</th>
              <th className="py-1 pr-2 text-right font-medium" title="Units compared with the average stocked spot">
                vs avg
              </th>
              <th className="py-1 pr-2 text-right font-medium">Sold 30d</th>
              <th className="py-1 pr-2 text-right font-medium" title="Sold in 30 days ÷ (sold + still in stock)">
                Sell-through
              </th>
              <th className="py-1 text-right font-medium" title="Price changed; belongs somewhere else now">
                To move
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((l) => {
              const share = totalUnits ? (l.units / totalUnits) * 100 : 0;
              const vsAvg = avg && l.units ? ((l.units - avg) / avg) * 100 : null;
              const sellThrough = l.sold30 + l.units ? (l.sold30 / (l.sold30 + l.units)) * 100 : null;
              const contents = SHELF_CONTENTS_V1[l.location];
              const bareName = l.location.replace(/^Binder /, "").replace(/ Binder$/, "");
              return (
                <tr key={l.location} className={l.units ? "" : "text-slate-400"}>
                  <td className="py-1 pr-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-slate-300"
                        style={{ background: contents?.swatch ?? "#94a3b8" }}
                      />
                      <span className="font-medium text-slate-800">{l.location}</span>
                      {contents && contents.label !== bareName ? (
                        <span className="text-slate-500">· {contents.label}</span>
                      ) : null}
                    </span>
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{l.units.toLocaleString()}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{l.units ? money(l.value) : "—"}</td>
                  <td className="py-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                        <div
                          className={`h-1.5 rounded-full ${kind === "case" ? "bg-indigo-500" : "bg-sky-500"}`}
                          style={{ width: `${(l.units / maxUnits) * 100}%` }}
                        />
                      </div>
                      <span className="w-9 text-right tabular-nums text-slate-500">{share.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td
                    className={`py-1 pr-2 text-right tabular-nums ${
                      vsAvg == null ? "" : vsAvg >= 0 ? "text-emerald-600" : "text-rose-600"
                    }`}
                  >
                    {vsAvg == null ? "—" : signedPct(vsAvg)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{l.sold30 || "—"}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {sellThrough == null || !l.sold30 ? "—" : `${sellThrough.toFixed(0)}%`}
                  </td>
                  <td className={`py-1 text-right tabular-nums ${l.needsMove ? "font-semibold text-amber-600" : ""}`}>
                    {l.needsMove || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalSold === 0 ? (
        <p className="mt-2 text-[11px] text-slate-500">
          Sales columns fill in as cards sell at the register or on Shopify.
        </p>
      ) : null}
    </div>
  );
}

function SalesByTier({ analytics }: { analytics: InventoryAnalytics }) {
  const maxSold = Math.max(...analytics.salesByTier.map((t) => t.sold30), 1);
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">
        Sold last 30 days{" "}
        <span className="text-xs font-normal text-slate-500">
          · {analytics.sold30Units.toLocaleString()} units · {money(analytics.sold30Revenue)}
        </span>
      </p>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
            <th className="py-1 pr-2 font-medium">Tier</th>
            <th className="w-1/3 py-1 pr-2 font-medium">Sold</th>
            <th className="py-1 pr-2 text-right font-medium">Revenue</th>
            <th className="py-1 text-right font-medium">Sell-through</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {analytics.salesByTier.map((t) => {
            const through = t.sold30 + t.inStock ? (t.sold30 / (t.sold30 + t.inStock)) * 100 : 0;
            return (
              <tr key={t.label}>
                <td className="py-1 pr-2">
                  <span className="flex items-center gap-1.5 text-slate-800">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: priceTierColor(t.label) }} />
                    {t.label}
                  </span>
                </td>
                <td className="py-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 rounded-full bg-slate-100">
                      <div
                        className="h-1.5 rounded-full"
                        style={{ width: `${(t.sold30 / maxSold) * 100}%`, backgroundColor: priceTierColor(t.label) }}
                      />
                    </div>
                    <span className="w-8 text-right tabular-nums text-slate-600">{t.sold30}</span>
                  </div>
                </td>
                <td className="py-1 pr-2 text-right tabular-nums">{t.revenue30 ? money(t.revenue30) : "—"}</td>
                <td className="py-1 text-right tabular-nums">{t.sold30 ? `${through.toFixed(0)}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const AGING_COLORS = ["#10b981", "#facc15", "#f97316", "#ef4444"];

function AgingBar({ analytics }: { analytics: InventoryAnalytics }) {
  const [metric, setMetric] = useState<Metric>("units");
  const total = analytics.aging.reduce((s, b) => s + (metric === "units" ? b.units : b.value), 0);
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900">
          How long it&apos;s been sitting
        </p>
        <MetricToggle metric={metric} onChange={setMetric} />
      </div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
        {analytics.aging.map((b, idx) => {
          const v = metric === "units" ? b.units : b.value;
          return total && v ? (
            <div
              key={b.label}
              style={{ width: `${(v / total) * 100}%`, backgroundColor: AGING_COLORS[idx] }}
              title={b.label}
            />
          ) : null;
        })}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
        {analytics.aging.map((b, idx) => {
          const v = metric === "units" ? b.units : b.value;
          return (
            <li key={b.label} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-slate-700">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: AGING_COLORS[idx] }} />
                {b.label}
              </span>
              <span className="tabular-nums text-slate-500">
                {total ? ((v / total) * 100).toFixed(0) : 0}% ·{" "}
                {metric === "units" ? b.units.toLocaleString() : money(b.value)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">Counted from when each card was first added to inventory.</p>
    </div>
  );
}

export function InventoryOwnerDashboard({ refreshKey }: { refreshKey: number }) {
  const [analytics, setAnalytics] = useState<InventoryAnalytics | null>(null);
  const [importTrends, setImportTrends] = useState<InventoryImportSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationKind, setLocationKind] = useState<"case" | "binder">("case");

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

  const stats: Array<{ value: string; label: string; note?: string }> = [
    { value: analytics.totalUnits.toLocaleString(), label: "Units in stock" },
    { value: analytics.inStockRows.toLocaleString(), label: "Different cards" },
    { value: money(analytics.totalListValue), label: "List value" },
    { value: money(analytics.totalMarketValue), label: "TCG market value" },
    {
      value: analytics.sold30Units.toLocaleString(),
      label: "Sold last 30 days",
      note: analytics.sold30Units ? money(analytics.sold30Revenue) : undefined,
    },
    {
      value: analytics.needsMoveRows.toLocaleString(),
      label: "Cards to move",
      note: analytics.needsMoveRows ? "see Cards to move below" : undefined,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-indigo-600/40 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">
          Store inventory snapshot
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {stats.map((s) => (
            <div key={s.label}>
              <p className="text-xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-600">
                {s.label}
                {s.note ? <span className="block text-slate-500">{s.note}</span> : null}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-200 pt-2 text-xs text-slate-600">
          <span>
            Shopify listed:{" "}
            <strong className="text-slate-900">{analytics.listedShopifyRows.toLocaleString()}</strong>
          </span>
          <span title="Cards under 60¢ market go in the bulk box instead of a binder">
            Bulk box (under 60¢):{" "}
            <strong className="text-slate-900">{analytics.bulkUnits.toLocaleString()} units</strong>
          </span>
          {analytics.noLocationRows ? (
            <span title="No price or color info yet, so the location rules couldn't place them">
              No location: <strong className="text-amber-500">{analytics.noLocationRows.toLocaleString()}</strong>
            </span>
          ) : null}
          {analytics.imagesPendingRows ? (
            <span>
              Images pending:{" "}
              <strong className="text-slate-900">{analytics.imagesPendingRows.toLocaleString()}</strong>
            </span>
          ) : null}
        </div>
      </div>

      <ImportTrendChart snapshots={importTrends} />

      <div className={`grid gap-3 ${analytics.byGame.length > 1 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
        <PieChart title="Price tier" slices={analytics.byPriceTier} colorFor={priceTierColor} />
        <PieChart
          title="Where it lives"
          slices={analytics.byPlacement}
          colorFor={placementColor}
          selected={locationKind === "case" ? "Cases" : "Binders"}
          onSelect={(label) => {
            if (label === "Cases") setLocationKind("case");
            if (label === "Binders") setLocationKind("binder");
          }}
        />
        {analytics.byGame.length > 1 ? (
          <PieChart title="By game" slices={analytics.byGame} colorFor={gameColor} />
        ) : null}
      </div>

      <LocationTable kind={locationKind} onKindChange={setLocationKind} locations={analytics.locations} />

      <div className="grid gap-3 lg:grid-cols-2">
        <SalesByTier analytics={analytics} />
        <AgingBar analytics={analytics} />
      </div>
    </div>
  );
}
