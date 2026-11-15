/**
 * The store's selling price for a single, from its TCG market price:
 * $1.00 and up sells at market; below that the price snaps to a floor so
 * bulk is never priced in odd cents.
 */
export function shelfPriceFromMarketV1(market: number | null | undefined): number | null {
  if (market == null || !Number.isFinite(market) || market <= 0) return null;
  const cents = Math.round(market * 100);
  if (cents >= 100) return cents / 100;
  if (cents >= 60) return 1;
  if (cents >= 30) return 0.5;
  return 0.25;
}

/** Signed share of the old price, e.g. 0.25 for a 25% rise; null when there was no old price. */
export function priceChangeRatioV1(previous: number | null | undefined, next: number): number | null {
  if (previous == null || !(previous > 0)) return null;
  return (next - previous) / previous;
}

export const PRICE_ALERT_THRESHOLD_V1 = 0.2;
