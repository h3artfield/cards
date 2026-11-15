/**
 * Fit COS_V1_UNIVERSAL_COMMANDER_BASELINE_V1.
 * Trains only on frozen MODEL.S intercepts. No spent outcomes. No color bonus.
 */
import { createReadStream, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { resolve } from "node:path";
import type { CosV1CatalogPoint } from "../../src/lib/commander-optimization-score/v1/access-features";
import { commanderPriorFeatureVector } from "../../src/lib/commander-optimization-score/v1/commander-prior-features";
import {
  COS_V1_UNIVERSAL_COMMANDER_BASELINE_VERSION,
  predictCommanderPriorIntercept,
  standardizePriorFeatures,
  type CosV1CommanderPriorArtifact,
} from "../../src/lib/commander-optimization-score/v1/commander-prior";
import type { CosV1Model } from "../../src/lib/commander-optimization-score/v1/types";
import { catalogShadowRoot, mechanicalSpaceRoot } from "../../src/lib/commander-optimization-score/v1/load-artifacts";

async function readJsonl(path: string): Promise<string[]> {
  const lines: string[] = [];
  const stream = path.endsWith(".gz") ? createReadStream(path).pipe(createGunzip()) : createReadStream(path, "utf8");
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }
  return lines;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

async function main() {
  const ms = mechanicalSpaceRoot();
  const cos = resolve(ms, "commander-optimization-score-v1");
  const model = JSON.parse(await readFile(resolve(cos, "MODEL.json"), "utf8")) as CosV1Model;

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

  const rows: Array<{ identity: string; x: number[]; S: number; covered: number }> = [];
  for (let i = 0; i < model.commanderIdentities.length; i++) {
    const identity = model.commanderIdentities[i]!;
    const S = model.S[i + 1];
    if (S == null || !Number.isFinite(S)) continue;
    const feat = commanderPriorFeatureVector({
      oracleIds: identity.split("|"),
      points,
      texts,
    });
    rows.push({ identity, x: feat.x, S, covered: feat.covered });
  }

  const dim = rows[0]!.x.length;
  const mu = Array.from({ length: dim }, (_, j) => rows.reduce((s, r) => s + r.x[j]!, 0) / rows.length);
  const sd = Array.from({ length: dim }, (_, j) => {
    const v = rows.reduce((s, r) => s + (r.x[j]! - mu[j]!) ** 2, 0) / rows.length;
    return Math.sqrt(v);
  });

  const k = 15;
  const truth: number[] = [];
  const pred: number[] = [];
  const zeroPred: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const hold = rows[i]!;
    const rest = rows.filter((_, j) => j !== i);
    const prior: CosV1CommanderPriorArtifact = {
      version: COS_V1_UNIVERSAL_COMMANDER_BASELINE_VERSION,
      method: "knn",
      k,
      featureNames: hold.x.map((_, idx) => String(idx)),
      mu,
      sd,
      commanders: rest.map((r) => ({
        identity: r.identity,
        z: standardizePriorFeatures(r.x, mu, sd),
        S: r.S,
      })),
    };
    truth.push(hold.S);
    pred.push(predictCommanderPriorIntercept({ x: hold.x, covered: hold.covered, prior }));
    zeroPred.push(0);
  }

  const mae = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]!), 0) / a.length;
  const report = {
    version: COS_V1_UNIVERSAL_COMMANDER_BASELINE_VERSION,
    nCommanders: rows.length,
    nCovered: rows.filter((r) => r.covered > 0).length,
    k,
    loo: {
      knnMae: mae(pred, truth),
      zeroMae: mae(zeroPred, truth),
      knnPearson: pearson(pred, truth),
      zeroPearson: pearson(zeroPred, truth),
    },
    S: {
      mean: rows.reduce((s, r) => s + r.S, 0) / rows.length,
      min: Math.min(...rows.map((r) => r.S)),
      max: Math.max(...rows.map((r) => r.S)),
    },
    SPENT_OUTCOMES_USED_FOR_TUNING: false,
    COLOR_BONUS_USED: false,
    EXISTING_N_GE_30_BO_CHANGED: false,
    COS_V1_MODEL_COEFFICIENTS_CHANGED: false,
  };

  const artifact: CosV1CommanderPriorArtifact = {
    version: COS_V1_UNIVERSAL_COMMANDER_BASELINE_VERSION,
    method: "knn",
    k,
    featureNames: [
      "manaValue",
      "isCreature",
      "isPlaneswalker",
      "isEnchantment",
      "tutor",
      "draw",
      "ramp",
      "interact",
      "protect",
      "recur",
      "plusOneCounters",
      "tokens",
      "lifegain",
      "sacrifice",
      "combat",
    ],
    mu,
    sd,
    commanders: rows.map((r) => ({
      identity: r.identity,
      z: standardizePriorFeatures(r.x, mu, sd),
      S: r.S,
    })),
  };

  writeFileSync(resolve(cos, "COMMANDER_PRIOR.json"), `${JSON.stringify(artifact)}\n`, "utf8");
  writeFileSync(resolve(cos, "COMMANDER_PRIOR_VALIDATION.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

void main();
