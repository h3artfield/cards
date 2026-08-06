import type {
  CardPriceHistoryResponse,
  CardPriceSnapshot,
} from "./types";

function pctChange(from?: number, to?: number): number | undefined {
  if (from == null || to == null || from <= 0) return undefined;
  return ((to - from) / from) * 100;
}

function valueOnOrBefore(
  points: { date: string; value: number }[],
  targetDate: string,
): number | undefined {
  let best: number | undefined;
  for (const p of points) {
    if (p.date <= targetDate) best = p.value;
    else break;
  }
  return best;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function computeVolatility(
  points: { date: string; value: number }[],
): "low" | "medium" | "high" | undefined {
  if (points.length < 3) return undefined;
  const changes: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!.value;
    const cur = points[i]!.value;
    if (prev > 0) changes.push(Math.abs((cur - prev) / prev));
  }
  if (!changes.length) return undefined;
  const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
  if (avg < 0.03) return "low";
  if (avg < 0.1) return "medium";
  return "high";
}

export function buildCardPriceHistoryResponse(input: {
  identityKey: string;
  requestedIdentityKey?: string;
  lookupKeys?: string[];
  matchedKeys?: string[];
  emptyReason?: string;
  cardName?: string;
  snapshots: CardPriceSnapshot[];
}): CardPriceHistoryResponse {
  const sorted = [...input.snapshots].sort((a, b) =>
    a.capturedDate.localeCompare(b.capturedDate),
  );

  const byDate = new Map<string, number>();
  for (const snap of sorted) {
    if (snap.rawUngraded != null) {
      byDate.set(snap.capturedDate, snap.rawUngraded);
    }
  }

  const points = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));

  const latest = sorted[sorted.length - 1];
  const latestValue = points[points.length - 1]?.value;
  const today = new Date().toISOString().slice(0, 10);

  const sampleCount = points.length;
  const trendNote =
    sampleCount <= 1
      ? "Trend unavailable until more daily snapshots exist"
      : undefined;

  return {
    identityKey: input.identityKey,
    requestedIdentityKey: input.requestedIdentityKey ?? input.identityKey,
    lookupKeys: input.lookupKeys,
    matchedKeys: input.matchedKeys,
    emptyReason: input.emptyReason,
    cardName: input.cardName ?? latest?.cardName,
    currentEstimate: latestValue,
    retailBuy: latest?.retailBuy,
    retailSell: latest?.retailSell,
    series: [
      {
        source: "pricecharting",
        label: "PriceCharting ungraded",
        points,
      },
    ],
    trend: {
      sevenDayChangePct:
        sampleCount > 1
          ? pctChange(valueOnOrBefore(points, daysAgoIso(7)), latestValue)
          : undefined,
      thirtyDayChangePct:
        sampleCount > 1
          ? pctChange(valueOnOrBefore(points, daysAgoIso(30)), latestValue)
          : undefined,
      ninetyDayChangePct:
        sampleCount > 1
          ? pctChange(valueOnOrBefore(points, daysAgoIso(90)), latestValue)
          : undefined,
      sampleCount,
      volatility: sampleCount > 1 ? computeVolatility(points) : undefined,
    },
    lastUpdated: latest?.capturedAt ?? latest?.capturedDate ?? today,
    sourceNote: trendNote
      ? `PriceCharting daily snapshots — ${trendNote}`
      : "PriceCharting daily snapshots",
  };
}
