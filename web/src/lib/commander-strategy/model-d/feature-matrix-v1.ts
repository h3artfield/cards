import type { ModelDVariant } from "./types";
import { opponentContextFeatureNames } from "./opponent-context-features-v1";
import { semanticMatchupFeatureNames } from "./matchup-interaction-features-v1";

export function modelDVariantFeatureNames(variant: ModelDVariant): {
  opponentContext: string[];
  semanticMatchup: string[];
  all: string[];
} {
  const opponentContext = opponentContextFeatureNames();
  const semanticMatchup = semanticMatchupFeatureNames();
  if (variant === "D0") {
    return { opponentContext, semanticMatchup: [], all: opponentContext };
  }
  return { opponentContext, semanticMatchup, all: [...opponentContext, ...semanticMatchup] };
}

export function sanitizeFeatureMap(features: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(features)) {
    out[key] = Number.isFinite(value) ? value : 0;
  }
  return out;
}

export function checkNumericIntegrity(features: Record<string, number>): {
  nanCount: number;
  infCount: number;
  keys: string[];
} {
  let nanCount = 0;
  let infCount = 0;
  const keys: string[] = [];
  for (const [key, value] of Object.entries(features)) {
    if (Number.isNaN(value)) {
      nanCount += 1;
      keys.push(key);
    } else if (!Number.isFinite(value)) {
      infCount += 1;
      keys.push(key);
    }
  }
  return { nanCount, infCount, keys };
}
