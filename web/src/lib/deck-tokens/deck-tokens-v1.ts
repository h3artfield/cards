/**
 * Which tokens and emblems a deck can make.
 *
 * Sourced from Scryfall's `all_parts` links (component "token"), generated into
 * `card-tokens-v1.json` by `scripts/build-deck-token-map.ts`. Cards that create
 * a copy of another permanent have no fixed token and are not linked, so the
 * list is a floor, not a guarantee.
 */

export type DeckTokenKindV1 = "token" | "emblem";

export type CardTokenMapEntryV1 = {
  name: string;
  typeLine: string;
  kind: DeckTokenKindV1;
  power?: string;
  toughness?: string;
  colors: string[];
  text?: string;
  imageUrl?: string;
};

export type CardTokenMapV1 = {
  version: 1;
  generatedAt: string;
  sourceUpdatedAt: string;
  /** Keyed by token oracle id. */
  tokens: Record<string, CardTokenMapEntryV1>;
  /** Card oracle id to the token oracle ids it makes. */
  cards: Record<string, string[]>;
};

export type DeckTokenV1 = CardTokenMapEntryV1 & {
  tokenId: string;
  /** Deck card names that make this token, commander first. */
  madeBy: string[];
  /** Token set of the first maker's newest printing, so a custom token can match it. */
  setCode?: string;
};

export type DeckTokensV1 = {
  tokens: DeckTokenV1[];
  emblems: DeckTokenV1[];
};

type DeckTokenSourceV1 = { oracleId: string | null; name: string };

/** Commander and mainboard only; bench and cut cards are not in the deck. */
export function computeDeckTokensV1(input: {
  commander: DeckTokenSourceV1;
  mainboard: readonly DeckTokenSourceV1[];
  map: CardTokenMapV1;
  cardSets?: Record<string, string>;
}): DeckTokensV1 {
  const byToken = new Map<string, DeckTokenV1>();

  for (const card of [input.commander, ...input.mainboard]) {
    if (!card.oracleId) continue;
    const setCode = input.cardSets?.[card.oracleId];
    for (const tokenId of input.map.cards[card.oracleId] ?? []) {
      const entry = input.map.tokens[tokenId];
      if (!entry) continue;
      const existing = byToken.get(tokenId);
      if (existing) {
        if (!existing.madeBy.includes(card.name)) existing.madeBy.push(card.name);
        if (!existing.setCode && setCode) existing.setCode = setCode;
      } else {
        byToken.set(tokenId, { ...entry, tokenId, madeBy: [card.name], ...(setCode ? { setCode } : {}) });
      }
    }
  }

  const sorted = [...byToken.values()].sort(
    (a, b) => b.madeBy.length - a.madeBy.length || a.name.localeCompare(b.name),
  );
  return {
    tokens: sorted.filter((t) => t.kind === "token"),
    emblems: sorted.filter((t) => t.kind === "emblem"),
  };
}

/** "1/1 white Soldier" style label; names alone are ambiguous (many Soldiers). */
export function deckTokenLabelV1(token: CardTokenMapEntryV1): string {
  const colorNames: Record<string, string> = {
    W: "white",
    U: "blue",
    B: "black",
    R: "red",
    G: "green",
  };
  const colors =
    token.colors.length === 0
      ? token.typeLine.includes("Creature")
        ? "colorless"
        : ""
      : token.colors.map((c) => colorNames[c] ?? c).join(" and ");
  const pt = token.power != null && token.toughness != null ? `${token.power}/${token.toughness}` : "";
  return [pt, colors, token.name].filter(Boolean).join(" ");
}
