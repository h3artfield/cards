/** 64-bit difference hash. Same algorithm the scanner app uses. */

export type NormalizedCropRect = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

/**
 * Canonical card artwork box inside a full card frame (2.5 x 3.5 aspect).
 * Inset from borders and title/text box so background edges and sleeves
 * never pollute the perceptual hash.
 */
export const CANONICAL_CARD_ART_CROP: NormalizedCropRect = {
  x0: 0.09,
  y0: 0.12,
  x1: 0.91,
  y1: 0.54,
};

export function grayFromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

export function cropGrayNormalized(
  pixels: Uint8Array,
  width: number,
  height: number,
  rect: NormalizedCropRect = CANONICAL_CARD_ART_CROP,
): { pixels: Uint8Array; width: number; height: number } {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(width * rect.x0)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(height * rect.y0)));
  const x1 = Math.max(x0 + 1, Math.min(width, Math.ceil(width * rect.x1)));
  const y1 = Math.max(y0 + 1, Math.min(height, Math.ceil(height * rect.y1)));
  const outW = x1 - x0;
  const outH = y1 - y0;
  const out = new Uint8Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const srcOffset = (y0 + y) * width + x0;
    out.set(pixels.subarray(srcOffset, srcOffset + outW), y * outW);
  }
  return { pixels: out, width: outW, height: outH };
}

/**
 * Area-averaged box downsample to 9x8 (or outWidth x outHeight).
 * Significantly more stable under camera noise/autofocus jitter than nearest-neighbor,
 * while remaining identical on uniform regions.
 */
export function resizeGrayBox(
  pixels: Uint8Array,
  width: number,
  height: number,
  outWidth: number,
  outHeight: number,
): Uint8Array {
  const out = new Uint8Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y++) {
    const sy0 = Math.floor((y * height) / outHeight);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * height) / outHeight));
    for (let x = 0; x < outWidth; x++) {
      const sx0 = Math.floor((x * width) / outWidth);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * width) / outWidth));
      let sum = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1 && sy < height; sy++) {
        const row = sy * width;
        for (let sx = sx0; sx < sx1 && sx < width; sx++) {
          sum += pixels[row + sx] ?? 0;
          count += 1;
        }
      }
      out[y * outWidth + x] = count > 0 ? Math.round(sum / count) : 0;
    }
  }
  return out;
}

export function resizeGrayNearest(
  pixels: Uint8Array,
  width: number,
  height: number,
  outWidth: number,
  outHeight: number,
): Uint8Array {
  const out = new Uint8Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y++) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / outHeight));
    for (let x = 0; x < outWidth; x++) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / outWidth));
      out[y * outWidth + x] = pixels[sy * width + sx] ?? 0;
    }
  }
  return out;
}

export function dHashFromGray(
  pixels: Uint8Array,
  width: number,
  height: number,
): bigint {
  const sample = resizeGrayNearest(pixels, width, height, 9, 8);
  let hash = BigInt(0);
  let bit = BigInt(0);
  const one = BigInt(1);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = sample[y * 9 + x] ?? 0;
      const right = sample[y * 9 + x + 1] ?? 0;
      if (left > right) hash |= one << bit;
      bit += one;
    }
  }
  return hash;
}

/**
 * Hash the canonical artwork region of a full card image (2.5:3.5 aspect).
 * Uses box-averaged downsampling for resilience against camera blur and foil glare.
 */
export function dHashCanonicalCardFromGray(
  pixels: Uint8Array,
  width: number,
  height: number,
  cropRect: NormalizedCropRect = CANONICAL_CARD_ART_CROP,
): bigint {
  const cropped = cropGrayNormalized(pixels, width, height, cropRect);
  const sample = resizeGrayBox(
    cropped.pixels,
    cropped.width,
    cropped.height,
    9,
    8,
  );
  let hash = BigInt(0);
  let bit = BigInt(0);
  const one = BigInt(1);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = sample[y * 9 + x] ?? 0;
      const right = sample[y * 9 + x + 1] ?? 0;
      if (left > right) hash |= one << bit;
      bit += one;
    }
  }
  return hash;
}

/**
 * Compute a 64-bit Vertical difference hash (vHash) + 8x8 mean luminance hash
 * on the canonical artwork region. Combined with the horizontal dHash, this forms
 * a 128-bit 2D structural fingerprint that rejects horizontal-only false collisions.
 */
export function vHashCanonicalCardFromGray(
  pixels: Uint8Array,
  width: number,
  height: number,
  cropRect: NormalizedCropRect = CANONICAL_CARD_ART_CROP,
): bigint {
  const cropped = cropGrayNormalized(pixels, width, height, cropRect);
  const sample = resizeGrayBox(
    cropped.pixels,
    cropped.width,
    cropped.height,
    8,
    9,
  );
  let hash = BigInt(0);
  let bit = BigInt(0);
  const one = BigInt(1);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const top = sample[y * 8 + x] ?? 0;
      const bottom = sample[(y + 1) * 8 + x] ?? 0;
      if (top > bottom) hash |= one << bit;
      bit += one;
    }
  }
  return hash;
}

/**
 * Generate aligned candidate hashes using the detected card bounds inside the guide box.
 * Instead of 8 blind shifts (which multiply false positives), we use only 3 tight
 * candidates centered on the detected card boundaries.
 */
export function dHashAlignedCandidatesFromGray(
  pixels: Uint8Array,
  width: number,
  height: number,
  cardBounds?: { x0: number; y0: number; x1: number; y1: number; confidence?: number },
): Array<{ hHash: bigint; vHash: bigint }> {
  const bx0 = cardBounds && (cardBounds.confidence ?? 0) >= 0.7 ? cardBounds.x0 : 0;
  const by0 = cardBounds && (cardBounds.confidence ?? 0) >= 0.7 ? cardBounds.y0 : 0;
  const bx1 = cardBounds && (cardBounds.confidence ?? 0) >= 0.7 ? cardBounds.x1 : 1;
  const by1 = cardBounds && (cardBounds.confidence ?? 0) >= 0.7 ? cardBounds.y1 : 1;

  const cardW = Math.max(0.5, bx1 - bx0);
  const cardH = Math.max(0.5, by1 - by0);

  const base = CANONICAL_CARD_ART_CROP;
  const mappedRect: NormalizedCropRect = {
    x0: Math.max(0.01, bx0 + cardW * base.x0),
    y0: Math.max(0.01, by0 + cardH * base.y0),
    x1: Math.min(0.99, bx0 + cardW * base.x1),
    y1: Math.min(0.99, by0 + cardH * base.y1),
  };

  const out: Array<{ hHash: bigint; vHash: bigint }> = [];
  const deltas = [
    { dx: 0, dy: 0 },
    { dx: 0, dy: -0.018 },
    { dx: 0, dy: 0.018 },
  ];

  for (const { dx, dy } of deltas) {
    const r: NormalizedCropRect = {
      x0: Math.max(0.01, mappedRect.x0 + dx),
      y0: Math.max(0.01, mappedRect.y0 + dy),
      x1: Math.min(0.99, mappedRect.x1 + dx),
      y1: Math.min(0.99, mappedRect.y1 + dy),
    };
    out.push({
      hHash: dHashCanonicalCardFromGray(pixels, width, height, r),
      vHash: vHashCanonicalCardFromGray(pixels, width, height, r),
    });
  }
  return out;
}

/**
 * Generate multi-jitter hashes (small translations/scale tolerances) from a live
 * camera card frame so slight hand movement or misalignment still hits <8 bit distance.
 */
export function dHashJitterCandidatesFromGray(
  pixels: Uint8Array,
  width: number,
  height: number,
): bigint[] {
  const offsets: Array<{ dx: number; dy: number; scale: number }> = [
    { dx: 0, dy: 0, scale: 1.0 },
    { dx: -0.025, dy: 0, scale: 1.0 },
    { dx: 0.025, dy: 0, scale: 1.0 },
    { dx: 0, dy: -0.025, scale: 1.0 },
    { dx: 0, dy: 0.025, scale: 1.0 },
    { dx: 0, dy: 0, scale: 0.94 },
    { dx: 0, dy: 0, scale: 1.06 },
  ];

  const base = CANONICAL_CARD_ART_CROP;
  const cx = (base.x0 + base.x1) / 2;
  const cy = (base.y0 + base.y1) / 2;
  const bw = base.x1 - base.x0;
  const bh = base.y1 - base.y0;

  const seen = new Set<bigint>();
  const out: bigint[] = [];
  for (const { dx, dy, scale } of offsets) {
    const hw = (bw * scale) / 2;
    const hh = (bh * scale) / 2;
    const rect: NormalizedCropRect = {
      x0: Math.max(0.01, cx + dx - hw),
      y0: Math.max(0.01, cy + dy - hh),
      x1: Math.min(0.99, cx + dx + hw),
      y1: Math.min(0.99, cy + dy + hh),
    };
    const h = dHashCanonicalCardFromGray(pixels, width, height, rect);
    if (!seen.has(h)) {
      seen.add(h);
      out.push(h);
    }
  }
  // Also include full-frame dHash as fallback for art-crop indexed entries
  const fullHash = dHashFromGray(pixels, width, height);
  if (!seen.has(fullHash)) {
    out.push(fullHash);
  }
  return out;
}

export function dHashFromRgba(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): bigint {
  return dHashFromGray(grayFromRgba(rgba, width, height), width, height);
}

export function hashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, "0");
}

export function hexToHash(hex: string): bigint {
  const cleaned = hex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{1,16}$/.test(cleaned)) return BigInt(0);
  return BigInt(`0x${cleaned}`);
}

const MASK_64 = BigInt("0xffffffffffffffff");
const ZERO_64 = BigInt(0);
const ONE_64 = BigInt(1);

export function hamming64(a: bigint, b: bigint): number {
  let x = (a ^ b) & MASK_64;
  let n = 0;
  while (x !== ZERO_64) {
    x &= x - ONE_64;
    n += 1;
  }
  return n;
}

/**
 * Entropy check: reject flat/blank/single-color backgrounds that produce
 * near-all-zero or near-all-one hashes.
 */
export function isMeaningfulCardHash(hash: bigint): boolean {
  const ones = hamming64(hash, ZERO_64);
  return ones >= 8 && ones <= 56;
}

