/**
 * Content-addressed immutable benchmark storage — never overwrite sealed artifacts.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

export type BenchmarkPhase = "prepolicy" | "certified";

export function immutableBenchmarkFilename(setVersion: string, phase: BenchmarkPhase, contentHash: string): string {
  const short = contentHash.slice(0, 16);
  return `${setVersion}-${phase}-${short}.json`;
}

export function writeImmutableBenchmarkCopy(input: {
  setVersion: string;
  phase: BenchmarkPhase;
  contentHash: string;
  sourcePath: string;
  outDir: string;
}): string {
  mkdirSync(resolve(input.outDir), { recursive: true });
  const filename = immutableBenchmarkFilename(input.setVersion, input.phase, input.contentHash);
  const dest = resolve(input.outDir, filename);
  if (existsSync(dest)) {
    const existing = JSON.parse(readFileSync(dest, "utf8")) as { contentHash?: string };
    if (existing.contentHash !== input.contentHash) {
      throw new Error(`Immutable benchmark collision: ${dest} exists with different contentHash`);
    }
    return dest;
  }
  copyFileSync(resolve(input.sourcePath), dest);
  return dest;
}

export function writeImmutableBenchmarkEnvelope(input: {
  setVersion: string;
  phase: BenchmarkPhase;
  envelope: Record<string, unknown> & { contentHash: string };
  outDir: string;
}): string {
  mkdirSync(resolve(input.outDir), { recursive: true });
  const filename = immutableBenchmarkFilename(input.setVersion, input.phase, input.envelope.contentHash);
  const dest = resolve(input.outDir, filename);
  if (existsSync(dest)) {
    const existing = JSON.parse(readFileSync(dest, "utf8")) as { contentHash?: string };
    if (existing.contentHash !== input.envelope.contentHash) {
      throw new Error(`Immutable benchmark collision: ${dest} exists with different contentHash`);
    }
    return dest;
  }
  writeFileSync(dest, `${JSON.stringify(input.envelope, null, 2)}\n`);
  return dest;
}

export function writeCanonicalPointer(input: {
  canonicalPath: string;
  immutablePath: string;
  contentHash: string;
  phase: BenchmarkPhase;
}): void {
  mkdirSync(dirname(resolve(input.canonicalPath)), { recursive: true });
  const pointer = {
    pointerVersion: "immutable-benchmark-pointer-v1",
    phase: input.phase,
    contentHash: input.contentHash,
    immutablePath: input.immutablePath.replace(/\\/g, "/"),
    note: "Canonical pointer — mutate only via new immutable copy with new contentHash.",
  };
  writeFileSync(resolve(input.canonicalPath), `${JSON.stringify(pointer, null, 2)}\n`);
}

export function assertImmutableNotOverwritten(path: string, expectedHash: string): void {
  if (!existsSync(resolve(path))) return;
  const envelope = JSON.parse(readFileSync(resolve(path), "utf8")) as { contentHash?: string; pointerVersion?: string };
  if (envelope.pointerVersion) return;
  if (envelope.contentHash && envelope.contentHash !== expectedHash) {
    throw new Error(
      `Refusing to overwrite sealed benchmark ${path}: on-disk hash ${envelope.contentHash} != expected ${expectedHash}. ` +
        "Write a new content-addressed immutable copy instead.",
    );
  }
}
