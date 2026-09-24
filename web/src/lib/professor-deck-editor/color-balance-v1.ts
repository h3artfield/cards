/**
 * Colored pip demand versus sources that can actually make those colors.
 *
 * Commander-color only: generic and colorless pips do not tell you whether the
 * deck bricks on green. Hybrid and phyrexian symbols count for each color they
 * can be paid with, because either side is a real demand on that color.
 */

export const DECK_COLOR_BALANCE_V1_VERSION = "professor-deck-editor-color-balance-v1";

export const COLOR_PIP_ORDER_V1 = ["W", "U", "B", "R", "G"] as const;
export type ColorPipV1 = (typeof COLOR_PIP_ORDER_V1)[number];

export const COLOR_PIP_LABELS_V1: Record<ColorPipV1, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

export type ColorBalanceRowV1 = {
  color: ColorPipV1;
  label: string;
  demand: number;
  sources: number;
  /** Few producers relative to the pips that ask for this color. */
  thin: boolean;
};

export type DeckColorBalanceV1 = {
  rows: ColorBalanceRowV1[];
  /** The hungriest thin color, if any — the one most likely to brick a hand. */
  warning: string | null;
};

export type ColorBalanceCardV1 = {
  copies: number;
  isLand: boolean;
  manaCost?: string | null;
  producedMana?: readonly string[] | null;
  colorIdentity?: readonly string[] | null;
};

const EMPTY_PIPS_V1 = (): Record<ColorPipV1, number> => ({
  W: 0,
  U: 0,
  B: 0,
  R: 0,
  G: 0,
});

/** Count each colored letter inside `{…}` symbols. */
export function parseColoredPipsV1(manaCost: string | null | undefined): Record<ColorPipV1, number> {
  const counts = EMPTY_PIPS_V1();
  if (!manaCost) return counts;
  for (const match of manaCost.toUpperCase().matchAll(/\{([^}]+)\}/g)) {
    const inner = match[1];
    if (!inner || /^\d+$/.test(inner) || inner === "X" || inner === "C" || inner === "S") continue;
    for (const color of COLOR_PIP_ORDER_V1) {
      if (inner.includes(color)) counts[color] += 1;
    }
  }
  return counts;
}

function colorsProducedV1(card: ColorBalanceCardV1): ColorPipV1[] {
  const produced = (card.producedMana ?? [])
    .map((color) => color.toUpperCase())
    .filter((color): color is ColorPipV1 => (COLOR_PIP_ORDER_V1 as readonly string[]).includes(color));
  if (produced.length) return produced;
  if (!card.isLand) return [];
  return (card.colorIdentity ?? [])
    .map((color) => color.toUpperCase())
    .filter((color): color is ColorPipV1 => (COLOR_PIP_ORDER_V1 as readonly string[]).includes(color));
}

function isThinV1(demand: number, sources: number): boolean {
  if (demand <= 0) return false;
  return sources < Math.max(3, Math.ceil(demand * 0.6));
}

export function computeDeckColorBalanceV1(args: {
  commanderColors: readonly string[];
  cards: readonly ColorBalanceCardV1[];
}): DeckColorBalanceV1 | null {
  const commander = new Set(
    (args.commanderColors ?? [])
      .map((color) => color.toUpperCase())
      .filter((color): color is ColorPipV1 => (COLOR_PIP_ORDER_V1 as readonly string[]).includes(color)),
  );
  const colors = COLOR_PIP_ORDER_V1.filter((color) => commander.has(color));
  if (colors.length < 2) return null;

  const demand = EMPTY_PIPS_V1();
  const sources = EMPTY_PIPS_V1();

  for (const card of args.cards) {
    const copies = Math.max(card.copies, 1);
    if (!card.isLand) {
      const pips = parseColoredPipsV1(card.manaCost);
      for (const color of colors) demand[color] += pips[color] * copies;
    }
    for (const color of colorsProducedV1(card)) {
      if (commander.has(color)) sources[color] += copies;
    }
  }

  const rows: ColorBalanceRowV1[] = colors.map((color) => ({
    color,
    label: COLOR_PIP_LABELS_V1[color],
    demand: demand[color],
    sources: sources[color],
    thin: isThinV1(demand[color], sources[color]),
  }));

  const worst = [...rows]
    .filter((row) => row.thin)
    .sort((a, b) => b.demand - b.sources - (a.demand - a.sources) || b.demand - a.demand)[0];

  return {
    rows,
    warning: worst
      ? `${worst.label} looks thin — ${worst.demand} pip${worst.demand === 1 ? "" : "s"} / ${worst.sources} source${worst.sources === 1 ? "" : "s"}.`
      : null,
  };
}
