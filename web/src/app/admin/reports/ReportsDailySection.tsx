"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/api-client";
import { describeShelfChange } from "@/lib/inventory/shelf-row-edit";
import type { DailyReport, DailyReportSummary } from "@/lib/reports/daily-reports";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function dayLabel(date: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, opts);
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const CHANNEL_LABEL: Record<string, string> = {
  in_store: "In store",
  shopify: "Online",
  ebay: "eBay",
  tcgplayer: "TCGplayer",
  other: "Other",
};

/** `initialDay` ("2026-11-12") opens that day when the report has it, else the latest day. */
export function ReportsDailySection({ initialDay = null }: { initialDay?: string | null }) {
  const [days, setDays] = useState<DailyReportSummary[]>([]);
  const [report, setReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (date?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/reports/daily${date ? `?date=${date}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load daily reports");
      setDays(data.days ?? []);
      setReport(data.report ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(initialDay ?? undefined);
  }, [load, initialDay]);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-2 lg:max-h-[75vh] lg:overflow-y-auto">
        {days.length === 0 && !loading ? <p className="p-3 text-sm text-slate-500">No days yet.</p> : null}
        <ul className="space-y-1">
          {days.map((d) => {
            const active = report?.date === d.date;
            return (
              <li key={d.date}>
                <button
                  type="button"
                  onClick={() => void load(d.date)}
                  className={`w-full rounded-lg px-3 py-2 text-left ${
                    active ? "bg-indigo-600 text-slate-50" : "text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <div className="text-sm font-semibold">
                    {dayLabel(d.date, { weekday: "short", month: "short", day: "numeric" })}
                  </div>
                  <div className={`mt-0.5 text-xs ${active ? "text-slate-50" : "text-slate-500"}`}>
                    {[
                      d.salesUnits ? `${d.salesUnits} sold · ${money.format(d.revenue)}` : "No sales",
                      d.priceAlerts ? `${d.priceAlerts} price ${d.priceAlerts === 1 ? "move" : "moves"}` : null,
                      d.manualChanges ? `${d.manualChanges} ${d.manualChanges === 1 ? "edit" : "edits"}` : null,
                      d.moves ? `${d.moves} to move` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="min-w-0">
        {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
        {loading && !report ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {report ? <DayDetail report={report} loading={loading} /> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <h4 className="border-b border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-800">
        {title}
        {count != null ? <span className="ml-2 font-normal text-slate-500">{count}</span> : null}
      </h4>
      <div className="px-4 py-3 text-sm text-slate-700">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-slate-500">{children}</p>;
}

function DayDetail({ report, loading }: { report: DailyReport; loading: boolean }) {
  const { sales, monthToDate } = report;
  const monthName = dayLabel(report.date, { month: "long" });
  return (
    <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
      <h3 className="text-lg font-bold text-slate-900">
        {dayLabel(report.date, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      </h3>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sales" value={money.format(sales.revenue)} sub={`${sales.units} cards`} />
        <Stat
          label="In store / online"
          value={`${sales.inStore.units} / ${sales.online.units}`}
          sub={`${money.format(sales.inStore.revenue)} / ${money.format(sales.online.revenue)}`}
        />
        <Stat
          label={`${monthName} to date`}
          value={money.format(monthToDate.revenue)}
          sub={`${monthToDate.units} cards`}
        />
        <Stat
          label="Price check"
          value={report.priceRun ? `${report.priceRun.changed} changed` : "Didn't run"}
          sub={report.priceRun ? `${report.priceRun.priced} cards checked` : undefined}
        />
      </div>

      <Panel title="Sales" count={sales.lines.length}>
        {sales.lines.length === 0 ? (
          <Empty>No sales this day.</Empty>
        ) : (
          <table className="w-full text-left">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 font-medium">Time</th>
                <th className="py-1 font-medium">Card</th>
                <th className="py-1 font-medium">Cond.</th>
                <th className="py-1 font-medium">Where</th>
                <th className="py-1 text-right font-medium">Qty</th>
                <th className="py-1 text-right font-medium">Each</th>
              </tr>
            </thead>
            <tbody>
              {sales.lines.map((s, i) => (
                <tr key={`${s.inventoryItemId}-${s.at}-${i}`} className="border-t border-slate-100">
                  <td className="py-1.5 whitespace-nowrap text-slate-500">{timeLabel(s.at)}</td>
                  <td className="py-1.5">
                    <div className="font-medium text-slate-800">{s.name}</div>
                    <div className="text-xs text-slate-500">
                      {[s.setName, s.location].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="py-1.5">{s.condition}</td>
                  <td className="py-1.5">{CHANNEL_LABEL[s.channel] ?? s.channel}</td>
                  <td className="py-1.5 text-right">{s.quantity}</td>
                  <td className="py-1.5 text-right">{money.format(s.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Big price moves (20%+ and $1+)" count={report.priceAlerts.length}>
        {report.priceAlerts.length === 0 ? (
          <Empty>{report.priceRun ? "No big price moves." : "The nightly price check didn't run this day."}</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {report.priceAlerts.map((a) => (
              <li key={a.inventoryItemId} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-800">{a.displayName}</span>
                  {a.condition ? <span className="text-slate-500"> · {a.condition}</span> : null}
                </span>
                <span className="shrink-0 whitespace-nowrap">
                  {money.format(a.previousPrice)} → {money.format(a.newPrice)}{" "}
                  <span className={`font-semibold ${a.change >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {a.change >= 0 ? "+" : ""}
                    {Math.round(a.change * 100)}%
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Manual changes" count={report.manualChanges.length}>
        {report.manualChanges.length === 0 ? (
          <Empty>No edits on the inventory sheet this day.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {report.manualChanges.map((c, i) => (
              <li key={`${c.inventoryItemId}-${c.at}-${i}`} className="flex gap-3 py-1.5">
                <span className="w-16 shrink-0 text-slate-500">{timeLabel(c.at)}</span>
                <span className="min-w-0">
                  <span className="font-medium text-slate-800">{c.name}</span>
                  <span className="text-slate-600"> — {describeShelfChange(c)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Cards to move" count={report.moveSuggestions.length}>
        {report.moveSuggestions.length === 0 ? (
          <Empty>No new cards to move from this day&apos;s price check.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {report.moveSuggestions.map((m) => (
              <li key={m.inventoryItemId} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate font-medium text-slate-800">{m.name}</span>
                <span className="shrink-0 whitespace-nowrap">
                  {m.from || "No location"} → <span className="font-semibold">{m.to}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {report.imports.length || report.pickups.placed || report.pickups.paid ? (
        <Panel title="Other activity">
          <ul className="space-y-1">
            {report.imports.map((imp) => (
              <li key={imp.at}>
                {timeLabel(imp.at)} — Import: {imp.created} new, {imp.updated} updated, {imp.withdrawn} removed (
                {imp.totalUnits} cards in stock after)
              </li>
            ))}
            {report.pickups.placed ? <li>{report.pickups.placed} pickup orders placed</li> : null}
            {report.pickups.paid ? <li>{report.pickups.paid} pickup orders paid</li> : null}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
