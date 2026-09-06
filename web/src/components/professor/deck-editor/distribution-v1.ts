import type { DeckEditorCard } from "./types";
import type { DeckEditorGroupModeV1 } from "./grouping-v1";

/**
 * The shape of the board along whichever axis it is grouped by.
 *
 * Derived from the same grouped sections the list renders rather than
 * recomputed from the cards, so the chart and the list can never disagree
 * about what is in a group.
 *
 * Not every axis earns a chart. Measured on a real 99-card deck, grouping by
 * Professor role produces 55 groups and by package 42, nearly all of height
 * one — a chart of that is noise wearing the costume of information. The axes
 * below are the ones where the distribution is itself the answer.
 */

export type DistributionBarV1 = {
  key: string;
  label: string;
  count: number;
};

export type DeckDistributionV1 = {
  bars: DistributionBarV1[];
  /**
   * Whether the bars count cards or appearances.
   *
   * Cards can belong to several groups at once on some axes — a card with
   * three functional roles is in three sections — so the bars sum to more
   * than the deck size. Saying "cards" there would be a lie, and the strip
   * says "entries" instead.
   */
  measures: "cards" | "entries";
  /** Sum of the bars, including any folded into Other. */
  total: number;
  /** How many small groups were folded into the Other bar. */
  foldedGroups: number;
  /**
   * True when the axis has a meaningful order of its own, like a mana curve.
   *
   * Ordered axes keep their order and read as a shape; unordered ones are
   * ranked by size, because there is nothing to be learned from the
   * alphabetical position of "Card advantage".
   */
  ordered: boolean;
};

/** Axes whose distribution is worth drawing. */
const CHARTABLE_V1: ReadonlySet<DeckEditorGroupModeV1> = new Set([
  "type",
  "mana",
  "color",
  "price",
  "semanticRole",
  "oracleAction",
]);

/** Axes with a natural order, which is the reading rather than the ranking. */
const ORDERED_V1: ReadonlySet<DeckEditorGroupModeV1> = new Set([
  "type",
  "mana",
  "color",
  "price",
]);

/**
 * Axes where one card can appear in several groups.
 *
 * Mirrors which branches of `groupKeysForV1` can return more than one key.
 */
const MULTI_KEY_V1: ReadonlySet<DeckEditorGroupModeV1> = new Set([
  "semanticRole",
  "oracleAction",
]);

/** Bars kept before the tail is folded into Other, on unordered axes. */
const MAX_RANKED_BARS_V1 = 8;

export function deckDistributionChartableV1(mode: DeckEditorGroupModeV1): boolean {
  return CHARTABLE_V1.has(mode);
}

export function buildDeckDistributionV1(
  mode: DeckEditorGroupModeV1,
  groups: ReadonlyArray<readonly [string, DeckEditorCard[]]>,
): DeckDistributionV1 | null {
  if (!deckDistributionChartableV1(mode)) return null;

  // Copies, not rows. Basic lands collapse into a single row carrying a count,
  // so counting rows reported this deck as 82 cards when it holds 99 and made
  // the Lands bar shorter than the land base actually is.
  const all: DistributionBarV1[] = groups
    .map(([label, cards]) => ({
      key: label,
      label,
      count: cards.reduce((sum, card) => sum + Math.max(card.copies, 1), 0),
    }))
    .filter((bar) => bar.count > 0);
  if (all.length === 0) return null;

  const total = all.reduce((sum, bar) => sum + bar.count, 0);
  const ordered = ORDERED_V1.has(mode);
  const measures = MULTI_KEY_V1.has(mode) ? "entries" : "cards";

  if (ordered || all.length <= MAX_RANKED_BARS_V1) {
    return { bars: all, measures, total, foldedGroups: 0, ordered };
  }

  // Ranked, with the tail folded rather than dropped: a chart that silently
  // omits nineteen roles' worth of cards misrepresents the deck.
  const ranked = [...all].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const kept = ranked.slice(0, MAX_RANKED_BARS_V1);
  const tail = ranked.slice(MAX_RANKED_BARS_V1);
  const folded = tail.reduce((sum, bar) => sum + bar.count, 0);

  return {
    bars: folded > 0 ? [...kept, { key: "__other__", label: "Other", count: folded }] : kept,
    measures,
    total,
    foldedGroups: tail.length,
    ordered: false,
  };
}
