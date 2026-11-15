#!/usr/bin/env npx tsx
/**
 * §6.4 Forge follow-up: two analyses on the 2-player Commander labels.
 *   (a) Gate 8 — within-band Spearman(current W, Forge hero win rate) + bootstrap CI.
 *   (b) Per-measure within-band Spearman + non-negative v1.2 weights, CV by commander group.
 *
 *   cd web && npx --yes tsx scripts/deck-rating/v1/forge-gate8-analysis-v1.ts
 *   cd web && npx --yes tsx scripts/deck-rating/v1/forge-gate8-analysis-v1.ts --pin-speed
 *   cd web && npx --yes tsx scripts/deck-rating/v1/forge-gate8-analysis-v1.ts --watch
 *
 * Read-only on every section64-* file. Writes forge/gate8-deck-measures-v1.json
 * (goldfish + structural measure cache) and forge/gate8-analysis-v1.json.
 * The goldfish is re-simulated whenever the goldfish engine source hash changes,
 * unless --pin-speed is given.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import type { GoldfishSimCard, GoldfishSimResult } from "../../../src/lib/deck-rating/v1/goldfish-sim-v1";
import type { CompiledVariant, FrozenTemplate } from "../../../src/lib/deck-rating/v1/goldfish-spellbook-index-v2";
import { midrankW } from "../../../src/lib/deck-rating/v1/goldfish-metrics-v1.1";
import { resolveOracleName, type OracleNameMap } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import type { ConstructionMeasures } from "../../../src/lib/deck-rating/v1/construction-score-v1";
import { repoWebRoot, snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";
import { measuresFromCards } from "./validate-construction-public-v1";

type SimModule = typeof import("../../../src/lib/deck-rating/v1/goldfish-sim-v1");
type IndexModule = typeof import("../../../src/lib/deck-rating/v1/goldfish-spellbook-index-v2");

/** The goldfish engine is edited in place by another worker; load it lazily so a broken edit cannot kill the Forge analysis. */
async function loadEngineModules(): Promise<{ sim: SimModule; idx: IndexModule; speedVersion: string }> {
  const sim = (await import("../../../src/lib/deck-rating/v1/goldfish-sim-v1")) as SimModule;
  const idx = (await import("../../../src/lib/deck-rating/v1/goldfish-spellbook-index-v2")) as IndexModule;
  const speed = (await import("../../../src/lib/deck-rating/v1/goldfish-speed-v1.1")) as { DR_GOLDFISH_SPEED_VERSION: string };
  return { sim, idx, speedVersion: speed.DR_GOLDFISH_SPEED_VERSION };
}

async function loadFrozenIndex(idx: IndexModule, snap: string) {
  const fit = join(snap, "fit");
  const tplFile = JSON.parse(readFileSync(join(fit, "goldfish-spellbook-templates-v1.json"), "utf8")) as {
    templates: Array<{ id: number; name: string; scryfallQuery: string | null; n: number; resolver: FrozenTemplate["resolver"]; oracleIds: string[]; sampleNames: string[] }>;
  };
  const templates: FrozenTemplate[] = tplFile.templates.map((t) => ({
    id: t.id,
    name: t.name,
    scryfallQuery: t.scryfallQuery,
    oracleIds: t.oracleIds,
    names: t.sampleNames,
    n: t.n,
    resolver: t.resolver,
  }));
  const variants: CompiledVariant[] = [];
  const rl = createInterface({ input: createReadStream(join(fit, "goldfish-spellbook-variants-v2.jsonl")) });
  for await (const line of rl) if (line.trim()) variants.push(JSON.parse(line) as CompiledVariant);
  return idx.buildSpellbookIndex(variants, templates);
}

function cardsOf(sim: SimModule, ids: string[], commanderIds: Set<string>, oracle: OracleNameMap): GoldfishSimCard[] {
  const out: GoldfishSimCard[] = [];
  for (const id of ids) {
    const info = oracle.byId.get(id);
    if (!info) continue;
    out.push(
      sim.classifyGoldfishCard({
        oracleId: id,
        name: info.name,
        typeLine: info.typeLine,
        text: info.text,
        cmc: info.cmc,
        power: info.power,
        isCommander: commanderIds.has(id),
      }),
    );
  }
  return out;
}

/** Same formula as goldfish-sim-v1 speedConsistencyW; duplicated so W survives a broken engine edit when the speed cache is reused. */
function speedConsistencyW(deck: { rmst15: number; iqr: number }, field: Array<{ rmst15: number; iqr: number }>) {
  const speedW = midrankW(deck.rmst15, field.map((r) => r.rmst15), true);
  const consW = midrankW(deck.iqr, field.map((r) => r.iqr), true);
  return {
    W: Math.max(0, Math.min(999, Math.round(0.6 * speedW + 0.4 * consW))),
    speedPct: speedW / 1000,
    consistencyPct: consW / 1000,
  };
}

const VERSION = "deck-rating-forge-gate8-analysis-v1";
const GAMES = Number(process.env.DR_GATE8_GAMES ?? 200);
const BOOT = Number(process.env.DR_GATE8_BOOT ?? 2000);
const SEED = 2026092808;
const BANDS = ["B2", "B3", "B4"] as const;
const MEASURES = ["interaction", "cardFlow", "manaBase", "cardQuality", "speed", "consistency"] as const;
const DEDUP_CARDS = process.env.DR_GATE8_DEDUP === "1";
const PIN_SPEED = process.argv.includes("--pin-speed");
const WATCH = process.argv.includes("--watch");
const WATCH_POLL_MS = 15 * 60 * 1000;

type Band = (typeof BANDS)[number];
type MeasureKey = (typeof MEASURES)[number];

type PlanDeck = {
  id: string;
  name: string;
  band: Band | string;
  role: string;
  commander: string;
  commanders: string[];
  playgroupName?: string;
  main: Array<{ name: string; quantity: number }>;
};
type Plan = {
  decks: PlanDeck[];
  matchupMatrix: Array<{ id: string; kind: string; band: string; heroId: string; oppId: string }>;
  nMatchups: number;
};
type GameRow = {
  matchupId: string;
  kind: string;
  band: string;
  heroId: string;
  oppId: string;
  seat?: number;
  gameIndex?: number;
  result: string;
};

type DeckMeasures = {
  id: string;
  band: Band;
  commanderGroup: string;
  engineHash: string;
  games: number;
  rmst15: number;
  iqr: number;
  p50: number;
  coverage: number;
  lowConfidence: boolean;
  unresolvedNames: string[];
  structural: ConstructionMeasures;
};

const forgeDir = () => join(snapshotRoot(), "forge");
const paths = () => ({
  plan: join(forgeDir(), "section64-collection-plan-v1.json"),
  games: join(forgeDir(), "section64-games-v1.jsonl"),
  matches: join(forgeDir(), "section64-matches-v1.jsonl"),
  progress: join(forgeDir(), "section64-progress-v1.json"),
  cache: join(forgeDir(), "gate8-deck-measures-v1.json"),
  out: join(forgeDir(), "gate8-analysis-v1.json"),
});

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      /* torn line while the collector appends */
    }
  }
  return out;
}

function commanderGroup(d: PlanDeck): string {
  return (d.commanders?.length ? d.commanders : [d.commander]).map((c) => c.toLowerCase()).sort().join(" / ");
}

/** Hash of every goldfish engine module; the engine is edited in place without version bumps. */
type EngineInfo = { sim: string; policy: string; planner: string | null; speed: string; sourceSha256: string; files: string[] };

function engineSourceSha(): { sourceSha256: string; files: string[] } {
  const dir = join(repoWebRoot(), "src", "lib", "deck-rating", "v1");
  const files = readdirSync(dir)
    .filter((n) => /^(goldfish-.*|tag-families-v1\.1)\.ts$/.test(n) && !/selftest/.test(n))
    .sort();
  const h = createHash("sha256");
  for (const f of files) h.update(f).update(readFileSync(join(dir, f)));
  return { sourceSha256: h.digest("hex"), files };
}

function plannerVersion(): string | null {
  const src = readFileSync(join(repoWebRoot(), "src", "lib", "deck-rating", "v1", "goldfish-planner-v2.ts"), "utf8");
  return /DR_PLANNER_V2\s*=\s*"([^"]+)"/.exec(src)?.[1] ?? null;
}

// ---------- stats ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ranks(v: number[]): number[] {
  const order = v.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out = Array<number>(v.length).fill(0);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j < order.length && order[j]!.x === order[i]!.x) j += 1;
    for (let k = i; k < j; k += 1) out[order[k]!.i] = (i + j + 1) / 2;
    i = j;
  }
  return out;
}

function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

const spearman = (x: number[], y: number[]) => pearson(ranks(x), ranks(y));

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

const r4 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);

function spearmanBoot(x: number[], y: number[], seed: number) {
  const n = x.length;
  const point = spearman(x, y);
  if (n < 5 || point == null) return { n, spearman: r4(point), ci95: null, bootReps: 0 };
  const rng = mulberry32(seed);
  const reps: number[] = [];
  for (let b = 0; b < BOOT; b += 1) {
    const bx: number[] = [];
    const by: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const k = Math.floor(rng() * n);
      bx.push(x[k]!);
      by.push(y[k]!);
    }
    const s = spearman(bx, by);
    if (s != null) reps.push(s);
  }
  reps.sort((a, b) => a - b);
  return {
    n,
    spearman: r4(point),
    ci95: [r4(quantile(reps, 0.025)), r4(quantile(reps, 0.975))],
    pBootLe0: r4(reps.filter((s) => s <= 0).length / reps.length),
    bootReps: reps.length,
  };
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let i = 0; i < n; i += 1) {
    let piv = i;
    for (let r = i + 1; r < n; r += 1) if (Math.abs(M[r]![i]!) > Math.abs(M[piv]![i]!)) piv = r;
    if (Math.abs(M[piv]![i]!) < 1e-12) return null;
    [M[i], M[piv]] = [M[piv]!, M[i]!];
    for (let r = 0; r < n; r += 1) {
      if (r === i) continue;
      const f = M[r]![i]! / M[i]![i]!;
      for (let c = i; c <= n; c += 1) M[r]![c]! -= f * M[i]![c]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Exact NNLS without intercept by enumerating active sets (p ≤ ~8). */
function nnls(X: number[][], y: number[]): number[] {
  const p = X[0]?.length ?? 0;
  let best = Array<number>(p).fill(0);
  let bestSse = y.reduce((s, v) => s + v * v, 0);
  for (let mask = 1; mask < 1 << p; mask += 1) {
    const cols = [...Array(p).keys()].filter((j) => mask & (1 << j));
    const A = cols.map((a) => cols.map((b) => X.reduce((s, row) => s + row[a]! * row[b]!, 0) + (a === b ? 1e-9 : 0)));
    const rhs = cols.map((a) => X.reduce((s, row, i) => s + row[a]! * y[i]!, 0));
    const beta = solve(A, rhs);
    if (!beta || beta.some((v) => v < 0)) continue;
    const w = Array<number>(p).fill(0);
    cols.forEach((c, k) => (w[c] = beta[k]!));
    const sse = X.reduce((s, row, i) => s + (y[i]! - row.reduce((t, v, j) => t + v * w[j]!, 0)) ** 2, 0);
    if (sse < bestSse - 1e-15) {
      bestSse = sse;
      best = w;
    }
  }
  return best;
}

// ---------- step 1: per-deck measures (goldfish speed + structural) ----------

type SpeedStep = { engine: EngineInfo; decks: DeckMeasures[]; reused: boolean; liveEngineError: string | null };

async function computeDeckMeasures(plan: Plan): Promise<SpeedStep> {
  const p = paths();
  const src = engineSourceSha();
  const validation = plan.decks.filter((d) => d.role === "validation" && (BANDS as readonly string[]).includes(d.band));
  type Cache = { engine: EngineInfo; games: number; dedupCards: boolean; decks: DeckMeasures[] };
  const cached = existsSync(p.cache) ? (JSON.parse(readFileSync(p.cache, "utf8")) as Cache) : null;
  const cacheUsable = Boolean(
    cached && cached.games === GAMES && cached.dedupCards === DEDUP_CARDS && cached.decks.length === validation.length,
  );
  if (cached && cacheUsable && (PIN_SPEED || cached.engine.sourceSha256 === src.sourceSha256)) {
    console.log(`reusing goldfish cache engine=${cached.engine.sourceSha256.slice(0, 12)} pinned=${PIN_SPEED}`);
    return { engine: cached.engine, decks: cached.decks, reused: true, liveEngineError: null };
  }
  let liveEngineError: string | null = null;
  const fallback = (err: unknown): SpeedStep | null => {
    liveEngineError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    if (cached && cacheUsable) {
      console.log(`live goldfish engine failed (${liveEngineError}); reusing cache engine=${cached.engine.sourceSha256.slice(0, 12)}`);
      return { engine: cached.engine, decks: cached.decks, reused: true, liveEngineError };
    }
    console.log(`live goldfish engine failed (${liveEngineError}) and no speed cache — speed/consistency/W unavailable this run`);
    return null;
  };
  const snap = snapshotRoot();
  let sim: SimModule | null = null;
  let index: Awaited<ReturnType<typeof loadFrozenIndex>> | null = null;
  let engine: EngineInfo = { sim: "unavailable", policy: "unavailable", planner: plannerVersion(), speed: "unavailable", ...src };
  console.log("loading oracle map, goldfish engine, frozen spellbook index, card strength");
  const oracle = await loadSnapshotOracleNameMap(snap);
  try {
    const mods = await loadEngineModules();
    sim = mods.sim;
    index = await loadFrozenIndex(mods.idx, snap);
    sim.setGoldfishSpellbookIndex(index);
    engine = { sim: sim.DR_GOLDFISH_SIM_V1, policy: sim.DR_GOLDFISH_POLICY_V2, planner: plannerVersion(), speed: mods.speedVersion, ...src };
    const smoke = validation[0]!;
    const smokeIds = [...(smoke.commanders ?? [smoke.commander]), ...smoke.main.map((c) => c.name)]
      .map((n) => resolveOracleName(oracle, n)?.oracleId)
      .filter((id): id is string => Boolean(id));
    sim.simulateGoldfish({ cards: cardsOf(sim, smokeIds, new Set(smokeIds.slice(0, 1)), oracle), games: 5, spellbook: index });
  } catch (err) {
    const fb = fallback(err);
    if (fb) return fb;
    sim = null;
  }
  const strength = new Map(
    (JSON.parse(readFileSync(join(snap, "fit", "card-strength-v1.json"), "utf8")) as {
      cards: Array<{ oracleId: string; strength: number }>;
    }).cards.map((c) => [c.oracleId, c.strength] as const),
  );
  const decks: DeckMeasures[] = [];
  const started = Date.now();
  for (const d of validation) {
    const cmdNames = d.commanders?.length ? d.commanders : [d.commander];
    const cmdIds = new Set<string>();
    const ids: string[] = [];
    const unresolved: string[] = [];
    for (const name of cmdNames) {
      const info = resolveOracleName(oracle, name);
      if (!info) unresolved.push(name);
      else {
        cmdIds.add(info.oracleId);
        ids.push(info.oracleId);
      }
    }
    const cmdSet = new Set(cmdNames);
    const mainCards = d.main.filter((c) => c.name && !cmdSet.has(c.name));
    for (const c of mainCards) {
      const info = resolveOracleName(oracle, c.name);
      if (!info) {
        unresolved.push(c.name);
        continue;
      }
      const q = DEDUP_CARDS ? 1 : Math.max(1, c.quantity ?? 1);
      for (let k = 0; k < q; k += 1) ids.push(info.oracleId);
    }
    let result: Pick<GoldfishSimResult, "rmst15" | "iqr" | "p50" | "coverage" | "lowConfidence"> = {
      rmst15: Number.NaN,
      iqr: Number.NaN,
      p50: Number.NaN,
      coverage: Number.NaN,
      lowConfidence: true,
    };
    if (sim && index) {
      try {
        result = sim.simulateGoldfish({ cards: cardsOf(sim, ids, cmdIds, oracle), games: GAMES, spellbook: index });
      } catch (err) {
        const fb = fallback(err);
        if (fb) return fb;
        sim = null;
      }
    }
    const structural = measuresFromCards(
      [...cmdNames.map((name) => ({ name, quantity: 1 })), ...mainCards],
      d.commander,
      oracle,
      strength,
    );
    decks.push({
      id: d.id,
      band: d.band as Band,
      commanderGroup: commanderGroup(d),
      engineHash: engine.sourceSha256,
      games: GAMES,
      rmst15: result.rmst15,
      iqr: result.iqr,
      p50: result.p50,
      coverage: result.coverage,
      lowConfidence: result.lowConfidence,
      unresolvedNames: unresolved,
      structural,
    });
    if (decks.length % 10 === 0) console.log(`goldfish ${decks.length}/${validation.length} ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  if (liveEngineError) {
    for (const d of decks) Object.assign(d, { rmst15: Number.NaN, iqr: Number.NaN, p50: Number.NaN, coverage: Number.NaN });
    return { engine, decks, reused: false, liveEngineError };
  }
  writeJson(p.cache, {
    version: `${VERSION}-deck-measures`,
    builtAt: new Date().toISOString(),
    engine,
    games: GAMES,
    dedupCards: DEDUP_CARDS,
    note: "Speed/consistency from goldfish RMST15/IQR at DR_GATE8_GAMES games per deck (deterministic deckHashSeed). Structural measures from validate-construction-public-v1 measuresFromCards; cardQuality raw (mean non-land card strength).",
    decks,
  });
  return { engine, decks, reused: false, liveEngineError: null };
}

// ---------- step 2: Forge labels ----------

type HeroLabel = {
  id: string;
  band: Band;
  pairingsComplete: number;
  pairingsPlanned: number;
  games: number;
  wins: number;
  losses: number;
  timeouts: number;
  errors: number;
  winRate: number | null;
  winRateExclTimeouts: number | null;
};

/** Seats whose JVM died with OutOfMemoryError. The collector pads the rest of that seat as timeouts; those pads are not games. */
function oomSeatKeys(logPath: string): Set<string> {
  const out = new Set<string>();
  if (!existsSync(logPath)) return out;
  for (const line of readFileSync(logPath, "utf8").split(/\n/)) {
    const m = line.match(/jvm-fail (\S+) seat(\d)\b.*oom=true/);
    if (m) out.add(`${m[1]}|${m[2]}`);
  }
  return out;
}

function cleanGames(games: GameRow[], oom: Set<string>): { kept: GameRow[]; droppedOom: number; droppedDup: number } {
  let droppedOom = 0;
  let droppedDup = 0;
  const seen = new Set<string>();
  const perSeat = new Map<string, number>();
  const ordered = games
    .map((g, i) => ({ g, i }))
    .sort((a, b) => (a.g.gameIndex ?? 0) - (b.g.gameIndex ?? 0) || a.i - b.i);
  const kept: GameRow[] = [];
  for (const { g } of ordered) {
    const key = `${g.matchupId}|${g.seat ?? -1}`;
    if (oom.has(key)) {
      droppedOom += 1;
      continue;
    }
    const uniq = `${key}|${g.gameIndex ?? "na"}`;
    if (seen.has(uniq)) {
      droppedDup += 1;
      continue;
    }
    seen.add(uniq);
    const n = perSeat.get(key) ?? 0;
    if (n >= 10) {
      droppedDup += 1;
      continue;
    }
    perSeat.set(key, n + 1);
    kept.push(g);
  }
  return { kept, droppedOom, droppedDup };
}

function forgeLabels(plan: Plan) {
  const p = paths();
  const completed = new Set(readJsonl<{ matchupId: string }>(p.matches).map((m) => m.matchupId));
  const oom = oomSeatKeys(join(forgeDir(), "section64-collect.log"));
  const raw = readJsonl<GameRow>(p.games).filter((g) => completed.has(g.matchupId));
  const cleaned = cleanGames(raw, oom);
  const games = cleaned.kept;
  const planned = new Map<string, number>();
  for (const m of plan.matchupMatrix) {
    if (m.kind === "validation-vs-gauntlet") planned.set(m.heroId, (planned.get(m.heroId) ?? 0) + 1);
  }
  const heroes = new Map<string, HeroLabel>();
  const pairingsSeen = new Map<string, Set<string>>();
  for (const d of plan.decks) {
    if (d.role !== "validation" || !(BANDS as readonly string[]).includes(d.band)) continue;
    heroes.set(d.id, {
      id: d.id,
      band: d.band as Band,
      pairingsComplete: 0,
      pairingsPlanned: planned.get(d.id) ?? 0,
      games: 0,
      wins: 0,
      losses: 0,
      timeouts: 0,
      errors: 0,
      winRate: null,
      winRateExclTimeouts: null,
    });
  }
  const precon = new Map<string, { id: string; heroId: string; oppId: string; wins: number; losses: number; timeouts: number; errors: number }>();
  for (const g of games) {
    if (g.kind === "validation-vs-gauntlet") {
      const h = heroes.get(g.heroId);
      if (!h || g.band !== h.band) continue;
      const seen = pairingsSeen.get(g.heroId) ?? new Set<string>();
      seen.add(g.matchupId);
      pairingsSeen.set(g.heroId, seen);
      if (g.result === "hero-win") h.wins += 1;
      else if (g.result === "opp-win") h.losses += 1;
      else if (g.result === "timeout") h.timeouts += 1;
      else h.errors += 1;
    } else if (g.kind === "precon-strip-then-add") {
      const r = precon.get(g.matchupId) ?? { id: g.matchupId, heroId: g.heroId, oppId: g.oppId, wins: 0, losses: 0, timeouts: 0, errors: 0 };
      if (g.result === "hero-win") r.wins += 1;
      else if (g.result === "opp-win") r.losses += 1;
      else if (g.result === "timeout") r.timeouts += 1;
      else r.errors += 1;
      precon.set(g.matchupId, r);
    }
  }
  for (const h of heroes.values()) {
    h.pairingsComplete = pairingsSeen.get(h.id)?.size ?? 0;
    h.games = h.wins + h.losses + h.timeouts;
    h.winRate = h.games ? h.wins / h.games : null;
    h.winRateExclTimeouts = h.wins + h.losses ? h.wins / (h.wins + h.losses) : null;
  }
  const preconPlanned = plan.matchupMatrix.filter((m) => m.kind === "precon-strip-then-add").length;
  return {
    heroes: [...heroes.values()],
    precon: [...precon.values()],
    preconPlanned,
    completedMatchups: completed.size,
    gameCleaning: {
      oomSeats: [...oom],
      droppedOomGames: cleaned.droppedOom,
      droppedDuplicateGames: cleaned.droppedDup,
      gamesKept: games.length,
    },
  };
}

function preconSummary(rows: ReturnType<typeof forgeLabels>["precon"], planned: number) {
  const deltas = rows
    .map((r) => {
      const n = r.wins + r.losses + r.timeouts;
      return {
        matchupId: r.id,
        addDeck: r.heroId,
        stockDeck: r.oppId,
        games: n,
        addWins: r.wins,
        stockWins: r.losses,
        timeouts: r.timeouts,
        errors: r.errors,
        addWinRate: n ? r4(r.wins / n) : null,
        delta: n ? r4(r.wins / n - r.losses / n) : null,
        deltaExclTimeouts: r.wins + r.losses ? r4((r.wins - r.losses) / (r.wins + r.losses)) : null,
      };
    })
    .filter((r) => r.delta != null);
  const d = deltas.map((r) => r.delta as number);
  const pos = d.filter((x) => x > 0).length;
  const neg = d.filter((x) => x < 0).length;
  const nz = pos + neg;
  let signP: number | null = null;
  if (nz) {
    const k = Math.min(pos, neg);
    let tail = 0;
    let c = 1;
    for (let i = 0; i <= nz; i += 1) {
      if (i > 0) c = (c * (nz - i + 1)) / i;
      if (i <= k) tail += c;
    }
    signP = Math.min(1, (2 * tail) / 2 ** nz);
  }
  let ci: [number | null, number | null] | null = null;
  if (d.length >= 5) {
    const rng = mulberry32(SEED + 44);
    const reps: number[] = [];
    for (let b = 0; b < BOOT; b += 1) {
      let s = 0;
      for (let i = 0; i < d.length; i += 1) s += d[Math.floor(rng() * d.length)]!;
      reps.push(s / d.length);
    }
    reps.sort((a, b) => a - b);
    ci = [r4(quantile(reps, 0.025)), r4(quantile(reps, 0.975))];
  }
  return {
    definition: "hero = strip-then-add (−2 basics/−1 nonbasic as needed, +Rhystic Study/Cyclonic Rift/Sol Ring), opp = stock precon, 20 games 10+10 seats. delta = (addWins − stockWins)/games; timeouts count as neither (0 contribution) but stay in the denominator.",
    pairsPlanned: planned,
    pairsComplete: deltas.length,
    status: deltas.length >= planned ? "final" : deltas.length ? "partial" : "not-started",
    meanDelta: d.length ? r4(d.reduce((a, b) => a + b, 0) / d.length) : null,
    meanDeltaCi95: ci,
    nPositive: pos,
    nNegative: neg,
    nZero: d.length - nz,
    signTestTwoSidedP: r4(signP),
    pairs: deltas,
  };
}

// ---------- step 3: analysis ----------

type Row = {
  id: string;
  band: Band;
  group: string;
  W: number | null;
  speedPct: number | null;
  consistencyPct: number | null;
  wr: number;
  wrNoTo: number | null;
  m: Record<MeasureKey, number | null>;
  label: HeroLabel;
  dm: DeckMeasures;
};

function measureVector(dm: DeckMeasures): Record<MeasureKey, number | null> {
  return {
    interaction: dm.structural.interaction,
    cardFlow: dm.structural.cardFlow,
    manaBase: dm.structural.manaBase,
    cardQuality: dm.structural.cardQuality,
    speed: -dm.rmst15,
    consistency: -dm.iqr,
  };
}

function zByBand(rows: Row[], keys: readonly MeasureKey[] | ["W"], statsFrom: Row[] = rows) {
  const stats = new Map<string, { mu: number; sd: number }>();
  const get = (r: Row, k: string) => (k === "W" ? r.W : r.m[k as MeasureKey]);
  for (const band of BANDS) {
    const src = statsFrom.filter((r) => r.band === band);
    for (const k of keys) {
      const v = src.map((r) => get(r, k)).filter((x): x is number => x != null && Number.isFinite(x));
      const mu = v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
      const sd = v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mu) ** 2, 0) / (v.length - 1)) : 0;
      stats.set(`${band}|${k}`, { mu, sd });
    }
  }
  return rows.map((r) =>
    keys.map((k) => {
      const s = stats.get(`${r.band}|${k}`)!;
      const v = get(r, k);
      return v == null || !Number.isFinite(v) || !s.sd ? 0 : (v - s.mu) / s.sd;
    }),
  );
}

function centerByBand(rows: Row[], y: (r: Row) => number, statsFrom: Row[] = rows) {
  const mu = new Map<string, number>();
  for (const band of BANDS) {
    const v = statsFrom.filter((r) => r.band === band).map(y);
    mu.set(band, v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
  }
  return rows.map((r) => y(r) - mu.get(r.band)!);
}

function cvByCommander(rows: Row[], keys: readonly MeasureKey[] | ["W"]) {
  const groups = [...new Set(rows.map((r) => r.group))];
  const pred = new Map<string, number>();
  const yc = new Map<string, number>();
  for (const g of groups) {
    const train = rows.filter((r) => r.group !== g);
    const test = rows.filter((r) => r.group === g);
    if (train.length < 5) continue;
    const w = nnls(zByBand(train, keys), centerByBand(train, (r) => r.wr));
    const zt = zByBand(test, keys, train);
    const ct = centerByBand(test, (r) => r.wr, train);
    test.forEach((r, i) => {
      pred.set(r.id, zt[i]!.reduce((s, v, j) => s + v * w[j]!, 0));
      yc.set(r.id, ct[i]!);
    });
  }
  const ids = rows.filter((r) => pred.has(r.id));
  const P = ids.map((r) => pred.get(r.id)!);
  const Y = ids.map((r) => yc.get(r.id)!);
  const sst = Y.reduce((s, v) => s + v * v, 0);
  const sse = Y.reduce((s, v, i) => s + (v - P[i]!) ** 2, 0);
  const byBand: Record<string, { n: number; spearman: number | null }> = {};
  for (const band of BANDS) {
    const idx = ids.map((r, i) => (r.band === band ? i : -1)).filter((i) => i >= 0);
    if (idx.length) byBand[band] = { n: idx.length, spearman: r4(spearman(idx.map((i) => P[i]!), idx.map((i) => Y[i]!))) };
  }
  return {
    scheme: "leave-one-commander-group-out (commander set, case-insensitive; ≤2 decks per commander per band by plan construction)",
    folds: groups.length,
    n: ids.length,
    cvSpearmanPooledCentered: r4(spearman(P, Y)),
    cvR2: sst ? r4(1 - sse / sst) : null,
    cvSpearmanByBand: byBand,
  };
}

function weightsWithCi(rows: Row[], keys: readonly MeasureKey[]) {
  const point = nnls(zByBand(rows, keys), centerByBand(rows, (r) => r.wr));
  const groupsByBand = new Map<string, string[]>();
  for (const band of BANDS) groupsByBand.set(band, [...new Set(rows.filter((r) => r.band === band).map((r) => r.group))]);
  const byGroup = new Map<string, Row[]>();
  for (const r of rows) byGroup.set(`${r.band}|${r.group}`, [...(byGroup.get(`${r.band}|${r.group}`) ?? []), r]);
  const rng = mulberry32(SEED + 7);
  const reps: number[][] = [];
  for (let b = 0; b < BOOT; b += 1) {
    const sample: Row[] = [];
    for (const [band, groups] of groupsByBand) {
      for (let i = 0; i < groups.length; i += 1) {
        const g = groups[Math.floor(rng() * groups.length)]!;
        byGroup.get(`${band}|${g}`)!.forEach((r, k) => sample.push({ ...r, id: `${r.id}#${b}.${i}.${k}` }));
      }
    }
    if (sample.length < 8) continue;
    reps.push(nnls(zByBand(sample, keys), centerByBand(sample, (r) => r.wr)));
  }
  const sum = point.reduce((a, b) => a + b, 0);
  const out: Record<string, unknown> = {};
  keys.forEach((k, j) => {
    const col = reps.map((w) => w[j]!).sort((a, b) => a - b);
    out[k] = {
      wrPerSd: r4(point[j]!),
      share: sum ? r4(point[j]! / sum) : null,
      ci95: [r4(quantile(col, 0.025)), r4(quantile(col, 0.975))],
      pBootPositive: r4(col.filter((v) => v > 1e-12).length / Math.max(1, col.length)),
    };
  });
  return {
    fit: "NNLS, no intercept, measures z-scored within band, win rate centered within band; weight = change in win rate per +1 SD of the measure",
    bootstrap: `${reps.length} reps, resample commander groups with replacement within band, seed ${SEED + 7}`,
    weights: out,
  };
}

function analyse(plan: Plan, dms: DeckMeasures[], labels: ReturnType<typeof forgeLabels>) {
  const byId = new Map(dms.map((d) => [d.id, d]));
  const bandStatus: Record<string, unknown> = {};
  const rowsByBand = new Map<Band, Row[]>();
  for (const band of BANDS) {
    const heroes = labels.heroes.filter((h) => h.band === band);
    const complete = heroes.filter((h) => h.pairingsPlanned > 0 && h.pairingsComplete >= h.pairingsPlanned);
    const partial = heroes.filter((h) => h.pairingsComplete > 0 && h.pairingsComplete < h.pairingsPlanned);
    const allGames = complete.reduce((s, h) => s + h.games + h.errors, 0);
    const to = complete.reduce((s, h) => s + h.timeouts, 0);
    const err = complete.reduce((s, h) => s + h.errors, 0);
    const field = dms.filter((d) => d.band === band && Number.isFinite(d.rmst15) && Number.isFinite(d.iqr));
    const rows: Row[] = [];
    for (const h of complete) {
      const dm = byId.get(h.id);
      if (!dm || h.winRate == null) continue;
      const w = Number.isFinite(dm.rmst15) && Number.isFinite(dm.iqr) ? speedConsistencyW(dm, field) : null;
      rows.push({
        id: h.id,
        band,
        group: dm.commanderGroup,
        W: w?.W ?? null,
        speedPct: w?.speedPct ?? null,
        consistencyPct: w?.consistencyPct ?? null,
        wr: h.winRate,
        wrNoTo: h.winRateExclTimeouts,
        m: measureVector(dm),
        label: h,
        dm,
      });
    }
    rowsByBand.set(band, rows);
    bandStatus[band] = {
      status: complete.length === heroes.length && heroes.length > 0 ? "final" : complete.length ? "partial" : "not-started",
      heroesPlanned: heroes.length,
      heroesComplete: complete.length,
      heroesInProgress: partial.length,
      nAnalysed: rows.length,
      games: allGames,
      timeoutRate: allGames ? r4(to / allGames) : null,
      errorGamesExcluded: err,
      meanWinRate: rows.length ? r4(rows.reduce((s, r) => s + r.wr, 0) / rows.length) : null,
      sdWinRate: rows.length > 1 ? r4(Math.sqrt(rows.reduce((s, r) => s + (r.wr - rows.reduce((a, q) => a + q.wr, 0) / rows.length) ** 2, 0) / (rows.length - 1))) : null,
    };
  }

  const gate8: Record<string, unknown> = {};
  const perMeasure: Record<string, unknown> = {};
  BANDS.forEach((band, bi) => {
    const rows = rowsByBand.get(band)!;
    const withW = rows.filter((r) => r.W != null);
    const noTo = withW.filter((r) => r.wrNoTo != null);
    gate8[band] = {
      status: (bandStatus[band] as { status: string }).status,
      W_vs_winRate: spearmanBoot(withW.map((r) => r.W!), withW.map((r) => r.wr), SEED + bi),
      W_vs_winRateExclTimeouts: spearmanBoot(noTo.map((r) => r.W!), noTo.map((r) => r.wrNoTo!), SEED + 10 + bi),
      speedPct_vs_winRate: r4(spearman(withW.map((r) => r.speedPct!), withW.map((r) => r.wr))),
      consistencyPct_vs_winRate: r4(spearman(withW.map((r) => r.consistencyPct!), withW.map((r) => r.wr))),
    };
    const pm: Record<string, unknown> = {};
    MEASURES.forEach((k, ki) => {
      const ok = rows.filter((r) => r.m[k] != null && Number.isFinite(r.m[k]!));
      const okNo = ok.filter((r) => r.wrNoTo != null);
      pm[k] = {
        ...spearmanBoot(ok.map((r) => r.m[k]!), ok.map((r) => r.wr), SEED + 100 * (bi + 1) + ki),
        spearmanExclTimeouts: r4(spearman(okNo.map((r) => r.m[k]!), okNo.map((r) => r.wrNoTo!))),
      };
    });
    perMeasure[band] = { status: (bandStatus[band] as { status: string }).status, measures: pm };
  });

  const finalBands = BANDS.filter((b) => (bandStatus[b] as { status: string }).status === "final");
  const partialBands = BANDS.filter((b) => (bandStatus[b] as { status: string }).status === "partial");
  const fitSet = (bands: readonly Band[]) => bands.flatMap((b) => rowsByBand.get(b)!);
  const v12 = (bands: readonly Band[]) => {
    const rows = fitSet(bands);
    if (rows.length < 10) return null;
    const keys = MEASURES.filter((k) => rows.some((r) => r.m[k] != null && Number.isFinite(r.m[k]!)));
    const hasSpeed = keys.includes("speed") && rows.every((r) => r.W != null);
    return {
      bands,
      n: rows.length,
      measuresUsed: keys,
      measuresUnavailable: MEASURES.filter((k) => !keys.includes(k)),
      ...weightsWithCi(rows, keys),
      cv: {
        allMeasures: cvByCommander(rows, keys),
        currentWOnly: hasSpeed ? cvByCommander(rows, ["W"]) : null,
        speedConsistencyOnly: hasSpeed ? cvByCommander(rows, ["speed", "consistency"]) : null,
        structuralOnly: cvByCommander(rows, ["interaction", "cardFlow", "manaBase", "cardQuality"]),
      },
      inSampleSpearmanCurrentWPooledCentered: hasSpeed
        ? r4(
            spearman(
              centerByBand(rows, (r) => r.W!),
              centerByBand(rows, (r) => r.wr),
            ),
          )
        : null,
    };
  };
  const weights = {
    pooledFinalBands: v12(finalBands),
    perBand: Object.fromEntries(BANDS.map((b) => [b, { status: (bandStatus[b] as { status: string }).status, fit: v12([b]) }])),
    note: "Non-negative weights assume higher interaction/cardFlow/manaBase/cardQuality, faster RMST15 (speed = −RMST15), and tighter IQR (consistency = −IQR) cannot hurt. A zero weight means the constraint bound, not proof of no effect.",
  };

  const deckRows = BANDS.flatMap((b) =>
    rowsByBand.get(b)!.map((r) => ({
      id: r.id,
      band: r.band,
      commanderGroup: r.group,
      W: r.W,
      rmst15: r4(r.dm.rmst15),
      iqr: r.dm.iqr,
      p50: r.dm.p50,
      coverage: r4(r.dm.coverage),
      lowConfidence: r.dm.lowConfidence,
      interaction: r4(r.m.interaction),
      cardFlow: r4(r.m.cardFlow),
      manaBase: r4(r.m.manaBase),
      cardQuality: r4(r.m.cardQuality),
      unresolvedNames: r.dm.unresolvedNames.length,
      games: r.label.games,
      wins: r.label.wins,
      losses: r.label.losses,
      timeouts: r.label.timeouts,
      errors: r.label.errors,
      winRate: r4(r.wr),
      winRateExclTimeouts: r4(r.wrNoTo),
    })),
  );
  return { bandStatus, gate8, perMeasure, weights, deckRows, finalBands, partialBands };
}

function fmtCi(x: { spearman: number | null; ci95: Array<number | null> | null; n: number } | undefined): string {
  if (!x || x.spearman == null) return "n/a";
  return `rho=${x.spearman} CI95=[${x.ci95?.[0] ?? "?"}, ${x.ci95?.[1] ?? "?"}] n=${x.n}`;
}

export async function runForgeGate8AnalysisV1(): Promise<Record<string, unknown>> {
  const p = paths();
  const plan = JSON.parse(readFileSync(p.plan, "utf8")) as Plan;
  const progress = existsSync(p.progress)
    ? (JSON.parse(readFileSync(p.progress, "utf8")) as { completed: number; totalMatchups: number; updatedAt?: string })
    : null;
  const { engine, decks, reused, liveEngineError } = await computeDeckMeasures(plan);
  const labels = forgeLabels(plan);
  const a = analyse(plan, decks, labels);
  const precon = preconSummary(labels.precon, labels.preconPlanned);
  const collectionFinal = Boolean(progress && progress.completed >= progress.totalMatchups);
  const status = collectionFinal && a.finalBands.length === BANDS.length ? "final" : "partial";

  const summary: Record<string, string> = {
    status: `${status.toUpperCase()} — collection ${progress?.completed ?? "?"}/${progress?.totalMatchups ?? plan.nMatchups} matchups (${labels.completedMatchups} completed rows in matches.jsonl). Final bands: ${a.finalBands.join(",") || "none"}. Partial: ${a.partialBands.join(",") || "none"}.`,
  };
  for (const band of BANDS) {
    const g = a.gate8[band] as { status: string; W_vs_winRate: Parameters<typeof fmtCi>[0] };
    summary[`gate8_${band}`] = `${g.status}: Spearman(W, win rate) ${fmtCi(g.W_vs_winRate)}`;
    const pm = (a.perMeasure[band] as { measures: Record<string, Parameters<typeof fmtCi>[0]> }).measures;
    summary[`measures_${band}`] = MEASURES.map((k) => `${k} ${pm[k]?.spearman ?? "n/a"}`).join("; ");
  }
  const pooled = a.weights.pooledFinalBands;
  if (pooled) {
    const w = pooled.weights as Record<string, { wrPerSd: number | null; share: number | null }>;
    summary.v12Weights = `bands ${pooled.bands.join(",")} n=${pooled.n}: ${MEASURES.map((k) => `${k} ${w[k]?.share ?? 0}`).join("; ")} (shares of NNLS weight)`;
    const cvW = pooled.cv.currentWOnly;
    summary.v12Cv = `CV Spearman all-measures ${pooled.cv.allMeasures.cvSpearmanPooledCentered} (R2 ${pooled.cv.allMeasures.cvR2}); structural-only ${pooled.cv.structuralOnly.cvSpearmanPooledCentered} (R2 ${pooled.cv.structuralOnly.cvR2}); current-W-only ${cvW ? `${cvW.cvSpearmanPooledCentered} (R2 ${cvW.cvR2})` : "unavailable"}`;
  }
  if (liveEngineError) {
    summary.goldfish = reused
      ? `live goldfish engine failed (${liveEngineError}); speed/consistency/W from cached engine ${engine.sourceSha256.slice(0, 12)}`
      : `live goldfish engine failed (${liveEngineError}); no speed cache — speed, consistency and W unavailable in this run`;
  }
  summary.gate4Precon = `${precon.status}: ${precon.pairsComplete}/${precon.pairsPlanned} pairs, mean delta ${precon.meanDelta ?? "n/a"}, +${precon.nPositive}/−${precon.nNegative}/=${precon.nZero}`;

  const report = {
    version: VERSION,
    status,
    builtAt: new Date().toISOString(),
    collectionProgress: progress,
    rerun: "cd web && npx --yes tsx scripts/deck-rating/v1/forge-gate8-analysis-v1.ts  (add --pin-speed to keep the cached goldfish if the engine changed; --watch to wait for progress.completed == totalMatchups)",
    goldfish: { engine, gamesPerDeck: GAMES, dedupCards: DEDUP_CARDS, cacheReused: reused, liveEngineError, cache: p.cache },
    definitions: {
      heroWinRate: "wins / (wins + losses + timeouts) over completed validation-vs-gauntlet pairings in the hero's band, after dropping every seat whose JVM died with OutOfMemoryError and keeping at most 10 games per seat (duplicates and crash pads removed). Ordinary clock timeouts still count as non-wins. Rows with result=error are dropped and counted.",
      heroWinRateExclTimeouts: "wins / (wins + losses) — sensitivity only.",
      inclusion: "Only heroes whose every planned pairing has a row in section64-matches-v1.jsonl; games from in-flight matchups are ignored.",
      W: "speedConsistencyW (goldfish-sim-v1): round(0.6·midrank(RMST15, faster better) + 0.4·midrank(IQR, tighter better)), field = the band's 40 validation decks at the same games count. The published field is the frozen band field; within-band ranks move only via the 0.6/0.4 blend.",
      measureMapping: {
        interaction: "construction-score-v1 interaction = share of non-land cards tagged 'interact' (tag-families-v1.1)",
        cardFlow: "construction-score-v1 cardFlow = share of non-land cards tagged 'draw' or 'tutor'",
        manaBase: "construction-score-v1 manaBase = 0.6·(land count closeness to 36/99, ±12%) + 0.4·nonbasic share of lands",
        cardQuality: "construction-score-v1 cardQuality, raw mean card-strength-v1 of non-land cards. The published form is a percentile vs the band field, a monotone transform: identical Spearman, differs only in the NNLS linear scale.",
        speed: "goldfish RMST15 of first-threat turn (cap 15), sign-flipped so higher = faster",
        consistency: "goldfish IQR (p75 − p25) of first-threat turn, sign-flipped so higher = tighter; this is W's consistency term",
      },
      bootstrap: `${BOOT} reps, percentile 95% CI, resample decks with replacement, fixed seeds from ${SEED}`,
    },
    bands: a.bandStatus,
    gameCleaning: labels.gameCleaning,
    analysisA_gate8: a.gate8,
    analysisB_perMeasure: a.perMeasure,
    analysisB_v12Weights: a.weights,
    gate4PreconStripThenAdd: precon,
    caveats: [
      "2-player Commander (Forge AI, Default profile), not the published 4-player table; interaction and threat density likely matter differently at 4p.",
      "n = 40 validation heroes per band at most; ≤2 per commander, so leave-one-commander-group-out is close to leave-one-out.",
      "Each hero win rate rests on 300 games vs one 15-deck gauntlet; binomial SE ≈ 0.029 at p = 0.5, comparable to the between-deck spread in fair bands.",
      "Ordinary clock timeouts are non-wins in the primary label. Seats that died with OutOfMemoryError are removed entirely, including the timeout pads the collector wrote for the rest of that seat.",
      "CV Spearman under leave-one-group-out is biased strongly negative when the true signal is ~0 (the held-out deck pulls its own fold's slope the other way); read cvR2 (≈0 = no skill) alongside it.",
      `Goldfish at ${GAMES} games per deck — IQR is integer-valued and ties heavily; the goldfish engine is under active edit, see goldfish.engine.sourceSha256.`,
    ],
    summary,
    decks: a.deckRows,
  };
  writeJson(p.out, report);
  return report;
}

async function watch(): Promise<void> {
  const p = paths();
  for (;;) {
    const prog = existsSync(p.progress)
      ? (JSON.parse(readFileSync(p.progress, "utf8")) as { completed: number; totalMatchups: number })
      : null;
    console.log(`[${new Date().toISOString()}] progress ${prog?.completed ?? "?"}/${prog?.totalMatchups ?? "?"}`);
    if (prog && prog.completed >= prog.totalMatchups) {
      await new Promise((r) => setTimeout(r, 120_000));
      const args = ["--yes", "tsx", "scripts/deck-rating/v1/forge-gate8-analysis-v1.ts", ...(PIN_SPEED ? ["--pin-speed"] : [])];
      const res = spawnSync("npx", args, { cwd: repoWebRoot(), stdio: "inherit", shell: true });
      process.exit(res.status ?? 1);
    }
    await new Promise((r) => setTimeout(r, WATCH_POLL_MS));
  }
}

if (require.main === module) {
  (WATCH ? watch() : runForgeGate8AnalysisV1().then((r) => console.log(JSON.stringify((r as { summary: unknown }).summary, null, 2))))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
