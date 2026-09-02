import { MODEL_D_FEATURE_SPEC } from "./model-d-feature-spec-v1";

export const OPPONENT_CONTEXT_RELATIVE_STATS = MODEL_D_FEATURE_SPEC.d0OpponentContext
  .relativeStats as readonly string[];

export const OPPONENT_CONTEXT_REDUCERS = ["meanOppDiff", "maxOppDiff", "minOppDiff"] as const;

export function opponentContextFeatureNames(): string[] {
  const names: string[] = [];
  for (const stat of OPPONENT_CONTEXT_RELATIVE_STATS) {
    for (const reducer of OPPONENT_CONTEXT_REDUCERS) {
      names.push(`oppctx_${stat}_${reducer}`);
    }
  }
  return names;
}

function opponentScalars(deckFeatures: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of OPPONENT_CONTEXT_RELATIVE_STATS) {
    out[key] = deckFeatures[key] ?? 0;
  }
  return out;
}

export function buildOpponentContextFeatures(input: {
  myDeckFeatures: Record<string, number>;
  opponentDeckFeatures: Array<Record<string, number>>;
}): Record<string, number> {
  const my = opponentScalars(input.myDeckFeatures);
  const oppCount = input.opponentDeckFeatures.length;
  const out = Object.fromEntries(opponentContextFeatureNames().map((name) => [name, 0]));

  if (oppCount === 0) return out;

  for (const stat of OPPONENT_CONTEXT_RELATIVE_STATS) {
    const myVal = my[stat] ?? 0;
    const oppVals = input.opponentDeckFeatures.map((deck) => opponentScalars(deck)[stat] ?? 0);
    const diffs = oppVals.map((v) => myVal - v);
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / oppCount;
    out[`oppctx_${stat}_meanOppDiff`] = meanDiff;
    out[`oppctx_${stat}_maxOppDiff`] = Math.max(...diffs);
    out[`oppctx_${stat}_minOppDiff`] = Math.min(...diffs);
  }
  return out;
}
