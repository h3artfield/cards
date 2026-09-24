import type { CatalogSource } from "../card-flow-v2/types";
import type { CollectionGame } from "../collection/collection-game";

export const SCAN_INDEX_GAMES = ["magic", "pokemon", "yugioh"] as const;
export type ScanIndexGame = (typeof SCAN_INDEX_GAMES)[number];

export const SCAN_INDEX_MAGIC = "CS9KID01";
export const SCAN_INDEX_FORMAT_VERSION = 1;
export const SCAN_INDEX_ALGORITHM = "dhash64";
export const SCAN_INDEX_MATCH_THRESHOLD = 12;

export type ScanIndexCard = {
  catalogId: string;
  catalogSource: CatalogSource;
  name: string;
  setCode?: string;
  setName?: string;
  cardNumber?: string;
  hash: bigint;
  imageUrl?: string;
};

export type ScanIndexManifest = {
  game: ScanIndexGame;
  version: string;
  algorithm: typeof SCAN_INDEX_ALGORITHM;
  formatVersion: number;
  cardCount: number;
  builtAt: string;
  packFile: string;
};

export type ScanIndexMatch = {
  card: ScanIndexCard;
  distance: number;
};

export function isScanIndexGame(value: string): value is ScanIndexGame {
  return (SCAN_INDEX_GAMES as readonly string[]).includes(value);
}

export function collectionGameToScanIndex(
  game: CollectionGame,
): ScanIndexGame | null {
  return isScanIndexGame(game) ? game : null;
}
