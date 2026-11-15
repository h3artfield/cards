"use client";

import { useEffect, useRef } from "react";
import { CARD_H, CARD_W, type TokenBoxV1 } from "@/lib/token-creator/design-v1";
import { refineTokenBarV1, tokenArtPocketV1, tokenBarMaskV1, type FramePixelsV1 } from "@/lib/token-creator/frame-detect-v1";
import { drawTokenArtBlankV1, modernTokenArtBoxV1, tokenBarPath } from "@/lib/token-creator/render-v1";
import { tokenSetLayoutV1, type TokenSetIndexEntryV1, type TokenSetLayoutV1 } from "@/lib/token-creator/set-templates-v1";
import type { TokenSetSampleV1 } from "./useTokenSetSampleV1";

/** Card units kept round each box so the edges of the bars survive the blanking. */
const RIM = 1;
/** Card units the blank reaches past the measured art, so no art shows along the border. */
const BLEED = 3;
/** Card units past the art where stray art pixels are painted the border's black. */
const EDGE = 10;
const BORDER_LUM = 40;
/** The black border's width in card units on modern tokens. */
const TOKEN_BORDER = 24;

type Bars = { title: TokenBoxV1; type: TokenBoxV1; pt: TokenBoxV1 | null };

const images = new Map<string, Promise<HTMLImageElement>>();
const found = new Map<string, Bars>();

/** Scryfall's images allow cross-origin reads, which the bar detection needs. */
function loadReadable(url: string): Promise<HTMLImageElement> {
  let hit = images.get(url);
  if (!hit) {
    hit = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => resolve(img);
      img.onerror = () => {
        images.delete(url);
        reject(new Error("Could not load the sample token"));
      };
      img.src = url;
    });
    images.set(url, hit);
  }
  return hit;
}

function pixelsOf(img: HTMLImageElement): FramePixelsV1 | null {
  try {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    return { data: d.data, width: d.width, height: d.height };
  } catch {
    return null;
  }
}

/** Where this particular token's bars are, found in its pixels; the set's measured boxes otherwise. */
function barsOf(img: HTMLImageElement, l: TokenSetLayoutV1, modern: boolean, hasPt: boolean): Bars {
  const key = `${img.src}|${modern}|${hasPt}|${l.title.y}|${l.type.y}`;
  const hit = found.get(key);
  if (hit) return hit;
  const measured: Bars = { title: l.title, type: l.type, pt: hasPt ? l.pt : null };
  const p = modern ? pixelsOf(img) : null;
  const unit = img.naturalWidth / CARD_W;
  const bars: Bars = p
    ? {
        title: refineTokenBarV1(p, l.title, unit),
        type: refineTokenBarV1(p, l.type, unit),
        pt: hasPt ? refineTokenBarV1(p, l.pt, unit) : null,
      }
    : measured;
  found.set(key, bars);
  return bars;
}

/** Modern art runs behind the bars to the black border on every side, whatever the set's measured window says. */
function fullModernArt(measured: TokenBoxV1): TokenBoxV1 {
  const a = modernTokenArtBoxV1(measured);
  const bottom = a.y + a.h;
  return { x: TOKEN_BORDER, y: TOKEN_BORDER, w: CARD_W - TOKEN_BORDER * 2, h: bottom - TOKEN_BORDER };
}

const traces = new Map<string, HTMLCanvasElement | null>();

/**
 * The token at its own resolution with every art pixel outside the bars and
 * the rules box replaced by the blank, using the traced bar outlines. Null
 * when the image cannot be read.
 */
function tracedBlank(
  img: HTMLImageElement,
  l: TokenSetLayoutV1,
  art: TokenBoxV1,
  hasText: boolean,
  hasPt: boolean,
): HTMLCanvasElement | null {
  const key = `${img.src}|${hasText}|${hasPt}|${l.title.y}|${l.type.y}`;
  if (traces.has(key)) return traces.get(key) ?? null;
  const p = pixelsOf(img);
  if (!p) {
    traces.set(key, null);
    return null;
  }
  const unit = p.width / CARD_W;
  const mask = tokenBarMaskV1(p, hasPt ? [l.title, l.type, l.pt] : [l.title, l.type], unit);

  const out = document.createElement("canvas");
  out.width = p.width;
  out.height = p.height;
  const octx = out.getContext("2d");
  if (!octx) return null;
  const pocket = hasText ? null : tokenArtPocketV1(p, l.type, hasPt ? l.pt : null, [art.x, art.x + art.w], unit);
  const artBottom = Math.max((art.y + art.h + BLEED) * unit, pocket?.bottom ?? 0);
  const top = l.title.y + l.title.h;
  drawTokenArtBlankV1(
    octx,
    (art.x - BLEED) * unit,
    (art.y - BLEED) * unit,
    (art.w + BLEED * 2) * unit,
    artBottom - (art.y - BLEED) * unit,
    ((top + l.type.y) / 2) * unit,
    unit,
  );
  const blank = octx.getImageData(0, 0, p.width, p.height).data;
  const result = new ImageData(new Uint8ClampedArray(p.data), p.width, p.height);
  const r = l.rules;
  const rx0 = (r.x - RIM) * unit;
  const rx1 = (r.x + r.w + RIM) * unit;
  const ry0 = (r.y - RIM) * unit;
  const ry1 = (r.y + r.h + RIM) * unit;
  // Real art can run a few units past the measured area, up to the black border; the border stays.
  const ax0 = (art.x - EDGE) * unit;
  const ax1 = (art.x + art.w + EDGE) * unit;
  const ay0 = (art.y - EDGE) * unit;
  for (let y = 0; y < p.height; y += 1) {
    for (let x = 0; x < p.width; x += 1) {
      const i = y * p.width + x;
      if (mask[i] || pocket?.keep[i]) continue;
      if (hasText && x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1) continue;
      if (blank[i * 4 + 3] === 0) {
        const nearArt = x >= ax0 && x <= ax1 && y >= ay0 && y <= (art.y + art.h) * unit;
        const d = p.data;
        const lum = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
        if (!nearArt || lum < BORDER_LUM) continue;
        result.data[i * 4] = 0x0b;
        result.data[i * 4 + 1] = 0x0b;
        result.data[i * 4 + 2] = 0x0c;
        result.data[i * 4 + 3] = 255;
        continue;
      }
      result.data[i * 4] = blank[i * 4];
      result.data[i * 4 + 1] = blank[i * 4 + 1];
      result.data[i * 4 + 2] = blank[i * 4 + 2];
      result.data[i * 4 + 3] = 255;
    }
  }
  octx.putImageData(result, 0, 0);
  traces.set(key, out);
  return out;
}

/**
 * A real token from the set with its artwork painted out, so the customer sees
 * only the frame: the name bar, type line, rules box and P/T box where the set
 * puts them. Shown on screen only; the image is Scryfall's and is never printed.
 */
export function TokenSetBlankV1({
  set,
  sample,
  width,
  className,
}: {
  set: Pick<TokenSetIndexEntryV1, "code" | "name" | "era" | "look">;
  sample: TokenSetSampleV1;
  width: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const height = Math.round((width * CARD_H) / CARD_W);

  useEffect(() => {
    let active = true;
    void loadReadable(sample.image)
      .then((img) => {
        const canvas = ref.current;
        if (!active || !canvas) return;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const s = canvas.width / CARD_W;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const l = tokenSetLayoutV1(set, sample.hasText);
        const modern = set.era === "2015";
        const art = modern ? fullModernArt(l.art) : l.art;
        const traced = modern ? tracedBlank(img, l, art, sample.hasText, sample.hasPt) : null;
        if (traced) {
          ctx.drawImage(traced, 0, 0, canvas.width, canvas.height);
          return;
        }
        const bars = barsOf(img, l, modern, sample.hasPt);

        ctx.save();
        const keep = (add: (p: Path2D) => void) => {
          const hole = new Path2D();
          hole.rect(0, 0, canvas.width, canvas.height);
          add(hole);
          ctx.clip(hole, "evenodd");
        };
        for (const b of [bars.title, bars.type, bars.pt]) {
          if (!b) continue;
          const box = { x: b.x - RIM, y: b.y - RIM, w: b.w + RIM * 2, h: b.h + RIM * 2 };
          keep((p) =>
            modern ? tokenBarPath(p, box.x * s, box.y * s, box.w * s, box.h * s) : p.rect(box.x * s, box.y * s, box.w * s, box.h * s),
          );
        }
        if (sample.hasText) {
          const r = l.rules;
          const top = Math.max(r.y, bars.type.y + bars.type.h);
          keep((p) => p.rect((r.x - RIM) * s, (top - RIM) * s, (r.w + RIM * 2) * s, (r.y + r.h - top + RIM * 2) * s));
        }
        drawTokenArtBlankV1(
          ctx,
          (art.x - BLEED) * s,
          (art.y - BLEED) * s,
          (art.w + BLEED * 2) * s,
          (art.h + BLEED) * s,
          ((bars.title.y + bars.title.h + bars.type.y) / 2) * s,
          s,
        );
        ctx.restore();
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sample.image, sample.hasText, sample.hasPt, set, width, height]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width, height }}
      role="img"
      aria-label={`A real ${set.name} ${sample.name || "token"} with its art removed`}
    />
  );
}
