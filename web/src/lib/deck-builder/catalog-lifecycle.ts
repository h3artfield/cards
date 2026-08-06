import type { CatalogCard } from "../deck-builder/types";

export type CatalogLifecycleStatus =
  | "current"
  | "stale"
  | "removed"
  | "review_required";

export function isCurrentCatalogPrinting(
  card: Pick<CatalogCard, "catalogStatus"> | null | undefined,
): boolean {
  if (!card) return false;
  return (card.catalogStatus ?? "current") === "current";
}

export function filterCurrentCatalogPrintings<T extends Pick<CatalogCard, "catalogStatus">>(
  cards: T[],
): T[] {
  return cards.filter(isCurrentCatalogPrinting);
}
