import type { CollectionCard } from "../types";
import {
  parseCollectionGame,
  type CollectionGame,
} from "./collection-game";
import { importCandidatesFromCard } from "./collection-import-parse";

export type CollectionBinderMode = "import" | "view";
export type CollectionBinderSort = "newest" | "name" | "set" | "quantity";
export type CollectionBinderFilter = "all" | "commanders" | "needs_printing";

export function cardNeedsPrintingPick(card: CollectionCard): boolean {
  return (
    card.status === "owned" &&
    Boolean(card.needsReview) &&
    importCandidatesFromCard(card).length > 0
  );
}

export function isVerifiedBinderCard(card: CollectionCard): boolean {
  return card.status === "owned" && !cardNeedsPrintingPick(card);
}

export function cardMatchesCollectionGame(
  card: CollectionCard,
  game: CollectionGame,
): boolean {
  const category = card.category ?? "magic";
  if (game === "other") return category === "other" || category === "sports";
  return category === game;
}

export function isCollectionCommander(card: CollectionCard): boolean {
  if (card.needsReview) return false;
  if ((card.category ?? "magic") !== "magic") return false;
  if (card.canBeCommander === false) return false;
  if (card.canBeCommander === true) return true;
  const typeLine = (card.typeLine ?? "").toLowerCase();
  return (
    typeLine.includes("legendary creature") ||
    typeLine.includes("legendary vehicle") ||
    typeLine.includes("legendary spacecraft")
  );
}

export function defaultBinderMode(cards: CollectionCard[]): CollectionBinderMode {
  const inGame = cards.filter((card) => card.status === "owned");
  if (inGame.some(cardNeedsPrintingPick)) return "import";
  if (inGame.some(isVerifiedBinderCard)) return "view";
  return "import";
}

export function filterBinderCards(
  cards: CollectionCard[],
  args: {
    game: CollectionGame;
    query?: string;
    filter?: CollectionBinderFilter;
    sort?: CollectionBinderSort;
  },
): CollectionCard[] {
  const game = parseCollectionGame(args.game);
  const query = args.query?.trim().toLowerCase() ?? "";
  const filter = args.filter ?? "all";
  const sort = args.sort ?? "newest";

  const next = cards.filter((card) => {
    if (card.status !== "owned") return false;
    if (!cardMatchesCollectionGame(card, game)) return false;
    if (query && !card.displayName.toLowerCase().includes(query)) return false;
    if (filter === "commanders") return isCollectionCommander(card);
    if (filter === "needs_printing") return cardNeedsPrintingPick(card);
    return isVerifiedBinderCard(card);
  });

  next.sort((a, b) => {
    if (sort === "name") {
      return a.displayName.localeCompare(b.displayName) || b.createdAt.localeCompare(a.createdAt);
    }
    if (sort === "set") {
      return (a.setName ?? "").localeCompare(b.setName ?? "") || a.displayName.localeCompare(b.displayName);
    }
    if (sort === "quantity") {
      return (b.quantity ?? 1) - (a.quantity ?? 1) || a.displayName.localeCompare(b.displayName);
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  return next;
}

export function pickDeckCommander(cards: CollectionCard[]): CollectionCard | null {
  return cards.find(isCollectionCommander) ?? null;
}

export function collectionDecklistText(
  cards: CollectionCard[],
  commanderId?: string,
): string {
  return cards
    .filter((card) => card.id !== commanderId)
    .map((card) => `${Math.max(1, Math.floor(card.quantity ?? 1) || 1)} ${card.displayName}`)
    .join("\n");
}
