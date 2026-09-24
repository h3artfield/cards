export type MarketTone = "highly_up" | "up" | "down" | "highly_down";

export type MarketTonePoint = {
  date: string;
  value: number;
  volume?: number;
};

export const MARKET_TONE_LABELS: Record<MarketTone, string> = {
  highly_up: "Highly trending up",
  up: "Trending up",
  down: "Trending down",
  highly_down: "Highly trending down",
};

const DEAD_PCT = 2;
const STRONG_PCT = 10;
const MIN_POINTS = 8;

function pctChange(from?: number, to?: number): number | undefined {
  if (from == null || to == null || from <= 0) return undefined;
  return ((to - from) / from) * 100;
}

function valueOnOrBefore(
  points: MarketTonePoint[],
  targetDate: string,
): number | undefined {
  let best: number | undefined;
  for (const point of points) {
    if (point.date <= targetDate) best = point.value;
    else break;
  }
  return best;
}

function shiftIso(latestDate: string, days: number): string {
  const [year, month, day] = latestDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function lookSign(changePct?: number): -1 | 0 | 1 {
  if (changePct == null) return 0;
  if (changePct >= DEAD_PCT) return 1;
  if (changePct <= -DEAD_PCT) return -1;
  return 0;
}

function meanVolume(points: MarketTonePoint[], startDate: string, endDate: string): number | undefined {
  const values = points
    .filter((point) => point.date >= startDate && point.date <= endDate)
    .map((point) => point.volume)
    .filter((volume): volume is number => volume != null && volume >= 0);
  if (!values.length) return undefined;
  return values.reduce((sum, volume) => sum + volume, 0) / values.length;
}

/**
 * Two looks (7-day and 30-day) plus whether sales sped up.
 * Highly requires both windows to agree. A tiny recent dip cannot
 * override a strong 30-day move.
 */
export function marketToneFromPoints(points: MarketTonePoint[]): MarketTone | null {
  if (points.length < MIN_POINTS) return null;

  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1]!;
  const latestValue = latest.value;
  const latestDate = latest.date;

  const seven = pctChange(valueOnOrBefore(sorted, shiftIso(latestDate, 7)), latestValue);
  const thirty = pctChange(
    valueOnOrBefore(sorted, shiftIso(latestDate, 30)),
    latestValue,
  );
  const sign7 = lookSign(seven);
  const sign30 = lookSign(thirty);
  if (sign7 === 0 && sign30 === 0) return null;

  const recentVol = meanVolume(sorted, shiftIso(latestDate, 13), latestDate);
  const priorVol = meanVolume(
    sorted,
    shiftIso(latestDate, 27),
    shiftIso(latestDate, 14),
  );
  const volumeRatio =
    recentVol != null && priorVol != null && priorVol > 0
      ? recentVol / priorVol
      : undefined;
  const volumeUp = volumeRatio != null && volumeRatio >= 1.1;
  const volumeThin = volumeRatio != null && volumeRatio < 0.75;

  const mag7 = Math.abs(seven ?? 0);
  const mag30 = Math.abs(thirty ?? 0);
  const magnitude = Math.max(mag7, mag30);
  const agreeUp = sign7 === 1 && sign30 === 1;
  const agreeDown = sign7 === -1 && sign30 === -1;

  if (agreeUp && (magnitude >= STRONG_PCT || volumeUp) && !volumeThin) {
    return "highly_up";
  }
  if (agreeDown && (magnitude >= STRONG_PCT || volumeUp) && !volumeThin) {
    return "highly_down";
  }

  if (sign7 !== 0 && sign30 !== 0 && sign7 !== sign30) {
    if (mag30 >= STRONG_PCT && mag7 < STRONG_PCT) {
      return sign30 === 1 ? "up" : "down";
    }
    if (mag7 >= STRONG_PCT && mag7 > mag30) {
      return sign7 === 1 ? "up" : "down";
    }
    return null;
  }

  if (sign7 === 1 || (sign7 === 0 && sign30 === 1)) return "up";
  if (sign7 === -1 || (sign7 === 0 && sign30 === -1)) return "down";
  return null;
}

export type MonthlySalesBucket = {
  month: string;
  label: string;
  sales: number;
};

export type MonthlySalesSeries = {
  kind: "estimated_sales" | "reported_volume";
  buckets: MonthlySalesBucket[];
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  if (!year || !mon) return month;
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * PriceCharting volume is a trailing count. When it moves day to day we
 * treat rises as sales that month. When it sits still we show the reported
 * level at month-end so the chart is not a flat 235 every bar.
 */
export function monthlySalesFromPoints(points: MarketTonePoint[]): MonthlySalesSeries | null {
  const dated = [...points]
    .filter((point) => point.volume != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (dated.length < 2) return null;

  const estimated = new Map<string, number>();
  const reported = new Map<string, number>();
  let estimatedTotal = 0;

  for (let i = 0; i < dated.length; i += 1) {
    const current = dated[i]!;
    const month = monthKey(current.date);
    reported.set(month, current.volume ?? 0);
    if (i === 0) continue;
    const prior = dated[i - 1]!.volume ?? 0;
    const delta = Math.max(0, (current.volume ?? 0) - prior);
    if (delta > 0) {
      estimated.set(month, (estimated.get(month) ?? 0) + delta);
      estimatedTotal += delta;
    }
  }

  const latest = dated[dated.length - 1]!.volume ?? 0;
  const useEstimated = estimatedTotal >= Math.max(8, latest * 0.25);
  const source = useEstimated ? estimated : reported;
  const buckets = [...source.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, sales]) => ({
      month,
      label: monthLabel(month),
      sales: Math.round(sales),
    }))
    .filter((bucket) => bucket.sales > 0);

  if (buckets.length === 0) return null;
  return {
    kind: useEstimated ? "estimated_sales" : "reported_volume",
    buckets,
  };
}

export function latestSalesVolume(points: MarketTonePoint[]): number | undefined {
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const volume = points[i]?.volume;
    if (volume != null) return volume;
  }
  return undefined;
}
