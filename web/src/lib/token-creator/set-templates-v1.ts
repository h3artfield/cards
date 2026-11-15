import type { TokenAlignV1, TokenBoxV1, TokenCardV1 } from "./design-v1";
import { tokenSetDefaultLookV1, tokenSetIndexEntryV1 } from "./set-index-v1";
import type { PackedLookV1 } from "./set-look-pack-v1";

/**
 * Per-set token looks, generated from Scryfall by
 * `scripts/build-token-set-templates.ts` into `set-templates-v1.json` (full,
 * server-side, with art direction) and `set-index-v1.json` (what the picker
 * and the renderer use).
 *
 * Each set's look is measured from its real tokens: where the name bar, type
 * line, rules box and P/T box sit, and what colour each one is for a token of
 * each colour. The renderer draws our own frame from those measurements; no
 * Wizards frame art, set symbol or font file is copied.
 */
export type TokenSetEraV1 = "1993" | "1997" | "2003" | "2015";
export type TokenSetFrameEffectV1 = "none" | "enchantment" | "snow" | "inverted" | "showcase" | "etched" | "fullart";

export type TokenSetColorKeyV1 = "W" | "U" | "B" | "R" | "G" | "multi" | "colorless";
export const TOKEN_SET_COLOR_KEYS_V1: readonly TokenSetColorKeyV1[] = ["W", "U", "B", "R", "G", "multi", "colorless"];

export type TokenSetLookColorsV1 = {
  /** The frame around the art on 2003-era tokens; the border on modern ones. */
  frame: string;
  /** Name bar in its middle and at its ends. */
  bar: string;
  barEdge: string;
  /** Name lettering. */
  title: string;
  type: string;
  rules: string;
  pt: string;
};

export type TokenSetLayoutV1 = { title: TokenBoxV1; art: TokenBoxV1; type: TokenBoxV1; rules: TokenBoxV1; pt: TokenBoxV1 };

export type TokenSetLookV1 = {
  /** Layout of a token with rules text, and of one without. Missing means the era default. */
  text?: TokenSetLayoutV1;
  vanilla?: TokenSetLayoutV1;
  /** Missing colours fall back to the era default. */
  colors?: Partial<Record<TokenSetColorKeyV1, TokenSetLookColorsV1>>;
  /** How a lone keyword such as "Flying" sits in the rules box. */
  keywordAlign?: TokenAlignV1;
  /** How many real tokens the look was measured from. */
  measured?: number;
};

export type TokenSetDefaultLookV1 = Required<Pick<TokenSetLookV1, "text" | "vanilla" | "keywordAlign">> & {
  colors: Record<TokenSetColorKeyV1, TokenSetLookColorsV1>;
};

export type TokenSetTemplateV1 = {
  /** Scryfall token set code, e.g. `tfdn`. */
  code: string;
  /** The main set's name, e.g. "Foundations". */
  name: string;
  parentCode: string | null;
  released: string;
  era: TokenSetEraV1;
  effect: TokenSetFrameEffectV1;
  border: "black" | "white" | "borderless" | "silver" | "gold";
  /** Dominant colours of the set's token art, most common first. */
  palette: string[];
  samples: Array<{ name: string; image: string }>;
  look?: TokenSetLookV1;
  artDirection?: string;
  setting?: string;
};

export type TokenSetTemplatesFileV1 = {
  version: 1;
  generatedAt: string;
  sets: TokenSetTemplateV1[];
};

export type TokenSetIndexEntryV1 = {
  code: string;
  name: string;
  released: string;
  era: TokenSetEraV1;
  effect: TokenSetFrameEffectV1;
  setting?: string;
  /** Most common colours of the set's token art; tints the placeholder art. */
  palette?: string[];
  sample: string | null;
  look?: TokenSetLookV1;
};

/** `set-index-v1.json` as written; `set-index-v1.ts` unpacks the looks. */
export type TokenSetIndexFileV1 = {
  version: 3;
  defaults: Partial<Record<"2015" | "2003", TokenSetDefaultLookV1>>;
  sets: Array<Omit<TokenSetIndexEntryV1, "look"> & { look?: PackedLookV1 }>;
};

type TokenSetFrameStyleV1 = "token_2015" | "token_2003";
type LookEra = "2015" | "2003";

export function tokenSetFrameStyleV1(era: TokenSetEraV1): TokenSetFrameStyleV1 {
  return era === "2015" ? "token_2015" : "token_2003";
}

const eraOfStyle = (style: TokenSetFrameStyleV1): LookEra => (style === "token_2015" ? "2015" : "2003");

const DARK_TEXT = "#141210";
const LIGHT_TEXT = "#f7f4ec";

function rgbOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function textOn(hex: string): string {
  const [r, g, b] = rgbOf(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? DARK_TEXT : LIGHT_TEXT;
}

function darken(hex: string, amount: number): string {
  return `#${rgbOf(hex)
    .map((v) => Math.round(v * (1 - amount)).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Used only until the build has written measured defaults. */
const FALLBACK_COLORS: Record<TokenSetColorKeyV1, TokenSetLookColorsV1> = {
  W: { frame: "#e8e2cf", bar: "#ece6d2", barEdge: "#c9bd98", title: DARK_TEXT, type: "#efece4", rules: "#efece4", pt: "#efece4" },
  U: { frame: "#3d74ae", bar: "#4f86c0", barEdge: "#1f4f86", title: LIGHT_TEXT, type: "#dfe8f1", rules: "#dfe8f1", pt: "#dfe8f1" },
  B: { frame: "#3a383d", bar: "#56555b", barEdge: "#252428", title: LIGHT_TEXT, type: "#e3e3e5", rules: "#e3e3e5", pt: "#e3e3e5" },
  R: { frame: "#b8442c", bar: "#cf5236", barEdge: "#8e2c19", title: LIGHT_TEXT, type: "#f3ddd4", rules: "#f3ddd4", pt: "#f3ddd4" },
  G: { frame: "#3f7f4a", bar: "#46905a", barEdge: "#245a32", title: LIGHT_TEXT, type: "#dfebdb", rules: "#dfebdb", pt: "#dfebdb" },
  multi: { frame: "#c2a24e", bar: "#d8b85c", barEdge: "#9c7a2a", title: DARK_TEXT, type: "#f1e9d0", rules: "#f1e9d0", pt: "#f1e9d0" },
  colorless: { frame: "#9aa0a6", bar: "#c5c9cd", barEdge: "#858c93", title: DARK_TEXT, type: "#e7e9eb", rules: "#e7e9eb", pt: "#e7e9eb" },
};

/** Medians of every measured set; the starting guess for measuring and the last resort when drawing. */
const FALLBACK_LAYOUTS: Record<LookEra, { text: TokenSetLayoutV1; vanilla: TokenSetLayoutV1 }> = {
  "2015": {
    text: {
      title: { x: 33, y: 39, w: 572, h: 59 },
      art: { x: 28, y: 69, w: 572, h: 749 },
      type: { x: 39, y: 597, w: 556, h: 47 },
      rules: { x: 45, y: 645, w: 541, h: 171 },
      pt: { x: 493, y: 787, w: 103, h: 45 },
    },
    vanilla: {
      title: { x: 33, y: 39, w: 571, h: 59 },
      art: { x: 27, y: 69, w: 574, h: 708 },
      type: { x: 39, y: 723, w: 556, h: 46 },
      rules: { x: 45, y: 645, w: 541, h: 171 },
      pt: { x: 491, y: 781, w: 104, h: 51 },
    },
  },
  "2003": {
    text: {
      title: { x: 120, y: 43, w: 390, h: 50 },
      art: { x: 49, y: 99, w: 532, h: 480 },
      type: { x: 43, y: 583, w: 539, h: 52 },
      rules: { x: 54, y: 639, w: 523, h: 150 },
      pt: { x: 471, y: 790, w: 109, h: 50 },
    },
    vanilla: {
      title: { x: 120, y: 43, w: 390, h: 50 },
      art: { x: 49, y: 99, w: 535, h: 620 },
      type: { x: 48, y: 728, w: 535, h: 51 },
      rules: { x: 54, y: 639, w: 523, h: 150 },
      pt: { x: 471, y: 790, w: 110, h: 50 },
    },
  },
};

export function tokenSetFallbackLookV1(era: LookEra): TokenSetDefaultLookV1 {
  return { ...FALLBACK_LAYOUTS[era], colors: FALLBACK_COLORS, keywordAlign: "center" };
}

function defaultLook(era: LookEra): TokenSetDefaultLookV1 {
  return tokenSetDefaultLookV1(era) ?? tokenSetFallbackLookV1(era);
}

function lookOf(card: TokenCardV1): TokenSetLookV1 | undefined {
  return tokenSetIndexEntryV1(card.setCode)?.look;
}

function layoutFor(era: LookEra, look: TokenSetLookV1 | undefined, text: boolean): TokenSetLayoutV1 {
  const variant = text ? "text" : "vanilla";
  return look?.[variant] ?? defaultLook(era)[variant];
}

/** Where a set's tokens put each box: the version with rules text, or the one without. */
export function tokenSetLayoutV1(set: Pick<TokenSetIndexEntryV1, "era" | "look">, text: boolean): TokenSetLayoutV1 {
  return layoutFor(set.era === "2015" ? "2015" : "2003", set.look, text);
}

function colorsFor(era: LookEra, look: TokenSetLookV1 | undefined, key: TokenSetColorKeyV1): TokenSetLookColorsV1 {
  return look?.colors?.[key] ?? defaultLook(era).colors[key] ?? FALLBACK_COLORS[key];
}

function colorKey(color: string | undefined): TokenSetColorKeyV1 {
  return color && (TOKEN_SET_COLOR_KEYS_V1 as readonly string[]).includes(color) ? (color as TokenSetColorKeyV1) : "colorless";
}

function hasText(card: TokenCardV1): boolean {
  return Boolean(card.rulesText.trim() || (card.rules.showFlavor && card.flavorText.trim()));
}

/** "Flying" or "Flying, vigilance": real tokens centre a lone keyword line. */
function keywordOnly(text: string): boolean {
  const t = text.trim();
  return Boolean(t) && t.length <= 40 && !/[.:\n(]/.test(t);
}

function autoRulesAlign(card: TokenCardV1, look: TokenSetLookV1 | undefined, era: LookEra): TokenAlignV1 {
  return keywordOnly(card.rulesText) ? (look?.keywordAlign ?? defaultLook(era).keywordAlign) : "left";
}

function isSetFrame(style: string): style is TokenSetFrameStyleV1 {
  return style === "token_2015" || style === "token_2003";
}

function withLayout(card: TokenCardV1, style: TokenSetFrameStyleV1, look: TokenSetLookV1 | undefined): TokenCardV1 {
  const text = hasText(card);
  const l = layoutFor(eraOfStyle(style), look, text);
  return {
    ...card,
    title: { ...card.title, box: { ...l.title } },
    type: { ...card.type, box: { ...l.type } },
    rules: { ...card.rules, show: text, box: { ...l.rules }, align: autoRulesAlign(card, look, eraOfStyle(style)) },
    pt: { ...card.pt, box: { ...l.pt } },
    art: { ...card.art, window: { ...l.art } },
  };
}

function withColors(card: TokenCardV1, style: TokenSetFrameStyleV1, fullArt: boolean, look: TokenSetLookV1 | undefined): TokenCardV1 {
  const era = eraOfStyle(style);
  const colors = card.frameColors ?? card.colors;
  const many = colors.length > 2;
  const c = colorsFor(era, look, many ? "multi" : colorKey(colors[0]));
  const second = colors.length === 2 ? colorsFor(era, look, colorKey(colors[1])) : undefined;
  const titleColor = second && second.title !== c.title ? DARK_TEXT : c.title;
  if (style === "token_2015") {
    return {
      ...card,
      frame: { style, color: c.bar, accent: darken(c.barEdge, 0.25) },
      title: {
        ...card.title,
        plate: "pill",
        plateColor: c.bar,
        plateEdge: second ? null : c.barEdge,
        plateColor2: second?.bar ?? null,
        plateOpacity: 1,
        color: titleColor,
      },
      type: { ...card.type, plate: "pill", plateColor: c.type, plateOpacity: fullArt ? 0.94 : 1, color: textOn(c.type) },
      rules: {
        ...card.rules,
        panel: "token_box",
        panelColor: c.rules,
        panelOpacity: fullArt ? 0.72 : 0.8,
        borderWidth: 2,
        color: textOn(c.rules),
      },
      pt: { ...card.pt, plate: "pill", plateColor: c.pt, color: textOn(c.pt) },
    };
  }
  return {
    ...card,
    frame: { style, color: c.frame, accent: darken(c.barEdge, 0.1) },
    title: { ...card.title, plate: "nameplate", plateColor: c.bar, plateEdge: null, plateColor2: null, plateOpacity: 1, color: titleColor },
    type: { ...card.type, plate: "bar", plateColor: c.type, plateOpacity: 1, color: textOn(c.type) },
    rules: { ...card.rules, panel: "token_box", panelColor: c.rules, panelOpacity: 1, borderWidth: 0, color: textOn(c.rules) },
    pt: { ...card.pt, plate: "bar", plateColor: c.pt, color: textOn(c.pt) },
  };
}

/** Restyles a card as a token from `set`: its measured layout, lettering and colours. */
export function applyTokenSetTemplateV1(
  card: TokenCardV1,
  set: Pick<TokenSetIndexEntryV1, "code" | "era" | "effect" | "look">,
): TokenCardV1 {
  const style = tokenSetFrameStyleV1(set.era);
  const fullArt = style === "token_2015" && set.effect === "fullart";
  let next: TokenCardV1 = {
    ...card,
    familyId: "set_template",
    setCode: set.code,
    frame: { ...card.frame, style },
    title: {
      ...card.title,
      show: true,
      font: "philosopher",
      smallCaps: true,
      weight: 700,
      size: style === "token_2015" ? 38 : 34,
      letterSpacing: 0.5,
      effect: "none",
      treatment: "flat",
      align: "center",
    },
    type: { ...card.type, show: Boolean(card.typeLine.trim()), font: "philosopher", size: 29, plateOpacity: 1 },
    rules: {
      ...card.rules,
      font: "crimson_pro",
      size: 37,
      lineHeight: 1.15,
      padding: 18,
      shadow: false,
      ornaments: false,
    },
    pt: { ...card.pt, show: Boolean(card.power || card.toughness), font: "philosopher", size: 34 },
    art: { ...card.art, mode: fullArt ? "full" : "window" },
    finish: "none",
    panelArt: null,
  };
  next = withMarks(next);
  next = withColors(next, style, fullArt, set.look);
  return withLayout(next, style, set.look);
}

/** Modern legendary tokens wear a gold crown, enchantment tokens a starfield name bar. */
function autoMarks(card: TokenCardV1): { crown: boolean; starfield: boolean } {
  const modern = card.frame.style === "token_2015";
  return { crown: modern && /\blegendary\b/i.test(card.typeLine), starfield: modern && /\benchantment\b/i.test(card.typeLine) };
}

function withMarks(card: TokenCardV1): TokenCardV1 {
  return { ...card, title: { ...card.title, ...autoMarks(card) } };
}

const sameBox = (a: TokenBoxV1, b: TokenBoxV1) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * Keeps a set-styled card looking like its set while it is edited: bar colours
 * follow the card's colours, a lone keyword stays centred, and the layout
 * switches between the vanilla and rules-text versions, unless the customer
 * has moved the layers themselves.
 */
export function syncTokenSetCardV1(prev: TokenCardV1, next: TokenCardV1): TokenCardV1 {
  const style = next.frame.style;
  if (!next.setCode || !isSetFrame(style) || prev.frame.style !== style) return next;
  const look = lookOf(next);
  const era = eraOfStyle(style);
  let out = next;
  if (prev.typeLine !== next.typeLine) {
    const was = autoMarks(prev);
    const now = autoMarks(next);
    out = {
      ...out,
      title: {
        ...out.title,
        crown: Boolean(prev.title.crown) === was.crown ? now.crown : out.title.crown,
        starfield: Boolean(prev.title.starfield) === was.starfield ? now.starfield : out.title.starfield,
      },
    };
  }
  if (prev.colors.join("") !== next.colors.join("")) out = withColors(out, style, out.art.mode === "full", look);
  if (prev.rulesText !== next.rulesText && prev.rules.align === autoRulesAlign(prev, look, era)) {
    out = { ...out, rules: { ...out.rules, align: autoRulesAlign(out, look, era) } };
  }
  if (hasText(prev) !== hasText(next)) {
    const l = layoutFor(era, look, hasText(prev));
    const untouched =
      sameBox(prev.title.box, l.title) && sameBox(prev.type.box, l.type) && sameBox(prev.pt.box, l.pt) && sameBox(prev.art.window, l.art);
    if (untouched) out = withLayout(out, style, look);
  }
  return out;
}

/** Re-applies the set look after the token itself changes (a creature preset, say). */
export function restyleTokenSetCardV1(card: TokenCardV1): TokenCardV1 {
  const style = card.frame.style;
  if (!card.setCode || !isSetFrame(style)) return card;
  const look = lookOf(card);
  return withLayout(withColors(withMarks(card), style, card.art.mode === "full", look), style, look);
}
