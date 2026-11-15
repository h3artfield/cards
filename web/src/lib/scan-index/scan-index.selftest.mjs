import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const pixels = new Uint8Array(32 * 32);
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) pixels[y * 32 + x] = x > 16 ? 20 : 220;
}

function resize(src, width, height, outW, outH) {
  const out = new Uint8Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / outH));
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / outW));
      out[y * outW + x] = src[sy * width + sx] ?? 0;
    }
  }
  return out;
}

function dhash(src, width, height) {
  const sample = resize(src, width, height, 9, 8);
  let hash = 0n;
  let bit = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((sample[y * 9 + x] ?? 0) > (sample[y * 9 + x + 1] ?? 0)) hash |= 1n << bit;
      bit += 1n;
    }
  }
  return hash;
}

const hash = dhash(pixels, 32, 32);
assert.ok(hash > 0n);

const magic = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/scan-index/magic/manifest.json"), "utf8"),
);
assert.equal(magic.game, "magic");
assert.ok(magic.cardCount >= 2);
const bin = readFileSync(path.join(process.cwd(), "data/scan-index/magic/cards.bin"));
assert.equal(bin.subarray(0, 8).toString("utf8"), "CS9KID01");

console.log("PASS  scan index fixture packs");
