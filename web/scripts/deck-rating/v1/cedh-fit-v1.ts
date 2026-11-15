#!/usr/bin/env npx tsx
/**
 * Deck Rating cEDH (5xxx) fit. Player + seat terms exist only here.
 * Train 2025-09–2026-05 / test 2026-06–2026-08. Draws are uniform targets.
 *
 *   cd web && node --max-old-space-size=8192 ./node_modules/tsx/dist/cli.mjs scripts/deck-rating/v1/cedh-fit-v1.ts
 */
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join, resolve } from "node:path";
import { loadSpellbookComboArtifacts } from "../../../src/lib/commander-optimization-score/v1/load-artifacts";
import type { CosV1CompiledVariant } from "../../../src/lib/commander-optimization-score/v1/detect";
import { loadComboBracketTagsV1 } from "../../../src/lib/commander-bracket-rubric/v1/combo-bracket-tags";
import { tagEventFromTitleV1 } from "../../../src/lib/commander-bracket-rubric/v1/event-tag-v1";
import type { NormalizedDeckInstance, TopdeckPodGame } from "../../../src/lib/commander-strategy/types";
import { newestMatching, repoWebRoot, snapshotRoot, writeJson } from "./lib";

const SHRINK_K = 120;
const PRIOR = 0.25;
const BAR = 95;
const TOPDECK_ROOT = "data/milestones/topdeck/topdeckImportRuns";
const TRAIN_END = "2026-05";
const TEST_START = "2026-06";
const MIN_PLAYER_GAMES = 8;
const LAMBDA_PLAYER = 4;
const LAMBDA_SEAT = 0.5;
const KEYS = ["commanderPrior", "interaction", "cardFlow", "manaBase", "comboPressure"] as const;
type Key = (typeof KEYS)[number];

type Feat = Record<Key, number>;
type DeckRow = {
  feat: Feat;
  resolved: number;
  commander: string;
  tid: string;
};
type PodRow = {
  month: string;
  draw: boolean;
  winner: number;
  seats: Array<{ deckId: string; player: string; feat: Feat }>;
};

function norm(s: string): string {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function shrink(wr: number, games: number): number {
  const n = Math.max(0, games);
  return (n / (n + SHRINK_K)) * wr + (SHRINK_K / (n + SHRINK_K)) * PRIOR;
}

export async function cedhFitV1(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const web = repoWebRoot();
  const root = resolve(web, TOPDECK_ROOT);
  console.log("cEDH fit: loading titles + pods");
  const titles = loadTitles(root);
  const needed = new Set<string>();
  const rawPods: Array<{ month: string; draw: boolean; winnerPlayer: string | null; seats: Array<{ deckId: string; player: string }>; tid: string }> = [];
  const seenPod = new Set<string>();
  for (const dir of v3Dirs(root)) {
    const pods = JSON.parse(readFileSync(join(root, dir, "normalized-pods-v3.json"), "utf8")) as TopdeckPodGame[];
    for (const pod of pods) {
      if (seenPod.has(pod.podId) || pod.participants.length !== 4) continue;
      seenPod.add(pod.podId);
      const tag = tagEventFromTitleV1(titles.get(pod.tid));
      if (tag.kind !== "cedh") continue;
      const month = pod.canonicalMonth ?? (pod.tournamentDate || "").slice(0, 7);
      if (!month) continue;
      const draw = Boolean(pod.draw) || (!pod.winnerPlayerIdHash && !pod.participants.some((p) => p.winner));
      const winnerPlayer = pod.winnerPlayerIdHash ?? pod.participants.find((p) => p.winner)?.playerIdHash ?? null;
      for (const p of pod.participants) needed.add(p.deckInstanceId);
      rawPods.push({
        month,
        draw,
        winnerPlayer,
        tid: pod.tid,
        seats: pod.participants.map((p) => ({ deckId: p.deckInstanceId, player: p.playerIdHash })),
      });
    }
  }
  console.log(`cEDH size-4 pods ${rawPods.length}; unique decks ${needed.size}`);

  const cachePath = join(snap, "fit", "cedh-feature-cache-v1.json");
  const decks = new Map<string, DeckRow>();
  if (existsSync(cachePath)) {
    const cached = JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, DeckRow>;
    for (const [id, row] of Object.entries(cached)) decks.set(id, row);
    console.log(`cEDH fit: loaded feature cache ${decks.size}`);
  } else {
    const cmdPrior = loadCommanderPriors(snap);
    const { tagsById, typeById } = await loadTagTable(snap);
    console.log("cEDH fit: loading Spellbook");
    const { comboIndex, compiled } = await loadSpellbookComboArtifacts();
    const comboTags = loadComboBracketTagsV1();
    const byFirst = invertCompiled(compiled);
    for (const dir of v3Dirs(root)) {
      console.log(`cEDH fit: decks ${dir}`);
      const all = JSON.parse(readFileSync(join(root, dir, "normalized-decks-v3.json"), "utf8")) as NormalizedDeckInstance[];
      for (const deck of all) {
        if (!needed.has(deck.deckInstanceId) || decks.has(deck.deckInstanceId)) continue;
        const row = featuresForDeck(deck, tagsById, typeById, cmdPrior, byFirst, comboIndex, comboTags);
        if (row) decks.set(deck.deckInstanceId, row);
      }
    }
    writeJson(cachePath, Object.fromEntries(decks));
    console.log(`cEDH fit: featured decks ${decks.size}`);
  }

  const pods: PodRow[] = [];
  let skippedThin = 0;
  for (const pod of rawPods) {
    const seats = [];
    let ok = true;
    let winner = -1;
    for (let i = 0; i < 4; i += 1) {
      const seat = pod.seats[i]!;
      const deck = decks.get(seat.deckId);
      if (!deck || deck.resolved < BAR) {
        ok = false;
        break;
      }
      if (!pod.draw && pod.winnerPlayer === seat.player) winner = i;
      seats.push({ deckId: seat.deckId, player: seat.player, feat: deck.feat });
    }
    if (!ok) {
      skippedThin += 1;
      continue;
    }
    if (!pod.draw && winner < 0) continue;
    pods.push({ month: pod.month, draw: pod.draw, winner, seats });
  }

  const train = pods.filter((p) => p.month <= TRAIN_END);
  const test = pods.filter((p) => p.month >= TEST_START);
  console.log(`cEDH fit: train ${train.length} test ${test.length} skippedThin ${skippedThin}`);

  const playerGames = new Map<string, number>();
  for (const pod of train) {
    for (const s of pod.seats) playerGames.set(s.player, (playerGames.get(s.player) ?? 0) + 1);
  }
  const playerIndex = new Map<string, number>();
  for (const [player, n] of playerGames) {
    if (n >= MIN_PLAYER_GAMES) playerIndex.set(player, playerIndex.size);
  }

  const fit = lbfgsFit(train, playerIndex);
  const trainMetrics = evaluate(train, fit, playerIndex);
  const testMetrics = evaluate(test, fit, playerIndex);
  const baseline = { winAcc: test.filter((p) => !p.draw).length ? 0.25 : 0, logloss: Math.log(4) };

  const susan = loadCommanderPriors(snap).get(norm("Susan Foreman"));
  const report = {
    version: "deck-rating-cedh-fit-v1",
    band: "5xxx only",
    shrinkK: SHRINK_K,
    prior: PRIOR,
    timeSplit: { train: `2025-09–${TRAIN_END}`, test: `${TEST_START}–2026-08` },
    nPods: { rawCedhSize4: rawPods.length, featured: pods.length, train: train.length, test: test.length, skippedThin },
    draws: {
      train: train.filter((p) => p.draw).length,
      test: test.filter((p) => p.draw).length,
    },
    playersWithEffect: playerIndex.size,
    weights: fit.weights,
    seat: fit.seat,
    meanAbsPlayer: fit.meanAbsPlayer,
    featuresUsed: KEYS,
    comboPressure: "tau = min(1, (2*n2 + n3plus + 3*nTerm) / 16) from live Spellbook lines (templates dropped)",
    train: trainMetrics,
    test: testMetrics,
    baseline,
    shrinkageExample: susan
      ? {
          name: "Susan Foreman",
          games: susan.games,
          rawWr: susan.wr,
          shrunk: shrink(susan.wr, susan.games),
          note: "k=120 keeps a 43-game commander near 25%",
        }
      : { name: "Susan Foreman", found: false },
    note: "Player and seat terms are fit-only. Deployed W uses structural weights against p-bar_B = 0.25 (mean field deck).",
  };
  writeJson(join(snap, "fit", "cedh-fit-v1.json"), report);
  return { ...report, dest: join(snap, "fit", "cedh-fit-v1.json") };
}

function featuresForDeck(
  deck: NormalizedDeckInstance,
  tagsById: Map<string, Set<string>>,
  typeById: Map<string, string>,
  cmdPrior: Map<string, { wr: number; games: number }>,
  byFirst: Map<string, CosV1CompiledVariant[]>,
  comboIndex: Awaited<ReturnType<typeof loadSpellbookComboArtifacts>>["comboIndex"],
  comboTags: ReturnType<typeof loadComboBracketTagsV1>,
): DeckRow | null {
  const present = new Set<string>();
  const qty = new Map<string, number>();
  for (const id of deck.commanderOracleIds) if (id) present.add(id);
  for (const card of deck.mainboard) {
    if (!card.oracleId || card.resolutionStatus !== "resolved") continue;
    present.add(card.oracleId);
    qty.set(card.oracleId, (qty.get(card.oracleId) ?? 0) + (card.quantity ?? 1));
  }
  if (present.size < BAR) return null;
  let land = 0;
  let nonland = 0;
  let nonbasic = 0;
  let interact = 0;
  let draw = 0;
  for (const id of present) {
    const q = qty.get(id) ?? 1;
    const typeLine = typeById.get(id) ?? "";
    const fam = tagsById.get(id);
    const isLand = /\bland\b/i.test(typeLine);
    if (isLand) {
      land += q;
      if (!/\bbasic\b/i.test(typeLine)) nonbasic += q;
    } else {
      nonland += q;
      if (fam?.has("interact")) interact += q;
      if (fam?.has("draw") || fam?.has("tutor")) draw += q;
    }
  }
  const cmdName = deck.commanders[0]?.canonicalOracleName ?? deck.commanders[0]?.sourceName ?? "";
  const pr = cmdPrior.get(norm(cmdName));
  const commanderPrior = (pr ? shrink(pr.wr, pr.games) : PRIOR) - PRIOR;
  const tot = Math.max(land + nonland, 1);
  const landFrac = land / tot;
  const landBand = 1 - Math.min(1, Math.abs(landFrac - 36 / 99) / 0.12);
  const tau = comboPressure(present, new Set(deck.commanderOracleIds.filter(Boolean)), byFirst, comboIndex, comboTags);
  return {
    resolved: present.size,
    commander: cmdName,
    tid: deck.tid,
    feat: {
      commanderPrior,
      interaction: interact / Math.max(nonland, 1),
      cardFlow: draw / Math.max(nonland, 1),
      manaBase: 0.6 * landBand + 0.4 * (land ? nonbasic / land : 0),
      comboPressure: tau,
    },
  };
}

function comboPressure(
  present: Set<string>,
  commanders: Set<string>,
  byFirst: Map<string, CosV1CompiledVariant[]>,
  comboIndex: Awaited<ReturnType<typeof loadSpellbookComboArtifacts>>["comboIndex"],
  comboTags: ReturnType<typeof loadComboBracketTagsV1>,
): number {
  const seen = new Set<string>();
  let n2 = 0;
  let n3 = 0;
  let nTerm = 0;
  for (const oracleId of present) {
    for (const variant of byFirst.get(oracleId) ?? []) {
      if (seen.has(variant.cardSetSignature)) continue;
      if (variant.requiredOracleIds.some((id) => !present.has(id))) continue;
      seen.add(variant.cardSetSignature);
      const row = comboIndex.get(variant.cardSetSignature);
      if (!row) continue;
      const nTemplates = comboTags.get(variant.cardSetSignature)?.nTemplates ?? row.nTemplates ?? 0;
      if (nTemplates > 0) continue;
      if (row.comboCardCount === 2) n2 += 1;
      else n3 += 1;
      if (row.isTerminalRoute) nTerm += 1;
    }
  }
  void commanders;
  return Math.min(1, (2 * n2 + n3 + 3 * nTerm) / 16);
}

function invertCompiled(compiled: CosV1CompiledVariant[]): Map<string, CosV1CompiledVariant[]> {
  const index = new Map<string, CosV1CompiledVariant[]>();
  for (const variant of compiled) {
    const key = variant.requiredOracleIds[0];
    if (!key) continue;
    const list = index.get(key);
    if (list) list.push(variant);
    else index.set(key, [variant]);
  }
  return index;
}

function clipTheta(x: Float64Array, nW: number): void {
  for (let i = 0; i < nW; i += 1) x[i] = Math.min(2, Math.max(-6, x[i]!));
  for (let i = nW; i < x.length; i += 1) x[i] = Math.min(2.5, Math.max(-2.5, x[i]!));
}

function finite(n: number): boolean {
  return Number.isFinite(n);
}

function lbfgsFit(train: PodRow[], playerIndex: Map<string, number>) {
  const nW = KEYS.length;
  const nP = playerIndex.size;
  const n = nW + 3 + nP;
  const x = new Float64Array(n);
  for (let i = 0; i < nW; i += 1) x[i] = -2.5;
  const m = 8;
  const sHist: Float64Array[] = [];
  const yHist: Float64Array[] = [];
  let gPrev: Float64Array | null = null;
  let xPrev: Float64Array | null = null;
  let last = nllAndGrad(train, x, playerIndex);
  let mode: "lbfgs" | "gd" = "lbfgs";
  for (let iter = 0; iter < 80; iter += 1) {
    if (!finite(last.nll) || last.g.some((v) => !finite(v))) {
      console.log(`cEDH optimizer reset at ${iter}`);
      x.fill(0);
      for (let i = 0; i < nW; i += 1) x[i] = -2.5;
      sHist.length = 0;
      yHist.length = 0;
      gPrev = null;
      xPrev = null;
      last = nllAndGrad(train, x, playerIndex);
      mode = "gd";
    }
    const g = last.g;
    const dir = mode === "lbfgs" ? twoLoop(g, sHist, yHist) : Float64Array.from(g);
    let step = mode === "gd" ? 0.15 : 0.4;
    let accepted = false;
    for (let ls = 0; ls < 12; ls += 1) {
      const trial = new Float64Array(x);
      for (let i = 0; i < n; i += 1) trial[i] = x[i]! - step * dir[i]!;
      clipTheta(trial, nW);
      const next = nllAndGrad(train, trial, playerIndex);
      if (finite(next.nll) && next.nll <= last.nll) {
        if (xPrev && gPrev && mode === "lbfgs") {
          const s = new Float64Array(n);
          const y = new Float64Array(n);
          let ys = 0;
          for (let i = 0; i < n; i += 1) {
            s[i] = trial[i]! - xPrev[i]!;
            y[i] = next.g[i]! - gPrev[i]!;
            ys += s[i]! * y[i]!;
          }
          if (ys > 1e-8) {
            sHist.push(s);
            yHist.push(y);
            if (sHist.length > m) {
              sHist.shift();
              yHist.shift();
            }
          }
        }
        xPrev = Float64Array.from(trial);
        gPrev = Float64Array.from(next.g);
        x.set(trial);
        last = next;
        accepted = true;
        break;
      }
      step *= 0.4;
    }
    if (!accepted) {
      if (mode === "lbfgs") {
        mode = "gd";
        sHist.length = 0;
        yHist.length = 0;
        continue;
      }
      break;
    }
    if (iter % 5 === 0) console.log(`cEDH ${mode} ${iter} nll=${last.nll.toFixed(4)}`);
    if (Math.sqrt(dot(last.g, last.g)) < 1e-5) break;
  }
  const weights: Record<string, number> = {};
  for (let i = 0; i < nW; i += 1) weights[KEYS[i]!] = Math.exp(x[i]!);
  const seat = [x[nW]!, x[nW + 1]!, x[nW + 2]!, -((x[nW] ?? 0) + (x[nW + 1] ?? 0) + (x[nW + 2] ?? 0))];
  let absP = 0;
  for (let i = 0; i < nP; i += 1) absP += Math.abs(x[nW + 3 + i]!);
  return { weights, seat, meanAbsPlayer: nP ? absP / nP : 0, theta: x, playerIndex, nll: last.nll };
}

function nllAndGrad(pods: PodRow[], theta: Float64Array, playerIndex: Map<string, number>) {
  const nW = KEYS.length;
  const nP = playerIndex.size;
  const g = new Float64Array(theta.length);
  let nll = 0;
  const w = KEYS.map((_, i) => Math.exp(theta[i]!));
  const seat = [theta[nW]!, theta[nW + 1]!, theta[nW + 2]!, -((theta[nW] ?? 0) + (theta[nW + 1] ?? 0) + (theta[nW + 2] ?? 0))];
  for (const pod of pods) {
    const s = [0, 0, 0, 0];
    for (let i = 0; i < 4; i += 1) {
      const feat = pod.seats[i]!.feat;
      let si = seat[i]!;
      const pi = playerIndex.get(pod.seats[i]!.player);
      if (pi != null) si += theta[nW + 3 + pi]!;
      for (let j = 0; j < nW; j += 1) si += w[j]! * feat[KEYS[j]!];
      s[i] = si;
    }
    const mx = Math.max(...s);
    const ex = s.map((v) => Math.exp(v - mx));
    const z = ex.reduce((a, b) => a + b, 0);
    const p = ex.map((v) => v / z);
    const t = pod.draw ? [0.25, 0.25, 0.25, 0.25] : [0, 0, 0, 0];
    if (!pod.draw) t[pod.winner] = 1;
    for (let i = 0; i < 4; i += 1) nll -= t[i]! * Math.log(Math.max(p[i]!, 1e-12));
    for (let i = 0; i < 4; i += 1) {
      const d = p[i]! - t[i]!;
      for (let j = 0; j < nW; j += 1) g[j]! += d * w[j]! * pod.seats[i]!.feat[KEYS[j]!];
      const pi = playerIndex.get(pod.seats[i]!.player);
      if (pi != null) g[nW + 3 + pi]! += d;
    }
    const d3 = p[3]! - t[3]!;
    for (let k = 0; k < 3; k += 1) g[nW + k]! += p[k]! - t[k]! - d3;
  }
  nll /= Math.max(pods.length, 1);
  for (let i = 0; i < theta.length; i += 1) g[i]! /= Math.max(pods.length, 1);
  for (let i = 0; i < 3; i += 1) {
    nll += 0.5 * LAMBDA_SEAT * (theta[nW + i]! ** 2);
    g[nW + i]! += LAMBDA_SEAT * theta[nW + i]!;
  }
  for (let i = 0; i < nP; i += 1) {
    const a = theta[nW + 3 + i]!;
    nll += 0.5 * LAMBDA_PLAYER * (a * a);
    g[nW + 3 + i]! += LAMBDA_PLAYER * a;
  }
  return { nll, g };
}

function twoLoop(g: Float64Array, sHist: Float64Array[], yHist: Float64Array[]): Float64Array {
  const q = Float64Array.from(g);
  const rho: number[] = [];
  const alpha: number[] = [];
  for (let i = sHist.length - 1; i >= 0; i -= 1) {
    const r = 1 / Math.max(dot(yHist[i]!, sHist[i]!), 1e-12);
    rho[i] = r;
    const a = r * dot(sHist[i]!, q);
    alpha[i] = a;
    axpy(q, yHist[i]!, -a);
  }
  if (sHist.length) {
    const lastS = sHist[sHist.length - 1]!;
    const lastY = yHist[yHist.length - 1]!;
    const scale = dot(lastS, lastY) / Math.max(dot(lastY, lastY), 1e-12);
    for (let i = 0; i < q.length; i += 1) q[i]! *= scale;
  }
  for (let i = 0; i < sHist.length; i += 1) {
    const b = rho[i]! * dot(yHist[i]!, q);
    axpy(q, sHist[i]!, alpha[i]! - b);
  }
  return q;
}

function evaluate(pods: PodRow[], fit: { weights: Record<string, number>; seat: number[]; theta: Float64Array; playerIndex: Map<string, number> }, playerIndex: Map<string, number>) {
  let nll = 0;
  let correct = 0;
  let winners = 0;
  let drawNll = 0;
  let draws = 0;
  for (const pod of pods) {
    const s = pod.seats.map((seat, i) => {
      let v = fit.seat[i] ?? 0;
      const pi = playerIndex.get(seat.player);
      if (pi != null) v += fit.theta[KEYS.length + 3 + pi] ?? 0;
      for (const k of KEYS) v += (fit.weights[k] ?? 0) * seat.feat[k];
      return v;
    });
    const mx = Math.max(...s);
    const ex = s.map((v) => Math.exp(v - mx));
    const z = ex.reduce((a, b) => a + b, 0);
    const p = ex.map((v) => v / z);
    if (pod.draw) {
      draws += 1;
      drawNll -= 0.25 * p.reduce((a, b) => a + Math.log(Math.max(b, 1e-12)), 0);
      nll -= 0.25 * p.reduce((a, b) => a + Math.log(Math.max(b, 1e-12)), 0);
    } else {
      winners += 1;
      nll -= Math.log(Math.max(p[pod.winner]!, 1e-12));
      if (p.indexOf(Math.max(...p)) === pod.winner) correct += 1;
    }
  }
  return {
    n: pods.length,
    logloss: pods.length ? nll / pods.length : 0,
    winAcc: winners ? correct / winners : 0,
    winners,
    draws,
    drawLogloss: draws ? drawNll / draws : 0,
  };
}

function loadCommanderPriors(snap: string): Map<string, { wr: number; games: number }> {
  const path = join(snap, "playgroup", "commander-table.json");
  const rows = JSON.parse(readFileSync(path, "utf8")) as {
    ranked: Array<{ name: string; winRatePct: number | null; games: number | null }>;
  };
  const out = new Map<string, { wr: number; games: number }>();
  for (const c of rows.ranked) {
    if (c.winRatePct == null || c.games == null) continue;
    out.set(norm(c.name), { wr: c.winRatePct / 100, games: c.games });
  }
  return out;
}

async function loadTagTable(snap: string): Promise<{ tagsById: Map<string, Set<string>>; typeById: Map<string, string> }> {
  const path = newestMatching(join(snap, "tags"), /deck-rating-tag-table-v1\.1\.jsonl\.gz$/);
  if (!path) throw new Error("tag-table-v1.1 missing");
  const tagsById = new Map<string, Set<string>>();
  const typeById = new Map<string, string>();
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as { oracleId?: string; typeLine?: string; tags?: string[] };
    if (!rec.oracleId) continue;
    typeById.set(rec.oracleId, rec.typeLine ?? "");
    tagsById.set(rec.oracleId, new Set(rec.tags ?? []));
  }
  return { tagsById, typeById };
}

function loadTitles(root: string): Map<string, string> {
  const titles = new Map<string, string>();
  for (const dir of readdirSync(root)) {
    const statsPath = join(root, dir, "aggregate-stats.json");
    if (!existsSync(statsPath)) continue;
    const stats = JSON.parse(readFileSync(statsPath, "utf8")) as {
      tournamentMeta?: Array<{ tid?: string; name?: string }>;
    };
    for (const row of stats.tournamentMeta ?? []) {
      if (row.tid && row.name && !titles.has(row.tid)) titles.set(row.tid, row.name);
    }
  }
  return titles;
}

function v3Dirs(root: string): string[] {
  return readdirSync(root)
    .filter((dir) => existsSync(join(root, dir, "normalized-decks-v3.json")) && existsSync(join(root, dir, "normalized-pods-v3.json")))
    .sort();
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i]! * b[i]!;
  return s;
}

function axpy(y: Float64Array, x: Float64Array, a: number): void {
  for (let i = 0; i < y.length; i += 1) y[i]! += a * x[i]!;
}

if (require.main === module) {
  cedhFitV1()
    .then((r) => console.log(JSON.stringify({ dest: r.dest, nPods: r.nPods, weights: r.weights, test: r.test }, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
