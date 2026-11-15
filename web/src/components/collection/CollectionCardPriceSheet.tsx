"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import type { CollectionCardPricePayload } from "@/lib/collection/collection-price";
import { isCollectionCommander } from "@/lib/collection/collection-binder";
import {
  prefillProfessorCommander,
  professorSetupPath,
} from "@/lib/collection/collection-professor-build";
import {
  MARKET_TONE_LABELS,
  monthlySalesFromPoints,
  type MonthlySalesSeries,
} from "@/lib/prices/market-tone";
import {
  authButton,
  authButtonSecondary,
  authError,
  authSubtext,
} from "@/lib/customer-auth-ui";
import type { CollectionCard } from "@/lib/types";

function money(n?: number): string {
  if (n == null) return "—";
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

function nicePriceTicks(min: number, max: number): number[] {
  if (!(max > min)) return [Number(min.toFixed(2))];
  const pad = (max - min) * 0.12;
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const rawStep = (hi - lo) / 2;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep || 1));
  const residual = rawStep / magnitude;
  const step =
    residual >= 5 ? 5 * magnitude : residual >= 2 ? 2 * magnitude : magnitude;
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let value = start; value <= hi + step / 4; value += step) {
    ticks.push(Number(value.toFixed(2)));
    if (ticks.length >= 4) break;
  }
  return ticks;
}

function pct(n?: number): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function formatAxisDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function axisTickIndexes(count: number): number[] {
  if (count <= 4) return [...Array(count).keys()];
  const last = count - 1;
  return [...new Set([0, Math.round(last / 3), Math.round((2 * last) / 3), last])];
}

function PriceSparkline({
  points,
}: {
  points: { date: string; value: number }[];
}) {
  if (points.length < 2) {
    return (
      <p className={authSubtext}>
        Not enough daily snapshots yet for a chart.
      </p>
    );
  }

  const width = 340;
  const height = 148;
  const padLeft = 44;
  const padRight = 10;
  const padTop = 16;
  const padBottom = 28;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const priceTicks = nicePriceTicks(min, max);
  const axisMin = Math.min(min, ...priceTicks);
  const axisMax = Math.max(max, ...priceTicks);
  const span = axisMax - axisMin || 1;
  const last = points.length - 1;
  const xFor = (i: number) =>
    padLeft + (i / last) * (width - padLeft - padRight);
  const yFor = (value: number) =>
    padTop + (1 - (value - axisMin) / span) * (height - padTop - padBottom);
  const coords = points.map((p, i) => `${xFor(i)},${yFor(p.value)}`);
  const ticks = axisTickIndexes(points.length);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-3 w-full text-[var(--accent)]"
      role="img"
      aria-label="Price history in dollars by date"
    >
      <text
        x={4}
        y={12}
        className="fill-neutral-500"
        fontSize="9"
      >
        Price
      </text>
      {priceTicks.map((price, index) => (
        <g key={`price-${index}`}>
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={yFor(price)}
            y2={yFor(price)}
            className="stroke-neutral-800"
            strokeWidth="1"
          />
          <text
            x={padLeft - 6}
            y={yFor(price) + 3}
            textAnchor="end"
            className="fill-neutral-400"
            fontSize="10"
          >
            {money(price)}
          </text>
        </g>
      ))}
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={coords.join(" ")}
      />
      {ticks.map((index) => {
        const x = xFor(index);
        const anchor =
          index === 0 ? "start" : index === last ? "end" : "middle";
        return (
          <text
            key={`${points[index]!.date}-${index}`}
            x={x}
            y={height - 6}
            textAnchor={anchor}
            className="fill-neutral-400"
            fontSize="10"
          >
            {formatAxisDate(points[index]!.date)}
          </text>
        );
      })}
    </svg>
  );
}

function SalesByMonth({ series }: { series: MonthlySalesSeries }) {
  const max = Math.max(...series.buckets.map((bucket) => bucket.sales), 1);

  return (
    <div className="mt-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        Sales by month
      </p>
      <div className="mt-2 flex items-end justify-center gap-6">
        {series.buckets.map((bucket) => {
          const pctHeight = Math.max(6, Math.round((bucket.sales / max) * 100));
          return (
            <div key={bucket.month} className="flex w-14 flex-col items-center">
              <p className="mb-1 text-[10px] tabular-nums text-neutral-400">
                {bucket.sales}
              </p>
              <div className="flex h-24 w-8 items-end">
                <div
                  className="w-full rounded-sm bg-[var(--accent)]/80"
                  style={{ height: `${pctHeight}%` }}
                  title={`${bucket.label}: ${bucket.sales}`}
                />
              </div>
              <p className="mt-1 text-[10px] text-neutral-400">{bucket.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CollectionCardPriceSheet({
  slug,
  card,
  busy,
  onClose,
  onBuild,
}: {
  slug: string;
  card: CollectionCard;
  busy: boolean;
  onClose: () => void;
  onBuild?: (card: CollectionCard) => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<CollectionCardPricePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const commander = isCollectionCommander(card);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setData(null);
    apiFetch<CollectionCardPricePayload>(
      `/api/store/${encodeURIComponent(slug)}/collection/${encodeURIComponent(card.id)}/price`,
    )
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Could not load prices");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [card.id, slug]);

  const points = data?.history.series[0]?.points ?? [];
  const monthly =
    data?.history.trend.monthlySales ?? monthlySalesFromPoints(points);
  const subtitle = [card.setName, card.cardNumber ? `#${card.cardNumber}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close price"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="collection-price-title"
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-neutral-800 bg-[var(--ink-850)] p-5"
      >
        <div className="flex items-start gap-4">
          {card.frontImageUrl &&
          !card.frontImageUrl.includes("00000000-0000-0000-0000-000000000000") ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.frontImageUrl}
              alt=""
              className="h-40 w-[7.15rem] shrink-0 object-cover"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h2
              id="collection-price-title"
              className="text-lg font-semibold leading-snug text-white"
            >
              {card.displayName}
            </h2>
            {subtitle ? (
              <p className={`mt-1 ${authSubtext}`}>{subtitle}</p>
            ) : null}
            {commander ? (
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent-hi)]">
                Commander
              </p>
            ) : null}
          </div>
        </div>

        {loading ? <p className={`mt-5 ${authSubtext}`}>Loading prices…</p> : null}
        {error ? <p className={`mt-5 ${authError}`}>{error}</p> : null}

        {data ? (
          <div className="mt-5 space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Today · TCGPlayer
              </p>
              <p className="mt-1 text-3xl font-semibold text-white">
                {money(data.tcgLow.price)}
              </p>
              <p className={`mt-1 ${authSubtext}`}>
                {data.tcgLow.note || "Lowest Near Mint listing today"}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                History
              </p>
              <p className="mt-1 text-sm text-neutral-300">
                Ungraded {money(data.history.currentEstimate)}
                {data.history.trend.sampleCount > 1 ? (
                  <>
                    {" "}
                    · 7D {pct(data.history.trend.sevenDayChangePct)} · 30D{" "}
                    {pct(data.history.trend.thirtyDayChangePct)}
                  </>
                ) : null}
              </p>
              {data.history.trend.marketTone ? (
                <p
                  className={`mt-2 text-sm font-semibold ${
                    data.history.trend.marketTone.endsWith("up")
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {MARKET_TONE_LABELS[data.history.trend.marketTone]}
                </p>
              ) : null}
              <PriceSparkline points={points} />
              {monthly ? <SalesByMonth series={monthly} /> : null}
            </div>
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {commander ? (
            <>
              <button
                type="button"
                className={authButton}
                disabled={busy}
                onClick={() => {
                  prefillProfessorCommander(slug, card.displayName);
                  router.push(professorSetupPath(slug));
                }}
              >
                Professor build
              </button>
              {onBuild ? (
                <button
                  type="button"
                  className={authButtonSecondary}
                  disabled={busy}
                  onClick={() => onBuild(card)}
                >
                  Build it myself
                </button>
              ) : null}
            </>
          ) : null}
          <button type="button" className={authButtonSecondary} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
