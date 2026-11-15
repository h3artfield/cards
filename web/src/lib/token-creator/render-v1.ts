import {
  CARD_BLEED,
  CARD_H,
  CARD_SAFE,
  CARD_W,
  tokenFontFamilyV1,
  tokenLayerOrderV1,
  TOKEN_FONTS_STYLESHEET_V1,
  type TokenStackLayerV1,
  type TokenAlignV1,
  type TokenBoxV1,
  type TokenCardV1,
  type TokenFontIdV1,
  type TokenPanelStyleV1,
  type TokenPlateShapeV1,
  type TokenTextEffectV1,
  type TokenTreatmentV1,
} from "./design-v1";
import { tokenIconPathV1 } from "./icons-v1";
import { tokenSetIndexEntryV1 } from "./set-index-v1";

/**
 * Draws a token card onto a 2D canvas.
 *
 * The editor preview, the texture on the 3D card and the print file all come
 * out of `drawTokenFrontV1`, at different scales, so they cannot disagree. It
 * runs in the browser because that is where the fonts are; the print file is
 * rendered there at 300 DPI and uploaded when the customer adds it to the cart.
 *
 * Drawing is deterministic: every irregular edge and texture is seeded from the
 * card, never from `Math.random`, so the same design draws the same pixels.
 */

type Ctx = CanvasRenderingContext2D;

/** Card units are 0.1 mm, so 300 DPI is 300 / 254 pixels per unit. */
export const PRINT_SCALE_V1 = 300 / 254;

export type TokenRenderOptionsV1 = {
  art: CanvasImageSource | null;
  artWidth?: number;
  artHeight?: number;
  /** Pixels per card unit. */
  scale: number;
  /** Include the 3 mm bleed around the trim. */
  bleed: boolean;
  /** Editor-only: trim line, safe margin and the selected layer's outline. */
  guides?: boolean;
  selectedLayer?: TokenLayerIdV1 | null;
  /** The decoded `card.panelArt` image; layers fall back to their own fill without it. */
  panelArt?: CanvasImageSource | null;
  /** The decoded upload when `card.symbol.icon` is "upload". */
  symbolArt?: CanvasImageSource | null;
  /** Draw only these parts, each on a clear background (the exploded build view). */
  parts?: ReadonlyArray<TokenPartV1>;
};

/** What the exploded view separates: the art, the frame around it and each text layer. */
export type TokenPartV1 = "art" | "frame" | TokenStackLayerV1 | "finish";

type PanelTexture = { img: CanvasImageSource; strength: number } | null;

function panelTextureFor(card: TokenCardV1, opts: TokenRenderOptionsV1, layer: "title" | "type" | "rules" | "pt"): PanelTexture {
  const p = card.panelArt;
  if (!p || !opts.panelArt || !p[layer]) return null;
  return { img: opts.panelArt, strength: p.strength };
}

export type TokenLayerIdV1 = "title" | "type" | "rules" | "pt" | "art";

export function tokenCanvasSizeV1(scale: number, bleed: boolean): { width: number; height: number } {
  const pad = bleed ? CARD_BLEED * 2 : 0;
  return { width: Math.round((CARD_W + pad) * scale), height: Math.round((CARD_H + pad) * scale) };
}

// --- seeded randomness -------------------------------------------------------

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    s ^= s >>> 13;
    return (s >>> 0) / 4294967296;
  };
}

// --- colour helpers ----------------------------------------------------------

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [128, 128, 128];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (c: number) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

// --- textures ----------------------------------------------------------------

type TextureKind = "stone" | "parchment" | "metal" | "wood" | "leather" | "noise";
const textureCache = new Map<string, HTMLCanvasElement>();

function textureCanvas(kind: TextureKind, base: string): HTMLCanvasElement {
  const key = `${kind}:${base}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext("2d")!;
  const rand = seeded(hashString(key));
  c.fillStyle = base;
  c.fillRect(0, 0, size, size);

  if (kind === "stone" || kind === "noise" || kind === "parchment" || kind === "leather") {
    const img = c.getImageData(0, 0, size, size);
    const strength = kind === "stone" ? 38 : kind === "parchment" ? 22 : kind === "leather" ? 26 : 14;
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (rand() - 0.5) * strength;
      img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
      img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
      img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n));
    }
    c.putImageData(img, 0, 0);
  }
  if (kind === "stone") {
    for (let i = 0; i < 14; i += 1) {
      c.strokeStyle = `rgba(0,0,0,${0.08 + rand() * 0.12})`;
      c.lineWidth = 0.6 + rand();
      c.beginPath();
      let x = rand() * size;
      let y = rand() * size;
      c.moveTo(x, y);
      for (let s = 0; s < 6; s += 1) {
        x += (rand() - 0.5) * 50;
        y += (rand() - 0.5) * 50;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    for (let i = 0; i < 40; i += 1) {
      c.fillStyle = `rgba(${rand() > 0.5 ? "255,255,255" : "0,0,0"},${0.04 + rand() * 0.06})`;
      c.beginPath();
      c.arc(rand() * size, rand() * size, 4 + rand() * 18, 0, Math.PI * 2);
      c.fill();
    }
  }
  if (kind === "parchment") {
    for (let i = 0; i < 30; i += 1) {
      c.fillStyle = `rgba(120, 80, 30, ${0.03 + rand() * 0.05})`;
      c.beginPath();
      c.arc(rand() * size, rand() * size, 10 + rand() * 40, 0, Math.PI * 2);
      c.fill();
    }
  }
  if (kind === "wood") {
    for (let y = 0; y < size; y += 1) {
      const wave = Math.sin(y * 0.09 + Math.sin(y * 0.013) * 4) * 0.5 + 0.5;
      c.fillStyle = `rgba(0,0,0,${0.05 + wave * 0.14})`;
      c.fillRect(0, y, size, 1);
    }
    for (let i = 0; i < 4; i += 1) {
      c.strokeStyle = "rgba(0,0,0,0.18)";
      c.beginPath();
      c.ellipse(rand() * size, rand() * size, 10 + rand() * 12, 3 + rand() * 4, 0, 0, Math.PI * 2);
      c.stroke();
    }
  }
  if (kind === "metal") {
    for (let x = 0; x < size; x += 1) {
      c.fillStyle = `rgba(255,255,255,${rand() * 0.06})`;
      c.fillRect(x, 0, 1, size);
    }
  }
  textureCache.set(key, canvas);
  return canvas;
}

function texturePattern(ctx: Ctx, kind: TextureKind, base: string, scale: number): CanvasPattern | string {
  const pattern = ctx.createPattern(textureCanvas(kind, base), "repeat");
  if (!pattern) return base;
  pattern.setTransform(new DOMMatrix().scale(Math.max(0.5, scale * 1.2)));
  return pattern;
}

function metalGradient(ctx: Ctx, base: string, x: number, y: number, h: number): CanvasGradient {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, shade(base, 0.45));
  g.addColorStop(0.35, shade(base, 0.05));
  g.addColorStop(0.5, shade(base, -0.25));
  g.addColorStop(0.7, shade(base, 0.2));
  g.addColorStop(1, shade(base, -0.35));
  return g;
}

// --- shapes ------------------------------------------------------------------

function roundedRect(p: Path2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  p.moveTo(x + rr, y);
  p.lineTo(x + w - rr, y);
  p.quadraticCurveTo(x + w, y, x + w, y + rr);
  p.lineTo(x + w, y + h - rr);
  p.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  p.lineTo(x + rr, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - rr);
  p.lineTo(x, y + rr);
  p.quadraticCurveTo(x, y, x + rr, y);
  p.closePath();
}

function jaggedRect(p: Path2D, b: TokenBoxV1, s: number, seed: number, amp: number) {
  const rand = seeded(seed);
  const step = 14 * s;
  const pts: Array<[number, number]> = [];
  const x0 = b.x * s;
  const y0 = b.y * s;
  const x1 = (b.x + b.w) * s;
  const y1 = (b.y + b.h) * s;
  for (let x = x0; x < x1; x += step) pts.push([x, y0 + (rand() - 0.5) * amp * s]);
  for (let y = y0; y < y1; y += step) pts.push([x1 + (rand() - 0.5) * amp * s, y]);
  for (let x = x1; x > x0; x -= step) pts.push([x, y1 + (rand() - 0.5) * amp * s]);
  for (let y = y1; y > y0; y -= step) pts.push([x0 + (rand() - 0.5) * amp * s, y]);
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
}

function platePath(shape: TokenPlateShapeV1, b: TokenBoxV1, s: number, seed: number): Path2D {
  const p = new Path2D();
  const x = b.x * s;
  const y = b.y * s;
  const w = b.w * s;
  const h = b.h * s;
  switch (shape) {
    case "engraved": {
      const c = h * 0.32;
      p.moveTo(x + c, y);
      p.lineTo(x + w - c, y);
      p.lineTo(x + w, y + c);
      p.lineTo(x + w, y + h - c);
      p.lineTo(x + w - c, y + h);
      p.lineTo(x + c, y + h);
      p.lineTo(x, y + h - c);
      p.lineTo(x, y + c);
      p.closePath();
      break;
    }
    case "stone": {
      const rand = seeded(seed);
      const j = () => (rand() - 0.5) * h * 0.18;
      p.moveTo(x + h * 0.2 + j(), y + j());
      p.lineTo(x + w * 0.5 + j(), y - h * 0.04 + j());
      p.lineTo(x + w - h * 0.25 + j(), y + j());
      p.lineTo(x + w + j(), y + h * 0.5 + j());
      p.lineTo(x + w - h * 0.18 + j(), y + h + j());
      p.lineTo(x + w * 0.45 + j(), y + h + h * 0.05 + j());
      p.lineTo(x + h * 0.15 + j(), y + h + j());
      p.lineTo(x + j(), y + h * 0.5 + j());
      p.closePath();
      break;
    }
    case "scroll": {
      const end = h * 0.9;
      p.moveTo(x + end * 0.5, y);
      p.lineTo(x + w - end * 0.5, y);
      p.quadraticCurveTo(x + w - end * 0.1, y + h * 0.5, x + w - end * 0.5, y + h);
      p.lineTo(x + end * 0.5, y + h);
      p.quadraticCurveTo(x + end * 0.1, y + h * 0.5, x + end * 0.5, y);
      p.closePath();
      break;
    }
    case "curved_metal": {
      const bulge = h * 0.22;
      p.moveTo(x, y + h * 0.5);
      p.lineTo(x + h * 0.45, y + bulge * 0.4);
      p.quadraticCurveTo(x + w / 2, y - bulge, x + w - h * 0.45, y + bulge * 0.4);
      p.lineTo(x + w, y + h * 0.5);
      p.lineTo(x + w - h * 0.45, y + h - bulge * 0.4);
      p.quadraticCurveTo(x + w / 2, y + h + bulge, x + h * 0.45, y + h - bulge * 0.4);
      p.closePath();
      break;
    }
    case "torn":
      jaggedRect(p, b, s, seed, 7);
      break;
    case "pill":
      tokenBarPath(p, x, y, w, h);
      break;
    case "nameplate": {
      const c = h * 0.16;
      p.moveTo(x + c, y);
      p.lineTo(x + w - c, y);
      p.lineTo(x + w, y + c);
      p.lineTo(x + w, y + h - c);
      p.lineTo(x + w - c, y + h);
      p.lineTo(x + c, y + h);
      p.lineTo(x, y + h - c);
      p.lineTo(x, y + c);
      p.closePath();
      break;
    }
    case "runic": {
      const n = h * 0.5;
      p.moveTo(x + n, y);
      p.lineTo(x + w * 0.3, y);
      p.lineTo(x + w * 0.32, y + h * 0.12);
      p.lineTo(x + w * 0.68, y + h * 0.12);
      p.lineTo(x + w * 0.7, y);
      p.lineTo(x + w - n, y);
      p.lineTo(x + w, y + h / 2);
      p.lineTo(x + w - n, y + h);
      p.lineTo(x + w * 0.7, y + h);
      p.lineTo(x + w * 0.68, y + h * 0.88);
      p.lineTo(x + w * 0.32, y + h * 0.88);
      p.lineTo(x + w * 0.3, y + h);
      p.lineTo(x + n, y + h);
      p.lineTo(x, y + h / 2);
      p.closePath();
      break;
    }
    case "bar":
    default:
      roundedRect(p, x, y, w, h, h * 0.28);
  }
  return p;
}

/** A modern token bar: straight top and bottom, ends bowed out in a shallow arc. */
export function tokenBarPath(p: Path2D, x: number, y: number, w: number, h: number) {
  const e = Math.min(h * 0.2, w * 0.08);
  p.moveTo(x + e, y);
  p.lineTo(x + w - e, y);
  p.quadraticCurveTo(x + w + e, y + h / 2, x + w - e, y + h);
  p.lineTo(x + e, y + h);
  p.quadraticCurveTo(x - e, y + h / 2, x + e, y);
  p.closePath();
}

/** Coloured rim, thin black keyline, then a flat fill, as on real 2015-frame tokens. */
function drawTokenBar(ctx: Ctx, color: string, color2: string | null, rim: string, b: TokenBoxV1, s: number, texture: PanelTexture) {
  const r = Math.min(6, Math.max(3, b.h * 0.085));
  const inset = { x: b.x + r, y: b.y + r, w: b.w - r * 2, h: b.h - r * 2 };
  const outer = new Path2D();
  tokenBarPath(outer, b.x * s, b.y * s, b.w * s, b.h * s);
  const inner = new Path2D();
  tokenBarPath(inner, inset.x * s, inset.y * s, inset.w * s, inset.h * s);

  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 4 * s;
  ctx.shadowOffsetY = 1.5 * s;
  ctx.fillStyle = rim;
  ctx.fill(outer);
  ctx.shadowColor = "transparent";
  const bevel = ctx.createLinearGradient(0, b.y * s, 0, (b.y + b.h) * s);
  bevel.addColorStop(0, "rgba(255,255,255,0.3)");
  bevel.addColorStop(0.5, "rgba(255,255,255,0)");
  bevel.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = bevel;
  ctx.fill(outer);
  ctx.lineWidth = 1.1 * s;
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.stroke(outer);

  if (color2) {
    const fade = ctx.createLinearGradient(inset.x * s, 0, (inset.x + inset.w) * s, 0);
    fade.addColorStop(0.15, color);
    fade.addColorStop(0.85, color2);
    ctx.fillStyle = fade;
  } else {
    const g = ctx.createLinearGradient(0, inset.y * s, 0, (inset.y + inset.h) * s);
    g.addColorStop(0, shade(color, 0.06));
    g.addColorStop(1, shade(color, -0.06));
    ctx.fillStyle = g;
  }
  ctx.fill(inner);
  if (texture) drawTextureInto(ctx, inner, inset, s, texture);
  ctx.save();
  ctx.clip(inner);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(inset.x * s, inset.y * s, inset.w * s, Math.max(1.5, inset.h * 0.07) * s);
  ctx.restore();
  ctx.lineWidth = 1.8 * s;
  ctx.strokeStyle = "#0b0b0c";
  ctx.stroke(inner);
}

function plateFill(ctx: Ctx, shape: TokenPlateShapeV1, color: string, b: TokenBoxV1, s: number): CanvasPattern | CanvasGradient | string {
  if (shape === "stone") return texturePattern(ctx, "stone", color, s);
  if (shape === "torn" || shape === "scroll") return texturePattern(ctx, "parchment", color, s);
  if (shape === "curved_metal" || shape === "engraved" || shape === "nameplate") return metalGradient(ctx, color, b.x * s, b.y * s, b.h * s);
  const g = ctx.createLinearGradient(0, b.y * s, 0, (b.y + b.h) * s);
  g.addColorStop(0, shade(color, 0.18));
  g.addColorStop(1, shade(color, -0.12));
  return g;
}

/** Lays a texture into `path`, cropped to cover the box like the art does. */
function drawTextureInto(ctx: Ctx, path: Path2D, b: TokenBoxV1, s: number, texture: NonNullable<PanelTexture>) {
  const img = texture.img as CanvasImageSource & { width?: number; height?: number };
  const sw = img.width ?? 1536;
  const sh = img.height ?? 1024;
  const tw = b.w * s;
  const th = b.h * s;
  const cover = Math.max(tw / sw, th / sh);
  const visW = tw / cover;
  const visH = th / cover;
  ctx.save();
  ctx.clip(path);
  ctx.globalAlpha *= texture.strength;
  ctx.drawImage(texture.img, (sw - visW) / 2, (sh - visH) / 2, visW, visH, b.x * s, b.y * s, tw, th);
  ctx.restore();
}

function drawPlate(
  ctx: Ctx,
  shape: TokenPlateShapeV1,
  color: string,
  opacity: number,
  accent: string,
  b: TokenBoxV1,
  s: number,
  seed: number,
  texture: PanelTexture = null,
  color2: string | null = null,
  edge: string | null = null,
) {
  if (shape === "none" || opacity <= 0) return;
  const path = platePath(shape, b, s, seed);
  ctx.save();
  ctx.globalAlpha *= opacity;
  if (shape === "pill") {
    drawTokenBar(ctx, color, color2, edge ?? accent, b, s, texture);
    ctx.restore();
    return;
  }
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 8 * s;
  ctx.shadowOffsetY = 3 * s;
  ctx.fillStyle = plateFill(ctx, shape, color, b, s);
  ctx.fill(path);
  ctx.shadowColor = "transparent";
  if (texture) drawTextureInto(ctx, path, b, s, texture);
  ctx.lineWidth = 2.5 * s;
  ctx.strokeStyle = shape === "torn" ? rgba("#3a2a16", 0.35) : shape === "nameplate" ? shade(color, -0.5) : shade(accent, -0.25);
  ctx.stroke(path);
  if (shape === "engraved" || shape === "curved_metal" || shape === "runic" || shape === "nameplate") {
    ctx.save();
    ctx.clip(path);
    ctx.lineWidth = 1.5 * s;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.translate(0, 2 * s);
    ctx.stroke(path);
    ctx.restore();
  }
  if (shape === "scroll") {
    ctx.fillStyle = shade(color, -0.3);
    const x = b.x * s;
    const y = b.y * s;
    const h = b.h * s;
    const w = b.w * s;
    ctx.beginPath();
    ctx.ellipse(x + h * 0.45, y + h / 2, h * 0.16, h * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w - h * 0.45, y + h / 2, h * 0.16, h * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// --- text --------------------------------------------------------------------

function fontString(font: TokenFontIdV1, size: number, weight: number, italic = false, smallCaps = false): string {
  return `${italic ? "italic " : ""}${smallCaps ? "small-caps " : ""}${weight} ${size}px "${tokenFontFamilyV1(font)}", Georgia, serif`;
}

function treatmentFill(ctx: Ctx, treatment: TokenTreatmentV1, color: string, y: number, h: number): string | CanvasGradient {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  switch (treatment) {
    case "gold":
      g.addColorStop(0, "#fff3b8");
      g.addColorStop(0.45, "#e2b54a");
      g.addColorStop(0.55, "#9c6b17");
      g.addColorStop(1, "#f6d77a");
      return g;
    case "silver":
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.45, "#c6ced8");
      g.addColorStop(0.55, "#7a8490");
      g.addColorStop(1, "#e9eef4");
      return g;
    case "wood":
      g.addColorStop(0, shade(color, 0.15));
      g.addColorStop(1, shade(color, -0.2));
      return g;
    case "stone":
      g.addColorStop(0, shade(color, 0.12));
      g.addColorStop(1, shade(color, -0.15));
      return g;
    default:
      return color;
  }
}

function drawStyledText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  opts: {
    fill: string | CanvasGradient;
    color: string;
    effect: TokenTextEffectV1;
    treatment: TokenTreatmentV1;
    s: number;
    accent: string;
  },
) {
  const { s } = opts;
  const dark = luminance(opts.color) > 0.5;
  ctx.save();
  if (opts.effect === "emboss" || opts.effect === "engrave") {
    const up = opts.effect === "emboss" ? -1 : 1;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(text, x, y + up * 1.6 * s);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(text, x, y - up * 1.6 * s);
  }
  if (opts.effect === "shadow") {
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 8 * s;
    ctx.shadowOffsetY = 3 * s;
  }
  if (opts.effect === "glow" || opts.treatment === "magic") {
    ctx.shadowColor = opts.treatment === "magic" ? opts.accent : opts.color;
    ctx.shadowBlur = 18 * s;
    ctx.fillStyle = opts.fill;
    ctx.fillText(text, x, y);
  }
  if (opts.effect === "outline") {
    ctx.lineJoin = "round";
    ctx.lineWidth = 5 * s;
    ctx.strokeStyle = dark ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.9)";
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = opts.fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function alignX(align: TokenAlignV1, b: TokenBoxV1, s: number, pad: number): number {
  if (align === "center") return (b.x + b.w / 2) * s;
  if (align === "right") return (b.x + b.w - pad) * s;
  return (b.x + pad) * s;
}

function fitSingleLine(ctx: Ctx, text: string, font: TokenFontIdV1, size: number, weight: number, maxWidth: number, spacing: number, smallCaps = false): number {
  let current = size;
  const step = Math.max(0.25, size / 60);
  for (; current > size * 0.2; current -= step) {
    ctx.font = fontString(font, current, weight, false, smallCaps);
    const width = ctx.measureText(text).width + spacing * Math.max(0, text.length - 1);
    if (width <= maxWidth) break;
  }
  return current;
}

function setSpacing(ctx: Ctx, px: number) {
  const c = ctx as Ctx & { letterSpacing?: string };
  if ("letterSpacing" in c) c.letterSpacing = `${px}px`;
}

function drawLineLayer(
  ctx: Ctx,
  text: string,
  layer: {
    plate: TokenPlateShapeV1;
    plateColor: string;
    plateColor2?: string | null;
    plateEdge?: string | null;
    plateOpacity: number;
    font: TokenFontIdV1;
    size: number;
    weight: number;
    color: string;
    letterSpacing: number;
    smallCaps?: boolean;
    crown?: boolean;
    starfield?: boolean;
    effect: TokenTextEffectV1;
    treatment: TokenTreatmentV1;
    align: TokenAlignV1;
    box: TokenBoxV1;
    /** Where the text goes when something else (the type-line icon) takes part of the plate. */
    textBox?: TokenBoxV1;
  },
  s: number,
  accent: string,
  seed: number,
  texture: PanelTexture = null,
) {
  const pad = layer.plate === "none" ? 4 : layer.box.h * 0.38;
  const spacing = layer.letterSpacing * s;
  const smallCaps = Boolean(layer.smallCaps);
  const textBox = layer.textBox ?? layer.box;
  const size = text.trim()
    ? fitSingleLine(ctx, text, layer.font, layer.size * s, layer.weight, (textBox.w - pad * 2) * s, spacing, smallCaps)
    : layer.size * s;
  let plateBox = layer.box;
  if (layer.plate === "nameplate" && text.trim()) {
    ctx.save();
    ctx.font = fontString(layer.font, size, layer.weight, false, smallCaps);
    const textW = (ctx.measureText(text).width + spacing * Math.max(0, text.length - 1)) / s;
    ctx.restore();
    const w = Math.min(layer.box.w, textW + layer.box.h * 1.1);
    const x =
      layer.align === "left" ? layer.box.x : layer.align === "right" ? layer.box.x + layer.box.w - w : layer.box.x + (layer.box.w - w) / 2;
    plateBox = { ...layer.box, x, w };
  }
  if (layer.crown) drawCrown(ctx, plateBox, s, "behind", null);
  drawPlate(ctx, layer.plate, layer.plateColor, layer.plateOpacity, accent, plateBox, s, seed, texture, layer.plateColor2 ?? null, layer.plateEdge ?? null);
  if (layer.starfield && layer.plate !== "none") drawStarfield(ctx, platePath(layer.plate, plateBox, s, seed), plateBox, s, seed);
  if (layer.crown) drawCrown(ctx, plateBox, s, "rim", layer.plate === "none" ? null : platePath(layer.plate, plateBox, s, seed));
  if (!text.trim()) return;
  ctx.save();
  ctx.font = fontString(layer.font, size, layer.weight, false, smallCaps);
  setSpacing(ctx, spacing);
  ctx.textAlign = layer.align;
  ctx.textBaseline = "middle";
  const x = alignX(layer.align, textBox, s, pad);
  const y = (layer.box.y + layer.box.h / 2) * s + size * 0.04;
  drawStyledText(ctx, text, x, y, {
    fill: treatmentFill(ctx, layer.treatment, layer.color, y - size / 2, size),
    color: layer.color,
    effect: layer.effect,
    treatment: layer.treatment,
    s,
    accent,
  });
  ctx.restore();
}

// --- legendary crown, enchantment starfield, type-line symbol ---------------

function goldFill(ctx: Ctx, y0: number, y1: number): CanvasGradient {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, "#fff1b0");
  g.addColorStop(0.35, "#e0b04a");
  g.addColorStop(0.6, "#8f5f16");
  g.addColorStop(1, "#f2cf72");
  return g;
}

/**
 * The gold crest real legendary tokens wear over the name bar. "behind" draws
 * the crest so the bar covers its foot; "rim" then edges the bar in gold.
 */
function drawCrown(ctx: Ctx, b: TokenBoxV1, s: number, pass: "behind" | "rim", plate: Path2D | null) {
  const x = b.x * s;
  const y = b.y * s;
  const w = b.w * s;
  const h = b.h * s;
  ctx.save();
  if (pass === "rim") {
    if (plate) {
      ctx.lineWidth = 4 * s;
      ctx.strokeStyle = goldFill(ctx, y, y + h);
      ctx.stroke(plate);
    }
    ctx.restore();
    return;
  }
  const cx = x + w / 2;
  const half = Math.min(w * 0.42, h * 5);
  const rise = Math.min(h * 0.62, y + 2 * s);
  const base = y + h * 0.5;
  const crest = new Path2D();
  crest.moveTo(cx - half, base);
  crest.bezierCurveTo(cx - half * 0.9, y - rise * 0.25, cx - half * 0.55, y - rise * 0.55, cx - h * 0.5, y - rise * 0.6);
  crest.quadraticCurveTo(cx - h * 0.16, y - rise * 0.66, cx, y - rise);
  crest.quadraticCurveTo(cx + h * 0.16, y - rise * 0.66, cx + h * 0.5, y - rise * 0.6);
  crest.bezierCurveTo(cx + half * 0.55, y - rise * 0.55, cx + half * 0.9, y - rise * 0.25, cx + half, base);
  crest.closePath();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 6 * s;
  ctx.shadowOffsetY = 2 * s;
  ctx.fillStyle = goldFill(ctx, y - rise, base);
  ctx.fill(crest);
  ctx.shadowColor = "transparent";
  ctx.lineWidth = 1.6 * s;
  ctx.strokeStyle = "rgba(60,36,6,0.9)";
  ctx.stroke(crest);
  // Engraved filigree: scrolls curling out from the centre gem.
  ctx.lineWidth = 1.2 * s;
  ctx.strokeStyle = "rgba(70,40,6,0.75)";
  for (const side of [-1, 1]) {
    for (const k of [0.32, 0.62]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * h * 0.2, y - rise * 0.3);
      ctx.bezierCurveTo(
        cx + side * half * k * 0.5,
        y - rise * (0.75 - k * 0.4),
        cx + side * half * k,
        y - rise * 0.1,
        cx + side * half * (k + 0.12),
        y - rise * 0.32,
      );
      ctx.arc(cx + side * half * (k + 0.12) - side * h * 0.07, y - rise * 0.32, h * 0.07, side > 0 ? 0 : Math.PI, side > 0 ? Math.PI * 1.6 : -Math.PI * 0.6, side < 0);
      ctx.stroke();
    }
  }
  const gem = new Path2D();
  const gy = y - rise * 0.5;
  gem.moveTo(cx, gy - h * 0.2);
  gem.lineTo(cx + h * 0.13, gy);
  gem.lineTo(cx, gy + h * 0.2);
  gem.lineTo(cx - h * 0.13, gy);
  gem.closePath();
  const gemFill = ctx.createLinearGradient(0, gy - h * 0.2, 0, gy + h * 0.2);
  gemFill.addColorStop(0, "#ffffff");
  gemFill.addColorStop(1, "#f0d27a");
  ctx.fillStyle = gemFill;
  ctx.fill(gem);
  ctx.lineWidth = 1.2 * s;
  ctx.stroke(gem);
  ctx.restore();
}

/** The night sky real enchantment tokens put inside the name bar. */
function drawStarfield(ctx: Ctx, path: Path2D, b: TokenBoxV1, s: number, seed: number) {
  const rand = seeded(seed ^ 0x5f3759df);
  const x = b.x * s;
  const y = b.y * s;
  const w = b.w * s;
  const h = b.h * s;
  ctx.save();
  ctx.clip(path);
  const dusk = ctx.createLinearGradient(x, 0, x + w, 0);
  dusk.addColorStop(0, "rgba(8,6,28,0.6)");
  dusk.addColorStop(0.5, "rgba(36,18,64,0.38)");
  dusk.addColorStop(1, "rgba(8,6,28,0.6)");
  ctx.fillStyle = dusk;
  ctx.fillRect(x, y, w, h);
  for (let i = 0; i < 3; i += 1) {
    const nx = x + rand() * w;
    const ny = y + rand() * h;
    const neb = ctx.createRadialGradient(nx, ny, 0, nx, ny, h * 1.3);
    neb.addColorStop(0, "rgba(160,130,255,0.22)");
    neb.addColorStop(1, "rgba(160,130,255,0)");
    ctx.fillStyle = neb;
    ctx.fillRect(x, y, w, h);
  }
  const count = Math.round(b.w / 5);
  ctx.fillStyle = "#ffffff";
  for (let i = 0; i < count; i += 1) {
    const r = (0.35 + rand() * rand() * 1.5) * s;
    ctx.globalAlpha = 0.45 + rand() * 0.55;
    ctx.beginPath();
    ctx.arc(x + rand() * w, y + rand() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 0.6 * s;
  for (let i = 0; i < 4; i += 1) {
    const sx = x + rand() * w;
    const sy = y + rand() * h;
    const len = (2 + rand() * 2.5) * s;
    ctx.beginPath();
    ctx.moveTo(sx - len, sy);
    ctx.lineTo(sx + len, sy);
    ctx.moveTo(sx, sy - len);
    ctx.lineTo(sx, sy + len);
    ctx.stroke();
  }
  ctx.restore();
}

/** Where the type-line icon sits: the right end of the type bar, where a set symbol goes. */
export function tokenSymbolBoxV1(card: TokenCardV1): TokenBoxV1 | null {
  if (!card.symbol || !card.type.show) return null;
  const b = card.type.box;
  const size = Math.min(b.h * 0.8 * card.symbol.scale, b.h * 1.1);
  const pad = b.h * 0.3;
  return { x: b.x + b.w - pad - size, y: b.y + (b.h - size) / 2, w: size, h: size };
}

function drawTypeIcon(ctx: Ctx, card: TokenCardV1, opts: TokenRenderOptionsV1, s: number) {
  const box = tokenSymbolBoxV1(card);
  const sym = card.symbol;
  if (!box || !sym) return;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = 3 * s;
  ctx.shadowOffsetY = 1 * s;
  if (sym.icon === "upload") {
    const img = opts.symbolArt as (CanvasImageSource & { width?: number; height?: number }) | null | undefined;
    if (img) {
      const iw = img.width ?? 1;
      const ih = img.height ?? 1;
      const fit = Math.min(box.w / iw, box.h / ih);
      const dw = iw * fit;
      const dh = ih * fit;
      ctx.drawImage(img, (box.x + (box.w - dw) / 2) * s, (box.y + (box.h - dh) / 2) * s, dw * s, dh * s);
    }
    ctx.restore();
    return;
  }
  const d = tokenIconPathV1(sym.icon);
  if (!d) {
    ctx.restore();
    return;
  }
  const unit = (box.w * s) / 24;
  ctx.translate(box.x * s, box.y * s);
  ctx.scale(unit, unit);
  const path = new Path2D(d);
  ctx.lineJoin = "round";
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.stroke(path);
  ctx.shadowColor = "transparent";
  const g = ctx.createLinearGradient(0, 0, 0, 24);
  g.addColorStop(0, shade(sym.color, 0.35));
  g.addColorStop(0.55, sym.color);
  g.addColorStop(1, shade(sym.color, -0.35));
  ctx.fillStyle = g;
  ctx.fill(path, "evenodd");
  ctx.restore();
}

// --- rules text with mana symbols -------------------------------------------

type Piece = { kind: "word"; text: string } | { kind: "symbol"; code: string } | { kind: "space" };

function tokenizeRules(text: string): Piece[][] {
  return text.split(/\n/).map((paragraph) => {
    const pieces: Piece[] = [];
    const re = /(\{[^}]{1,4}\})|(\s+)|([^\s{]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(paragraph))) {
      if (m[1]) pieces.push({ kind: "symbol", code: m[1].slice(1, -1).toUpperCase() });
      else if (m[2]) pieces.push({ kind: "space" });
      else if (m[3]) pieces.push({ kind: "word", text: m[3] });
    }
    return pieces;
  });
}

const SYMBOL_FILL: Record<string, string> = {
  W: "#f8f1d0",
  U: "#a9cfee",
  B: "#c2b6b4",
  R: "#f2a387",
  G: "#9fd2a6",
  C: "#d3cdc7",
};

function drawSymbol(ctx: Ctx, code: string, x: number, baseline: number, size: number) {
  const r = size * 0.42;
  const cx = x + r;
  const cy = baseline - size * 0.33;
  ctx.save();
  ctx.fillStyle = SYMBOL_FILL[code] ?? "#d3cdc7";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.stroke();
  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (code === "T" || code === "Q") {
    ctx.lineWidth = size * 0.09;
    ctx.strokeStyle = "#111";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, Math.PI * 0.9, Math.PI * 2.25, code === "Q");
    ctx.stroke();
    const tipAngle = code === "Q" ? Math.PI * 0.9 : Math.PI * 2.25;
    const tx = cx + Math.cos(tipAngle) * r * 0.5;
    const ty = cy + Math.sin(tipAngle) * r * 0.5;
    ctx.beginPath();
    ctx.moveTo(tx - r * 0.22, ty - r * 0.05);
    ctx.lineTo(tx + r * 0.2, ty - r * 0.12);
    ctx.lineTo(tx + r * 0.02, ty + r * 0.28);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.font = `700 ${size * 0.58}px Inter, Arial, sans-serif`;
    ctx.fillText(code, cx, cy + size * 0.02);
  }
  ctx.restore();
  return r * 2 + size * 0.08;
}

type LaidLine = { items: Array<{ piece: Piece; width: number }>; width: number };

function layoutParagraphs(ctx: Ctx, paragraphs: Piece[][], size: number, maxWidth: number): LaidLine[][] {
  const spaceWidth = ctx.measureText(" ").width;
  const symbolWidth = size * 0.92;
  return paragraphs.map((pieces) => {
    const lines: LaidLine[] = [];
    let current: LaidLine = { items: [], width: 0 };
    for (const piece of pieces) {
      const width = piece.kind === "word" ? ctx.measureText(piece.text).width : piece.kind === "symbol" ? symbolWidth : spaceWidth;
      if (piece.kind === "space" && current.items.length === 0) continue;
      if (piece.kind !== "space" && current.width + width > maxWidth && current.items.length > 0) {
        while (current.items.length && current.items[current.items.length - 1]!.piece.kind === "space") {
          current.width -= current.items.pop()!.width;
        }
        lines.push(current);
        current = { items: [], width: 0 };
      }
      current.items.push({ piece, width });
      current.width += width;
    }
    if (current.items.length) lines.push(current);
    return lines;
  });
}

function panelPath(style: TokenPanelStyleV1, b: TokenBoxV1, s: number, seed: number): Path2D {
  const p = new Path2D();
  const x = b.x * s;
  const y = b.y * s;
  const w = b.w * s;
  const h = b.h * s;
  if (style === "gothic") {
    const arch = Math.min(h * 0.22, 46 * s);
    p.moveTo(x, y + arch);
    p.quadraticCurveTo(x + w * 0.25, y + arch * 0.2, x + w / 2, y);
    p.quadraticCurveTo(x + w * 0.75, y + arch * 0.2, x + w, y + arch);
    p.lineTo(x + w, y + h);
    p.lineTo(x, y + h);
    p.closePath();
  } else if (style === "tablet") {
    const c = 16 * s;
    p.moveTo(x + c, y);
    p.lineTo(x + w - c, y);
    p.lineTo(x + w, y + c);
    p.lineTo(x + w, y + h - c);
    p.lineTo(x + w - c, y + h);
    p.lineTo(x + c, y + h);
    p.lineTo(x, y + h - c);
    p.lineTo(x, y + c);
    p.closePath();
  } else if (style === "parchment") {
    jaggedRect(p, b, s, seed, 5);
  } else {
    roundedRect(p, x, y, w, h, style === "box" || style === "token_box" ? 6 * s : 14 * s);
  }
  return p;
}

function drawPanel(ctx: Ctx, card: TokenCardV1, s: number, seed: number, texture: PanelTexture) {
  const r = card.rules;
  if (r.panel === "none" || r.panel === "glow" || r.panel === "integrated") return;
  const path = panelPath(r.panel, r.box, s, seed);
  const accent = card.frame.accent;
  ctx.save();
  ctx.globalAlpha *= r.panelOpacity;
  if (r.panel !== "glass" && r.panel !== "translucent" && r.panel !== "token_box") {
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 10 * s;
    ctx.shadowOffsetY = 3 * s;
  }
  switch (r.panel) {
    case "parchment":
      ctx.fillStyle = texturePattern(ctx, "parchment", r.panelColor, s);
      break;
    case "tablet":
      ctx.fillStyle = texturePattern(ctx, "stone", r.panelColor, s);
      break;
    case "leather":
      ctx.fillStyle = texturePattern(ctx, "leather", r.panelColor, s);
      break;
    case "gothic":
      ctx.fillStyle = texturePattern(ctx, "noise", r.panelColor, s);
      break;
    case "plaque": {
      ctx.fillStyle = metalGradient(ctx, accent, r.box.x * s, r.box.y * s, r.box.h * s);
      break;
    }
    default:
      ctx.fillStyle = r.panelColor;
  }
  ctx.fill(path);
  ctx.shadowColor = "transparent";
  if (texture) drawTextureInto(ctx, path, r.box, s, texture);

  if (r.panel === "plaque" && !texture) {
    const inset = 10;
    const inner = new Path2D();
    roundedRect(inner, (r.box.x + inset) * s, (r.box.y + inset) * s, (r.box.w - inset * 2) * s, (r.box.h - inset * 2) * s, 8 * s);
    ctx.fillStyle = texturePattern(ctx, "noise", r.panelColor, s);
    ctx.fill(inner);
    ctx.fillStyle = shade(accent, -0.35);
    for (const [cx, cy] of [
      [r.box.x + 5, r.box.y + 5],
      [r.box.x + r.box.w - 5, r.box.y + 5],
      [r.box.x + 5, r.box.y + r.box.h - 5],
      [r.box.x + r.box.w - 5, r.box.y + r.box.h - 5],
    ] as const) {
      ctx.beginPath();
      ctx.arc(cx * s, cy * s, 3 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (r.panel === "glass") {
    const g = ctx.createLinearGradient(0, r.box.y * s, 0, (r.box.y + r.box.h * 0.5) * s);
    g.addColorStop(0, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = g;
    ctx.fillRect(r.box.x * s, r.box.y * s, r.box.w * s, r.box.h * 0.5 * s);
    ctx.restore();
  }
  if (r.panel === "token_box" && card.frame.style === "token_2015") {
    ctx.globalAlpha = Math.min(1, ctx.globalAlpha / Math.max(0.01, r.panelOpacity));
    ctx.lineWidth = Math.max(r.borderWidth, 2.5) * s;
    ctx.strokeStyle = shade(r.panelColor, 0.5);
    ctx.stroke(path);
  } else if (r.borderWidth > 0 && r.panel !== "translucent") {
    ctx.lineWidth = r.borderWidth * s;
    ctx.strokeStyle =
      r.panel === "glass" ? "rgba(255,255,255,0.7)" : r.panel === "token_box" ? accent : shade(accent, -0.15);
    ctx.stroke(path);
  }
  if (r.panel === "leather") {
    const inset = 8;
    const stitch = new Path2D();
    roundedRect(stitch, (r.box.x + inset) * s, (r.box.y + inset) * s, (r.box.w - inset * 2) * s, (r.box.h - inset * 2) * s, 10 * s);
    ctx.setLineDash([6 * s, 5 * s]);
    ctx.lineWidth = 1.6 * s;
    ctx.strokeStyle = "rgba(255,240,210,0.6)";
    ctx.stroke(stitch);
    ctx.setLineDash([]);
  }
  if (r.panel === "tablet" || r.panel === "gothic") {
    ctx.save();
    ctx.clip(path);
    ctx.lineWidth = 3 * s;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.translate(2 * s, 2 * s);
    ctx.stroke(path);
    ctx.restore();
  }
  ctx.restore();

  if (r.ornaments) {
    ctx.save();
    ctx.fillStyle = accent;
    ctx.strokeStyle = shade(accent, -0.3);
    const cx = (r.box.x + r.box.w / 2) * s;
    for (const cy of [r.box.y * s, (r.box.y + r.box.h) * s]) {
      ctx.beginPath();
      ctx.moveTo(cx - 14 * s, cy);
      ctx.lineTo(cx, cy - 8 * s);
      ctx.lineTo(cx + 14 * s, cy);
      ctx.lineTo(cx, cy + 8 * s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(cx - 70 * s, cy);
      ctx.lineTo(cx - 20 * s, cy);
      ctx.moveTo(cx + 20 * s, cy);
      ctx.lineTo(cx + 70 * s, cy);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRules(ctx: Ctx, card: TokenCardV1, s: number, seed: number, texture: PanelTexture) {
  const r = card.rules;
  const rules = card.rulesText.trim();
  const flavor = r.showFlavor ? card.flavorText.trim() : "";
  if (!rules && !flavor) {
    if (r.panel !== "none" && r.panel !== "glow" && r.panel !== "integrated") drawPanel(ctx, card, s, seed, texture);
    return;
  }
  drawPanel(ctx, card, s, seed, texture);

  const pad = r.padding * s;
  const maxWidth = r.box.w * s - pad * 2;
  const maxHeight = r.box.h * s - pad * 2;
  const rulesParas = rules ? tokenizeRules(rules) : [];
  const flavorParas = flavor ? tokenizeRules(flavor.replace(/[{}]/g, "")) : [];

  let size = r.size * s;
  let rulesLines: LaidLine[][] = [];
  let flavorLines: LaidLine[][] = [];
  let total = 0;
  for (; size > 10 * s; size -= 1) {
    ctx.font = fontString(r.font, size, 400);
    rulesLines = layoutParagraphs(ctx, rulesParas, size, maxWidth);
    ctx.font = fontString(r.font, size, 400, true);
    flavorLines = layoutParagraphs(ctx, flavorParas, size, maxWidth);
    const lh = size * r.lineHeight;
    const ruleCount = rulesLines.reduce((n, p) => n + p.length, 0);
    const flavorCount = flavorLines.reduce((n, p) => n + p.length, 0);
    const gaps = Math.max(0, rulesLines.length - 1) * size * 0.35 + (rules && flavor ? size * 0.7 : 0);
    total = (ruleCount + flavorCount) * lh + gaps;
    if (total <= maxHeight) break;
  }
  const lh = size * r.lineHeight;
  let y = r.box.y * s + pad + Math.max(0, (maxHeight - total) / 2) + size * 0.85;

  ctx.save();
  ctx.textBaseline = "alphabetic";
  const glow = r.panel === "glow";
  const integrated = r.panel === "integrated" || r.panel === "none";
  if (glow) {
    ctx.shadowColor = card.frame.accent;
    ctx.shadowBlur = 14 * s;
  } else if (r.shadow || integrated) {
    ctx.shadowColor = luminance(r.color) > 0.5 ? "rgba(0,0,0,0.95)" : "rgba(255,255,255,0.9)";
    ctx.shadowBlur = (integrated ? 10 : 5) * s;
  }

  const drawLines = (paras: LaidLine[][], italic: boolean, color: string) => {
    paras.forEach((lines, pi) => {
      for (const line of lines) {
        ctx.font = fontString(r.font, size, 400, italic);
        let x = r.box.x * s + pad;
        if (r.align === "center") x += (maxWidth - line.width) / 2;
        if (r.align === "right") x += maxWidth - line.width;
        for (const item of line.items) {
          if (item.piece.kind === "word") {
            ctx.fillStyle = color;
            ctx.textAlign = "left";
            ctx.fillText(item.piece.text, x, y);
          } else if (item.piece.kind === "symbol") {
            drawSymbol(ctx, item.piece.code, x, y, size);
          }
          x += item.width;
        }
        y += lh;
      }
      if (pi < paras.length - 1) y += size * 0.35;
    });
  };

  drawLines(rulesLines, false, r.color);
  if (rules && flavor) {
    const lineY = y - lh + size * 0.55;
    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.strokeStyle = rgba(r.color, 0.35);
    ctx.lineWidth = 1.2 * s;
    ctx.beginPath();
    ctx.moveTo(r.box.x * s + pad + maxWidth * 0.15, lineY);
    ctx.lineTo(r.box.x * s + pad + maxWidth * 0.85, lineY);
    ctx.stroke();
    ctx.restore();
    y += size * 0.7;
  }
  drawLines(flavorLines, true, rgba(r.color, 0.85));
  ctx.restore();
}

// --- art ---------------------------------------------------------------------

function drawArtInto(ctx: Ctx, opts: TokenRenderOptionsV1, card: TokenCardV1, target: TokenBoxV1, s: number) {
  const tx = target.x * s;
  const ty = target.y * s;
  const tw = target.w * s;
  const th = target.h * s;
  if (!opts.art) {
    drawPlaceholderArt(ctx, card, tx, ty, tw, th, s);
    return;
  }
  const sw = opts.artWidth ?? (opts.art as { width?: number }).width ?? 1024;
  const sh = opts.artHeight ?? (opts.art as { height?: number }).height ?? 1536;
  const cover = Math.max(tw / sw, th / sh) * card.art.zoom;
  const visW = tw / cover;
  const visH = th / cover;
  const sx = (sw - visW) / 2 + card.art.offsetX * ((sw - visW) / 2);
  const sy = (sh - visH) / 2 + card.art.offsetY * ((sh - visH) / 2);
  ctx.drawImage(opts.art, sx, sy, visW, visH, tx, ty, tw, th);
}

/**
 * The empty art area of a set-styled card, also painted over the art of the
 * real set token it is compared with, so the two read alike before art exists.
 * `labelY` is in pixels.
 */
export function drawTokenArtBlankV1(ctx: Ctx, x: number, y: number, w: number, h: number, labelY: number, s: number) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, "#3a3f47");
  g.addColorStop(1, "#23272d");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `600 ${22 * s}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Art goes here", x + w / 2, labelY);
  ctx.restore();
}

function drawPlaceholderArt(ctx: Ctx, card: TokenCardV1, x: number, y: number, w: number, h: number, s: number) {
  if (card.setCode && (card.frame.style === "token_2015" || card.frame.style === "token_2003")) {
    const top = card.title.box.y + card.title.box.h;
    drawTokenArtBlankV1(ctx, x, y, w, h, ((top + card.type.box.y) / 2) * s, s);
    return;
  }
  const palette = tokenSetIndexEntryV1(card.setCode)?.palette;
  const base = palette?.[0] ?? card.frame.color;
  const mid = palette?.[1] ?? card.frame.accent;
  const glow = palette?.[3] ?? palette?.[2] ?? card.frame.accent;
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, palette ? base : shade(base, -0.55));
  g.addColorStop(0.55, palette ? mid : shade(mid, -0.35));
  g.addColorStop(1, palette ? shade(base, -0.4) : shade(base, -0.7));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  const rand = seeded(hashString(card.name + card.kindId));
  for (let i = 0; i < 7; i += 1) {
    const r = (0.15 + rand() * 0.35) * Math.min(w, h);
    const rg = ctx.createRadialGradient(x + rand() * w, y + rand() * h, 0, x + rand() * w, y + rand() * h, r);
    rg.addColorStop(0, rgba(glow, palette ? 0.45 : 0.28));
    rg.addColorStop(1, rgba(glow, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(x, y, w, h);
  }
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 0.95, w * 0.42, h * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h * 0.42, w * 0.16, h * 0.2, 0, 0, Math.PI * 2);
  ctx.ellipse(x + w / 2, y + h * 0.78, w * 0.26, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// --- frame -------------------------------------------------------------------

function drawFrameRing(ctx: Ctx, card: TokenCardV1, s: number, outer: TokenBoxV1, width: number) {
  const style = card.frame.style;
  const ring = new Path2D();
  ring.rect(outer.x * s, outer.y * s, outer.w * s, outer.h * s);
  const innerX = (outer.x + width) * s;
  const innerY = (outer.y + width) * s;
  const innerW = (outer.w - width * 2) * s;
  const innerH = (outer.h - width * 2) * s;
  roundedRect(ring, innerX, innerY, innerW, innerH, 10 * s);
  ctx.save();
  ctx.fillStyle = frameFill(ctx, card, s);
  ctx.fill(ring, "evenodd");
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = card.frame.accent;
  const inner = new Path2D();
  roundedRect(inner, innerX, innerY, innerW, innerH, 10 * s);
  ctx.stroke(inner);
  if (style === "ornate") drawCornerFlourishes(ctx, card, s, innerX / s, innerY / s, innerW / s, innerH / s);
  ctx.restore();
}

function frameFill(ctx: Ctx, card: TokenCardV1, s: number): CanvasPattern | CanvasGradient | string {
  const c = card.frame.color;
  switch (card.frame.style) {
    case "stone":
      return texturePattern(ctx, "stone", c, s);
    case "parchment":
      return texturePattern(ctx, "parchment", c, s);
    case "metal": {
      const g = ctx.createLinearGradient(0, 0, CARD_W * s, CARD_H * s);
      g.addColorStop(0, shade(c, 0.35));
      g.addColorStop(0.3, shade(c, -0.15));
      g.addColorStop(0.5, shade(c, 0.25));
      g.addColorStop(0.75, shade(c, -0.25));
      g.addColorStop(1, shade(c, 0.2));
      return g;
    }
    case "ornate": {
      const g = ctx.createLinearGradient(0, 0, 0, CARD_H * s);
      g.addColorStop(0, shade(c, 0.12));
      g.addColorStop(0.5, shade(c, -0.18));
      g.addColorStop(1, shade(c, 0.05));
      return g;
    }
    default: {
      const g = ctx.createLinearGradient(0, 0, 0, CARD_H * s);
      g.addColorStop(0, shade(c, 0.1));
      g.addColorStop(1, shade(c, -0.15));
      return g;
    }
  }
}

function drawCornerFlourishes(ctx: Ctx, card: TokenCardV1, s: number, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = card.frame.accent;
  ctx.lineWidth = 2.4 * s;
  const corners: Array<[number, number, number, number]> = [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ];
  for (const [cx, cy, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo((cx + dx * 4) * s, (cy + dy * 46) * s);
    ctx.quadraticCurveTo((cx + dx * 4) * s, (cy + dy * 4) * s, (cx + dx * 46) * s, (cy + dy * 4) * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc((cx + dx * 18) * s, (cy + dy * 18) * s, 6 * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFramedBody(ctx: Ctx, card: TokenCardV1, s: number) {
  const full = { x: -CARD_BLEED, y: -CARD_BLEED, w: CARD_W + CARD_BLEED * 2, h: CARD_H + CARD_BLEED * 2 };
  ctx.save();
  ctx.fillStyle = frameFill(ctx, card, s);
  ctx.fillRect(full.x * s, full.y * s, full.w * s, full.h * s);
  if (card.frame.style === "metal") {
    ctx.fillStyle = shade(card.frame.accent, -0.2);
    for (const [cx, cy] of [
      [20, 20],
      [CARD_W - 20, 20],
      [20, CARD_H - 20],
      [CARD_W - 20, CARD_H - 20],
    ] as const) {
      ctx.beginPath();
      ctx.arc(cx * s, cy * s, 5 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = shade(card.frame.accent, -0.1);
  ctx.strokeRect(14 * s, 14 * s, (CARD_W - 28) * s, (CARD_H - 28) * s);
  if (card.frame.style === "ornate") {
    drawCornerFlourishes(ctx, card, s, 14, 14, CARD_W - 28, CARD_H - 28);
  }
  ctx.restore();
}

function windowBox(card: TokenCardV1): TokenBoxV1 {
  if (card.art.mode === "beyond") {
    const w = card.art.window;
    return { x: -CARD_BLEED, y: -CARD_BLEED, w: CARD_W + CARD_BLEED * 2, h: w.y + w.h + CARD_BLEED };
  }
  return card.art.window;
}

/** Width of the black border on token-era frames, in card units. */
const TOKEN_BORDER = 24;

/**
 * Where a modern token's art shows. Real tokens run the art up behind the name
 * bar and out to the black border, so a window that sits near an edge is
 * stretched to it; one the customer has moved well inside keeps its shape.
 */
function tokenArtWindowV1(card: TokenCardV1): TokenBoxV1 {
  const inner = { x: TOKEN_BORDER, y: TOKEN_BORDER, w: CARD_W - TOKEN_BORDER * 2, h: CARD_H - TOKEN_BORDER * 2 };
  return card.art.mode === "window" ? modernTokenArtBoxV1(card.art.window) : inner;
}

export function modernTokenArtBoxV1(w: TokenBoxV1): TokenBoxV1 {
  const inner = { x: TOKEN_BORDER, y: TOKEN_BORDER, w: CARD_W - TOKEN_BORDER * 2, h: CARD_H - TOKEN_BORDER * 2 };
  const near = 48;
  const left = w.x - inner.x < near ? inner.x : w.x;
  const top = w.y - inner.y < near ? inner.y : w.y;
  const right = inner.x + inner.w - (w.x + w.w) < near ? inner.x + inner.w : w.x + w.w;
  return { x: left, y: top, w: right - left, h: w.y + w.h - top };
}

/** Tokens without rules text keep a thin rim-coloured bracket from the type line down to the P/T box. */
function drawVanillaBracket(ctx: Ctx, card: TokenCardV1, s: number) {
  if (!card.type.show || !card.pt.show) return;
  const t = card.type.box;
  const pt = card.pt.box;
  const x = t.x + 4;
  const bottom = pt.y + pt.h * 0.62;
  if (bottom <= t.y + t.h + 4 || pt.x <= x + 20) return;
  ctx.save();
  ctx.lineWidth = 4 * s;
  ctx.lineJoin = "miter";
  ctx.strokeStyle = card.title.plateEdge ?? card.frame.accent;
  ctx.beginPath();
  ctx.moveTo(x * s, (t.y + t.h * 0.5) * s);
  ctx.lineTo(x * s, bottom * s);
  ctx.lineTo((pt.x + 6) * s, bottom * s);
  ctx.stroke();
  ctx.restore();
}

function archPath(b: TokenBoxV1, s: number): Path2D {
  const p = new Path2D();
  const x = b.x * s;
  const y = b.y * s;
  const w = b.w * s;
  const h = b.h * s;
  const arch = Math.min(h * 0.2, w * 0.14);
  const foot = 8 * s;
  p.moveTo(x, y + arch);
  p.quadraticCurveTo(x + w / 2, y - arch, x + w, y + arch);
  p.lineTo(x + w, y + h - foot);
  p.quadraticCurveTo(x + w, y + h, x + w - foot, y + h);
  p.lineTo(x + foot, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - foot);
  p.closePath();
  return p;
}

function drawTokenEraFrame(ctx: Ctx, card: TokenCardV1, opts: TokenRenderOptionsV1, s: number) {
  const fullBleed = { x: -CARD_BLEED, y: -CARD_BLEED, w: CARD_W + CARD_BLEED * 2, h: CARD_H + CARD_BLEED * 2 };
  ctx.save();
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(fullBleed.x * s, fullBleed.y * s, fullBleed.w * s, fullBleed.h * s);

  if (card.frame.style === "token_2015") {
    const area = tokenArtWindowV1(card);
    const clip = new Path2D();
    roundedRect(clip, area.x * s, area.y * s, area.w * s, area.h * s, 10 * s);
    ctx.save();
    ctx.clip(clip);
    drawArtInto(ctx, opts, card, area, s);
    if (card.art.mode === "under_text") {
      const g = ctx.createLinearGradient(0, CARD_H * 0.55 * s, 0, CARD_H * s);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = g;
      ctx.fillRect(area.x * s, CARD_H * 0.55 * s, area.w * s, CARD_H * 0.45 * s);
    }
    ctx.restore();
    ctx.restore();
    return;
  }

  const body = new Path2D();
  roundedRect(body, 12 * s, 12 * s, (CARD_W - 24) * s, (CARD_H - 24) * s, 16 * s);
  ctx.fillStyle = texturePattern(ctx, "stone", card.frame.color, s);
  ctx.fill(body);
  const depth = ctx.createLinearGradient(0, 0, 0, CARD_H * s);
  depth.addColorStop(0, "rgba(255,255,255,0.12)");
  depth.addColorStop(0.5, "rgba(0,0,0,0)");
  depth.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = depth;
  ctx.fill(body);
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = rgba(card.frame.accent, 0.7);
  ctx.stroke(body);

  const window = card.art.window;
  const arch = archPath(window, s);
  ctx.save();
  ctx.clip(arch);
  drawArtInto(ctx, opts, card, window, s);
  ctx.restore();
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = "rgba(0,0,0,0.75)";
  ctx.stroke(arch);
  ctx.lineWidth = 2 * s;
  ctx.strokeStyle = card.frame.accent;
  ctx.stroke(arch);
  ctx.restore();
}

function drawArtLayer(ctx: Ctx, card: TokenCardV1, opts: TokenRenderOptionsV1, s: number) {
  if (card.frame.style === "token_2015" || card.frame.style === "token_2003") {
    drawTokenEraFrame(ctx, card, opts, s);
    return;
  }
  const fullBleed = { x: -CARD_BLEED, y: -CARD_BLEED, w: CARD_W + CARD_BLEED * 2, h: CARD_H + CARD_BLEED * 2 };
  const framed = card.art.mode === "window" || card.art.mode === "beyond";
  const frameless = card.frame.style === "none" || card.frame.style === "full_art" || card.frame.style === "borderless";

  if (framed && !frameless) {
    drawFramedBody(ctx, card, s);
    const w = windowBox(card);
    const clip = new Path2D();
    roundedRect(clip, w.x * s, w.y * s, w.w * s, w.h * s, card.art.mode === "beyond" ? 0 : 6 * s);
    ctx.save();
    ctx.clip(clip);
    drawArtInto(ctx, opts, card, w, s);
    ctx.restore();
    if (card.art.mode === "window") {
      ctx.save();
      ctx.lineWidth = 4 * s;
      ctx.strokeStyle = shade(card.frame.accent, -0.2);
      ctx.stroke(clip);
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 12 * s;
      ctx.lineWidth = 2 * s;
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.stroke(clip);
      ctx.restore();
    }
    return;
  }

  if (framed && frameless) {
    ctx.fillStyle = card.frame.style === "none" ? "#000000" : shade(card.frame.color, -0.6);
    ctx.fillRect(fullBleed.x * s, fullBleed.y * s, fullBleed.w * s, fullBleed.h * s);
    const w = windowBox(card);
    ctx.save();
    const clip = new Path2D();
    roundedRect(clip, w.x * s, w.y * s, w.w * s, w.h * s, 6 * s);
    ctx.clip(clip);
    drawArtInto(ctx, opts, card, w, s);
    ctx.restore();
  } else {
    drawArtInto(ctx, opts, card, fullBleed, s);
  }

  if (card.frame.style === "borderless") {
    const ring = new Path2D();
    ring.rect(fullBleed.x * s, fullBleed.y * s, fullBleed.w * s, fullBleed.h * s);
    roundedRect(ring, 12 * s, 12 * s, (CARD_W - 24) * s, (CARD_H - 24) * s, 14 * s);
    ctx.fillStyle = "#0a0a0a";
    ctx.fill(ring, "evenodd");
  } else if (card.frame.style === "full_art") {
    ctx.save();
    ctx.lineWidth = 6 * s;
    ctx.strokeStyle = rgba(card.frame.accent, 0.8);
    const rim = new Path2D();
    roundedRect(rim, 16 * s, 16 * s, (CARD_W - 32) * s, (CARD_H - 32) * s, 12 * s);
    ctx.stroke(rim);
    ctx.restore();
  } else if (card.frame.style !== "none") {
    drawFrameRing(ctx, card, s, fullBleed, CARD_BLEED + 26);
  }

  if (card.art.mode === "under_text") {
    const g = ctx.createLinearGradient(0, CARD_H * 0.55 * s, 0, CARD_H * s);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(fullBleed.x * s, CARD_H * 0.55 * s, fullBleed.w * s, (CARD_H * 0.45 + CARD_BLEED) * s);
  }
}

function drawFinish(ctx: Ctx, card: TokenCardV1, s: number) {
  const x = -CARD_BLEED * s;
  const y = -CARD_BLEED * s;
  const w = (CARD_W + CARD_BLEED * 2) * s;
  const h = (CARD_H + CARD_BLEED * 2) * s;
  ctx.save();
  if (card.finish === "vignette") {
    const g = ctx.createRadialGradient((CARD_W / 2) * s, (CARD_H / 2) * s, CARD_W * 0.3 * s, (CARD_W / 2) * s, (CARD_H / 2) * s, CARD_H * 0.75 * s);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  } else if (card.finish === "foil") {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    ["#ff6ad5", "#c774e8", "#ad8cff", "#8795e8", "#94d0ff", "#7af5c4", "#fff27a"].forEach((c, i, all) =>
      g.addColorStop(i / (all.length - 1), c),
    );
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
  } else if (card.finish === "grain") {
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = texturePattern(ctx, "noise", "#808080", s);
    ctx.globalCompositeOperation = "overlay";
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function drawGuides(ctx: Ctx, card: TokenCardV1, s: number, selected: TokenLayerIdV1 | null | undefined) {
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(120, 220, 255, 0.55)";
  ctx.strokeRect(CARD_SAFE * s, CARD_SAFE * s, (CARD_W - CARD_SAFE * 2) * s, (CARD_H - CARD_SAFE * 2) * s);
  if (selected && selected !== "art") {
    const b = card[selected].box;
    ctx.setLineDash([]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 210, 90, 0.95)";
    ctx.strokeRect(b.x * s, b.y * s, b.w * s, b.h * s);
  }
  ctx.restore();
}

/** Draws the front. `ctx` should be sized with `tokenCanvasSizeV1`. */
export function drawTokenFrontV1(ctx: Ctx, card: TokenCardV1, opts: TokenRenderOptionsV1) {
  const s = opts.scale;
  const seed = hashString(`${card.familyId}:${card.kindId}`);
  const want = (part: TokenPartV1) => !opts.parts || opts.parts.includes(part);
  ctx.save();
  if (opts.bleed) ctx.translate(CARD_BLEED * s, CARD_BLEED * s);

  if (want("art") && want("frame")) {
    drawArtLayer(ctx, card, opts, s);
  } else if (want("art")) {
    ctx.save();
    ctx.clip(artCutoutV1(card, s));
    drawArtLayer(ctx, card, opts, s);
    ctx.restore();
  } else if (want("frame")) {
    ctx.save();
    drawArtLayer(ctx, card, { ...opts, art: null }, s);
    ctx.globalCompositeOperation = "destination-out";
    ctx.fill(artCutoutV1(card, s));
    ctx.restore();
  }

  const modern = card.frame.style === "token_2015";
  if (modern && want("frame") && !card.rules.show) drawVanillaBracket(ctx, card, s);
  const symbolBox = tokenSymbolBoxV1(card);
  const symbolShown = symbolBox !== null && (card.layerOpacity?.symbol ?? 1) > 0;
  const typeBox =
    symbolShown && symbolBox ? { ...card.type.box, w: symbolBox.x - card.type.box.x + card.type.box.h * 0.1 } : card.type.box;

  const drawLayer: Record<TokenStackLayerV1, () => void> = {
    title: () => {
      if (card.title.show) {
        drawLineLayer(ctx, card.name, card.title, s, card.frame.accent, seed + 1, panelTextureFor(card, opts, "title"));
      }
    },
    type: () => {
      if (card.type.show && card.typeLine.trim()) drawTypeLine();
    },
    rules: () => {
      if (!card.rules.show) return;
      const blankBehind = !opts.art && Boolean(card.setCode) && card.rules.panel === "token_box";
      const rulesCard = blankBehind ? { ...card, rules: { ...card.rules, panelOpacity: 1 } } : card;
      drawRules(ctx, rulesCard, s, seed + 3, panelTextureFor(card, opts, "rules"));
    },
    pt: () => drawPt(),
    symbol: () => drawTypeIcon(ctx, card, opts, s),
  };

  for (const layer of tokenLayerOrderV1(card)) {
    if (!want(layer)) continue;
    const alpha = card.layerOpacity?.[layer] ?? 1;
    if (alpha <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    drawLayer[layer]();
    ctx.restore();
  }
  if (want("finish")) drawFinish(ctx, card, s);
  if (opts.guides) drawGuides(ctx, card, s, opts.selectedLayer);
  ctx.restore();

  function drawTypeLine() {
    drawLineLayer(
      ctx,
      card.typeLine,
      {
        ...card.type,
        plateEdge: modern ? (card.title.plateEdge ?? null) : null,
        textBox: typeBox,
        weight: 700,
        letterSpacing: 0,
        smallCaps: false,
        effect: card.title.effect === "glow" ? "glow" : card.title.effect === "shadow" ? "shadow" : "none",
        treatment: card.title.treatment === "magic" ? "magic" : "flat",
        align: "left",
      },
      s,
      card.frame.accent,
      seed + 2,
      panelTextureFor(card, opts, "type"),
    );
  }

  function drawPt() {
    if (!card.pt.show || !(card.power || card.toughness)) return;
    drawLineLayer(
      ctx,
      `${card.power}/${card.toughness}`,
      {
        plate: card.pt.plate,
        plateColor: card.pt.plateColor,
        plateEdge: modern ? shade(card.pt.plateColor, -0.14) : null,
        plateOpacity: 1,
        font: card.pt.font,
        size: card.pt.size,
        weight: 700,
        color: card.pt.color,
        letterSpacing: 0,
        effect: card.title.effect,
        treatment: card.title.treatment,
        align: "center",
        box: card.pt.box,
      },
      s,
      card.frame.accent,
      seed + 4,
      panelTextureFor(card, opts, "pt"),
    );
  }
}

/** The shape the art shows through, matching each frame's window. */
function artCutoutV1(card: TokenCardV1, s: number): Path2D {
  const p = new Path2D();
  if (card.frame.style === "token_2015") {
    const area = tokenArtWindowV1(card);
    roundedRect(p, area.x * s, area.y * s, area.w * s, area.h * s, 10 * s);
    return p;
  }
  if (card.frame.style === "token_2003") return archPath(card.art.window, s);
  if (card.art.mode === "window" || card.art.mode === "beyond") {
    const w = windowBox(card);
    roundedRect(p, w.x * s, w.y * s, w.w * s, w.h * s, card.art.mode === "beyond" ? 0 : 6 * s);
    return p;
  }
  p.rect(-CARD_BLEED * s, -CARD_BLEED * s, (CARD_W + CARD_BLEED * 2) * s, (CARD_H + CARD_BLEED * 2) * s);
  return p;
}

/**
 * The card back: an original CardScanner9000 design, so it cannot be mistaken
 * for a real Magic card. Kept separate so a licensed back can replace it.
 */
export function drawTokenBackV1(ctx: Ctx, opts: { scale: number; bleed: boolean; storeName: string }) {
  const s = opts.scale;
  ctx.save();
  if (opts.bleed) ctx.translate(CARD_BLEED * s, CARD_BLEED * s);
  const x = -CARD_BLEED * s;
  const y = -CARD_BLEED * s;
  const w = (CARD_W + CARD_BLEED * 2) * s;
  const h = (CARD_H + CARD_BLEED * 2) * s;
  const bg = ctx.createRadialGradient((CARD_W / 2) * s, (CARD_H / 2) * s, 20 * s, (CARD_W / 2) * s, (CARD_H / 2) * s, CARD_H * 0.7 * s);
  bg.addColorStop(0, "#1d3a4a");
  bg.addColorStop(0.55, "#0f1d2b");
  bg.addColorStop(1, "#05080d");
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = "rgba(240, 200, 110, 0.85)";
  ctx.lineWidth = 3 * s;
  ctx.strokeRect(28 * s, 28 * s, (CARD_W - 56) * s, (CARD_H - 56) * s);
  ctx.lineWidth = 1.2 * s;
  ctx.strokeRect(38 * s, 38 * s, (CARD_W - 76) * s, (CARD_H - 76) * s);

  const cx = (CARD_W / 2) * s;
  const cy = (CARD_H / 2) * s;
  ctx.strokeStyle = "rgba(120, 220, 230, 0.55)";
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 110 * s, cy + Math.sin(a) * 110 * s);
    ctx.lineTo(cx + Math.cos(a) * 230 * s, cy + Math.sin(a) * 230 * s);
    ctx.stroke();
  }
  for (const [r, a] of [
    [235, 0.9],
    [200, 0.5],
    [110, 0.9],
    [86, 0.6],
  ] as const) {
    ctx.strokeStyle = `rgba(240, 200, 110, ${a})`;
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.arc(cx, cy, r * s, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(240, 200, 110, 0.95)";
  ctx.beginPath();
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const r = (i % 2 === 0 ? 70 : 30) * s;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(240, 220, 170, 0.95)";
  ctx.font = `700 ${34 * s}px Cinzel, Georgia, serif`;
  ctx.fillText((opts.storeName || "The Game Lodge").toUpperCase(), cx, 120 * s);
  ctx.font = `400 ${22 * s}px Cinzel, Georgia, serif`;
  ctx.fillText("CardScanner9000 · Custom Token", cx, (CARD_H - 110) * s);
  ctx.restore();
}

// --- browser helpers ---------------------------------------------------------

let fontsLink: HTMLLinkElement | null = null;

export function ensureTokenFontStylesheetV1() {
  if (typeof document === "undefined" || fontsLink) return;
  fontsLink = document.createElement("link");
  fontsLink.rel = "stylesheet";
  fontsLink.href = TOKEN_FONTS_STYLESHEET_V1;
  document.head.appendChild(fontsLink);
}

/** Waits for the card's fonts so the canvas never draws with a fallback face. */
export async function ensureTokenFontsV1(card: TokenCardV1): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  ensureTokenFontStylesheetV1();
  const fonts = new Set<TokenFontIdV1>([card.title.font, card.type.font, card.rules.font, card.pt.font, "cinzel", "inter"]);
  await Promise.all(
    [...fonts].flatMap((font) => [
      document.fonts.load(`700 40px "${tokenFontFamilyV1(font)}"`),
      document.fonts.load(`400 40px "${tokenFontFamilyV1(font)}"`),
      document.fonts.load(`italic 400 40px "${tokenFontFamilyV1(font)}"`),
    ]).map((p) => p.catch(() => [])),
  );
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

export function loadTokenImageV1(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => {
      imageCache.delete(url);
      reject(new Error("Could not load artwork"));
    };
    img.src = url;
  });
  imageCache.set(url, promise);
  return promise;
}

export function renderTokenFrontCanvasV1(card: TokenCardV1, opts: TokenRenderOptionsV1): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const size = tokenCanvasSizeV1(opts.scale, opts.bleed);
  canvas.width = size.width;
  canvas.height = size.height;
  drawTokenFrontV1(canvas.getContext("2d")!, card, opts);
  return canvas;
}

export function renderTokenBackCanvasV1(opts: { scale: number; bleed: boolean; storeName: string }): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const size = tokenCanvasSizeV1(opts.scale, opts.bleed);
  canvas.width = size.width;
  canvas.height = size.height;
  drawTokenBackV1(canvas.getContext("2d")!, opts);
  return canvas;
}

/**
 * Whether the art has enough pixels for the area it fills at 300 DPI.
 * Returns the ratio of source pixels to print pixels; under ~0.75 looks soft.
 */
export function tokenArtPrintRatioV1(card: TokenCardV1, artWidth: number, artHeight: number): number {
  const full = card.art.mode === "full" || card.art.mode === "under_text";
  const target = full ? { w: CARD_W + CARD_BLEED * 2, h: CARD_H + CARD_BLEED * 2 } : windowBox(card);
  const tw = target.w * PRINT_SCALE_V1;
  const th = target.h * PRINT_SCALE_V1;
  const cover = Math.max(tw / artWidth, th / artHeight) * card.art.zoom;
  return 1 / cover;
}

/** The artwork's area on the trimmed card, in card units: where spot varnish goes. */
export function tokenArtAreaV1(card: TokenCardV1): TokenBoxV1 {
  const full = card.art.mode === "full" || card.art.mode === "under_text";
  const b =
    card.frame.style === "token_2015" ? tokenArtWindowV1(card) : full ? { x: 0, y: 0, w: CARD_W, h: CARD_H } : windowBox(card);
  const x = Math.max(0, b.x);
  const y = Math.max(0, b.y);
  return { x, y, w: Math.min(CARD_W, b.x + b.w) - x, h: Math.min(CARD_H, b.y + b.h) - y };
}

/** Which movable layer sits under a point in card units, topmost first. */
export function tokenLayerAtV1(card: TokenCardV1, x: number, y: number): TokenLayerIdV1 | null {
  const order: Array<"pt" | "title" | "type" | "rules"> = ["pt", "title", "type", "rules"];
  for (const id of order) {
    const layer = card[id];
    if (!layer.show) continue;
    const b = layer.box;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return id;
  }
  return null;
}
