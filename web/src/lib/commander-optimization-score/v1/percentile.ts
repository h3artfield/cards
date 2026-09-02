/**
 * Exact stand-in for numpy.interp(value, grid101, linspace(0, 100, 101)).
 * Frozen COS mapping. Do not replace with a different percentile definition.
 */
export function percentileFromGrid(value: number, grid: number[]): number {
  if (grid.length !== 101) {
    throw new Error("COS v1 quantile grid must have 101 points");
  }
  const xp = grid;
  const n = xp.length;
  if (value <= xp[0]!) return 0;
  if (value >= xp[n - 1]!) return 100;
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xp[mid]! < value) lo = mid + 1;
    else hi = mid;
  }
  const j = lo;
  if (j <= 0) return 0;
  if (j >= n) return 100;
  const x0 = xp[j - 1]!;
  const x1 = xp[j]!;
  if (x1 === x0) return j - 1;
  return j - 1 + (value - x0) / (x1 - x0);
}
