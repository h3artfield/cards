import type { TokenBoxV1 } from "./design-v1";

/**
 * Finds where a real modern token's bars actually sit, starting from a set's
 * measured boxes (which are medians over its tokens, so a few units off for
 * any one card). Every 2015-frame bar is a coloured rim with a thin black
 * keyline inside it; the keyline is what we look for, row by row, across many
 * columns at once so art that happens to be dark does not fool it.
 *
 * Works in image pixels; boxes go in and come out in card units.
 */
export type FramePixelsV1 = { data: Uint8ClampedArray; width: number; height: number };

const DARK = 48;
const RIM_LIFT = 18;
/** How far, in card units, an edge may sit from the measured one. */
const SLACK = 14;

function lumAt(p: FramePixelsV1, x: number, y: number): number {
  const xi = Math.min(p.width - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(p.height - 1, Math.max(0, Math.round(y)));
  const i = (yi * p.width + xi) * 4;
  return 0.299 * p.data[i] + 0.587 * p.data[i + 1] + 0.114 * p.data[i + 2];
}

function colorAt(p: FramePixelsV1, x: number, y: number): [number, number, number] {
  const xi = Math.min(p.width - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(p.height - 1, Math.max(0, Math.round(y)));
  const i = (yi * p.width + xi) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2]];
}

function near(a: [number, number, number], b: [number, number, number], tol: number): boolean {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < tol;
}

/**
 * The bar's keyline: scanning from inside the bar (`from`) out toward `to`,
 * the first row that is dark in most columns while the row `rim` pixels
 * further out is clearly lighter (the rim). Scanning outward means dark art
 * beyond the bar is never reached first.
 */
function keylineRow(p: FramePixelsV1, cols: number[], from: number, to: number, rim: number): number | null {
  const step = from < to ? 1 : -1;
  for (let y = from; step > 0 ? y <= to : y >= to; y += step) {
    let hits = 0;
    for (const x of cols) {
      const key = lumAt(p, x, y);
      if (key < DARK && lumAt(p, x, y + step * rim) > key + RIM_LIFT) hits += 1;
    }
    if (hits >= cols.length * 0.6) return y;
  }
  return null;
}

/** Walks outward from the keyline across the rim until the colour jumps; the rim's bevel shades gradually. */
function rimEdge(p: FramePixelsV1, cols: number[], keyline: number, outward: 1 | -1, rimPx: number, maxPx: number): number {
  let prev = cols.map((x) => colorAt(p, x, keyline + outward * rimPx));
  let edge = keyline + outward * rimPx;
  for (let d = rimPx + 1; d <= maxPx; d += 1) {
    const y = keyline + outward * d;
    const here = cols.map((x) => colorAt(p, x, y));
    const same = here.filter((c, i) => near(c, prev[i], 60)).length;
    if (same < cols.length * 0.5) break;
    prev = here;
    edge = y;
  }
  return edge;
}

/**
 * Which pixels of a real token belong to its bars. Each bar's rough box is
 * found first; then, around it, every column is walked down from above and up
 * from below, and every row in from each side, until the rim's colour starts.
 * What was walked over is art. This follows the bar's true outline, curved
 * ends included, rather than a shape we assume.
 *
 * Returns one byte per pixel: 1 for bar, 0 otherwise.
 */
export function tokenBarMaskV1(p: FramePixelsV1, boxes: TokenBoxV1[], unit: number): Uint8Array {
  const mask = new Uint8Array(p.width * p.height);
  for (const measured of boxes) markBar(p, mask, measured, unit);
  return mask;
}

function markBar(p: FramePixelsV1, mask: Uint8Array, measured: TokenBoxV1, k: number) {
  const box = refineTokenBarV1(p, measured, k);  const X = box.x * k;
  const Y = box.y * k;
  const W = box.w * k;
  const H = box.h * k;
  const out = 4 * k;
  const inn = 6 * k;
  const TOL = 80;
  const rimLike = (x: number, y: number, rim: [number, number, number]) => near(colorAt(p, x, y), rim, TOL);
  /** Art can share the rim's colour; only the rim has the black keyline just inside it. */
  const reach = Math.max(3, Math.round(9 * k));
  const keyInside = (x: number, y: number, dx: number, dy: number) => {
    const rimLum = lumAt(p, x, y);
    for (let d = 2; d <= reach; d += 1) {
      const l = lumAt(p, x + dx * d, y + dy * d);
      if (l < DARK && l < rimLum - 15) return true;
    }
    return false;
  };
  const clampX = (x: number) => Math.min(X + W * 0.94, Math.max(X + W * 0.06, x));
  /** How far in from the box's side the end's curve sits on row `y` (the shape `tokenBarPath` draws). */
  const e = Math.min(H * 0.2, W * 0.08);
  const capInset = (y: number) => {
    const t = Math.min(1, Math.max(0, (y - Y) / H));
    return e - 4 * e * t * (1 - t);
  };

  const y0 = Math.max(0, Math.floor(Y - out));
  const y1 = Math.min(p.height - 1, Math.ceil(Y + H + out));
  const L = Math.min(X, measured.x * k);
  const R = Math.max(X + W, (measured.x + measured.w) * k);
  const x0 = Math.max(0, Math.floor(L - out));
  const x1 = Math.min(p.width - 1, Math.ceil(R + out));

  // Top and bottom: per column, the first rim pixel within a band round the expected edge.
  const top = new Float64Array(x1 - x0 + 1);
  const bottom = new Float64Array(x1 - x0 + 1);
  for (let x = x0; x <= x1; x += 1) {
    const rimT = colorAt(p, clampX(x), Y + 1.5 * k);
    const rimB = colorAt(p, clampX(x), Y + H - 1.5 * k);
    let t = Y + k;
    for (let y = Math.floor(Y - out); y <= Y + inn; y += 1) {
      if (rimLike(x, y, rimT) && rimLike(x, y + 1, rimT) && keyInside(x, y, 0, 1)) {
        t = y;
        break;
      }
    }
    let b = Y + H - k;
    for (let y = Math.ceil(Y + H + out); y >= Y + H - inn; y -= 1) {
      if (rimLike(x, y, rimB) && rimLike(x, y - 1, rimB) && keyInside(x, y, 0, -1)) {
        b = y;
        break;
      }
    }
    top[x - x0] = t;
    bottom[x - x0] = b;
  }

  // Ends: per row, the first rim pixel walking in from outside, within the curve's reach.
  const midY = Y + H / 2;
  const rimL = colorAt(p, X + 1.5 * k, midY);
  const rimR = colorAt(p, X + W - 1.5 * k, midY);
  for (let y = y0; y <= y1; y += 1) {
    const inset = capInset(y);
    let l = X + inset;
    for (let x = Math.floor(L - out); x <= X + inset + inn; x += 1) {
      if (rimLike(x, y, rimL) && rimLike(x + 1, y, rimL) && keyInside(x, y, 1, 0)) {
        l = x;
        break;
      }
    }
    let r = X + W - inset;
    for (let x = Math.ceil(R + out); x >= X + W - inset - inn; x -= 1) {
      if (rimLike(x, y, rimR) && rimLike(x - 1, y, rimR) && keyInside(x, y, -1, 0)) {
        r = x;
        break;
      }
    }
    for (let x = Math.max(x0, Math.ceil(l)); x <= Math.min(x1, Math.floor(r)); x += 1) {
      if (y >= top[x - x0] && y <= bottom[x - x0]) mask[y * p.width + x] = 1;
    }
  }
}

const INFO_LUM = 24;
/** Brackets are the rim's colour, far brighter than the dark art that can end in an even row. */
const BRACKET_SUM = 200;

/**
 * Tokens without rules text carry their art on under the type line, down to
 * the black collector strip, sometimes framed by a thin rim-coloured bracket
 * running to the P/T box. Finds where that art stops (in image pixels) and
 * which pixels of the bracket to keep (1 in `keep`).
 */
export function tokenArtPocketV1(
  p: FramePixelsV1,
  type: TokenBoxV1,
  pt: TokenBoxV1 | null,
  innerX: [number, number],
  unit: number,
): { bottom: number; keep: Uint8Array } {
  const k = unit;
  const keep = new Uint8Array(p.width * p.height);
  const bar = refineTokenBarV1(p, type, k);
  const barBottom = (bar.y + bar.h) * k;
  const right = pt ? pt.x - 10 : type.x + type.w * 0.6;
  const cols = columns((innerX[0] + 6) * k, right * k, 24);
  const foot = pt ? refineTokenBarV1(p, pt, k) : null;
  const lowest = Math.min(p.height - 1, Math.round(((foot ? foot.y + foot.h : type.y + type.h + 50) - 4) * k));
  // Collector text lights a few columns of a row; art and the bracket light nearly all of them.
  const lit = (y: number) => cols.filter((x) => lumAt(p, x, y) > INFO_LUM).length >= cols.length * 0.75;

  // Up from the P/T box's foot, the first lit row is where the art (or the bracket) ends. Art too dark
  // to light a row is left alone; it already reads as the strip's black.
  let y = lowest;
  while (y > barBottom && !lit(y)) y -= 1;
  const bottom = y + 1;
  if (bottom <= barBottom + 2 * k) return { bottom: Math.round(barBottom), keep };

  // A bracket is one even colour all along its foot; the bottom of a picture is not.
  const soft = Math.max(1, Math.round(1.5 * k));
  let line: [number, number, number] | null = null;
  const sum = (c: [number, number, number]) => c[0] + c[1] + c[2];
  for (let d = 0; d <= soft + 1; d += 1) {
    const row = cols.map((x) => colorAt(p, x, bottom - 1 - d));
    const mid = row.map(sum).sort((a, b) => a - b)[row.length >> 1];
    const pick = row.find((c) => sum(c) === mid) ?? row[0];
    const even = row.filter((c) => near(c, pick, 60)).length >= row.length * 0.6;
    if (even && sum(pick) >= BRACKET_SUM && (!line || sum(pick) > sum(line))) line = pick;
  }
  if (!line) return { bottom, keep };
  const bracket = line;

  const reach = Math.round(6 * k);
  /** Keeps the run of bracket-coloured pixels starting within `soft` steps (the anti-aliased edge) of `at(0)`. */
  const keepRun = (at: (d: number) => [number, number] | null) => {
    let started = false;
    for (let d = 0; d < reach; d += 1) {
      const xy = at(d);
      if (!xy) return;
      if (near(colorAt(p, xy[0], xy[1]), bracket, 80)) {
        started = true;
        keep[xy[1] * p.width + xy[0]] = 1;
      } else if (started || d >= soft) {
        return;
      }
    }
  };
  const x0 = Math.round(innerX[0] * k);
  const x1 = Math.round(innerX[1] * k);
  for (let x = x0; x <= x1; x += 1) keepRun((d) => [x, bottom - 1 - d]);
  for (let y = Math.round(barBottom); y < bottom; y += 1) {
    let x = x0;
    while (x < x1 && lumAt(p, x, y) < INFO_LUM) x += 1;
    keepRun((d) => (x + d <= x1 ? [x + d, y] : null));
  }
  return { bottom, keep };
}

function columns(x0: number, x1: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => x0 + ((x1 - x0) * (i + 0.5)) / n);
}

/** The bar's outer box, or the measured one where an edge cannot be found. */
export function refineTokenBarV1(p: FramePixelsV1, box: TokenBoxV1, unit: number): TokenBoxV1 {
  const k = unit;
  const x = box.x * k;
  const y = box.y * k;
  const w = box.w * k;
  const h = box.h * k;
  const slack = SLACK * k;
  const rimPx = Math.max(2, Math.round(2.5 * k));
  const maxRim = Math.round(10 * k);
  const cols = columns(x + w * 0.1, x + w * 0.9, 28);

  const topKey = keylineRow(p, cols, Math.round(y + h * 0.4), Math.round(y - slack), rimPx);
  const bottomKey = keylineRow(p, cols, Math.round(y + h * 0.6), Math.round(y + h + slack), rimPx);
  const top = topKey !== null ? rimEdge(p, cols, topKey, -1, rimPx, maxRim) : y;
  const bottom = bottomKey !== null ? rimEdge(p, cols, bottomKey, 1, rimPx, maxRim) : y + h;
  if (bottom - top < h * 0.5) return box;

  // The ends bow out furthest at mid-height; walk in from outside until the rim colour starts.
  const mid = (top + bottom) / 2;
  const rows = [mid - (bottom - top) * 0.12, mid, mid + (bottom - top) * 0.12];
  const rimTop = colorAt(p, x + w / 2, top + rimPx * 0.5);
  const end = (from: number, to: number) => {
    const step = from < to ? 1 : -1;
    for (let xi = from; step > 0 ? xi <= to : xi >= to; xi += step) {
      const run = [0, 1, 2].every((d) => rows.filter((ry) => near(colorAt(p, xi + step * d, ry), rimTop, 80)).length >= 2);
      if (run) return xi;
    }
    return null;
  };
  const left = end(Math.round(x - slack), Math.round(x + slack)) ?? x;
  const right = end(Math.round(x + w + slack), Math.round(x + w - slack)) ?? x + w;
  if (right - left < w * 0.6) return { x: box.x, y: top / k, w: box.w, h: (bottom - top) / k };
  return { x: left / k, y: top / k, w: (right - left) / k, h: (bottom - top) / k };
}
