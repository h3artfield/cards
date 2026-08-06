"use client";

import Link from "next/link";
import { Button } from "@/components/Button";
import type { StoreStrategicReport } from "@/lib/reports/store-strategic-report";

export function StoreStrategicReportView({
  report,
}: {
  report: StoreStrategicReport;
}) {
  const generated = new Date(report.generatedAt).toLocaleString();
  const { buyingTrends: trends } = report;

  return (
    <div className="mt-6 space-y-6">
      <p className="text-xs text-slate-500">Generated {generated}</p>

      {report.insights.length > 0 && (
        <section className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-wide text-indigo-900">
            Strategic insights
          </h3>
          <ul className="mt-3 space-y-2">
            {report.insights.map((line) => (
              <li
                key={line}
                className="flex gap-2 text-sm leading-relaxed text-slate-800"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Open orders"
          value={String(report.orders.open)}
          sub={`${report.orders.total} total · $${report.orders.pipelineCash.toFixed(0)} cash pipeline`}
        />
        <MetricCard
          label="Buyback spend"
          value={`$${report.purchases.totalSpent.toFixed(2)}`}
          sub={`${report.purchases.cashCount} cash · ${report.purchases.tradeCount} trade`}
        />
        <MetricCard
          label="Inventory"
          value={String(report.inventory.count)}
          sub={
            report.inventory.avgMarginPercent != null
              ? `~${report.inventory.avgMarginPercent.toFixed(0)}% avg margin`
              : "No margin data yet"
          }
        />
        <MetricCard
          label="Analyzed cards"
          value={String(trends.analyzedCards)}
          sub={
            trends.analyzedCards > 0
              ? `${trends.buyCount} buy · ${trends.passCount} pass`
              : "Process orders for trends"
          }
        />
      </div>

      {trends.analyzedCards > 0 && (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Buying trends</h3>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Recommendations
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Pill label="Buy" count={trends.buyCount} tone="green" />
                <Pill label="Pass" count={trends.passCount} tone="red" />
                <Pill label="Review" count={trends.reviewCount} tone="gray" />
              </div>
              {trends.avgOfferToMarketRatio != null && (
                <p className="mt-3 text-sm text-slate-600">
                  Avg offer vs market:{" "}
                  <strong>
                    {Math.round(trends.avgOfferToMarketRatio * 100)}%
                  </strong>
                  {trends.avgMarginPercent != null && (
                    <>
                      {" "}
                      · Est. margin{" "}
                      <strong>{trends.avgMarginPercent.toFixed(0)}%</strong>
                    </>
                  )}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-500">
                Sentiment & turnover
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <MiniStat label="Bullish" value={trends.sentiment.bullish} />
                <MiniStat label="Bearish" value={trends.sentiment.bearish} />
                <MiniStat label="High turnover" value={trends.turnover.high} />
                <MiniStat label="Slow movers" value={trends.turnover.low} />
              </div>
            </div>
          </div>

          {trends.byCategory.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Volume by category
              </p>
              <ul className="mt-2 space-y-1.5">
                {trends.byCategory.map((row) => (
                  <li
                    key={row.category}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="capitalize text-slate-700">{row.category}</span>
                    <span className="text-slate-500">
                      {row.count} cards · ${row.marketTotal.toFixed(0)} market
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {trends.topSets.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase text-slate-500">
                Top sets submitted
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {trends.topSets.map((s) => (
                  <span
                    key={s.name}
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700"
                  >
                    {s.name} ({s.count})
                  </span>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Purchases</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Cash paid" value={`$${report.purchases.cashTotal.toFixed(2)}`} />
            <Row label="Trade credit" value={`$${report.purchases.tradeTotal.toFixed(2)}`} />
            <Row
              label="Avg cash order"
              value={
                report.purchases.avgCashOrder > 0
                  ? `$${report.purchases.avgCashOrder.toFixed(2)}`
                  : "—"
              }
            />
            <Row
              label="Avg cards / purchase"
              value={
                report.purchases.avgCardsPerPurchase > 0
                  ? report.purchases.avgCardsPerPurchase.toFixed(1)
                  : "—"
              }
            />
            <Row label="Cancelled" value={String(report.purchases.cancelledCount)} />
          </dl>
          {report.highlights.recentPurchases.length > 0 && (
            <ul className="mt-4 space-y-2 border-t pt-4 text-xs">
              {report.highlights.recentPurchases.map((tx) => (
                <li key={tx.orderNumber + tx.createdAt} className="text-slate-600">
                  {tx.orderNumber} · {tx.type} · ${tx.amount.toFixed(2)} ·{" "}
                  {tx.cardCount} cards
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Inventory</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Cards on hand" value={String(report.inventory.count)} />
            <Row label="Total paid" value={`$${report.inventory.totalPaid.toFixed(2)}`} />
            <Row label="Market value" value={`$${report.inventory.totalMarket.toFixed(2)}`} />
          </dl>
          {report.inventory.byCategory.length > 0 && (
            <ul className="mt-4 space-y-1.5 border-t pt-4 text-xs text-slate-600">
              {report.inventory.byCategory.map((row) => (
                <li key={row.category} className="flex justify-between capitalize">
                  <span>{row.category}</span>
                  <span>
                    {row.count} · ${row.paidTotal.toFixed(0)} paid
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Pricing & rules</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <MiniStat
            label="Default cash %"
            value={report.pricingConfig.defaultCashPercent}
            suffix="%"
          />
          <MiniStat
            label="Default trade %"
            value={report.pricingConfig.defaultTradePercent}
            suffix="%"
          />
          <MiniStat
            label="Slab cash %"
            value={report.pricingConfig.slabCashPercent}
            suffix="%"
          />
          <MiniStat
            label="Min offer"
            value={`$${report.pricingConfig.minimumOffer}`}
          />
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Condition multipliers: NM {report.pricingConfig.conditionMultipliers.NM} · LP{" "}
          {report.pricingConfig.conditionMultipliers.LP} · MP{" "}
          {report.pricingConfig.conditionMultipliers.MP} · HP{" "}
          {report.pricingConfig.conditionMultipliers.HP} · DMG{" "}
          {report.pricingConfig.conditionMultipliers.DMG}
        </p>
        {report.activeRules.length > 0 ? (
          <ul className="mt-4 space-y-2 border-t pt-4">
            {report.activeRules.map((rule) => (
              <li key={rule.id} className="text-sm">
                <span className="font-medium text-slate-800">{rule.title}</span>
                <span className="ml-2 text-xs uppercase text-slate-500">
                  {rule.ruleType.replace(/_/g, " ")}
                </span>
                {rule.categories.length > 0 && (
                  <span className="ml-2 text-xs text-slate-400">
                    ({rule.categories.join(", ")})
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-slate-500">No active store rules.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Link href="/admin/pricing?section=rules" className="text-indigo-600 hover:underline">
            Edit rules
          </Link>
          <span className="text-slate-300">·</span>
          <Link href="/admin/pricing?section=buy" className="text-indigo-600 hover:underline">
            Buy percentages
          </Link>
          <span className="text-slate-300">·</span>
          <Link href="/admin/reports?section=inventory" className="text-indigo-600 hover:underline">
            View inventory
          </Link>
          <span className="text-slate-300">·</span>
          <Link href="/admin/reports?section=inventory&view=purchases" className="text-indigo-600 hover:underline">
            Purchase ledger
          </Link>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-slate-900">Order pipeline</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(report.orders.byStatus).map(([status, count]) => (
            <span
              key={status}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs capitalize text-slate-700"
            >
              {status.replace(/_/g, " ")}: {count}
            </span>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Pipeline exposure: ${report.orders.pipelineMarket.toFixed(2)} market · $
          {report.orders.pipelineCash.toFixed(2)} cash offers on open orders.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Per-card buyback reports are on each order — open an order to review AI
          analysis for individual cards.
        </p>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{sub}</p>
    </div>
  );
}

function Pill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "green" | "red" | "gray";
}) {
  const colors = {
    green: "bg-emerald-100 text-emerald-800",
    red: "bg-red-100 text-red-800",
    gray: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${colors[tone]}`}>
      {label}: {count}
    </span>
  );
}

function MiniStat({
  label,
  value,
  suffix = "",
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="font-semibold text-slate-900">
        {value}
        {suffix}
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
