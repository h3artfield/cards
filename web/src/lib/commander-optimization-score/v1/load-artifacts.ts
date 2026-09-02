import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createGunzip } from "node:zlib";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { COS_V1_EXPECTED_SHA } from "./constants";
import type { CosV1CatalogPoint } from "./access-features";
import type { CosV1CompiledVariant } from "./detect";
import type { CosV1ComboRow } from "./architecture-from-hits";
import type { CosV1Model, CosV1Reference } from "./types";

function firstExistingDir(candidates: string[]): string {
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

export function mechanicalSpaceRoot(): string {
  return firstExistingDir([
    resolve(process.cwd(), "data/milestones/mechanical-space"),
    resolve(process.cwd(), "web/data/milestones/mechanical-space"),
  ]);
}

export function catalogShadowRoot(): string {
  return firstExistingDir([
    resolve(process.cwd(), "data/milestones/catalog-shadow"),
    resolve(process.cwd(), "web/data/milestones/catalog-shadow"),
  ]);
}

export function sha256Bytes(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function verifyCosV1Hashes(): Promise<{
  ok: boolean;
  hashes: { formula: string; schema: string; model: string; reference: string };
  checks: Array<{ file: string; expected: string; got: string; match: boolean }>;
}> {
  const dir = resolve(mechanicalSpaceRoot(), "commander-optimization-score-v1");
  const files = {
    formula: "FORMULA.json",
    schema: "SCHEMA.json",
    model: "MODEL.json",
    reference: "REFERENCE.json",
  } as const;
  const hashes = { formula: "", schema: "", model: "", reference: "" };
  const checks = [];
  for (const [key, name] of Object.entries(files) as Array<[keyof typeof files, string]>) {
    const got = sha256Bytes(await readFile(resolve(dir, name)));
    const expected = COS_V1_EXPECTED_SHA[key];
    hashes[key] = got;
    checks.push({ file: name, expected, got, match: got === expected });
  }
  return { ok: checks.every((c) => c.match), hashes, checks };
}

let cached:
  | {
      model: CosV1Model;
      reference: CosV1Reference;
      hashes: { formula: string; schema: string; model: string; reference: string };
      comboIndex: Map<string, CosV1ComboRow>;
      compiled: CosV1CompiledVariant[];
      points: Map<string, CosV1CatalogPoint>;
      texts: Map<string, string>;
    }
  | null = null;

async function readJsonl(path: string): Promise<string[]> {
  const lines: string[] = [];
  const stream = path.endsWith(".gz") ? createReadStream(path).pipe(createGunzip()) : createReadStream(path, "utf8");
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }
  return lines;
}

export async function loadCosV1Runtime() {
  if (cached) return cached;
  const verified = await verifyCosV1Hashes();
  if (!verified.ok) {
    throw new Error(`COS v1 frozen hash mismatch: ${JSON.stringify(verified.checks)}`);
  }
  const ms = mechanicalSpaceRoot();
  const cos = resolve(ms, "commander-optimization-score-v1");
  const model = JSON.parse(await readFile(resolve(cos, "MODEL.json"), "utf8")) as CosV1Model;
  const reference = JSON.parse(await readFile(resolve(cos, "REFERENCE.json"), "utf8")) as CosV1Reference;

  const comboIndex = new Map<string, CosV1ComboRow>();
  for (const line of await readJsonl(resolve(ms, "spellbook-win-architecture-space-v1", "normalized-combo-dictionary.jsonl"))) {
    const rec = JSON.parse(line) as CosV1ComboRow;
    comboIndex.set(rec.cardSetSignature, rec);
  }

  const detectorPath = resolve(cos, "detector-complete-variants.jsonl");
  const compiled: CosV1CompiledVariant[] = [];
  for (const line of await readJsonl(detectorPath)) {
    compiled.push(JSON.parse(line) as CosV1CompiledVariant);
  }

  const points = new Map<string, CosV1CatalogPoint>();
  const pointRaw = await new Promise<string>((resolveP, reject) => {
    const chunks: Buffer[] = [];
    createReadStream(resolve(catalogShadowRoot(), "catalog-semantic-visualization-v1-points.json.gz"))
      .pipe(createGunzip())
      .on("data", (c) => chunks.push(c as Buffer))
      .on("end", () => resolveP(Buffer.concat(chunks).toString("utf8")))
      .on("error", reject);
  });
  for (const row of JSON.parse(pointRaw) as Array<CosV1CatalogPoint & { oracleId?: string }>) {
    if (row.oracleId) points.set(row.oracleId, row);
  }

  const texts = new Map<string, string>();
  for (const line of await readJsonl(resolve(catalogShadowRoot(), "catalog-shadow-parse-rc8-firestore-v2.jsonl.gz"))) {
    const rec = JSON.parse(line) as {
      oracleId?: string;
      semantic?: { abilities?: Array<{ abilitySpan?: { text?: string } }> };
    };
    if (!rec.oracleId) continue;
    const chunks = (rec.semantic?.abilities ?? [])
      .map((ab) => (ab.abilitySpan?.text ?? "").trim())
      .filter(Boolean);
    texts.set(rec.oracleId, chunks.join("\n"));
  }

  cached = {
    model,
    reference,
    hashes: verified.hashes,
    comboIndex,
    compiled,
    points,
    texts,
  };
  return cached;
}
