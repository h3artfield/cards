import { hamming64 } from "./dhash";

export const DINOV3_MODEL_ID =
  "onnx-community/dinov3-vits16-pretrain-lvd1689m-ONNX";
export const DINOV3_EMBED_DIM = 384;
export const DINOV3_WORDS = 6; // 6 x 64-bit words = 384 bits

export type Binary384 = [bigint, bigint, bigint, bigint, bigint, bigint];

const ZERO = BigInt(0);
const ONE = BigInt(1);

/**
 * Pool and L2-normalize a DINOv3 output tensor `[1, N_tokens, 384]` or `[1, 384]`
 * into a 384-element Float32Array.
 *
 * Combines 50% CLS token (`token 0`) + 50% mean-pooled spatial patch tokens (`tokens 5..N`)
 * for maximum artwork & layout invariance, then centers and L2-normalizes.
 */
export function poolDinoV3Features(
  data: Float32Array | number[],
  dims: readonly number[],
): Float32Array {
  const vec = new Float32Array(DINOV3_EMBED_DIM);
  const tokenCount = dims.length === 3 ? (dims[1] ?? 1) : 1;

  if (tokenCount <= 1) {
    for (let d = 0; d < DINOV3_EMBED_DIM; d++) {
      vec[d] = Number(data[d] ?? 0);
    }
  } else {
    // DINOv3 has 1 CLS token + 4 register tokens + 196 patch tokens = 201 tokens
    const patchStart = tokenCount > 5 ? 5 : 1;
    const patchCount = Math.max(1, tokenCount - patchStart);

    for (let d = 0; d < DINOV3_EMBED_DIM; d++) {
      const clsVal = Number(data[d] ?? 0);
      let patchSum = 0;
      for (let t = patchStart; t < tokenCount; t++) {
        patchSum += Number(data[t * DINOV3_EMBED_DIM + d] ?? 0);
      }
      const patchMean = patchSum / patchCount;
      vec[d] = 0.5 * clsVal + 0.5 * patchMean;
    }
  }

  // Mean-center across the 384 dimensions so sign-bit quantization is balanced (50% 1s, 50% 0s)
  let mean = 0;
  for (let d = 0; d < DINOV3_EMBED_DIM; d++) {
    mean += vec[d]!;
  }
  mean /= DINOV3_EMBED_DIM;

  let normSq = 0;
  for (let d = 0; d < DINOV3_EMBED_DIM; d++) {
    const centered = vec[d]! - mean;
    vec[d] = centered;
    normSq += centered * centered;
  }
  const norm = Math.sqrt(normSq) || 1;
  for (let d = 0; d < DINOV3_EMBED_DIM; d++) {
    vec[d] = vec[d]! / norm;
  }
  return vec;
}

/**
 * Quantize a 384-d float embedding into 6 x 64-bit BigInts (384 bits / 48 bytes).
 */
export function quantizeDinoV3ToBinary384(vec: Float32Array): Binary384 {
  const words: Binary384 = [ZERO, ZERO, ZERO, ZERO, ZERO, ZERO];
  for (let w = 0; w < DINOV3_WORDS; w++) {
    let word = ZERO;
    const base = w * 64;
    for (let b = 0; b < 64; b++) {
      if ((vec[base + b] ?? 0) > 0) {
        word |= ONE << BigInt(b);
      }
    }
    words[w] = word;
  }
  return words;
}

export function hamming384(a: Binary384, b: Binary384): number {
  return (
    hamming64(a[0], b[0]) +
    hamming64(a[1], b[1]) +
    hamming64(a[2], b[2]) +
    hamming64(a[3], b[3]) +
    hamming64(a[4], b[4]) +
    hamming64(a[5], b[5])
  );
}

export function binary384ToHex(words: Binary384): string {
  return words.map((w) => w.toString(16).padStart(16, "0")).join("");
}

export function hexToBinary384(hex: string): Binary384 | undefined {
  const cleaned = hex.trim().toLowerCase().replace(/^0x/, "");
  if (cleaned.length !== 96 || !/^[0-9a-f]{96}$/.test(cleaned)) {
    return undefined;
  }
  return [
    BigInt(`0x${cleaned.slice(0, 16)}`),
    BigInt(`0x${cleaned.slice(16, 32)}`),
    BigInt(`0x${cleaned.slice(32, 48)}`),
    BigInt(`0x${cleaned.slice(48, 64)}`),
    BigInt(`0x${cleaned.slice(64, 80)}`),
    BigInt(`0x${cleaned.slice(80, 96)}`),
  ];
}
