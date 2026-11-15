import type { CollectionValuePoint } from "./collection-price";

export type CollectionHistorySeries = {
  qty: number;
  points: CollectionValuePoint[];
};

/** Carry each card's last known value forward, then sum the binder by day. */
export function sumCollectionHistory(
  series: CollectionHistorySeries[],
): CollectionValuePoint[] {
  const dates = [
    ...new Set(series.flatMap((row) => row.points.map((point) => point.date))),
  ].sort();
  if (dates.length === 0) return [];

  const walkers = series.map((row) => ({
    qty: Math.max(1, Math.floor(row.qty) || 1),
    points: [...row.points].sort((a, b) => a.date.localeCompare(b.date)),
    index: 0,
    last: undefined as number | undefined,
  }));

  return dates.map((date) => {
    let total = 0;
    for (const walker of walkers) {
      while (
        walker.index < walker.points.length &&
        walker.points[walker.index]!.date <= date
      ) {
        walker.last = walker.points[walker.index]!.value;
        walker.index += 1;
      }
      if (walker.last != null) total += walker.last * walker.qty;
    }
    return { date, value: total };
  });
}
