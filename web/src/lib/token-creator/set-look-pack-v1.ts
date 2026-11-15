import type { TokenBoxV1 } from "./design-v1";
import type {
  TokenSetColorKeyV1,
  TokenSetLayoutV1,
  TokenSetLookColorsV1,
  TokenSetLookV1,
} from "./set-templates-v1";

/**
 * The client index stores looks packed: a box as [x, y, w, h], a colour set as
 * one string of seven hex colours, so 200 sets stay a small download.
 */
export type PackedBoxV1 = [number, number, number, number];
export type PackedLayoutV1 = [PackedBoxV1, PackedBoxV1, PackedBoxV1, PackedBoxV1, PackedBoxV1];
export type PackedLookV1 = {
  t?: PackedLayoutV1;
  v?: PackedLayoutV1;
  c?: Partial<Record<TokenSetColorKeyV1, string>>;
  k?: "left" | "center";
  n?: number;
};

const PARTS = ["title", "art", "type", "rules", "pt"] as const;
const COLORS = ["frame", "bar", "barEdge", "title", "type", "rules", "pt"] as const;

const packBox = (b: TokenBoxV1): PackedBoxV1 => [b.x, b.y, b.w, b.h];
const unpackBox = ([x, y, w, h]: PackedBoxV1): TokenBoxV1 => ({ x, y, w, h });

const packLayout = (l: TokenSetLayoutV1) => PARTS.map((p) => packBox(l[p])) as PackedLayoutV1;
const unpackLayout = (l: PackedLayoutV1) =>
  Object.fromEntries(PARTS.map((p, i) => [p, unpackBox(l[i]!)])) as TokenSetLayoutV1;

const packColors = (c: TokenSetLookColorsV1) => COLORS.map((k) => c[k].slice(1)).join("");
const unpackColors = (s: string) =>
  Object.fromEntries(COLORS.map((k, i) => [k, `#${s.slice(i * 6, i * 6 + 6)}`])) as TokenSetLookColorsV1;

export function packLookV1(look: TokenSetLookV1): PackedLookV1 {
  const out: PackedLookV1 = {};
  if (look.text) out.t = packLayout(look.text);
  if (look.vanilla) out.v = packLayout(look.vanilla);
  if (look.colors && Object.keys(look.colors).length) {
    out.c = Object.fromEntries(Object.entries(look.colors).map(([k, c]) => [k, packColors(c!)]));
  }
  if (look.keywordAlign === "left" || look.keywordAlign === "center") out.k = look.keywordAlign;
  if (look.measured) out.n = look.measured;
  return out;
}

export function unpackLookV1(p: PackedLookV1): TokenSetLookV1 {
  return {
    ...(p.t ? { text: unpackLayout(p.t) } : {}),
    ...(p.v ? { vanilla: unpackLayout(p.v) } : {}),
    ...(p.c ? { colors: Object.fromEntries(Object.entries(p.c).map(([k, s]) => [k, unpackColors(s!)])) } : {}),
    ...(p.k ? { keywordAlign: p.k } : {}),
    ...(p.n ? { measured: p.n } : {}),
  };
}
