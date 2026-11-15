/**
 * One saved token card design.
 *
 * This object is the only description of a card. The editor preview, the 3D
 * card face and the print file are all drawn from it by the same renderer, so
 * whatever a customer approves on screen is what gets printed.
 *
 * Coordinates are in card units: the trimmed card is 630 × 880, a tenth of a
 * millimetre each, so 63 × 88 mm. Bleed and safe margins are expressed in the
 * same units.
 */
export const CARD_W = 630;
export const CARD_H = 880;
/** 3 mm of bleed on every side. */
export const CARD_BLEED = 30;
/** Text and key art should stay this far inside the trim. */
export const CARD_SAFE = 30;

export type TokenFrameStyleV1 =
  | "classic"
  | "ornate"
  | "stone"
  | "metal"
  | "parchment"
  | "borderless"
  | "full_art"
  /** Modern token layout: thin black border, art to the edges, plates over the art. */
  | "token_2015"
  /** 2003-era token layout: textured colour frame, arched art window, small nameplate. */
  | "token_2003"
  | "none";

export type TokenPlateShapeV1 =
  | "bar"
  /** Rounded bar with a light rim, as on modern tokens. */
  | "pill"
  /** A plate that shrinks to fit the text, centred in its box. */
  | "nameplate"
  | "engraved"
  | "stone"
  | "scroll"
  | "curved_metal"
  | "torn"
  | "runic"
  | "none";

export type TokenPanelStyleV1 =
  | "box"
  | "parchment"
  | "tablet"
  | "glass"
  | "translucent"
  | "gothic"
  | "plaque"
  | "leather"
  | "glow"
  | "integrated"
  /** Tinted box with a thin rim in the frame colour, as on real tokens. */
  | "token_box"
  | "none";

export type TokenTreatmentV1 = "flat" | "gold" | "silver" | "stone" | "wood" | "ink" | "parchment" | "magic";
export type TokenTextEffectV1 = "none" | "outline" | "shadow" | "glow" | "emboss" | "engrave";
export type TokenArtModeV1 = "window" | "full" | "beyond" | "under_text";
export type TokenAlignV1 = "left" | "center" | "right";
export type TokenFinishV1 = "none" | "vignette" | "foil" | "grain";

export type TokenBoxV1 = { x: number; y: number; w: number; h: number };

export type TokenFontIdV1 =
  | "philosopher"
  | "crimson_pro"
  | "cinzel"
  | "cinzel_decorative"
  | "unifraktur"
  | "medieval_sharp"
  | "uncial"
  | "im_fell"
  | "eb_garamond"
  | "cormorant"
  | "pirata"
  | "almendra"
  | "metamorphous"
  | "bangers"
  | "creepster"
  | "press_start"
  | "inter";

export type TokenTitleLayerV1 = {
  show: boolean;
  plate: TokenPlateShapeV1;
  plateOpacity: number;
  plateColor: string;
  /** Second colour for a left-to-right fade, as on two-colour tokens. */
  plateColor2?: string | null;
  /** Colour the bar shades to at its ends, as on modern token name bars. */
  plateEdge?: string | null;
  font: TokenFontIdV1;
  size: number;
  weight: 400 | 700;
  color: string;
  letterSpacing: number;
  /** Modern token names are set in small caps. */
  smallCaps?: boolean;
  /** The gold filigree real tokens put over a legendary token's name. */
  crown?: boolean;
  /** The night-sky texture real tokens put in an enchantment token's name bar. */
  starfield?: boolean;
  effect: TokenTextEffectV1;
  treatment: TokenTreatmentV1;
  align: TokenAlignV1;
  box: TokenBoxV1;
};

export type TokenTypeLayerV1 = {
  show: boolean;
  plate: TokenPlateShapeV1;
  plateOpacity: number;
  plateColor: string;
  font: TokenFontIdV1;
  size: number;
  color: string;
  box: TokenBoxV1;
};

export type TokenRulesLayerV1 = {
  show: boolean;
  panel: TokenPanelStyleV1;
  panelOpacity: number;
  panelColor: string;
  borderWidth: number;
  padding: number;
  font: TokenFontIdV1;
  size: number;
  color: string;
  lineHeight: number;
  align: TokenAlignV1;
  shadow: boolean;
  ornaments: boolean;
  showFlavor: boolean;
  box: TokenBoxV1;
};

export type TokenPtLayerV1 = {
  show: boolean;
  plate: TokenPlateShapeV1;
  plateColor: string;
  font: TokenFontIdV1;
  size: number;
  color: string;
  box: TokenBoxV1;
};

export type TokenArtLayerV1 = {
  mode: TokenArtModeV1;
  /** The window the art shows through in `window` mode. */
  window: TokenBoxV1;
  /** 1 fills the area; larger zooms in. */
  zoom: number;
  /** -1…1, how far the crop slides from centre. */
  offsetX: number;
  offsetY: number;
};

export type TokenCardV1 = {
  version: 1;
  kindId: string;
  familyId: string;
  name: string;
  typeLine: string;
  rulesText: string;
  flavorText: string;
  /** `official` only while the text is the Oracle wording we loaded; any edit makes it custom. */
  rulesSource: "official" | "custom" | "none";
  power: string;
  toughness: string;
  /** WUBRG letters, used for theme colour. */
  colors: string[];
  /** WUBRG letters of the set design the customer picked, which colour its bars; null follows `colors`. */
  frameColors?: string[] | null;
  frame: { style: TokenFrameStyleV1; color: string; accent: string };
  title: TokenTitleLayerV1;
  type: TokenTypeLayerV1;
  rules: TokenRulesLayerV1;
  pt: TokenPtLayerV1;
  art: TokenArtLayerV1;
  finish: TokenFinishV1;
  /** An AI-made surface laid into the plates and rules panel. */
  panelArt?: TokenPanelArtV1 | null;
  /** Scryfall token set the card is styled after, e.g. `tfdn`. */
  setCode?: string | null;
  /** The icon at the right end of the type line, where a set symbol sits. */
  symbol?: TokenSymbolV1 | null;
  /** Bottom-to-top drawing order of the text layers; missing ones keep the default place. */
  layerOrder?: TokenStackLayerV1[];
  /** 0…1 per layer, on top of the layer's own plate opacity. */
  layerOpacity?: Partial<Record<TokenStackLayerV1, number>>;
};

export type TokenStackLayerV1 = "title" | "type" | "rules" | "pt" | "symbol";
export const TOKEN_STACK_LAYERS_V1: readonly TokenStackLayerV1[] = ["rules", "type", "pt", "title", "symbol"];

export type TokenSymbolV1 = {
  /** One of `TOKEN_ICONS_V1`, or "upload" for the customer's own picture. */
  icon: string;
  /** The customer's upload when `icon` is "upload". */
  path: string | null;
  color: string;
  /** 0.6…1.6 of the default size. */
  scale: number;
};

/** The layers in drawing order, bottom first, with any the order leaves out in their default place. */
export function tokenLayerOrderV1(card: TokenCardV1): TokenStackLayerV1[] {
  const given = (card.layerOrder ?? []).filter((l, i, all) => TOKEN_STACK_LAYERS_V1.includes(l) && all.indexOf(l) === i);
  return [...given, ...TOKEN_STACK_LAYERS_V1.filter((l) => !given.includes(l))];
}

export type TokenPanelArtV1 = {
  /** Storage path under the owner's token prefix; routes reject any other. */
  path: string;
  title: boolean;
  type: boolean;
  rules: boolean;
  pt: boolean;
  /** How strongly the texture covers the plate's own colour, 0.2 to 1. */
  strength: number;
};

export const TOKEN_FONTS_V1: ReadonlyArray<{ id: TokenFontIdV1; label: string; family: string }> = [
  { id: "philosopher", label: "Philosopher (Magic-style titles)", family: "Philosopher" },
  { id: "crimson_pro", label: "Crimson Pro (Magic-style rules text)", family: "Crimson Pro" },
  { id: "cinzel", label: "Cinzel (classic engraved)", family: "Cinzel" },
  { id: "cinzel_decorative", label: "Cinzel Decorative", family: "Cinzel Decorative" },
  { id: "unifraktur", label: "Gothic blackletter", family: "UnifrakturMaguntia" },
  { id: "medieval_sharp", label: "Medieval Sharp", family: "MedievalSharp" },
  { id: "uncial", label: "Uncial (Celtic)", family: "Uncial Antiqua" },
  { id: "im_fell", label: "IM Fell (old print)", family: "IM Fell English" },
  { id: "eb_garamond", label: "EB Garamond (book)", family: "EB Garamond" },
  { id: "cormorant", label: "Cormorant (elegant)", family: "Cormorant Garamond" },
  { id: "pirata", label: "Pirata One", family: "Pirata One" },
  { id: "almendra", label: "Almendra (calligraphy)", family: "Almendra" },
  { id: "metamorphous", label: "Metamorphous (runic)", family: "Metamorphous" },
  { id: "bangers", label: "Bangers (comic)", family: "Bangers" },
  { id: "creepster", label: "Creepster (horror)", family: "Creepster" },
  { id: "press_start", label: "Press Start (pixel)", family: "Press Start 2P" },
  { id: "inter", label: "Inter (modern)", family: "Inter" },
];

/** All fonts are SIL Open Font License from Google Fonts, so they are free to print commercially. */
export const TOKEN_FONTS_STYLESHEET_V1 =
  "https://fonts.googleapis.com/css2?family=Almendra:wght@400;700&family=Bangers&family=Cinzel+Decorative:wght@400;700&family=Cinzel:wght@400;700&family=Cormorant+Garamond:wght@400;700&family=Creepster&family=Crimson+Pro:ital,wght@0,400;0,700;1,400&family=EB+Garamond:wght@400;700&family=IM+Fell+English&family=Inter:wght@400;700&family=MedievalSharp&family=Metamorphous&family=Philosopher:ital,wght@0,400;0,700;1,400&family=Pirata+One&family=Press+Start+2P&family=Uncial+Antiqua&family=UnifrakturMaguntia&display=block";

export function tokenFontFamilyV1(id: TokenFontIdV1): string {
  return TOKEN_FONTS_V1.find((font) => font.id === id)?.family ?? "Cinzel";
}

export const COLOR_THEME_V1: Record<string, { frame: string; accent: string }> = {
  W: { frame: "#e9e2c9", accent: "#b89a4a" },
  U: { frame: "#2f5f9a", accent: "#9cc4ef" },
  B: { frame: "#2a2430", accent: "#9a86a8" },
  R: { frame: "#9a3324", accent: "#f0a066" },
  G: { frame: "#2f6b3a", accent: "#a9d37f" },
  multi: { frame: "#9a7a2a", accent: "#f2d27a" },
  colorless: { frame: "#7d838c", accent: "#d6dbe2" },
};

export function themeForColorsV1(colors: readonly string[]): { frame: string; accent: string } {
  if (colors.length > 1) return COLOR_THEME_V1.multi!;
  if (colors.length === 1) return COLOR_THEME_V1[colors[0]!] ?? COLOR_THEME_V1.colorless!;
  return COLOR_THEME_V1.colorless!;
}

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
};

const str = (value: unknown, max: number, fallback = ""): string =>
  typeof value === "string" ? value.slice(0, max) : fallback;

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const color = (value: unknown, fallback: string): string =>
  typeof value === "string" && COLOR_RE.test(value) ? value : fallback;

const FRAME_STYLES: TokenFrameStyleV1[] = ["classic", "ornate", "stone", "metal", "parchment", "borderless", "full_art", "token_2015", "token_2003", "none"];
const PLATES: TokenPlateShapeV1[] = ["bar", "pill", "nameplate", "engraved", "stone", "scroll", "curved_metal", "torn", "runic", "none"];
const PANELS: TokenPanelStyleV1[] = ["box", "token_box", "parchment", "tablet", "glass", "translucent", "gothic", "plaque", "leather", "glow", "integrated", "none"];
const TREATMENTS: TokenTreatmentV1[] = ["flat", "gold", "silver", "stone", "wood", "ink", "parchment", "magic"];
const EFFECTS: TokenTextEffectV1[] = ["none", "outline", "shadow", "glow", "emboss", "engrave"];
const ART_MODES: TokenArtModeV1[] = ["window", "full", "beyond", "under_text"];
const ALIGNS: TokenAlignV1[] = ["left", "center", "right"];
const FINISHES: TokenFinishV1[] = ["none", "vignette", "foil", "grain"];
const FONT_IDS = TOKEN_FONTS_V1.map((font) => font.id);

function box(value: unknown, fallback: TokenBoxV1): TokenBoxV1 {
  const v = (value ?? {}) as Partial<TokenBoxV1>;
  const w = clamp(v.w, 20, CARD_W + CARD_BLEED * 2, fallback.w);
  const h = clamp(v.h, 12, CARD_H + CARD_BLEED * 2, fallback.h);
  return {
    x: clamp(v.x, -CARD_BLEED, CARD_W + CARD_BLEED - 20, fallback.x),
    y: clamp(v.y, -CARD_BLEED, CARD_H + CARD_BLEED - 12, fallback.y),
    w,
    h,
  };
}

/**
 * Coerces anything a client sends into a valid card, filling gaps from
 * `fallback`. The server runs every saved design through this, so a hand-made
 * request cannot store a card the renderer cannot draw.
 */
export function sanitizeTokenCardV1(raw: unknown, fallback: TokenCardV1): TokenCardV1 {
  const r = (raw ?? {}) as Partial<TokenCardV1>;
  const f = fallback;
  const t = (r.title ?? {}) as Partial<TokenTitleLayerV1>;
  const ty = (r.type ?? {}) as Partial<TokenTypeLayerV1>;
  const ru = (r.rules ?? {}) as Partial<TokenRulesLayerV1>;
  const p = (r.pt ?? {}) as Partial<TokenPtLayerV1>;
  const a = (r.art ?? {}) as Partial<TokenArtLayerV1>;
  const fr = (r.frame ?? {}) as Partial<TokenCardV1["frame"]>;
  return {
    version: 1,
    kindId: str(r.kindId, 40, f.kindId) || f.kindId,
    familyId: str(r.familyId, 40, f.familyId) || f.familyId,
    name: str(r.name, 60, f.name),
    typeLine: str(r.typeLine, 80, f.typeLine),
    rulesText: str(r.rulesText, 600, f.rulesText),
    flavorText: str(r.flavorText, 240, f.flavorText),
    rulesSource: pick(r.rulesSource, ["official", "custom", "none"] as const, f.rulesSource),
    power: str(r.power, 4, f.power),
    toughness: str(r.toughness, 4, f.toughness),
    colors: Array.isArray(r.colors)
      ? r.colors.filter((c): c is string => typeof c === "string" && /^[WUBRG]$/.test(c)).slice(0, 5)
      : f.colors,
    frameColors: Array.isArray(r.frameColors)
      ? r.frameColors.filter((c): c is string => typeof c === "string" && /^[WUBRG]$/.test(c)).slice(0, 5)
      : r.frameColors === undefined
        ? (f.frameColors ?? null)
        : null,
    frame: {
      style: pick(fr.style, FRAME_STYLES, f.frame.style),
      color: color(fr.color, f.frame.color),
      accent: color(fr.accent, f.frame.accent),
    },
    title: {
      show: typeof t.show === "boolean" ? t.show : f.title.show,
      plate: pick(t.plate, PLATES, f.title.plate),
      plateOpacity: clamp(t.plateOpacity, 0, 1, f.title.plateOpacity),
      plateColor: color(t.plateColor, f.title.plateColor),
      plateColor2: t.plateColor2 === undefined ? f.title.plateColor2 ?? null : COLOR_RE.test(String(t.plateColor2)) ? (t.plateColor2 as string) : null,
      plateEdge: t.plateEdge === undefined ? f.title.plateEdge ?? null : COLOR_RE.test(String(t.plateEdge)) ? (t.plateEdge as string) : null,
      font: pick(t.font, FONT_IDS, f.title.font),
      size: clamp(t.size, 14, 120, f.title.size),
      weight: t.weight === 400 || t.weight === 700 ? t.weight : f.title.weight,
      color: color(t.color, f.title.color),
      letterSpacing: clamp(t.letterSpacing, -2, 20, f.title.letterSpacing),
      smallCaps: typeof t.smallCaps === "boolean" ? t.smallCaps : Boolean(f.title.smallCaps),
      crown: typeof t.crown === "boolean" ? t.crown : Boolean(f.title.crown),
      starfield: typeof t.starfield === "boolean" ? t.starfield : Boolean(f.title.starfield),
      effect: pick(t.effect, EFFECTS, f.title.effect),
      treatment: pick(t.treatment, TREATMENTS, f.title.treatment),
      align: pick(t.align, ALIGNS, f.title.align),
      box: box(t.box, f.title.box),
    },
    type: {
      show: typeof ty.show === "boolean" ? ty.show : f.type.show,
      plate: pick(ty.plate, PLATES, f.type.plate),
      plateOpacity: clamp(ty.plateOpacity, 0, 1, f.type.plateOpacity),
      plateColor: color(ty.plateColor, f.type.plateColor),
      font: pick(ty.font, FONT_IDS, f.type.font),
      size: clamp(ty.size, 12, 60, f.type.size),
      color: color(ty.color, f.type.color),
      box: box(ty.box, f.type.box),
    },
    rules: {
      show: typeof ru.show === "boolean" ? ru.show : f.rules.show,
      panel: pick(ru.panel, PANELS, f.rules.panel),
      panelOpacity: clamp(ru.panelOpacity, 0, 1, f.rules.panelOpacity),
      panelColor: color(ru.panelColor, f.rules.panelColor),
      borderWidth: clamp(ru.borderWidth, 0, 16, f.rules.borderWidth),
      padding: clamp(ru.padding, 0, 60, f.rules.padding),
      font: pick(ru.font, FONT_IDS, f.rules.font),
      size: clamp(ru.size, 12, 60, f.rules.size),
      color: color(ru.color, f.rules.color),
      lineHeight: clamp(ru.lineHeight, 0.9, 2, f.rules.lineHeight),
      align: pick(ru.align, ALIGNS, f.rules.align),
      shadow: typeof ru.shadow === "boolean" ? ru.shadow : f.rules.shadow,
      ornaments: typeof ru.ornaments === "boolean" ? ru.ornaments : f.rules.ornaments,
      showFlavor: typeof ru.showFlavor === "boolean" ? ru.showFlavor : f.rules.showFlavor,
      box: box(ru.box, f.rules.box),
    },
    pt: {
      show: typeof p.show === "boolean" ? p.show : f.pt.show,
      plate: pick(p.plate, PLATES, f.pt.plate),
      plateColor: color(p.plateColor, f.pt.plateColor),
      font: pick(p.font, FONT_IDS, f.pt.font),
      size: clamp(p.size, 14, 90, f.pt.size),
      color: color(p.color, f.pt.color),
      box: box(p.box, f.pt.box),
    },
    art: {
      mode: pick(a.mode, ART_MODES, f.art.mode),
      window: box(a.window, f.art.window),
      zoom: clamp(a.zoom, 1, 4, f.art.zoom),
      offsetX: clamp(a.offsetX, -1, 1, f.art.offsetX),
      offsetY: clamp(a.offsetY, -1, 1, f.art.offsetY),
    },
    finish: pick(r.finish, FINISHES, f.finish),
    panelArt: sanitizePanelArt(r.panelArt === undefined ? f.panelArt : r.panelArt),
    setCode: sanitizeSetCode(r.setCode === undefined ? f.setCode : r.setCode),
    symbol: sanitizeSymbol(r.symbol === undefined ? f.symbol : r.symbol),
    layerOrder: Array.isArray(r.layerOrder)
      ? (r.layerOrder as unknown[]).filter(
          (l, i, all): l is TokenStackLayerV1 => (TOKEN_STACK_LAYERS_V1 as readonly unknown[]).includes(l) && all.indexOf(l) === i,
        )
      : f.layerOrder,
    layerOpacity: sanitizeLayerOpacity(r.layerOpacity === undefined ? f.layerOpacity : r.layerOpacity),
  };
}

function sanitizeSymbol(raw: unknown): TokenSymbolV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<TokenSymbolV1>;
  const icon = typeof v.icon === "string" && /^[a-z_]{2,24}$/.test(v.icon) ? v.icon : null;
  if (!icon) return null;
  const path =
    icon === "upload" && typeof v.path === "string" && /^tokenCreator\/[^.]+\.(png|jpg|webp)$/.test(v.path) && v.path.length <= 300
      ? v.path
      : null;
  if (icon === "upload" && !path) return null;
  return { icon, path, color: color(v.color, "#e8e2cf"), scale: clamp(v.scale, 0.6, 1.6, 1) };
}

function sanitizeLayerOpacity(raw: unknown): Partial<Record<TokenStackLayerV1, number>> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Partial<Record<TokenStackLayerV1, number>> = {};
  for (const l of TOKEN_STACK_LAYERS_V1) {
    const v = (raw as Record<string, unknown>)[l];
    if (typeof v === "number" && Number.isFinite(v)) out[l] = clamp(v, 0, 1, 1);
  }
  return out;
}

function sanitizeSetCode(raw: unknown): string | null {
  return typeof raw === "string" && /^[a-z0-9]{2,8}$/.test(raw) ? raw : null;
}

function sanitizePanelArt(raw: unknown): TokenPanelArtV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Partial<TokenPanelArtV1>;
  if (typeof v.path !== "string" || !/^tokenCreator\/[^.]+\.png$/.test(v.path) || v.path.length > 300) return null;
  const flag = (x: unknown) => x === true;
  return {
    path: v.path,
    title: flag(v.title),
    type: flag(v.type),
    rules: flag(v.rules),
    pt: flag(v.pt),
    strength: clamp(v.strength, 0.2, 1, 0.85),
  };
}

export type TokenLayoutWarningV1 = { layer: string; message: string };

function outsideSafe(b: TokenBoxV1): boolean {
  return (
    b.x < CARD_SAFE ||
    b.y < CARD_SAFE ||
    b.x + b.w > CARD_W - CARD_SAFE ||
    b.y + b.h > CARD_H - CARD_SAFE
  );
}

/** Problems worth telling the customer about before they print. */
export function tokenLayoutWarningsV1(card: TokenCardV1): TokenLayoutWarningV1[] {
  const warnings: TokenLayoutWarningV1[] = [];
  if (card.title.show && card.name.trim() && outsideSafe(card.title.box)) {
    warnings.push({ layer: "Name", message: "The name runs past the safe margin and may be trimmed off." });
  }
  if (card.type.show && card.typeLine.trim() && outsideSafe(card.type.box)) {
    warnings.push({ layer: "Type line", message: "The type line runs past the safe margin." });
  }
  if (card.rules.show && (card.rulesText.trim() || card.flavorText.trim()) && outsideSafe(card.rules.box)) {
    warnings.push({ layer: "Rules text", message: "The rules text runs past the safe margin and may be trimmed off." });
  }
  if (card.pt.show && outsideSafe(card.pt.box)) {
    warnings.push({ layer: "Power/toughness", message: "Power/toughness sits past the safe margin." });
  }
  if (card.rules.show && card.rulesText.trim() && (card.rules.panel === "none" || card.rules.panel === "integrated" || card.rules.panelOpacity < 0.35)) {
    warnings.push({
      layer: "Rules text",
      message: "Rules text without a solid panel can be hard to read over busy art. Check it in the preview.",
    });
  }
  return warnings;
}
