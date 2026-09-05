const COLOR_CLASS: Record<string, string> = {
  W: "professor-mtg-mana--W",
  U: "professor-mtg-mana--U",
  B: "professor-mtg-mana--B",
  R: "professor-mtg-mana--R",
  G: "professor-mtg-mana--G",
};

/**
 * Renders a mana cost string like `{2}{G}{G}` as pips.
 *
 * Hybrid and Phyrexian symbols are shown with their slashes stripped ("W/U"
 * becomes "WU") and coloured by the first colour in the pair. That loses the
 * split-circle look a dedicated symbol font would give, but it stays legible at
 * this size and needs no font to load before a decklist can be read.
 */
export function ManaCost({ cost, className }: { cost?: string | null; className?: string }) {
  if (!cost) return null;
  const symbols = [...cost.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]!);
  if (symbols.length === 0) return null;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-[0.1rem] ${className ?? ""}`}
      aria-label={`Mana cost ${symbols.join(" ")}`}
    >
      {symbols.map((symbol, index) => {
        const letters = symbol.replace(/\//g, "").toUpperCase();
        const color = letters.split("").find((letter) => COLOR_CLASS[letter]);
        return (
          <span
            key={`${symbol}-${index}`}
            aria-hidden="true"
            className={`professor-mtg-mana ${color ? COLOR_CLASS[color] : "professor-mtg-mana--C"}`}
          >
            {letters}
          </span>
        );
      })}
    </span>
  );
}
