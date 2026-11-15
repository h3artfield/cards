import { getCardTokenMapV1 } from "@/lib/deck-tokens/card-token-map-v1";
import { deckTokenLabelV1, type CardTokenMapEntryV1 } from "@/lib/deck-tokens/deck-tokens-v1";

/** One real Magic token, for the creator's "what are you making?" search. */
export type TokenSearchHitV1 = {
  id: string;
  name: string;
  typeLine: string;
  power?: string;
  toughness?: string;
  colors: string[];
  text?: string;
  imageUrl?: string;
  /** "1/1 white Spirit". */
  label: string;
  /** How many cards make it; the ranking for ties. */
  makers: number;
};

const COLOR_WORDS: Record<string, string> = { white: "W", blue: "U", black: "B", red: "R", green: "G" };

type Indexed = { hit: TokenSearchHitV1; hay: string; nameLc: string };

let cached: Indexed[] | null = null;

function index(): Indexed[] {
  if (cached) return cached;
  const map = getCardTokenMapV1();
  const makers = new Map<string, number>();
  for (const ids of Object.values(map.cards)) for (const id of ids) makers.set(id, (makers.get(id) ?? 0) + 1);
  cached = Object.entries(map.tokens)
    // "Copy" stands in for cards that copy a permanent; it is not a token anyone designs.
    .filter(([, t]) => t.kind === "token" && t.name !== "Copy" && /^Token\b/.test(t.typeLine))
    .map(([id, t]: [string, CardTokenMapEntryV1]) => ({
      hit: {
        id,
        name: t.name,
        typeLine: t.typeLine,
        ...(t.power != null ? { power: t.power } : {}),
        ...(t.toughness != null ? { toughness: t.toughness } : {}),
        colors: t.colors,
        ...(t.text ? { text: t.text } : {}),
        ...(t.imageUrl ? { imageUrl: t.imageUrl } : {}),
        label: deckTokenLabelV1(t),
        makers: makers.get(id) ?? 0,
      },
      nameLc: t.name.toLowerCase(),
      hay: `${t.name} ${t.typeLine} ${t.text ?? ""}`.toLowerCase().replace(/—/g, " "),
    }))
    .sort((a, b) => b.hit.makers - a.hit.makers || a.hit.name.localeCompare(b.hit.name));
  return cached;
}

/**
 * Every query word has to match: "2/2" the power and toughness, a colour word
 * the colours, anything else the name, type line or rules text. Name matches
 * rank first, then tokens more cards make.
 */
export function searchTokensV1(query: string, limit = 12): TokenSearchHitV1[] {
  const q = query.trim().toLowerCase();
  const all = index();
  if (!q) return all.slice(0, limit).map((t) => t.hit);
  const words = q.split(/\s+/).filter(Boolean);
  const matches = all.filter(({ hit, hay }) =>
    words.every((w) => {
      const pt = /^(\*|\d+)\/(\*|\d+)$/.exec(w);
      if (pt) return hit.power === pt[1] && hit.toughness === pt[2];
      if (COLOR_WORDS[w]) return hit.colors.includes(COLOR_WORDS[w]!);
      if (w === "colorless" || w === "colourless") return hit.colors.length === 0;
      return hay.includes(w);
    }),
  );
  const nameWords = words.filter((w) => !/\//.test(w) && !COLOR_WORDS[w]).join(" ");
  const rank = (t: Indexed) =>
    !nameWords ? 2 : t.nameLc === nameWords ? 0 : t.nameLc.startsWith(nameWords) ? 1 : t.nameLc.includes(nameWords) ? 2 : 3;
  return matches
    .sort((a, b) => rank(a) - rank(b) || b.hit.makers - a.hit.makers)
    .slice(0, limit)
    .map((t) => t.hit);
}
