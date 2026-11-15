/**
 * Published clock = RMST₁₅ of T_first, censored at 15.
 * On-time = share of games with T_first ≤ field median RMST, interpolated.
 */
export const DR_GOLDFISH_RMST_CAP = 15;

export function rmst15(turns: number[]): number {
  if (!turns.length) return DR_GOLDFISH_RMST_CAP;
  let s = 0;
  for (const t of turns) s += Math.min(t, DR_GOLDFISH_RMST_CAP);
  return s / turns.length;
}

/** P(T ≤ m) with linear interpolation between integer turns. */
export function onTimeRate(turns: number[], fieldMedianRmst: number): number {
  if (!turns.length) return 0;
  const cap = Math.max(0, fieldMedianRmst);
  const k = Math.floor(cap);
  const frac = cap - k;
  let leK = 0;
  let eqNext = 0;
  for (const t of turns) {
    if (t <= k) leK += 1;
    else if (t === k + 1) eqNext += 1;
  }
  return (leK + frac * eqNext) / turns.length;
}

export function midrankW(value: number, field: number[], fasterIsBetter: boolean): number {
  if (!field.length) return 500;
  const signed = fasterIsBetter ? -value : value;
  const pool = field.map((x) => (fasterIsBetter ? -x : x));
  const below = pool.filter((x) => x < signed).length;
  const ties = pool.filter((x) => x === signed).length;
  return Math.max(0, Math.min(999, Math.round(1000 * ((below + 0.5 * ties) / pool.length))));
}
