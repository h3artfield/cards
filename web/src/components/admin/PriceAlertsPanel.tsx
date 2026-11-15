"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { InventoryPriceAlertV1, PriceRunReportV1 } from "@/lib/pricing/nightly-price-refresh";

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** Cards whose shelf price moved more than 20% in the overnight JustTCG refresh. */
export function PriceAlertsPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [alerts, setAlerts] = useState<InventoryPriceAlertV1[]>([]);
  const [lastRun, setLastRun] = useState<PriceRunReportV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch("/api/admin/inventory/price-alerts");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load price alerts");
      setAlerts(data.alerts ?? []);
      setLastRun(data.lastRun ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load price alerts");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / refresh
    void load();
  }, [load, refreshKey]);

  async function dismiss(body: { ids: string[] } | { all: true }) {
    setBusy(true);
    try {
      const res = await adminFetch("/api/admin/inventory/price-alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Dismiss failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setRunning(true);
    setError(null);
    try {
      const res = await adminFetch("/api/cron/inventory-prices", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Price refresh failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Price refresh failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Price alerts{alerts.length ? ` (${alerts.length})` : ""}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            JustTCG market prices refresh overnight and new shelf prices go straight to Shopify. Cards that moved more
            than 20% either way are listed here.
          </p>
          {lastRun ? (
            <p className="mt-1 text-xs text-slate-500">
              Last run {lastRun.runDate}: {lastRun.priced.toLocaleString()} priced, {lastRun.changed.toLocaleString()}{" "}
              changed
              {lastRun.unpriced ? `, ${lastRun.unpriced.toLocaleString()} with no JustTCG price` : ""}
              {lastRun.shopifyFailed ? `, ${lastRun.shopifyFailed} Shopify updates failed` : ""}
              {lastRun.finished ? "" : " (still running)"}
              {lastRun.lastError ? ` · Error: ${lastRun.lastError}` : ""}
            </p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={running} onClick={() => void runNow()}>
            {running ? "Refreshing…" : "Refresh prices now"}
          </Button>
          {alerts.length ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void dismiss({ all: true })}>
              Dismiss all
            </Button>
          ) : null}
        </div>
      </div>

      {error ? <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}

      {alerts.length ? (
        <div className="mt-3 max-h-72 overflow-auto rounded-lg border">
          <table className="min-w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-2">Card</th>
                <th className="px-2 py-2">Price</th>
                <th className="px-2 py-2">Change</th>
                <th className="px-2 py-2">TCG market</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-2 py-2">
                    <p className="font-medium text-slate-900">{a.displayName}</p>
                    <p className="text-slate-500">
                      {a.condition} · {a.runDate}
                    </p>
                  </td>
                  <td className="px-2 py-2">
                    {money(a.previousPrice)} → <strong>{money(a.newPrice)}</strong>
                  </td>
                  <td className={`px-2 py-2 font-semibold ${a.change > 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {a.change > 0 ? "+" : ""}
                    {Math.round(a.change * 100)}%
                  </td>
                  <td className="px-2 py-2 text-slate-500">
                    {a.previousMarket != null ? `${money(a.previousMarket)} → ` : ""}
                    {money(a.newMarket)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      className="text-xs font-medium text-sky-700 hover:underline"
                      onClick={() => void dismiss({ ids: [a.id] })}
                    >
                      Dismiss
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No price alerts.</p>
      )}
    </div>
  );
}
