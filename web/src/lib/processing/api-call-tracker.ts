import type { CardProcessingTimings } from "../types";

export type ApiCallSource =
  | "openai"
  | "ebay"
  | "pricecharting"
  | "tcgplayer"
  | "scryfall"
  | "pokemonTcg";

let activeTimings: CardProcessingTimings | null = null;

export function bindApiCallTracker(timings: CardProcessingTimings | null): void {
  activeTimings = timings;
}

export function trackApiCall(source: ApiCallSource, count = 1): void {
  if (!activeTimings) return;
  if (!activeTimings.apiCallCounts) activeTimings.apiCallCounts = {};
  activeTimings.apiCallCounts[source] =
    (activeTimings.apiCallCounts[source] ?? 0) + count;
}
