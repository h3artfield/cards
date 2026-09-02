import type { DeckFeatureBundle } from "../model-c/deck-features-v1";
import { buildOpponentContextFeatures } from "./opponent-context-features-v1";
import { buildSemanticMatchupFeatures } from "./matchup-interaction-features-v1";

function nonSemanticDeckFeatures(bundle: DeckFeatureBundle): Record<string, number> {
  return { ...bundle.basicStructure, ...bundle.gameChanger };
}

function fullSemanticDeckFeatures(bundle: DeckFeatureBundle): Record<string, number> {
  return { ...nonSemanticDeckFeatures(bundle), ...bundle.semantic };
}

export function buildPodMatchupFeaturesForSeat(input: {
  seatIndex: number;
  seatBundles: DeckFeatureBundle[];
}): {
  opponentContext: Record<string, number>;
  semanticMatchup: Record<string, number>;
} {
  const myBundle = input.seatBundles[input.seatIndex];
  if (!myBundle) {
    return { opponentContext: {}, semanticMatchup: {} };
  }

  const opponentBundles = input.seatBundles.filter((_, idx) => idx !== input.seatIndex);

  return {
    opponentContext: buildOpponentContextFeatures({
      myDeckFeatures: nonSemanticDeckFeatures(myBundle),
      opponentDeckFeatures: opponentBundles.map(nonSemanticDeckFeatures),
    }),
    semanticMatchup: buildSemanticMatchupFeatures({
      myDeckFeatures: fullSemanticDeckFeatures(myBundle),
      opponentDeckFeatures: opponentBundles.map(fullSemanticDeckFeatures),
    }),
  };
}

export function featuresEqual(a: Record<string, number>, b: Record<string, number>, eps = 1e-12): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const av = a[key] ?? 0;
    const bv = b[key] ?? 0;
    if (!Number.isFinite(av) || !Number.isFinite(bv)) return false;
    if (Math.abs(av - bv) > eps) return false;
  }
  return true;
}

export function assertPermutationInvariant(input: {
  seatIndex: number;
  seatBundles: DeckFeatureBundle[];
}): { pass: boolean; checkedPermutations: number } {
  const baseline = buildPodMatchupFeaturesForSeat(input);
  const podSize = input.seatBundles.length;
  const myBundle = input.seatBundles[input.seatIndex]!;
  const opponentBundles = input.seatBundles.filter((_, idx) => idx !== input.seatIndex);

  function permute<T>(arr: T[]): T[][] {
    if (arr.length <= 1) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
      for (const tail of permute(rest)) out.push([arr[i]!, ...tail]);
    }
    return out;
  }

  const permutations = permute(opponentBundles);
  for (const oppPerm of permutations) {
    const reordered: DeckFeatureBundle[] = [];
    let oppPtr = 0;
    for (let seat = 0; seat < podSize; seat += 1) {
      if (seat === input.seatIndex) reordered[seat] = myBundle;
      else {
        reordered[seat] = oppPerm[oppPtr]!;
        oppPtr += 1;
      }
    }
    const candidate = buildPodMatchupFeaturesForSeat({
      seatIndex: input.seatIndex,
      seatBundles: reordered,
    });
    if (
      !featuresEqual(candidate.opponentContext, baseline.opponentContext) ||
      !featuresEqual(candidate.semanticMatchup, baseline.semanticMatchup)
    ) {
      return { pass: false, checkedPermutations: permutations.length };
    }
  }
  return { pass: true, checkedPermutations: permutations.length };
}
