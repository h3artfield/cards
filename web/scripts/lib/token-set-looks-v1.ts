/**
 * Measures a token set's look from its real tokens, for build-token-set-templates.ts.
 *
 * 1. A vision call places the name bar, type line, rules box, P/T box and art
 *    on up to three sample tokens (one with rules text, one without).
 * 2. Each edge is then snapped to the strongest colour change in the scan
 *    near it, since the model's boxes are only good to a few percent.
 * 3. The bars and boxes are colour-sampled on up to eight tokens, one per
 *    colour and layout, so a blue token gets that set's blue bar.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { callOpenAiJson } from "../../src/lib/card-flow-v2/openai-json";
import type { TokenAlignV1, TokenBoxV1 } from "../../src/lib/token-creator/design-v1";
import {
  TOKEN_SET_COLOR_KEYS_V1,
  tokenSetFallbackLookV1,
  type TokenSetColorKeyV1,
  type TokenSetDefaultLookV1,
  type TokenSetLayoutV1,
  type TokenSetLookColorsV1,
  type TokenSetLookV1,
} from "../../src/lib/token-creator/set-templates-v1";

const LOOK_VERSION = 5;
const IMG_W = 500;
const IMG_H = 700;
const UA = "CardScanner9000/1.0 (token creator set templates)";

export type LookSampleV1 = { name: string; image: string; colors: string[]; text: string; creature: boolean; hasPt: boolean };
export type LookEraV1 = "2015" | "2003";

type Rgb = [number, number, number];
type Img = { data: Buffer; w: number; h: number };
/** [x0, y0, x1, y1] in thousandths of the card image. */
type Q = [number, number, number, number];
type Parts = { title: Q; type: Q; rules: Q | null; pt: Q | null; art: Q };
type Variant = "text" | "vanilla";

// --- pixels ------------------------------------------------------------------

async function loadImage(url: string): Promise<Img> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*" } });
      if (!res.ok) throw new Error(`${res.status}`);
      const { data, info } = await sharp(Buffer.from(await res.arrayBuffer()))
        .resize(IMG_W, IMG_H, { fit: "fill" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { data, w: info.width, h: info.height };
    } catch (err) {
      if (attempt >= 2) throw new Error(`${url}: ${(err as Error).message}`);
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

const at = (img: Img, x: number, y: number): Rgb => {
  const i = (Math.min(img.h - 1, Math.max(0, y)) * img.w + Math.min(img.w - 1, Math.max(0, x))) * 3;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
};

function median(values: number[]): number {
  const v = values.slice().sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)] ?? 0;
}

function medianRgb(px: Rgb[]): Rgb {
  return [0, 1, 2].map((c) => median(px.map((p) => p[c]!))) as Rgb;
}

const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = ([r, g, b]: Rgb) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const lum = ([r, g, b]: Rgb) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** Median colour of one row (or column) between a0 and a1. */
function line(img: Img, axis: "row" | "col", i: number, a0: number, a1: number): Rgb {
  const px: Rgb[] = [];
  for (let a = Math.round(a0); a <= a1; a += 2) px.push(axis === "row" ? at(img, a, i) : at(img, i, a));
  return medianRgb(px);
}

/** The strongest colour step near `guess`; ties go to the closer one. Score 0 means no real edge was found. */
function snapEdge(img: Img, axis: "row" | "col", guess: number, a0: number, a1: number, radius: number): { at: number; score: number } {
  const limit = axis === "row" ? img.h : img.w;
  let best = guess;
  let bestScore = 30;
  for (let i = Math.max(2, guess - radius); i <= Math.min(limit - 3, guess + radius); i++) {
    const score = dist(line(img, axis, i - 2, a0, a1), line(img, axis, i + 2, a0, a1)) - Math.abs(i - guess) * 0.6;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return { at: best, score: bestScore > 30 ? bestScore : 0 };
}

type Px = { x0: number; y0: number; x1: number; y1: number };
const toPx = (q: Q): Px => ({ x0: (q[0] * IMG_W) / 1000, y0: (q[1] * IMG_H) / 1000, x1: (q[2] * IMG_W) / 1000, y1: (q[3] * IMG_H) / 1000 });
const toQ = (p: Px): Q => [(p.x0 * 1000) / IMG_W, (p.y0 * 1000) / IMG_H, (p.x1 * 1000) / IMG_W, (p.y1 * 1000) / IMG_H];

type Snapped = { q: Q; score: number };

function snapBox(img: Img, q: Q, radius = 14, fixedTop?: number, sideRadius = radius): Snapped {
  const b = toPx(q);
  const w = b.x1 - b.x0;
  const topEdge = fixedTop !== undefined ? { at: fixedTop, score: 0 } : snapEdge(img, "row", Math.round(b.y0), b.x0 + w * 0.06, b.x1 - w * 0.06, radius);
  const bottomEdge = snapEdge(img, "row", Math.round(b.y1), b.x0 + w * 0.06, b.x1 - w * 0.06, radius);
  const top = topEdge.at;
  const bottom = bottomEdge.at;
  const h = bottom - top;
  if (h < 8) return { q, score: 0 };
  const left = snapEdge(img, "col", Math.round(b.x0), top + h * 0.3, bottom - h * 0.3, sideRadius);
  const right = snapEdge(img, "col", Math.round(b.x1), top + h * 0.3, bottom - h * 0.3, sideRadius);
  if (right.at - left.at < 20) return { q, score: 0 };
  return {
    q: toQ({ x0: left.at, y0: top, x1: right.at, y1: bottom }),
    score: topEdge.score + bottomEdge.score + left.score + right.score,
  };
}

/** Snaps from each guess and keeps the box whose edges are most clearly there. */
function snapBest(img: Img, guesses: Array<Q | null>, radius?: number, fixedTop?: number, sideRadius?: number): Q | null {
  let best: Snapped | null = null;
  for (const g of guesses) {
    if (!g) continue;
    const s = snapBox(img, g, radius, fixedTop, sideRadius);
    if (!best || s.score > best.score) best = s;
  }
  return best?.q ?? null;
}

function region(img: Img, q: Q, fx0: number, fy0: number, fx1: number, fy1: number): Rgb[] {
  const b = toPx(q);
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const px: Rgb[] = [];
  for (let y = Math.round(b.y0 + h * fy0); y <= b.y0 + h * fy1; y++) {
    for (let x = Math.round(b.x0 + w * fx0); x <= b.x0 + w * fx1; x++) px.push(at(img, x, y));
  }
  return px;
}

/** Splits a region into its main colour and its second (lettering, usually). */
function twoColors(px: Rgb[]): { main: Rgb; other: Rgb } {
  if (px.length === 0) return { main: [128, 128, 128], other: [128, 128, 128] };
  const byLum = px.slice().sort((a, b) => lum(a) - lum(b));
  let c: [Rgb, Rgb] = [byLum[Math.floor(px.length * 0.1)]!, byLum[Math.floor(px.length * 0.9)]!];
  let groups: [Rgb[], Rgb[]] = [[], []];
  for (let iter = 0; iter < 8; iter++) {
    groups = [[], []];
    for (const p of px) groups[dist(p, c[0]) <= dist(p, c[1]) ? 0 : 1].push(p);
    c = [groups[0].length ? medianRgb(groups[0]) : c[0], groups[1].length ? medianRgb(groups[1]) : c[1]];
  }
  return groups[0].length >= groups[1].length ? { main: c[0], other: c[1] } : { main: c[1], other: c[0] };
}

// --- vision ------------------------------------------------------------------

const VISION_SYSTEM = [
  "You measure the layout of Magic: The Gathering token cards so a lookalike frame can be drawn.",
  "For each image give boxes as [x0, y0, x1, y1] in thousandths of the full image (0 to 1000), including the card's outer black border.",
  "Measure the drawn plate or box itself, not just the lettering inside it. Be as precise as you can.",
  "Answer JSON only:",
  "{",
  '  "cards": [{',
  '    "image": 1,',
  '    "title": [x0,y0,x1,y1],         the name bar or nameplate',
  '    "type": [x0,y0,x1,y1],          the type line bar',
  '    "rules": [x0,y0,x1,y1] | null,  the rules text box, null when the card has none',
  '    "pt": [x0,y0,x1,y1] | null,     the power/toughness box',
  '    "art": [x0,y0,x1,y1]            where the illustration shows, including any part behind see-through boxes',
  "  }],",
  '  "keywordAlign": "center" | "left"   how a lone keyword such as Flying sits in its rules box',
  "}",
].join("\n");

type VisionLook = { cards?: Array<{ image?: number; title?: Q; type?: Q; rules?: Q | null; pt?: Q | null; art?: Q }>; keywordAlign?: string };

const validQ = (q: unknown): q is Q =>
  Array.isArray(q) && q.length === 4 && q.every((n) => typeof n === "number" && n >= 0 && n <= 1000) && q[2] - q[0] > 30 && q[3] - q[1] > 15;

async function visionLook(cacheDir: string, key: string, setName: string, probes: LookSampleV1[]): Promise<VisionLook | null> {
  const file = path.join(cacheDir, `vision-${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as VisionLook;
  const content = [
    {
      type: "text" as const,
      text: `${probes.length} tokens from ${setName}. ` + probes.map((p, i) => `Image ${i + 1}: ${p.text ? "has rules text" : "no rules text"}.`).join(" "),
    },
    ...probes.map((p) => ({ type: "image_url" as const, image_url: { url: p.image, detail: "high" as const } })),
  ];
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const answer = await callOpenAiJson<VisionLook>(VISION_SYSTEM, content, {
        model: process.env.OPENAI_VISION_MODEL ?? "gpt-6-luna",
        maxTokens: 1500,
      });
      writeFileSync(file, JSON.stringify(answer));
      return answer;
    } catch (err) {
      console.warn(`  look vision ${setName} attempt ${attempt + 1}: ${(err as Error).message.slice(0, 160)}`);
    }
  }
  return null;
}

// --- measuring ---------------------------------------------------------------

function colorKeyOf(colors: string[]): TokenSetColorKeyV1 | null {
  if (colors.length === 0) return "colorless";
  if (colors.length === 1) return colors[0] as TokenSetColorKeyV1;
  return colors.length > 2 ? "multi" : null;
}

const variantOf = (s: LookSampleV1): Variant => (s.text.trim() ? "text" : "vanilla");

function layoutToQ(l: TokenSetLayoutV1): Parts {
  const q = (b: TokenBoxV1): Q => [(b.x / 630) * 1000, (b.y / 880) * 1000, ((b.x + b.w) / 630) * 1000, ((b.y + b.h) / 880) * 1000];
  return { title: q(l.title), type: q(l.type), rules: q(l.rules), pt: q(l.pt), art: q(l.art) };
}

function qToBox(q: Q): TokenBoxV1 {
  const x = Math.round((q[0] * 630) / 1000);
  const y = Math.round((q[1] * 880) / 1000);
  return { x, y, w: Math.round((q[2] * 630) / 1000) - x, h: Math.round((q[3] * 880) / 1000) - y };
}

const medianQ = (qs: Q[]): Q => [0, 1, 2, 3].map((i) => median(qs.map((q) => q[i]!))) as Q;

/** Picks the tokens to look at: probes for the vision call, then one per colour and layout. */
function pickSamples(samples: LookSampleV1[]): { probes: LookSampleV1[]; measure: LookSampleV1[] } {
  const mono = (s: LookSampleV1) => s.colors.length <= 1;
  const text = samples.find((s) => s.creature && s.text && mono(s)) ?? samples.find((s) => s.text);
  const vanilla = samples.find((s) => s.creature && !s.text && mono(s)) ?? samples.find((s) => !s.text);
  const probes = [text, vanilla].filter((s): s is LookSampleV1 => Boolean(s));
  const third = samples.find((s) => !probes.includes(s) && mono(s) && !probes.some((p) => colorKeyOf(p.colors) === colorKeyOf(s.colors)));
  if (third) probes.push(third);
  const seen = new Set<string>();
  const measure: LookSampleV1[] = [];
  for (const s of [...probes, ...samples]) {
    const k = `${colorKeyOf(s.colors)}:${variantOf(s)}`;
    if (seen.has(k) || measure.length >= 8) continue;
    seen.add(k);
    measure.push(s);
  }
  return { probes, measure };
}

type Measured = { variant: Variant; parts: Parts; key: TokenSetColorKeyV1 | null; colors: TokenSetLookColorsV1 | null };

function measureOne(img: Img, sample: LookSampleV1, guess: Parts, base: Parts, era: LookEraV1): Measured {
  const variant = variantOf(sample);
  const side = era === "2003" ? 5 : 14;
  const title = snapBest(img, [guess.title, base.title], 14, undefined, side)!;
  const type = snapBest(img, [guess.type, base.type], 14, undefined, side)!;
  const typeBottomPx = Math.round((type[3] * IMG_H) / 1000);
  const rules = variant === "text" ? snapBest(img, [guess.rules, base.rules], 10, typeBottomPx + 1) : guess.rules;
  const pt = sample.hasPt ? snapBest(img, [guess.pt, base.pt], 10) : null;
  const parts: Parts = { title, type, rules, pt, art: guess.art };
  const key = colorKeyOf(sample.colors);
  if (!key) return { variant, parts, key, colors: null };

  const titleCenter = twoColors(region(img, title, 0.3, 0.2, 0.7, 0.8));
  const bar = twoColors(region(img, title, 0.12, 0.3, 0.88, 0.7)).main;
  const barEdge = medianRgb([...region(img, title, 0.025, 0.35, 0.07, 0.65), ...region(img, title, 0.93, 0.35, 0.975, 0.65)]);
  const typeFill = twoColors(region(img, type, 0.45, 0.25, 0.85, 0.75)).main;
  // A box that comes out near-black under a light type line landed on the border, not the box.
  const unlessBorder = (c: Rgb) => (lum(c) < 0.15 && lum(typeFill) > 0.45 ? typeFill : c);
  const rulesFill = rules && variant === "text" ? unlessBorder(twoColors(region(img, rules, 0.06, 0.12, 0.94, 0.88)).main) : typeFill;
  const ptFill = pt ? unlessBorder(twoColors(region(img, pt, 0.12, 0.2, 0.88, 0.8)).main) : typeFill;
  let frame: Rgb = [11, 11, 12];
  if (era === "2003") {
    // The coloured frame band between the black border and the art window, down both sides.
    const strip: Rgb[] = [];
    for (let y = Math.round(IMG_H * 0.3); y < IMG_H * 0.6; y += 2) {
      for (let x = Math.round(IMG_W * 0.042); x < IMG_W * 0.065; x++) {
        strip.push(at(img, x, y), at(img, IMG_W - 1 - x, y));
      }
    }
    frame = medianRgb(strip);
  }
  return {
    variant,
    parts,
    key,
    colors: {
      frame: hex(frame),
      bar: hex(bar),
      barEdge: hex(barEdge),
      title: lum(titleCenter.other) > lum(titleCenter.main) ? "#f7f4ec" : "#141210",
      type: hex(typeFill),
      rules: hex(rulesFill),
      pt: hex(ptFill),
    },
  };
}

function layoutFrom(measured: Measured[], variant: Variant, era: LookEraV1, guess: Parts): TokenSetLayoutV1 | undefined {
  const ms = measured.filter((m) => m.variant === variant);
  if (ms.length === 0) return undefined;
  const fallback = tokenSetFallbackLookV1(era)[variant];
  const pick = (k: keyof Parts, alt: TokenBoxV1): TokenBoxV1 => {
    const qs = ms.map((m) => m.parts[k]).filter(validQ);
    return qs.length ? qToBox(medianQ(qs)) : alt;
  };
  let title = pick("title", fallback.title);
  if (era === "2003" && title.w < fallback.title.w) {
    // Older nameplates shrink to the name, so the sample's width is only that name's width.
    const cx = title.x + title.w / 2;
    title = { ...title, x: Math.round(cx - fallback.title.w / 2), w: fallback.title.w };
  }
  const type = pick("type", fallback.type);
  const rules = variant === "text" ? pick("rules", fallback.rules) : fallback.rules;
  const pt = pick("pt", fallback.pt);
  const art = validQ(guess.art) ? qToBox(guess.art) : fallback.art;
  if (era === "2015") {
    // Modern art runs behind the bars and the see-through rules box.
    const bottom = Math.max(art.y + art.h, variant === "text" ? rules.y + rules.h : type.y + type.h);
    art.y = Math.min(art.y, title.y + Math.round(title.h / 2));
    art.h = bottom - art.y;
  }
  return { title, art, type, rules, pt };
}

function hashOf(parts: string[]): string {
  return createHash("sha1").update([`v${LOOK_VERSION}`, ...parts].join("|")).digest("hex").slice(0, 12);
}

/** Measures one set. Cached by the samples used, so reruns are free. */
export async function measureTokenSetLookV1(input: {
  cacheDir: string;
  code: string;
  setName: string;
  era: LookEraV1;
  samples: LookSampleV1[];
}): Promise<TokenSetLookV1 | null> {
  const { probes, measure } = pickSamples(input.samples);
  if (probes.length === 0) return null;
  mkdirSync(input.cacheDir, { recursive: true });
  const key = `${input.code}-${hashOf([...probes, ...measure].map((s) => s.image))}`;
  const file = path.join(input.cacheDir, `look-${key}.json`);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as TokenSetLookV1;

  const visionKey = createHash("sha1").update(probes.map((s) => s.image).join("|")).digest("hex").slice(0, 12);
  const vision = await visionLook(input.cacheDir, `${input.code}-${visionKey}`, input.setName, probes);
  const fallback = tokenSetFallbackLookV1(input.era);
  const base: Record<Variant, Parts> = { text: layoutToQ(fallback.text), vanilla: layoutToQ(fallback.vanilla) };
  const guesses: Record<Variant, Parts> = { text: base.text, vanilla: base.vanilla };
  for (const [i, probe] of probes.entries()) {
    const card = vision?.cards?.find((c) => c.image === i + 1);
    if (!card || !validQ(card.title) || !validQ(card.type) || !validQ(card.art)) continue;
    const v = variantOf(probe);
    if (probes.findIndex((p) => variantOf(p) === v) !== i) continue;
    // The model sometimes copies one card's boxes onto another; a type line in the wrong band is one of those.
    if (input.era === "2015" && (v === "text" ? card.type[1] < 560 || card.type[1] > 760 : card.type[1] < 760 || card.type[1] > 900)) continue;
    guesses[v] = {
      title: card.title,
      type: card.type,
      rules: validQ(card.rules) ? card.rules : guesses[v].rules,
      pt: validQ(card.pt) ? card.pt : guesses[v].pt,
      art: card.art,
    };
  }

  const measured: Measured[] = [];
  for (const sample of measure) {
    try {
      const img = await loadImage(sample.image);
      const m = measureOne(img, sample, guesses[variantOf(sample)], base[variantOf(sample)], input.era);
      measured.push(m);
      if (process.env.LOOK_DEBUG_DIR) await debugOverlay(process.env.LOOK_DEBUG_DIR, input.code, sample, img, m, guesses[m.variant]);
    } catch (err) {
      console.warn(`  look ${input.code}: ${(err as Error).message}`);
    }
  }
  if (measured.length === 0) return null;

  const colors: Partial<Record<TokenSetColorKeyV1, TokenSetLookColorsV1>> = {};
  for (const k of TOKEN_SET_COLOR_KEYS_V1) {
    const list = measured.filter((m) => m.key === k && m.colors).map((m) => m.colors!);
    if (list.length) colors[k] = mergeColors(list);
  }
  const text = layoutFrom(measured, "text", input.era, guesses.text);
  const vanilla = layoutFrom(measured, "vanilla", input.era, guesses.vanilla);
  if (vanilla) {
    // Without rules text the left edge tends to snap to where the lettering starts; the bar is as wide either way.
    const ref = (text ?? fallback.text).type;
    vanilla.type = { ...vanilla.type, x: ref.x, w: ref.w };
  }
  const look: TokenSetLookV1 = {
    text,
    vanilla,
    colors,
    keywordAlign: (vision?.keywordAlign === "left" ? "left" : "center") as TokenAlignV1,
    measured: measured.length,
  };
  writeFileSync(file, JSON.stringify(look));
  return look;
}

async function debugOverlay(dir: string, code: string, sample: LookSampleV1, img: Img, m: Measured, guess: Parts) {
  const rect = (q: Q | null, color: string, dash = "") =>
    q
      ? `<rect x="${(q[0] * IMG_W) / 1000}" y="${(q[1] * IMG_H) / 1000}" width="${((q[2] - q[0]) * IMG_W) / 1000}" height="${((q[3] - q[1]) * IMG_H) / 1000}" fill="none" stroke="${color}" stroke-width="1.5" ${dash ? `stroke-dasharray="${dash}"` : ""}/>`
      : "";
  const parts = ["title", "type", "rules", "pt"] as const;
  const cols = ["#ff00ff", "#00ffff", "#ffff00", "#ff5500"];
  const swatches = m.colors
    ? (["bar", "barEdge", "title", "type", "rules", "pt", "frame"] as const)
        .map((k, i) => `<rect x="${IMG_W + 6}" y="${10 + i * 44}" width="60" height="36" fill="${m.colors![k]}" stroke="#fff"/><text x="${IMG_W + 6}" y="${54 + i * 44}" font-size="9" fill="#fff">${k}</text>`)
        .join("")
    : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${IMG_W + 80}" height="${IMG_H}">${parts.map((p, i) => rect(guess[p], cols[i]!, "4 3")).join("")}${parts.map((p, i) => rect(m.parts[p], cols[i]!)).join("")}${rect(m.parts.art, "#00ff00", "2 2")}${swatches}</svg>`;
  mkdirSync(dir, { recursive: true });
  await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 3 } })
    .extend({ right: 80, background: "#222" })
    .composite([{ input: Buffer.from(svg) }])
    .jpeg({ quality: 85 })
    .toFile(path.join(dir, `${code}-${m.key ?? "2c"}-${m.variant}-${sample.name.replace(/[^a-z0-9]+/gi, "_")}.jpg`));
}

const rgbOf = (h: string): Rgb => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function mergeColors(list: TokenSetLookColorsV1[]): TokenSetLookColorsV1 {
  const field = (k: keyof TokenSetLookColorsV1) => hex(medianRgb(list.map((c) => rgbOf(c[k]))));
  const lightTitles = list.filter((c) => c.title === "#f7f4ec").length;
  return {
    frame: field("frame"),
    bar: field("bar"),
    barEdge: field("barEdge"),
    title: lightTitles * 2 >= list.length ? "#f7f4ec" : "#141210",
    type: field("type"),
    rules: field("rules"),
    pt: field("pt"),
  };
}

// --- era defaults and trimming ---------------------------------------------

/** The look most sets of an era share: the median of every measured set. */
export function defaultLookV1(era: LookEraV1, looks: TokenSetLookV1[]): TokenSetDefaultLookV1 {
  const fallback = tokenSetFallbackLookV1(era);
  const layout = (variant: Variant): TokenSetLayoutV1 => {
    const ls = looks.map((l) => l[variant]).filter((l): l is TokenSetLayoutV1 => Boolean(l));
    if (ls.length === 0) return fallback[variant];
    const box = (k: keyof TokenSetLayoutV1): TokenBoxV1 => ({
      x: median(ls.map((l) => l[k].x)),
      y: median(ls.map((l) => l[k].y)),
      w: median(ls.map((l) => l[k].w)),
      h: median(ls.map((l) => l[k].h)),
    });
    return { title: box("title"), art: box("art"), type: box("type"), rules: box("rules"), pt: box("pt") };
  };
  const colors = {} as Record<TokenSetColorKeyV1, TokenSetLookColorsV1>;
  for (const k of TOKEN_SET_COLOR_KEYS_V1) {
    const list = looks.map((l) => l.colors?.[k]).filter((c): c is TokenSetLookColorsV1 => Boolean(c));
    colors[k] = list.length >= 3 ? mergeColors(list) : fallback.colors[k];
  }
  const centred = looks.filter((l) => l.keywordAlign !== "left").length;
  return { text: layout("text"), vanilla: layout("vanilla"), colors, keywordAlign: centred * 2 >= looks.length ? "center" : "left" };
}

const closeBox = (a: TokenBoxV1, b: TokenBoxV1) =>
  Math.abs(a.x - b.x) <= 8 && Math.abs(a.y - b.y) <= 8 && Math.abs(a.w - b.w) <= 8 && Math.abs(a.h - b.h) <= 8;

/** Drops whatever matches the era default, so the client index stays small. */
export function trimLookV1(look: TokenSetLookV1, base: TokenSetDefaultLookV1): TokenSetLookV1 {
  const out: TokenSetLookV1 = { measured: look.measured };
  for (const v of ["text", "vanilla"] as const) {
    const l = look[v];
    if (l && !(Object.keys(l) as Array<keyof TokenSetLayoutV1>).every((k) => closeBox(l[k], base[v][k]))) out[v] = l;
  }
  const colors: Partial<Record<TokenSetColorKeyV1, TokenSetLookColorsV1>> = {};
  for (const [k, c] of Object.entries(look.colors ?? {}) as Array<[TokenSetColorKeyV1, TokenSetLookColorsV1]>) {
    const d = base.colors[k];
    const same =
      c.title === d.title && (Object.keys(c) as Array<keyof TokenSetLookColorsV1>).every((f) => f === "title" || dist(rgbOf(c[f]), rgbOf(d[f])) < 20);
    if (!same) colors[k] = c;
  }
  if (Object.keys(colors).length) out.colors = colors;
  if (look.keywordAlign && look.keywordAlign !== base.keywordAlign) out.keywordAlign = look.keywordAlign;
  return out;
}
