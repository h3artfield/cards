import type { CardCategory } from "../types";

export const COLLECTION_GAMES = ["magic", "pokemon", "yugioh", "other"] as const;
export type CollectionGame = (typeof COLLECTION_GAMES)[number];

export const COLLECTION_GAME_STORAGE_PREFIX = "cs9k-collection-game:";

export const COLLECTION_GAME_LABELS: Record<CollectionGame, string> = {
  magic: "Magic: The Gathering",
  pokemon: "Pokémon",
  yugioh: "Yu-Gi-Oh!",
  other: "Other",
};

export function collectionGameStorageKey(slug: string): string {
  return `${COLLECTION_GAME_STORAGE_PREFIX}${slug}`;
}

export function parseCollectionGame(value: unknown): CollectionGame {
  return COLLECTION_GAMES.includes(value as CollectionGame)
    ? (value as CollectionGame)
    : "magic";
}

export function collectionGameToCategory(game: CollectionGame): CardCategory {
  return game;
}

export function readCollectionGame(slug: string): CollectionGame {
  if (typeof window === "undefined") return "magic";
  try {
    return parseCollectionGame(window.localStorage.getItem(collectionGameStorageKey(slug)));
  } catch {
    return "magic";
  }
}

export function writeCollectionGame(slug: string, game: CollectionGame): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(collectionGameStorageKey(slug), game);
  } catch {
    // Quota or private mode — the page still works for this visit.
  }
}
