/**
 * Structural measures kept for later Forge weighting.
 * commanderFit is dropped. Weights stay 0 until Forge can set them.
 * Published W is goldfish speed & consistency, not this construction score.
 */
export const DR_CONSTRUCTION_SCORE_V1 = "deck-rating-construction-score-v1";
export const DR_CONSTRUCTION_PBAR = 0.25;

export const DR_CONSTRUCTION_WEIGHTS_V1 = {
  manaBase: 0,
  interaction: 0,
  cardFlow: 0,
  cardQuality: 0,
} as const;

export type ConstructionMeasureKey = keyof typeof DR_CONSTRUCTION_WEIGHTS_V1;

export type ConstructionMeasures = {
  manaBase: number;
  interaction: number;
  cardFlow: number;
  cardQuality: number | null;
};

export function constructionP(measures: ConstructionMeasures, weights = DR_CONSTRUCTION_WEIGHTS_V1): number {
  let p = DR_CONSTRUCTION_PBAR;
  for (const key of Object.keys(weights) as ConstructionMeasureKey[]) {
    const v = measures[key];
    if (v == null || Number.isNaN(v)) continue;
    p += weights[key] * v;
  }
  return Math.min(0.6, Math.max(0.05, p));
}

export function constructionW(p: number, pBar = DR_CONSTRUCTION_PBAR): number {
  const odds = (x: number) => x / Math.max(1 - x, 1e-6);
  const raw = 500 + 400 * Math.log10(odds(p) / odds(Math.max(pBar, 0.06)));
  return Math.max(0, Math.min(999, Math.round(raw)));
}

export function percentileVs(value: number, field: number[]): number {
  if (!field.length) return 0.5;
  const below = field.filter((x) => x < value).length;
  return below / field.length;
}
