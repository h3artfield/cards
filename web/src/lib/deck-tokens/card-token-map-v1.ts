import cardTokenSets from "./card-token-sets-v1.json";
import cardTokenMap from "./card-tokens-v1.json";
import type { CardTokenMapV1 } from "./deck-tokens-v1";

/** Regenerate with `npm run deck-tokens:build`. */
export function getCardTokenMapV1(): CardTokenMapV1 {
  return cardTokenMap as CardTokenMapV1;
}

/** Card oracle id → the token set of its newest printing with tokens. Regenerate with `npm run token-sets:build`. */
export function getCardTokenSetsV1(): Record<string, string> {
  return cardTokenSets as Record<string, string>;
}
