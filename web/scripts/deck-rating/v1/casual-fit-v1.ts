#!/usr/bin/env npx tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotRoot, writeJson } from "./lib";
import { familiesFromCardV1_1 } from "../../../src/lib/deck-rating/v1/tag-families-v1.1";
import { resolveOracleName, type OracleNameMap } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";
import { classifyCommanderBracketV1 } from "../../../src/lib/commander-bracket-rubric/v1";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../../../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { joinPreconLabels } from "./join-precon-labels";

const SHRINK_K = 120;
const PRIOR = 0.25;

type Feat = {
  commanderPrior: number;
  meanCardStrength: number;
  interaction: number;
  cardFlow: number;
  manaBase: number;
};

const KEYS: Array<keyof Feat> = ["commanderPrior", "meanCardStrength", "interaction", "cardFlow", "manaBase"];

function shrink(wr: number, games: number): number {
  const n = Math.max(0, games);
  return (n / (n + SHRINK_K)) * wr + (SHRINK_K / (n + SHRINK_K)) * PRIOR;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function nnls(X: number[][], y: number[], keys: string[]): Record<string, number> {
  const w = keys.map(() => 0.05);
  const lr = 0.25;
  for (let step = 0; step < 800; step += 1) {
    const grad = keys.map(() => 0);
    for (let i = 0; i < X.length; i += 1) {
      let pred = PRIOR;
      for (let j = 0; j < keys.length; j += 1) pred += w[j]! * X[i]![j]!;
      const err = pred - y[i]!;
      for (let j = 0; j < keys.length; j += 1) grad[j]! += err * X[i]![j]!;
    }
    for (let j = 0; j < keys.length; j += 1) {
      w[j] = Math.max(0, w[j]! - (lr / Math.max(X.length, 1)) * grad[j]!);
    }
  }
  return Object.fromEntries(keys.map((k, j) => [k, w[j]!]));
}

function mae(X: number[][], y: number[], w: Record<string, number>, keys: string[]): number {
  let s = 0;
  for (let i = 0; i < X.length; i += 1) {
    let pred = PRIOR;
    for (const k of keys) pred += (w[k] ?? 0) * X[i]![keys.indexOf(k)]!;
    s += Math.abs(pred - y[i]!);
  }
  return s / Math.max(y.length, 1);
}

export async function casualFitV1(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const joinedMeta = joinPreconLabels() as { dest: string; joined: number };
  const labels = JSON.parse(readFileSync(joinedMeta.dest, "utf8")) as {
    decks: Array<{
      playgroupName: string;
      winRatePct: number | null;
      games: number | null;
      mtgjsonCode: string | null;
      releaseDate: string | null;
      last3Years: boolean;
      commanders: Array<{ name?: string; oracleId?: string | null }>;
      mainboard: Array<{ name?: string; oracleId?: string | null; quantity?: number }>;
    }>;
  };
  const stapleRows = JSON.parse(readFileSync(join(snap, "playgroup", "card-staples-table.json"), "utf8")) as {
    cards: Array<{ name: string; extra?: { liftPp?: number | null } }>;
  };
  const lift = new Map<string, number>();
  for (const c of stapleRows.cards) {
    if (c.extra?.liftPp != null) lift.set(norm(c.name), Number(c.extra.liftPp) / 100);
  }
  const commanders = JSON.parse(readFileSync(join(snap, "playgroup", "commander-table.json"), "utf8")) as {
    ranked: Array<{ name: string; winRatePct: number | null; games: number | null }>;
  };
  const cmdPrior = new Map<string, { wr: number; games: number }>();
  for (const c of commanders.ranked) {
    if (c.winRatePct == null || c.games == null) continue;
    cmdPrior.set(norm(c.name), { wr: c.winRatePct / 100, games: c.games });
  }

  const oracleMap = await loadSnapshotOracleNameMap(snap);
  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const rows = [];
  for (const deck of labels.decks) {
    if (deck.winRatePct == null || deck.games == null) continue;
    const cards = [
      ...deck.commanders.map((c) => ({ ...c, quantity: 1, isCommander: true })),
      ...deck.mainboard.map((c) => ({ ...c, isCommander: false })),
    ];
    let land = 0;
    let nonland = 0;
    let nonbasic = 0;
    let interact = 0;
    let draw = 0;
    let strength = 0;
    let strengthN = 0;
    for (const card of cards) {
      const q = card.quantity ?? 1;
      const name = card.name ?? "";
      const typeGuess = "";
      const fam = familiesFromCardV1_1({ typeLine: typeGuess, oracleText: "" });
      void fam;
      const liftV = lift.get(norm(name));
      if (liftV != null) {
        strength += liftV * q;
        strengthN += q;
      }
    }
    const feat = featuresForDeck(deck, cmdPrior, lift, oracleMap);
    const measured = classifyCommanderBracketV1({
      cards: cards.map((c) => ({
        oracleId: c.oracleId ?? "",
        name: c.name ?? "",
        typeLine: "",
        oracleText: "",
        quantity: c.quantity ?? 1,
        isCommander: Boolean(c.isCommander),
      })),
      gameChangerOracleIds: gcSet,
      combos: { twoCardCombos: 0, threePlusCardCombos: 0, extraTurnCount: 0, extraTurnLock: false, totalCombos: 0, comboSets: [] },
    }).assignedBracket;
    rows.push({
      name: deck.playgroupName,
      set: deck.mtgjsonCode ?? "unk",
      last3Years: deck.last3Years,
      y: deck.winRatePct / 100,
      games: deck.games,
      feat,
      measured,
    });
    void land;
    void nonland;
    void nonbasic;
    void interact;
    void draw;
    void strength;
    void strengthN;
  }

  const sets = [...new Set(rows.map((r) => r.set))];
  const loso = (keys: Array<keyof Feat>) => {
    const errors: number[] = [];
    const weights: Record<string, number>[] = [];
    for (const held of sets) {
      const train = rows.filter((r) => r.set !== held);
      const test = rows.filter((r) => r.set === held);
      if (!train.length || !test.length) continue;
      const X = train.map((r) => keys.map((k) => r.feat[k]));
      const y = train.map((r) => r.y);
      const w = nnls(X, y, keys as string[]);
      weights.push(w);
      const Xt = test.map((r) => keys.map((k) => r.feat[k]));
      errors.push(mae(Xt, test.map((r) => r.y), w, keys as string[]));
    }
    const meanW: Record<string, number> = {};
    for (const k of keys) meanW[k] = weights.reduce((s, w) => s + (w[k] ?? 0), 0) / Math.max(weights.length, 1);
    return { mae: errors.reduce((a, b) => a + b, 0) / Math.max(errors.length, 1), folds: errors.length, weights: meanW };
  };

  const five = loso(KEYS);
  const four = loso(KEYS.filter((k) => k !== "meanCardStrength"));
  const keepStrength = five.mae + 0.002 < four.mae;
  const chosen = keepStrength ? five : four;
  const used = keepStrength ? KEYS : KEYS.filter((k) => k !== "meanCardStrength");

  const b2 = rows.filter((r) => r.last3Years && r.measured === 2);
  const pBar = b2.length ? b2.reduce((s, r) => s + predict(r.feat, chosen.weights, used), 0) / b2.length : PRIOR;
  const labelsOut = rows.map((r) => {
    const p = predict(r.feat, chosen.weights, used);
    const w = strengthW(p, pBar);
    return { name: r.name, set: r.set, y: r.y, p, W: w, measured: r.measured, last3Years: r.last3Years };
  });

  const report = {
    version: "deck-rating-casual-fit-v1",
    shrinkK: SHRINK_K,
    prior: PRIOR,
    nLabels: rows.length,
    nSets: sets.length,
    loso: { withStrength: five, withoutStrength: four, keepMeanCardStrength: keepStrength },
    weights: chosen.weights,
    featuresUsed: used,
    b2Comparison: { n: b2.length, pBar },
    anchors: {
      medianPreconW: median(labelsOut.map((r) => r.W)),
      topPlaygroup: labelsOut.slice().sort((a, b) => b.y - a.y)[0] ?? null,
      test: "median ranked precon W should land near 2500 ± 25 once B=2 is attached (DR=2000+W)",
    },
    labels: labelsOut,
  };
  writeJson(join(snap, "fit", "casual-fit-v1.json"), report);
  return { nLabels: rows.length, keepMeanCardStrength: keepStrength, weights: chosen.weights, mae: chosen.mae, dest: join(snap, "fit", "casual-fit-v1.json") };
}

function featuresForDeck(
  deck: {
    commanders: Array<{ name?: string }>;
    mainboard: Array<{ name?: string; quantity?: number }>;
  },
  cmdPrior: Map<string, { wr: number; games: number }>,
  lift: Map<string, number>,
  oracleMap: OracleNameMap,
): Feat {
  const cmd = deck.commanders[0]?.name ?? "";
  const pr = cmdPrior.get(norm(cmd));
  const commanderPrior = pr ? shrink(pr.wr, pr.games) : PRIOR;
  let land = 0;
  let nonland = 0;
  let nonbasic = 0;
  let interact = 0;
  let draw = 0;
  let strength = 0;
  let strengthN = 0;
  for (const card of [...deck.commanders.map((c) => ({ ...c, quantity: 1 })), ...deck.mainboard]) {
    const q = card.quantity ?? 1;
    const info = resolveOracleName(oracleMap, card.name ?? "");
    const typeLine = info?.typeLine ?? "";
    const text = info?.text ?? "";
    const fam = familiesFromCardV1_1({ typeLine, oracleText: text });
    const isLand = /\bland\b/i.test(typeLine);
    if (isLand) {
      land += q;
      if (!/\bbasic\b/i.test(typeLine)) nonbasic += q;
    } else {
      nonland += q;
      if (fam.has("interact")) interact += q;
      if (fam.has("draw") || fam.has("tutor")) draw += q;
    }
    const lv = lift.get(norm(card.name ?? ""));
    if (lv != null) {
      strength += lv * q;
      strengthN += q;
    }
  }
  const tot = Math.max(land + nonland, 1);
  const landFrac = land / tot;
  const landBand = 1 - Math.min(1, Math.abs(landFrac - 36 / 99) / 0.12);
  return {
    commanderPrior: commanderPrior - PRIOR,
    meanCardStrength: strengthN ? strength / strengthN : 0,
    interaction: interact / Math.max(nonland, 1),
    cardFlow: draw / Math.max(nonland, 1),
    manaBase: 0.6 * landBand + 0.4 * (land ? nonbasic / land : 0),
  };
}

function predict(feat: Feat, w: Record<string, number>, keys: Array<keyof Feat>): number {
  let p = PRIOR;
  for (const k of keys) p += (w[k] ?? 0) * feat[k];
  return Math.min(0.6, Math.max(0.05, p));
}

function strengthW(p: number, pBar: number): number {
  const odds = (x: number) => x / Math.max(1 - x, 1e-6);
  const raw = 500 + 400 * Math.log10(odds(p) / odds(Math.max(pBar, 0.06)));
  return Math.max(0, Math.min(999, Math.round(raw)));
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  if (!s.length) return 0;
  return s[Math.floor(s.length / 2)]!;
}

if (require.main === module) {
  casualFitV1().then((r) => console.log(JSON.stringify(r, null, 2))).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
