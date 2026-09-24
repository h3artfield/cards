/** 64-bit difference hash. Same algorithm the scanner app uses. */

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
  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = sample[y * 9 + x] ?? 0;
      const right = sample[y * 9 + x + 1] ?? 0;
      if (left > right) hash |= 1n << bit;
      bit += 1n;
    }
  }
  return hash;
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
  if (!/^[0-9a-f]{1,16}$/.test(cleaned)) return 0n;
  return BigInt(`0x${cleaned}`);
}

export function hamming64(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x !== 0n) {
    x &= x - 1n;
    n += 1;
  }
  return n;
}
