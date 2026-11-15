#!/usr/bin/env npx tsx
/**
 * Card-strength-v1 from RC8 action vectors + mana/type/tags.
 * Scoring reads the frozen table only.
 */
import { createReadStream, createWriteStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join, resolve } from "node:path";
import { familiesFromCardV1_1 } from "../../../src/lib/deck-rating/v1/tag-families-v1.1";
import { resolveOracleName } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { FEATURE_NAMES, createEmptyFeatureVector } from "../../../src/lib/semantic-visualization/feature-spec-v1";
import { newestMatching, snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

const SEED = 42;
const HOLDOUT = 0.2;

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ridge(X: number[][], y: number[], lambda = 8): number[] {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const xtx: number[][] = Array.from({ length: d }, () => Array(d).fill(0));
  const xty = Array(d).fill(0);
  for (let i = 0; i < n; i += 1) {
    const row = X[i]!;
    const yi = y[i]!;
    for (let a = 0; a < d; a += 1) {
      xty[a] += row[a]! * yi;
      for (let b = a; b < d; b += 1) xtx[a]![b] += row[a]! * row[b]!;
    }
  }
  for (let a = 0; a < d; a += 1) {
    for (let b = 0; b < a; b += 1) xtx[a]![b] = xtx[b]![a]!;
    xtx[a]![a] += lambda;
  }
  return solve(xtx, xty);
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let i = 0; i < n; i += 1) {
    let piv = i;
    for (let r = i + 1; r < n; r += 1) if (Math.abs(M[r]![i]!) > Math.abs(M[piv]![i]!)) piv = r;
    [M[i], M[piv]] = [M[piv]!, M[i]!];
    const d = M[i]![i] || 1e-9;
    for (let c = i; c <= n; c += 1) M[i]![c]! /= d;
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const f = M[r]![i]!;
      for (let c = i; c <= n; c += 1) M[r]![c]! -= f * M[i]![c]!;
    }
  }
  return M.map((row) => row[n]!);
}

function dot(w: number[], x: number[]): number {
  let s = 0;
  for (let i = 0; i < w.length; i += 1) s += w[i]! * x[i]!;
  return s;
}

function mae(y: number[], yhat: number[]): number {
  let s = 0;
  for (let i = 0; i < y.length; i += 1) s += Math.abs(y[i]! - yhat[i]!);
  return s / Math.max(y.length, 1);
}

function colorOk(card: string[], deck: string[]): boolean {
  return card.every((c) => deck.includes(c));
}

export async function freezeCardStrengthV1(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const oracle = await loadSnapshotOracleNameMap(snap);
  const rc8Path = resolve(process.cwd(), "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz");
  const vectors = new Map<string, number[]>();
  if (existsSync(rc8Path)) {
    const rl = createInterface({ input: createReadStream(rc8Path).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as {
        oracleId?: string;
        semantic?: { actions?: Array<{ actionType?: string; primitive?: string }> };
      };
      if (!rec.oracleId) continue;
      const vec = createEmptyFeatureVector();
      for (const action of rec.semantic?.actions ?? []) {
        const key = action.actionType ?? action.primitive ?? "";
        const idx = FEATURE_NAMES.indexOf(key as (typeof FEATURE_NAMES)[number]);
        if (idx >= 0) vec[idx] = Math.min(1, (vec[idx] ?? 0) + 0.25);
      }
      vectors.set(rec.oracleId, vec);
    }
    const vecDest = join(snap, "fit", "card-vectors-rc8-v1.jsonl");
    const out = createWriteStream(vecDest);
    for (const [oracleId, vector] of vectors) {
      if (!out.write(`${JSON.stringify({ oracleId, vector })}\n`)) {
        await new Promise<void>((res) => out.once("drain", () => res()));
      }
    }
    await new Promise<void>((res, rej) => {
      out.end(() => res());
      out.on("error", rej);
    });
  }

  type Deck = { ids: Set<string>; colors: string[]; group: "casual" | "cedh" };
  const decks: Deck[] = [];
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    decks: Array<{ commanders: Array<{ oracleId?: string | null }>; mainboard: Array<{ oracleId?: string | null }> }>;
  };
  for (const deck of labels.decks) {
    const ids = new Set<string>();
    const colors = new Set<string>();
    for (const c of [...deck.commanders, ...deck.mainboard]) {
      if (c.oracleId) {
        ids.add(c.oracleId);
        for (const col of oracle.byId.get(c.oracleId)?.colorIdentity ?? []) colors.add(col);
      }
    }
    decks.push({ ids, colors: [...colors], group: "casual" });
  }
  for (const field of ["field-b3.jsonl.gz", "field-b4.jsonl.gz"] as const) {
    const path = join(snap, "archidekt", field);
    if (!existsSync(path)) continue;
    const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as { oracleIds?: string[] };
      const ids = row.oracleIds ?? [];
      const colors = new Set<string>();
      for (const id of ids) for (const col of oracle.byId.get(id)?.colorIdentity ?? []) colors.add(col);
      decks.push({ ids: new Set(ids), colors: [...colors], group: "casual" });
    }
  }
  const b5 = join(snap, "b5", "b5-identity-sets.jsonl.gz");
  if (existsSync(b5)) {
    const rl = createInterface({ input: createReadStream(b5).pipe(createGunzip()) });
    let n = 0;
    for await (const line of rl) {
      if (!line.trim() || n > 4000) continue;
      const rec = JSON.parse(line) as { oracleIds?: string[] };
      const ids = rec.oracleIds ?? [];
      const colors = new Set<string>();
      for (const id of ids) for (const col of oracle.byId.get(id)?.colorIdentity ?? []) colors.add(col);
      decks.push({ ids: new Set(ids), colors: [...colors], group: "cedh" });
      n += 1;
    }
  }

  const liftRows = JSON.parse(readFileSync(join(snap, "playgroup", "card-staples-table.json"), "utf8")) as {
    cards: Array<{ name: string; extra?: { liftPp?: number | null } }>;
  };
  const lift = new Map<string, number>();
  for (const c of liftRows.cards) {
    const id = resolveOracleName(oracle, c.name)?.oracleId;
    if (id && c.extra?.liftPp != null) lift.set(id, Number(c.extra.liftPp) / 100);
  }

  const casualDecks = decks.filter((d) => d.group === "casual");
  const rows: Array<{
    oracleId: string;
    name: string;
    x: number[];
    inclusion: number;
    logEdh: number;
    lift: number | null;
  }> = [];
  for (const info of oracle.byId.values()) {
    if (info.commanderLegal !== "legal" && info.commanderLegal !== "banned") continue;
    if (/\bland\b/i.test(info.typeLine) && !/\bcreature\b/i.test(info.typeLine)) continue;
    const vec = vectors.get(info.oracleId) ?? createEmptyFeatureVector();
    const fam = familiesFromCardV1_1({ typeLine: info.typeLine, oracleText: info.text });
    const tags = ["tutor", "draw", "ramp", "interact", "protect", "recur"].map((t) => (fam.has(t as never) ? 1 : 0));
    const types = ["Creature", "Artifact", "Enchantment", "Instant", "Sorcery", "Planeswalker"].map((t) =>
      info.typeLine.includes(t) ? 1 : 0,
    );
    const allow = casualDecks.filter((d) => colorOk(info.colorIdentity, d.colors)).length;
    const incl = casualDecks.filter((d) => d.ids.has(info.oracleId)).length;
    const inclusion = allow ? incl / allow : 0;
    const logEdh = -Math.log10(Math.max(info.edhrecRank ?? 20000, 1));
    rows.push({
      oracleId: info.oracleId,
      name: info.name,
      x: [...vec.slice(0, 40), info.cmc / 10, ...types, ...tags],
      inclusion,
      logEdh,
      lift: lift.get(info.oracleId) ?? null,
    });
  }

  const rng = mulberry32(SEED);
  const shuffled = rows.slice().sort(() => rng() - 0.5);
  const cut = Math.floor(shuffled.length * (1 - HOLDOUT));
  const train = shuffled.slice(0, cut);
  const test = shuffled.slice(cut);
  const wIncl = ridge(
    train.map((r) => r.x),
    train.map((r) => r.inclusion),
  );
  const wEdh = ridge(
    train.map((r) => [1, r.logEdh]),
    train.map((r) => r.inclusion),
    1,
  );
  const pred = test.map((r) => dot(wIncl, r.x));
  const base = test.map((r) => dot(wEdh, [1, r.logEdh]));
  const modelMae = mae(
    test.map((r) => r.inclusion),
    pred,
  );
  const edhMae = mae(
    test.map((r) => r.inclusion),
    base,
  );
  const hot = test.map((r, i) => ({ r, pred: pred[i]!, base: base[i]! })).filter((x) => x.r.inclusion >= 0.05);
  const modelHot = mae(
    hot.map((x) => x.r.inclusion),
    hot.map((x) => x.pred),
  );
  const edhHot = mae(
    hot.map((x) => x.r.inclusion),
    hot.map((x) => x.base),
  );
  const beatEdhrec = hot.length >= 20 && modelHot + 1e-6 < edhHot;
  const disagreements = test
    .map((r, i) => ({ name: r.name, oracleId: r.oracleId, actual: r.inclusion, pred: pred[i]!, edh: base[i]!, gap: Math.abs(r.inclusion - pred[i]!) }))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 50);

  const table = new Map<string, number>();
  for (const r of rows) {
    table.set(r.oracleId, beatEdhrec ? dot(wIncl, r.x) : r.logEdh);
  }
  const sol = resolveOracleName(oracle, "Sol Ring");
  const worn = resolveOracleName(oracle, "Worn Powerstone");
  const sanity = {
    solRing: sol ? table.get(sol.oracleId) ?? null : null,
    wornPowerstone: worn ? table.get(worn.oracleId) ?? null : null,
  };
  const sanityPass = sanity.solRing != null && sanity.wornPowerstone != null && sanity.solRing > sanity.wornPowerstone;

  const dest = join(snap, "fit", "card-strength-v1.json");
  const report = {
    version: "deck-rating-card-strength-v1",
    vectorSource: "RC8 shadow-parse action counts in semantic-feature-vector-v1 space (no separate embedding; RC8 has no stored dense vector)",
    seed: SEED,
    nCards: rows.length,
    nDecksCasual: casualDecks.length,
    holdout: { n: test.length, modelMae, edhrecMae: edhMae, hotN: hot.length, modelHotMae: modelHot, edhrecHotMae: edhHot, beatEdhrec },
    used: beatEdhrec ? "ridge-on-rc8-vector" : "edhrec_rank",
    sanity,
    sanityPass,
    disagreements,
    cards: [...table.entries()].map(([oracleId, strength]) => ({
      oracleId,
      name: oracle.byId.get(oracleId)?.name ?? oracleId,
      strength,
    })),
  };
  writeJson(dest, report);
  return {
    dest,
    nCards: rows.length,
    beatEdhrec,
    modelMae,
    edhMae,
    sanity,
    sanityPass,
    used: report.used,
  };
}

if (require.main === module) {
  freezeCardStrengthV1()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
