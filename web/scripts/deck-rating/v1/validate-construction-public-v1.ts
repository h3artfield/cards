#!/usr/bin/env npx tsx
/**
 * Construction W on the 409 Playgroup W/L lists. Validate, do not fit.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import { familiesFromCardV1_1 } from "../../../src/lib/deck-rating/v1/tag-families-v1.1";
import {
  constructionP,
  constructionW,
  DR_CONSTRUCTION_SCORE_V1,
  percentileVs,
  type ConstructionMeasures,
} from "../../../src/lib/deck-rating/v1/construction-score-v1";
import { resolveOracleName, type OracleNameMap } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { ensureDir, fetchJson, sleep, snapshotRoot, writeJson } from "./lib";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../../../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

type PublicRow = {
  playgroupId: number;
  commander: string;
  games: number;
  label: number;
  measured?: number;
  bracket?: number | null;
  decklistUrl: string;
  host?: string;
  nNames?: number;
};

export function measuresFromCards(
  cards: Array<{ name: string; quantity: number }>,
  commander: string,
  oracle: OracleNameMap,
  strength?: Map<string, number>,
  vectors?: Map<string, number[]>,
): ConstructionMeasures {
  let land = 0;
  let nonland = 0;
  let nonbasic = 0;
  let interact = 0;
  let draw = 0;
  let quality = 0;
  let qualityN = 0;
  void commander;
  void vectors;
  for (const card of cards) {
    const q = card.quantity ?? 1;
    const info = resolveOracleName(oracle, card.name);
    const typeLine = info?.typeLine ?? "";
    const fam = familiesFromCardV1_1({ typeLine, oracleText: info?.text ?? "" });
    const isLand = /\bland\b/i.test(typeLine);
    if (isLand) {
      land += q;
      if (!/\bbasic\b/i.test(typeLine)) nonbasic += q;
      continue;
    }
    nonland += q;
    if (fam.has("interact")) interact += q;
    if (fam.has("draw") || fam.has("tutor")) draw += q;
    if (info && strength?.has(info.oracleId)) {
      quality += (strength.get(info.oracleId) ?? 0) * q;
      qualityN += q;
    }
  }
  const tot = Math.max(land + nonland, 1);
  const landBand = 1 - Math.min(1, Math.abs(land / tot - 36 / 99) / 0.12);
  return {
    manaBase: 0.6 * landBand + 0.4 * (land ? nonbasic / land : 0),
    interaction: interact / Math.max(nonland, 1),
    cardFlow: draw / Math.max(nonland, 1),
    cardQuality: qualityN ? quality / qualityN : null,
  };
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

function ranks(values: number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = Array<number>(values.length).fill(0);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j < order.length && order[j]!.v === order[i]!.v) j += 1;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k += 1) out[order[k]!.i] = avg;
    i = j;
  }
  return out;
}

function weightedPearson(x: number[], y: number[], w: number[]): number | null {
  const tw = w.reduce((a, b) => a + b, 0);
  if (!tw || x.length < 3) return null;
  const mx = x.reduce((s, v, i) => s + w[i]! * v, 0) / tw;
  const my = y.reduce((s, v, i) => s + w[i]! * v, 0) / tw;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < x.length; i += 1) {
    const a = x[i]! - mx;
    const b = y[i]! - my;
    num += w[i]! * a * b;
    dx += w[i]! * a * a;
    dy += w[i]! * b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : null;
}

function weightedSpearman(x: number[], y: number[], w: number[]): number | null {
  return weightedPearson(ranks(x), ranks(y), w);
}

function residualize(y: number[], band: number[]): number[] {
  const n = y.length;
  const x1 = band.map((b) => (b === 3 ? 1 : 0));
  const x2 = band.map((b) => (b === 4 ? 1 : 0));
  const xtx = [
    [n, x1.reduce((a, b) => a + b, 0), x2.reduce((a, b) => a + b, 0)],
    [x1.reduce((a, b) => a + b, 0), x1.reduce((a, b) => a + b * b, 0), x1.reduce((s, v, i) => s + v * x2[i]!, 0)],
    [x2.reduce((a, b) => a + b, 0), x1.reduce((s, v, i) => s + v * x2[i]!, 0), x2.reduce((a, b) => a + b * b, 0)],
  ];
  const xty = [
    y.reduce((a, b) => a + b, 0),
    y.reduce((s, v, i) => s + v * x1[i]!, 0),
    y.reduce((s, v, i) => s + v * x2[i]!, 0),
  ];
  const beta = solve3(xtx, xty);
  return y.map((v, i) => v - (beta[0]! + beta[1]! * x1[i]! + beta[2]! * x2[i]!));
}

function solve3(A: number[][], b: number[]): number[] {
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let i = 0; i < 3; i += 1) {
    let piv = i;
    for (let r = i + 1; r < 3; r += 1) if (Math.abs(M[r]![i]!) > Math.abs(M[piv]![i]!)) piv = r;
    [M[i], M[piv]] = [M[piv]!, M[i]!];
    const d = M[i]![i] || 1e-12;
    for (let c = i; c < 4; c += 1) M[i]![c]! /= d;
    for (let r = 0; r < 3; r += 1) {
      if (r === i) continue;
      const f = M[r]![i]!;
      for (let c = i; c < 4; c += 1) M[r]![c]! -= f * M[i]![c]!;
    }
  }
  return [M[0]![3]!, M[1]![3]!, M[2]![3]!];
}

async function loadArchidektCards(url: string, cacheDir: string): Promise<Array<{ name: string; quantity: number }>> {
  const id = Number(url.match(/\/decks\/(\d+)/)?.[1] ?? 0);
  const cache = join(cacheDir, `${id}.json`);
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8")) as Array<{ name: string; quantity: number }>;
  if (!id) return [];
  const hit = await fetchJson<{ cards?: Array<{ card?: { oracleCard?: { name?: string } }; quantity?: number; categories?: string[] }> }>(
    `https://archidekt.com/api/decks/${id}/`,
  );
  const cards: Array<{ name: string; quantity: number }> = [];
  for (const entry of hit.json?.cards ?? []) {
    const cats = (entry.categories ?? []).map((c) => c.toLowerCase());
    if (cats.some((c) => /maybe|sideboard|consider|wishlist|token/.test(c))) continue;
    const name = entry.card?.oracleCard?.name;
    if (name) cards.push({ name, quantity: entry.quantity ?? 1 });
  }
  writeJson(cache, cards);
  await sleep(180);
  return cards;
}

function legalResolved(
  cards: Array<{ name: string }>,
  oracle: OracleNameMap,
): { ids: Set<string>; illegal: "banned" | "not_legal" | null } {
  const ids = new Set<string>();
  let illegal: "banned" | "not_legal" | null = null;
  for (const card of cards) {
    const info = resolveOracleName(oracle, card.name);
    if (!info) continue;
    if (/\b(token|emblem|sticker)\b/i.test(info.typeLine) && info.commanderLegal !== "legal") continue;
    if (info.commanderLegal === "banned") illegal = illegal ?? "banned";
    else if (info.commanderLegal !== "legal") illegal = illegal ?? "not_legal";
    ids.add(info.oracleId);
  }
  return { ids, illegal };
}

function qualityFromIds(ids: string[], oracle: OracleNameMap, strength: Map<string, number>): number | null {
  let q = 0;
  let n = 0;
  for (const id of ids) {
    const info = oracle.byId.get(id);
    if (!info) continue;
    if (/\bland\b/i.test(info.typeLine) && !/\bcreature\b/i.test(info.typeLine)) continue;
    if (!strength.has(id)) continue;
    q += strength.get(id)!;
    n += 1;
  }
  return n ? q / n : null;
}

function fitFromIds(
  ids: string[],
  commanderName: string,
  oracle: OracleNameMap,
  vectors: Map<string, number[]>,
): number | null {
  const cmd = resolveOracleName(oracle, commanderName);
  const cmdVec = cmd ? vectors.get(cmd.oracleId) : undefined;
  if (!cmdVec) return null;
  let s = 0;
  let n = 0;
  for (const id of ids) {
    const info = oracle.byId.get(id);
    if (!info || /\bland\b/i.test(info.typeLine)) continue;
    const vec = vectors.get(id);
    if (!vec) continue;
    s += cosine(cmdVec, vec);
    n += 1;
  }
  return n ? s / n : null;
}

export async function validateConstructionPublicV1(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const oracle = await loadSnapshotOracleNameMap(snap);
  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const measureBand = (cards: Array<{ name: string }>, declared?: number | null) => {
    let gc = 0;
    for (const card of cards) {
      const id = resolveOracleName(oracle, card.name)?.oracleId;
      if (id && gcSet.has(id)) gc += 1;
    }
    const raw = gc >= 4 ? 4 : gc >= 1 ? 3 : 2;
    if (declared === 3 && raw <= 3) return 3;
    return raw;
  };
  const strengthPath = join(snap, "fit", "card-strength-v1.json");
  const strength = existsSync(strengthPath)
    ? new Map(
        (JSON.parse(readFileSync(strengthPath, "utf8")) as { cards: Array<{ oracleId: string; strength: number }> }).cards.map(
          (c) => [c.oracleId, c.strength] as const,
        ),
      )
    : undefined;
  const vecPath = join(snap, "fit", "card-vectors-rc8-v1.jsonl");
  const vectors = new Map<string, number[]>();
  if (existsSync(vecPath)) {
    const rl = createInterface({ input: createReadStream(vecPath) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { oracleId: string; vector: number[] };
      vectors.set(rec.oracleId, rec.vector);
    }
  }

  const fieldQuality: Record<number, number[]> = { 2: [], 3: [], 4: [] };
  const fieldFit: Record<number, number[]> = { 2: [], 3: [], 4: [] };
  const fieldFitByCmd = new Map<string, number[]>();
  const pushFit = (cmd: string, fit: number | null) => {
    if (fit == null) return;
    const key = cmd.toLowerCase();
    const list = fieldFitByCmd.get(key) ?? [];
    list.push(fit);
    fieldFitByCmd.set(key, list);
  };
  const labels = existsSync(join(snap, "labels", "precon-labels.json"))
    ? (JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
        decks: Array<{
          last3Years?: boolean;
          commanders: Array<{ name?: string; oracleId?: string | null }>;
          mainboard: Array<{ oracleId?: string | null }>;
        }>;
      })
    : { decks: [] };
  if (strength) {
    for (const deck of labels.decks) {
      if (!deck.last3Years) continue;
      const ids = [...deck.commanders, ...deck.mainboard].map((c) => c.oracleId).filter((id): id is string => Boolean(id));
      const q = qualityFromIds(ids, oracle, strength);
      if (q != null) fieldQuality[2]!.push(q);
      const cmd = deck.commanders[0]?.name ?? "";
      const fit = vectors.size ? fitFromIds(ids, cmd, oracle, vectors) : null;
      if (fit != null) {
        fieldFit[2]!.push(fit);
        pushFit(cmd, fit);
      }
    }
  }
  for (const [band, file] of [
    [3, "field-b3.jsonl.gz"],
    [4, "field-b4.jsonl.gz"],
  ] as const) {
    const path = join(snap, "archidekt", file);
    if (!existsSync(path) || !strength) continue;
    const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { commanders?: string[]; oracleIds?: string[] };
      const ids = rec.oracleIds ?? [];
      const q = qualityFromIds(ids, oracle, strength);
      if (q != null) fieldQuality[band]!.push(q);
      const cmd = rec.commanders?.[0] ?? "";
      const fit = vectors.size ? fitFromIds(ids, cmd, oracle, vectors) : null;
      if (fit != null) {
        fieldFit[band]!.push(fit);
        pushFit(cmd, fit);
      }
    }
  }

  const toPercentile = (raw: number | null, band: number, kind: "quality" | "fit", commander: string): number | null => {
    if (raw == null) return null;
    if (kind === "fit") {
      const same = fieldFitByCmd.get(commander.toLowerCase()) ?? [];
      const pool = same.length >= 8 ? same : fieldFit[band]!.length ? fieldFit[band]! : Object.values(fieldFit).flat();
      return pool.length ? percentileVs(raw, pool) : null;
    }
    const pool = fieldQuality[band]!.length ? fieldQuality[band]! : Object.values(fieldQuality).flat();
    return pool.length ? percentileVs(raw, pool) : null;
  };

  const arch = JSON.parse(readFileSync(join(snap, "playgroup", "public-decks", "usable-archidekt-v1.json"), "utf8")) as {
    usable: PublicRow[];
  };
  const mox = JSON.parse(
    readFileSync(join(snap, "playgroup", "public-decks", "moxfield-from-playgroup", "usable-moxfield-v1.json"), "utf8"),
  ) as { usable: PublicRow[] };
  const cacheDir = ensureDir(join(snap, "playgroup", "public-decks", "archidekt-lists"));
  const rows: Array<{
    playgroupId: number;
    host: string;
    commander: string;
    games: number;
    wr: number;
    measured: number;
    measures: ConstructionMeasures;
    rawQuality: number | null;
    W: number;
  }> = [];
  const playgroupFunnel = {
    archidektNamed: arch.usable.length,
    archidektBelow90: 0,
    archidektIllegal: 0,
    archidektBelow95: 0,
    archidektKept: 0,
    moxfieldKept: 0,
  };

  for (const row of arch.usable) {
    const cards = await loadArchidektCards(row.decklistUrl, cacheDir);
    if (cards.length < 90) {
      playgroupFunnel.archidektBelow90 += 1;
      continue;
    }
    const { ids, illegal } = legalResolved(cards, oracle);
    if (illegal) {
      playgroupFunnel.archidektIllegal += 1;
      continue;
    }
    if (ids.size < 95) {
      playgroupFunnel.archidektBelow95 += 1;
      continue;
    }
    const raw = measuresFromCards(cards, row.commander, oracle, strength, vectors.size ? vectors : undefined);
    const measured = row.measured ?? measureBand(cards, row.bracket ?? null);
    const measures: ConstructionMeasures = {
      ...raw,
      cardQuality: toPercentile(raw.cardQuality, measured, "quality", row.commander),
    };
    const p = constructionP(measures);
    playgroupFunnel.archidektKept += 1;
    rows.push({
      playgroupId: row.playgroupId,
      host: "archidekt.com",
      commander: row.commander,
      games: row.games,
      wr: row.label,
      measured,
      measures,
      rawQuality: raw.cardQuality,
      W: constructionW(p),
    });
  }
  for (const row of mox.usable) {
    const listPath = join(snap, "playgroup", "public-decks", "moxfield-from-playgroup", "lists", `${row.playgroupId}.json`);
    if (!existsSync(listPath)) continue;
    const cached = JSON.parse(readFileSync(listPath, "utf8")) as { cards: Array<{ name: string; quantity: number }> };
    const { ids, illegal } = legalResolved(cached.cards, oracle);
    if (illegal || ids.size < 95) continue;
    const raw = measuresFromCards(cached.cards, row.commander, oracle, strength, vectors.size ? vectors : undefined);
    const measured = row.measured ?? measureBand(cached.cards, row.bracket ?? null);
    const measures: ConstructionMeasures = {
      ...raw,
      cardQuality: toPercentile(raw.cardQuality, measured, "quality", row.commander),
    };
    const p = constructionP(measures);
    playgroupFunnel.moxfieldKept += 1;
    rows.push({
      playgroupId: row.playgroupId,
      host: "moxfield.com",
      commander: row.commander,
      games: row.games,
      wr: row.label,
      measured,
      measures,
      rawQuality: raw.cardQuality,
      W: constructionW(p),
    });
  }

  const corr = (xs: Array<number | null>, ys: number[], w: number[]) => {
    const keep = xs.map((v, i) => ({ v, y: ys[i]!, wt: w[i]!, ok: v != null && Number.isFinite(v) }));
    const x = keep.filter((r) => r.ok).map((r) => r.v as number);
    const y = keep.filter((r) => r.ok).map((r) => r.y);
    const wt = keep.filter((r) => r.ok).map((r) => r.wt);
    return { n: x.length, spearman: weightedSpearman(x, y, wt) };
  };

  const byBand: Record<string, ReturnType<typeof corr>> = {};
  const flags: string[] = [];
  for (const band of [2, 3, 4]) {
    const subset = rows.filter((r) => r.measured === band);
    byBand[String(band)] = corr(
      subset.map((r) => r.W),
      subset.map((r) => r.wr),
      subset.map((r) => r.games),
    );
  }
  const allW = corr(
    rows.map((r) => r.W),
    rows.map((r) => r.wr),
    rows.map((r) => r.games),
  );
  const residW = residualize(
    rows.map((r) => r.W),
    rows.map((r) => r.measured),
  );
  const residY = residualize(
    rows.map((r) => r.wr),
    rows.map((r) => r.measured),
  );
  const across = {
    n: rows.length,
    spearman: weightedSpearman(
      residW,
      residY,
      rows.map((r) => r.games),
    ),
  };
  const measureCorrs: Record<string, ReturnType<typeof corr>> = {};
  for (const key of ["manaBase", "interaction", "cardFlow", "cardQuality"] as const) {
    const hit = corr(
      rows.map((r) => r.measures[key]),
      rows.map((r) => r.wr),
      rows.map((r) => r.games),
    );
    measureCorrs[key] = hit;
    if (hit.spearman != null && hit.spearman < 0) flags.push(`${key} correlates negatively with Playgroup WR (${hit.spearman.toFixed(3)})`);
  }
  if (across.spearman != null && across.spearman < 0) flags.push(`construction W residual Spearman is negative (${across.spearman.toFixed(3)})`);

  const report = {
    version: DR_CONSTRUCTION_SCORE_V1,
    n: rows.length,
    hosts: {
      archidekt: rows.filter((r) => r.host === "archidekt.com").length,
      moxfield: rows.filter((r) => r.host === "moxfield.com").length,
    },
    hasCardStrength: Boolean(strength?.size),
    hasVectors: vectors.size > 0,
    fieldN: {
      quality: { 2: fieldQuality[2]!.length, 3: fieldQuality[3]!.length, 4: fieldQuality[4]!.length },
      fit: { 2: fieldFit[2]!.length, 3: fieldFit[3]!.length, 4: fieldFit[4]!.length },
    },
    playgroupFunnel,
    withinBand: byBand,
    allBands: allW,
    acrossBandsBandCovariate: across,
    measures: measureCorrs,
    flags,
    note: "One pilot per deck; today's list may differ from the recorded games. Looking for a positive relationship, not a strong one.",
  };
  writeJson(join(snap, "fit", "construction-validate-public-v1.json"), report);
  return report;
}

if (require.main === module) {
  validateConstructionPublicV1()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
