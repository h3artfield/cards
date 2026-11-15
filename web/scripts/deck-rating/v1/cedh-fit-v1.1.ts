#!/usr/bin/env npx tsx
/**
 * cEDH fit against the spec: five-way outcome (4 seats + draw via τ),
 * player/commander random-effect shrinkage, log-sum-exp, standardized
 * features, per-card presence shrunk to a Scryfall prior.
 *
 *   cd web && set NODE_OPTIONS=--max-old-space-size=8192 && npx --yes tsx scripts/deck-rating/v1/cedh-fit-v1.1.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tagEventFromTitleV1 } from "../../../src/lib/commander-bracket-rubric/v1/event-tag-v1";
import type { NormalizedDeckInstance, TopdeckPodGame } from "../../../src/lib/commander-strategy/types";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../../../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { newestMatching, repoWebRoot, snapshotRoot, writeJson } from "./lib";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";

const TOPDECK_ROOT = "data/milestones/topdeck/topdeckImportRuns";
const BAR = 95;
const TRAIN_END = "2026-05";
const TEST_START = "2026-06";
const PLAYER_K = 20;
const COMMANDER_K = 30;
const CARD_K = 80;
const MIN_CARD_N = 80;
const STRUCT = ["commanderPrior", "interaction", "cardFlow", "manaBase", "comboPressure"] as const;

type Feat = Record<(typeof STRUCT)[number], number>;
type DeckRow = { feat: Feat; commander: string; resolved: number; cards?: string[] };
type Seat = { deckId: string; player: string; commander: string; feat: Feat; cards: string[] };
type Pod = { month: string; draw: boolean; winner: number; seats: Seat[]; cedh: boolean };

function norm(s: string): string {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function lse(xs: number[]): number {
  const m = Math.max(...xs);
  let s = 0;
  for (const x of xs) s += Math.exp(x - m);
  return m + Math.log(s);
}

export async function cedhFitV11(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const web = repoWebRoot();
  const root = resolve(web, TOPDECK_ROOT);
  console.log("cEDH v1.1: pods");
  const titles = loadTitles(root);
  const needed = new Set<string>();
  const raw: Array<{ month: string; draw: boolean; winnerPlayer: string | null; seats: Array<{ deckId: string; player: string }>; cedh: boolean }> = [];
  const seen = new Set<string>();
  let unknownSize4 = 0;
  for (const dir of v3Dirs(root)) {
    const pods = JSON.parse(readFileSync(join(root, dir, "normalized-pods-v3.json"), "utf8")) as TopdeckPodGame[];
    for (const pod of pods) {
      if (seen.has(pod.podId) || pod.participants.length !== 4) continue;
      seen.add(pod.podId);
      const tag = tagEventFromTitleV1(titles.get(pod.tid));
      const month = pod.canonicalMonth ?? (pod.tournamentDate || "").slice(0, 7);
      if (!month) continue;
      const draw = Boolean(pod.draw) || (!pod.winnerPlayerIdHash && !pod.participants.some((p) => p.winner));
      const winnerPlayer = pod.winnerPlayerIdHash ?? pod.participants.find((p) => p.winner)?.playerIdHash ?? null;
      if (tag.kind === "unknown") unknownSize4 += 1;
      if (tag.kind !== "cedh" && tag.kind !== "unknown") continue;
      for (const p of pod.participants) needed.add(p.deckInstanceId);
      raw.push({
        month,
        draw,
        winnerPlayer,
        cedh: tag.kind === "cedh",
        seats: pod.participants.map((p) => ({ deckId: p.deckInstanceId, player: p.playerIdHash })),
      });
    }
  }

  const decks = await loadDecks(root, snap, needed);
  const pods: Pod[] = [];
  for (const pod of raw) {
    const seats: Seat[] = [];
    let ok = true;
    let winner = -1;
    for (let i = 0; i < 4; i += 1) {
      const deck = decks.get(pod.seats[i]!.deckId);
      if (!deck || deck.resolved < BAR) {
        ok = false;
        break;
      }
      if (!pod.draw && pod.winnerPlayer === pod.seats[i]!.player) winner = i;
      seats.push({
        deckId: pod.seats[i]!.deckId,
        player: pod.seats[i]!.player,
        commander: deck.commander,
        feat: deck.feat,
        cards: deck.cards ?? [],
      });
    }
    if (!ok || (!pod.draw && winner < 0)) continue;
    pods.push({ month: pod.month, draw: pod.draw, winner, seats, cedh: pod.cedh });
  }

  const cedhAll = pods.filter((p) => p.cedh);
  const train = cedhAll.filter((p) => p.month <= TRAIN_END);
  const test = cedhAll.filter((p) => p.month >= TEST_START);
  const unknownTrain = pods.filter((p) => !p.cedh && p.month <= TRAIN_END);
  console.log(`cEDH v1.1 featured cedh ${cedhAll.length} train ${train.length} test ${test.length} unknownTrain ${unknownTrain.length} unknownSize4 ${unknownSize4}`);

  const mu: Feat = { commanderPrior: 0, interaction: 0, cardFlow: 0, manaBase: 0, comboPressure: 0 };
  const sd: Feat = { ...mu };
  for (const k of STRUCT) {
    const xs = train.flatMap((p) => p.seats.map((s) => s.feat[k]));
    mu[k] = xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
    const v = xs.reduce((a, b) => a + (b - mu[k]) ** 2, 0) / Math.max(xs.length, 1);
    sd[k] = Math.sqrt(v) || 1;
  }
  const z = (f: Feat): number[] => STRUCT.map((k) => (f[k] - mu[k]) / sd[k]);

  const cardN = new Map<string, number>();
  for (const pod of train) for (const s of pod.seats) for (const id of s.cards) cardN.set(id, (cardN.get(id) ?? 0) + 1);
  const cardIndex = new Map<string, number>();
  for (const [id, n] of cardN) if (n >= MIN_CARD_N) cardIndex.set(id, cardIndex.size);
  const priors = await cardPriors(snap, cardIndex);

  const seatOnly = fitModel(train, { z, usePlayer: false, useCommander: false, useDeck: false, useCards: false, cardIndex, priors });
  const seatPlayer = fitModel(train, { z, usePlayer: true, useCommander: false, useDeck: false, useCards: false, cardIndex, priors });
  const seatPlayerCmd = fitModel(train, { z, usePlayer: true, useCommander: true, useDeck: false, useCards: false, cardIndex, priors });
  const withDeck = fitModel(train, { z, usePlayer: true, useCommander: true, useDeck: true, useCards: false, cardIndex, priors });
  const withCards = fitModel(train, { z, usePlayer: true, useCommander: true, useDeck: true, useCards: true, cardIndex, priors });

  const ev = (model: Fit, podsX: Pod[]) => evaluate(podsX, model, z, cardIndex);
  const testTrivial = trivialFiveWay(test, train);
  const testSeat = ev(seatOnly, test);
  const testSp = ev(seatPlayer, test);
  const testSpc = ev(seatPlayerCmd, test);
  const testDeck = ev(withDeck, test);
  const testCards = ev(withCards, test);

  const addBackTrain = [...train, ...unknownTrain];
  const addBack = fitModel(addBackTrain, { z, usePlayer: true, useCommander: true, useDeck: true, useCards: false, cardIndex, priors });
  const addBackTest = ev(addBack, test);

  const tau = withDeck.tau;
  const pBar = 1 / (4 + Math.exp(tau));
  const report = {
    version: "deck-rating-cedh-fit-v1.2",
    outcome: "five-way categorical: seats 1–4 or draw (τ is the fifth logit)",
    metric: "mean -log p_true in nats over the 5-way softmax; not a sum of per-seat binary losses",
    evalFix:
      "v1.1 evaluate() inferred useCards from nonzero Scryfall priors, so seat-only was scored with leftover card terms. Flags are stored on the fit. Card contribution is the mean presence effect over the 99, and the card vector is demeaned after each update.",
    pBar,
    pBarNote: "average-deck win probability against 3 average decks plus τ; spec target ~18%",
    n: {
      allScoredSize4Earlier: 45509,
      thisFitCedhTagged95: cedhAll.length,
      train: train.length,
      test: test.length,
      unknownSize4Raw: unknownSize4,
      unknownTrainAdded: unknownTrain.length,
      reason: "24,448 was cEDH-tagged events only at the 95-card bar. 45,509 was every size-4 pod with all four lists scored at 95, including unknown / casual / bracket-labeled titles.",
    },
    shrinkage: { playerK: PLAYER_K, commanderK: COMMANDER_K, cardK: CARD_K, minCardN: MIN_CARD_N, cardsInTable: cardIndex.size },
    meanAbsPlayer: withDeck.meanAbsPlayer,
    meanAbsCommander: withDeck.meanAbsCommander,
    tau,
    deckWeightsStd: withDeck.w,
    testLogloss: {
      trivial: testTrivial.logloss,
      trivialPSeat: testTrivial.pSeat,
      trivialPDraw: testTrivial.pDraw,
      trivialNote: testTrivial.metric,
      seat: testSeat.logloss,
      seatPlayer: testSp.logloss,
      seatPlayerCommander: testSpc.logloss,
      plusDeckFeatures: testDeck.logloss,
      plusCards: testCards.logloss,
      deckBeatsCommanderBaseline: testDeck.logloss < testSpc.logloss,
      cardsBeatCommanderBaseline: testCards.logloss < testSpc.logloss,
      deckDeltaVsCommander: testSpc.logloss - testDeck.logloss,
      materialDeckBeat: testSpc.logloss - testDeck.logloss > 0.01,
    },
    publish: {
      wPublished: false,
      reason:
        "A material beat is >0.01 nats over seat+player+commander. Tournament cEDH lists are too similar for results to separate them if that fails.",
    },
    addBackUnknown: {
      trainN: addBackTrain.length,
      testLoglossOnCedhMonths: addBackTest.logloss,
      vsCedhOnlyDeck: testDeck.logloss,
    },
    draws: { train: train.filter((p) => p.draw).length, test: test.filter((p) => p.draw).length },
  };
  writeJson(join(snap, "fit", "cedh-fit-v1.2.json"), report);
  return { ...report, dest: join(snap, "fit", "cedh-fit-v1.2.json") };
}

type Fit = {
  w: number[];
  seat: number[];
  tau: number;
  player: Map<string, number>;
  commander: Map<string, number>;
  card: Float64Array;
  usePlayer: boolean;
  useCommander: boolean;
  useDeck: boolean;
  useCards: boolean;
  meanAbsPlayer: number;
  meanAbsCommander: number;
};

function fitModel(
  train: Pod[],
  opt: {
    z: (f: Feat) => number[];
    usePlayer: boolean;
    useCommander: boolean;
    useDeck: boolean;
    useCards: boolean;
    cardIndex: Map<string, number>;
    priors: Float64Array;
  },
): Fit {
  const w = STRUCT.map(() => 0);
  const seat = [0.08, 0.03, -0.02, -0.09];
  let tau = 0.4;
  let player = new Map<string, number>();
  let commander = new Map<string, number>();
  const card = Float64Array.from(opt.priors);
  for (let iter = 0; iter < 12; iter += 1) {
    const gradW = STRUCT.map(() => 0);
    let gradTau = 0;
    const gradSeat = [0, 0, 0, 0];
    const pRes = new Map<string, { s: number; n: number }>();
    const cRes = new Map<string, { s: number; n: number }>();
    const cResCard = new Float64Array(card.length);
    const cN = new Float64Array(card.length);
    for (const pod of train) {
      const raw = pod.seats.map((s, i) => strength(s, i, { w, seat, tau, player, commander, card }, opt));
      const xs = [...raw, tau];
      const logZ = lse(xs);
      const p = xs.map((x) => Math.exp(x - logZ));
      const t = pod.draw ? [0, 0, 0, 0, 1] : [0, 0, 0, 0, 0];
      if (!pod.draw) t[pod.winner] = 1;
      for (let i = 0; i < 4; i += 1) {
        const d = p[i]! - t[i]!;
        if (opt.useDeck) {
          const zv = opt.z(pod.seats[i]!.feat);
          for (let j = 0; j < STRUCT.length; j += 1) gradW[j]! += d * zv[j]!;
        }
        gradSeat[i]! += d;
        bump(pRes, pod.seats[i]!.player, d);
        bump(cRes, pod.seats[i]!.commander, d);
        if (opt.useCards) {
          const indexed = pod.seats[i]!.cards.filter((id) => opt.cardIndex.has(id));
          const n = Math.max(indexed.length, 1);
          for (const id of indexed) {
            const idx = opt.cardIndex.get(id)!;
            cResCard[idx]! += d / n;
            cN[idx]! += 1;
          }
        }
      }
      gradTau += p[4]! - t[4]!;
    }
    const lr = 0.25 / Math.max(train.length, 1);
    if (opt.useDeck) {
      for (let j = 0; j < w.length; j += 1) w[j] = Math.max(0, w[j]! - lr * train.length * (gradW[j]! / train.length));
    }
    tau -= 0.15 * (gradTau / train.length);
    for (let i = 0; i < 4; i += 1) seat[i] = seat[i]! - 0.15 * (gradSeat[i]! / train.length);
    const seatMean = seat.reduce((a, b) => a + b, 0) / 4;
    for (let i = 0; i < 4; i += 1) seat[i]! -= seatMean;
    if (opt.usePlayer) player = shrinkMap(pRes, PLAYER_K);
    if (opt.useCommander) commander = shrinkMap(cRes, COMMANDER_K);
    if (opt.useCards) {
      for (let i = 0; i < card.length; i += 1) {
        const n = cN[i]!;
        const mle = n ? -cResCard[i]! / n : 0;
        card[i] = (n / (n + CARD_K)) * mle + (CARD_K / (n + CARD_K)) * opt.priors[i]!;
      }
      let cardMean = 0;
      for (let i = 0; i < card.length; i += 1) cardMean += card[i]!;
      cardMean /= Math.max(card.length, 1);
      for (let i = 0; i < card.length; i += 1) card[i]! -= cardMean;
    }
    if (iter % 3 === 0) console.log(`cEDH v1.1 iter ${iter} tau=${tau.toFixed(3)}`);
  }
  return {
    w,
    seat,
    tau,
    player,
    commander,
    card,
    usePlayer: opt.usePlayer,
    useCommander: opt.useCommander,
    useDeck: opt.useDeck,
    useCards: opt.useCards,
    meanAbsPlayer: meanAbs(player),
    meanAbsCommander: meanAbs(commander),
  };
}

function strength(
  seat: Seat,
  i: number,
  model: { w: number[]; seat: number[]; tau: number; player: Map<string, number>; commander: Map<string, number>; card: Float64Array },
  opt: { z: (f: Feat) => number[]; usePlayer: boolean; useCommander: boolean; useDeck: boolean; useCards: boolean; cardIndex: Map<string, number>; priors: Float64Array },
): number {
  let s = model.seat[i] ?? 0;
  if (opt.usePlayer) s += model.player.get(seat.player) ?? 0;
  if (opt.useCommander) s += model.commander.get(seat.commander) ?? 0;
  if (opt.useDeck) {
    const zv = opt.z(seat.feat);
    for (let j = 0; j < STRUCT.length; j += 1) s += model.w[j]! * zv[j]!;
  }
  if (opt.useCards) {
    const effects: number[] = [];
    for (const id of seat.cards) {
      const idx = opt.cardIndex.get(id);
      if (idx != null) effects.push(model.card[idx]!);
    }
    if (effects.length) {
      s += effects.reduce((a, b) => a + b, 0) / effects.length;
    }
  }
  return s;
}

function fiveWayNll(pods: Pod[], scores: (pod: Pod) => number[], tau: number): { n: number; logloss: number } {
  let nll = 0;
  for (const pod of pods) {
    const xs = [...scores(pod), tau];
    const logZ = lse(xs);
    const p = xs.map((x) => Math.exp(x - logZ));
    if (pod.draw) nll -= Math.log(Math.max(p[4]!, 1e-12));
    else nll -= Math.log(Math.max(p[pod.winner]!, 1e-12));
  }
  return { n: pods.length, logloss: pods.length ? nll / pods.length : 0 };
}

function evaluate(pods: Pod[], model: Fit, z: (f: Feat) => number[], cardIndex: Map<string, number>) {
  const opt = {
    z,
    usePlayer: model.usePlayer,
    useCommander: model.useCommander,
    useDeck: model.useDeck,
    useCards: model.useCards,
    cardIndex,
    priors: model.card,
  };
  return fiveWayNll(pods, (pod) => pod.seats.map((s, i) => strength(s, i, model, opt)), model.tau);
}

function trivialFiveWay(pods: Pod[], train: Pod[]): {
  n: number;
  logloss: number;
  pSeat: number;
  pDraw: number;
  metric: string;
} {
  const pDraw = train.length ? train.filter((p) => p.draw).length / train.length : 0;
  const pSeat = (1 - pDraw) / 4;
  let nll = 0;
  for (const pod of pods) {
    nll -= Math.log(Math.max(pod.draw ? pDraw : pSeat, 1e-12));
  }
  return {
    n: pods.length,
    logloss: pods.length ? nll / pods.length : 0,
    pSeat,
    pDraw,
    metric: "5-way categorical log-loss in nats; p_draw = train draw rate, p_seat = (1-p_draw)/4 (~18.2%)",
  };
}

function bump(map: Map<string, { s: number; n: number }>, key: string, d: number) {
  const row = map.get(key) ?? { s: 0, n: 0 };
  row.s -= d;
  row.n += 1;
  map.set(key, row);
}

function shrinkMap(res: Map<string, { s: number; n: number }>, k: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, row] of res) {
    const mle = row.n ? row.s / row.n : 0;
    out.set(key, (row.n / (row.n + k)) * mle);
  }
  return out;
}

function meanAbs(map: Map<string, number>): number {
  if (!map.size) return 0;
  let s = 0;
  for (const v of map.values()) s += Math.abs(v);
  return s / map.size;
}

async function loadDecks(root: string, snap: string, needed: Set<string>): Promise<Map<string, DeckRow>> {
  const featCache = join(snap, "fit", "cedh-feature-cache-v1.json");
  const slimCache = join(snap, "fit", "cedh-deck-slim-v1.json");
  const feats = new Map<string, DeckRow>();
  if (existsSync(featCache)) {
    const cached = JSON.parse(readFileSync(featCache, "utf8")) as Record<string, DeckRow>;
    for (const [id, row] of Object.entries(cached)) feats.set(id, row);
  }
  if (existsSync(slimCache)) {
    const slim = JSON.parse(readFileSync(slimCache, "utf8")) as Record<string, DeckRow>;
    for (const [id, row] of Object.entries(slim)) feats.set(id, { ...feats.get(id), ...row });
    console.log(`cEDH v1.1 slim cache ${feats.size}`);
    return feats;
  }
  const out = new Map<string, DeckRow>();
  for (const dir of v3Dirs(root)) {
    console.log(`cEDH v1.1 decks ${dir}`);
    const all = JSON.parse(readFileSync(join(root, dir, "normalized-decks-v3.json"), "utf8")) as NormalizedDeckInstance[];
    for (const deck of all) {
      if (!needed.has(deck.deckInstanceId)) continue;
      const prior = feats.get(deck.deckInstanceId);
      const cards: string[] = [];
      for (const id of deck.commanderOracleIds) if (id) cards.push(id);
      for (const c of deck.mainboard) if (c.oracleId && c.resolutionStatus === "resolved") cards.push(c.oracleId);
      out.set(deck.deckInstanceId, {
        feat: prior?.feat ?? { commanderPrior: 0, interaction: 0, cardFlow: 0, manaBase: 0, comboPressure: 0 },
        commander: prior?.commander || deck.commanders[0]?.canonicalOracleName || deck.commanders[0]?.sourceName || "",
        resolved: cards.length,
        cards: [...new Set(cards)],
      });
    }
  }
  require("node:fs").writeFileSync(slimCache, JSON.stringify(Object.fromEntries(out)));
  return out;
}

async function cardPriors(snap: string, cardIndex: Map<string, number>): Promise<Float64Array> {
  const prior = new Float64Array(cardIndex.size);
  const gc = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const path = newestMatching(join(snap, "scryfall"), /^oracle-cards-.*\.jsonl\.gz$/);
  const tagsPath = newestMatching(join(snap, "tags"), /deck-rating-tag-table-v1\.1\.jsonl\.gz$/);
  const tags = new Map<string, string[]>();
  if (tagsPath) {
    const rl = createInterface({ input: createReadStream(tagsPath).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { oracleId?: string; tags?: string[] };
      if (rec.oracleId) tags.set(rec.oracleId, rec.tags ?? []);
    }
  }
  if (!path) return prior;
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as { oracle_id?: string; cmc?: number; edhrec_rank?: number | null };
    if (!rec.oracle_id || !cardIndex.has(rec.oracle_id)) continue;
    const fam = new Set(tags.get(rec.oracle_id) ?? []);
    const cmc = rec.cmc ?? 3;
    const rank = rec.edhrec_rank ?? 20000;
    let p = 0;
    if (gc.has(rec.oracle_id)) p += 0.04;
    if (fam.has("interact")) p += 0.015;
    if (fam.has("ramp") && cmc <= 1) p += 0.02;
    if (fam.has("tutor")) p += 0.01;
    p += 0.03 * (1 / Math.log10(rank + 10));
    prior[cardIndex.get(rec.oracle_id)!] = p;
  }
  return prior;
}

function loadTitles(root: string): Map<string, string> {
  const titles = new Map<string, string>();
  for (const dir of readdirSync(root)) {
    const statsPath = join(root, dir, "aggregate-stats.json");
    if (!existsSync(statsPath)) continue;
    const stats = JSON.parse(readFileSync(statsPath, "utf8")) as { tournamentMeta?: Array<{ tid?: string; name?: string }> };
    for (const row of stats.tournamentMeta ?? []) {
      if (row.tid && row.name && !titles.has(row.tid)) titles.set(row.tid, row.name);
    }
  }
  return titles;
}

function v3Dirs(root: string): string[] {
  return readdirSync(root)
    .filter((dir) => existsSync(join(root, dir, "normalized-decks-v3.json")))
    .sort();
}

if (require.main === module) {
  cedhFitV11()
    .then((r) =>
      console.log(
        JSON.stringify(
          {
            dest: r.dest,
            n: r.n,
            pBar: r.pBar,
            testLogloss: r.testLogloss,
            addBackUnknown: r.addBackUnknown,
            meanAbsPlayer: r.meanAbsPlayer,
            tau: r.tau,
            shrinkage: r.shrinkage,
          },
          null,
          2,
        ),
      ),
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
