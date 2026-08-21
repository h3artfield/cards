import { readFileSync } from "node:fs";

export function readFloat32File(path: string): Float32Array {
  const buf = readFileSync(path);
  return new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
}
