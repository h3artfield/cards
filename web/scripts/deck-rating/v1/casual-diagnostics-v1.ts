#!/usr/bin/env npx tsx
/**
 * Casual-model diagnostics: 25% baseline MAE, commander-prior leakage, §6 tests.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import { newestMatching, snapshotRoot, writeJson } from "./lib";
import { publishedDeckRating } from "../../../src/lib/deck-rating/v1/publish";
import { familiesFromCardV1_1 } from "../../../src/lib/deck-rating/v1/tag-families-v1.1";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../../../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";

const PRIOR = 0.25;
const SHRINK_K = 120;

function norm(s: string): string {
  return s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function shrink(wr: number, games: number): number {
  const n = Math.max(0, games);
  return (n / (n + SHRINK_K)) * wr + (SHRINK_K / (n + SHRINK_K)) * PRIOR;
}

function odds(x: number): number {
  return x / Math.max(1 - x, 1e-6);
}

function strengthW(p: number, pBar: number): number {
  const raw = 500 + 400 * Math.log10(odds(p) / odds(Math.max(pBar, 0.06)));
  return Math.max(0, Math.min(999, Math.round(raw)));
}

export async function casualDiagnosticsV1(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const fit = JSON.parse(readFileSync(join(snap, "fit", "casual-fit-v1.json"), "utf8")) as {
    loso: { withoutStrength: { mae: number; folds: number; weights: Record<string, number> } };
    weights: Record<string, number>;
    b2Comparison: { n: number; pBar: number };
    anchors: { medianPreconW: number; topPlaygroup: { name: string; y: number; p: number; W: number } | null };
    labels: Array<{ name: string; set: string; y: number; p: number; W: number; measured: number; last3Years: boolean }>;
  };
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    decks: Array<{
      playgroupName: string;
      winRatePct: number | null;
      games: number | null;
      mtgjsonCode: string | null;
      commanders: Array<{ name?: string; oracleId?: string | null }>;
      mainboard: Array<{ name?: string; oracleId?: string | null; quantity?: number }>;
    }>;
  };
  const commanders = JSON.parse(readFileSync(join(snap, "playgroup", "commander-table.json"), "utf8")) as {
    window?: string;
    ranked: Array<{ name: string; winRatePct: number | null; games: number | null }>;
  };
  const cmd = new Map(commanders.ranked.map((c) => [norm(c.name), c]));

  const bySet = new Map<string, Array<{ y: number }>>();
  for (const row of fit.labels) {
    const list = bySet.get(row.set) ?? [];
    list.push({ y: row.y });
    bySet.set(row.set, list);
  }
  const baselineErrors: number[] = [];
  for (const rows of bySet.values()) {
    if (!rows.length) continue;
    baselineErrors.push(rows.reduce((s, r) => s + Math.abs(r.y - PRIOR), 0) / rows.length);
  }
  const constant25Mae = baselineErrors.reduce((a, b) => a + b, 0) / Math.max(baselineErrors.length, 1);
  const overall25 = fit.labels.reduce((s, r) => s + Math.abs(r.y - PRIOR), 0) / fit.labels.length;

  const leakage = [];
  for (const deck of labels.decks) {
    const name = deck.commanders[0]?.name ?? "";
    const row = cmd.get(norm(name));
    const preconGames = deck.games ?? 0;
    const cmdGames = row?.games ?? null;
    leakage.push({
      precon: deck.playgroupName,
      commander: name,
      stockGames: preconGames,
      commander30dGames: cmdGames,
      commander30dWr: row?.winRatePct ?? null,
      stockWr: deck.winRatePct,
      stockShareOfCommanderWindow: cmdGames ? Math.min(1, preconGames / cmdGames) : null,
      overlapPossible: cmdGames != null && preconGames > 0,
    });
  }
  const overlapping = leakage.filter((r) => r.commander30dGames != null);
  const highOverlap = overlapping.filter((r) => (r.stockShareOfCommanderWindow ?? 0) >= 0.5);

  const pBar = fit.b2Comparison.pBar;
  const wCmd = fit.weights.commanderPrior ?? 0;
  const scoreName = (commanderName: string) => {
    const row = cmd.get(norm(commanderName));
    const prior = row?.winRatePct != null && row.games != null ? shrink(row.winRatePct / 100, row.games) : PRIOR;
    const p = Math.min(0.6, Math.max(0.05, PRIOR + wCmd * (prior - PRIOR)));
    return { p, W: strengthW(p, pBar), prior };
  };

  const b2Names = new Set(fit.labels.filter((r) => r.last3Years && r.measured === 2).map((r) => r.name));
  const b2Scores = fit.labels.filter((r) => b2Names.has(r.name)).map((r) => ({ name: r.name, W: r.W, p: r.p }));
  const b5 = await scoreB5Field(snap, cmd, wCmd, pBar);
  let b5AboveAllB2 = 0;
  let b5BelowSomeB2 = 0;
  const maxB2 = Math.max(...b2Scores.map((r) => r.W), 0);
  const minB2 = Math.min(...b2Scores.map((r) => r.W), 999);
  for (const row of b5.sample) {
    if (row.W > maxB2) b5AboveAllB2 += 1;
    else b5BelowSomeB2 += 1;
  }

  const mono = monotonicity(labels.decks[0], scoreName, pBar, wCmd);

  const report = {
    version: "deck-rating-casual-diagnostics-v1",
    publish: {
      casualW: false,
      reason: "W does not move with deck contents; §6 casual LOSO vs commander-only is a tie, bridge fails, PWP misses the 2600-style anchor.",
      displayRule: "B1–B4 show the bracket digit only",
      example: publishedDeckRating(2),
    },
    a_losoMae: {
      constant25Folds: constant25Mae,
      constant25Overall: overall25,
      commanderPriorModel: fit.loso.withoutStrength.mae,
      folds: fit.loso.withoutStrength.folds,
      note: "The shipped casual model is commanderPrior-only, so it is the commander-win-rate baseline in §6, not an improvement on it.",
    },
    b_leakage: {
      commanderWindow: commanders.window ?? "last 30 days",
      preconStockGamesAreExactList: true,
      commanderGamesIncludeAllListsWithThatCommander: true,
      cannotSubtractStockFromPublicTables: true,
      nPreconsWithCommanderIn30d: overlapping.length,
      nWhereStockGamesGeHalfCommanderWindow: highOverlap.length,
      examples: leakage
        .filter((r) => r.precon === "Planeswalker Party" || (r.stockShareOfCommanderWindow ?? 0) >= 0.8)
        .slice(0, 12),
      decision: "Treat LOSO as optimistic. Public tables do not split stock vs upgraded commander games, so we cannot rebuild the prior without the export.",
    },
    c_section6: {
      casualLosoBeatsCommanderOnly: false,
      bridge: {
        pass: false,
        b2n: b2Scores.length,
        b2W: { min: minB2, max: maxB2 },
        b5Scored: b5.sample.length,
        b5W: b5.w,
        fractionB5StrictlyAboveEveryB2: b5.sample.length ? b5AboveAllB2 / b5.sample.length : 0,
        reason: "Casual s is commanderPrior only. Most B5 commanders are missing from the Playgroup 30-day casual table and get the 25% prior, so they land at W≈500 and do not clear the B2 field.",
      },
      monotonicity: mono,
      anchor: {
        medianPreconW: fit.anchors.medianPreconW,
        medianNear2500: Math.abs(fit.anchors.medianPreconW - 500) <= 25,
        planeswalkerParty: fit.anchors.topPlaygroup,
        pwpNear2600: false,
      },
      determinism: "not run — W is unpublished",
    },
  };
  writeJson(join(snap, "fit", "casual-diagnostics-v1.json"), report);
  return report;
}

async function scoreB5Field(
  snap: string,
  cmd: Map<string, { name: string; winRatePct: number | null; games: number | null }>,
  wCmd: number,
  pBar: number,
) {
  const names = await commanderNamesByOracle(snap);
  const path = join(snap, "b5", "b5-identity-sets.jsonl.gz");
  const scores: number[] = [];
  const sample: Array<{ commander: string; W: number }> = [];
  if (!existsSync(path)) return { sample, w: { min: 0, max: 0, mean: 0 } };
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as { commanderOracleIds?: string[] };
    const oid = rec.commanderOracleIds?.[0] ?? "";
    const commander = names.get(oid) ?? "";
    const row = cmd.get(norm(commander));
    const prior = row?.winRatePct != null && row.games != null ? shrink(row.winRatePct / 100, row.games) : PRIOR;
    const p = Math.min(0.6, Math.max(0.05, PRIOR + wCmd * (prior - PRIOR)));
    const W = strengthW(p, pBar);
    scores.push(W);
    if (sample.length < 400 || n % 80 === 0) sample.push({ commander: commander || oid.slice(0, 8), W });
    n += 1;
  }
  scores.sort((a, b) => a - b);
  return {
    sample,
    w: {
      min: scores[0] ?? 0,
      max: scores.at(-1) ?? 0,
      mean: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
      n: scores.length,
    },
  };
}

async function commanderNamesByOracle(snap: string): Promise<Map<string, string>> {
  const path = newestMatching(join(snap, "scryfall"), /^oracle-cards-.*\.jsonl\.gz$/);
  const out = new Map<string, string>();
  if (!path) return out;
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as { oracle_id?: string; name?: string; type_line?: string };
    if (rec.oracle_id && rec.name && /legendary/i.test(rec.type_line ?? "")) out.set(rec.oracle_id, rec.name);
  }
  return out;
}

function monotonicity(
  deck: {
    playgroupName: string;
    commanders: Array<{ name?: string; oracleId?: string | null }>;
    mainboard: Array<{ name?: string; oracleId?: string | null; quantity?: number }>;
  } | undefined,
  scoreName: (commanderName: string) => { p: number; W: number },
  _pBar: number,
  _wCmd: number,
) {
  void familiesFromCardV1_1;
  void loadCommanderGameChangerSnapshot;
  void gameChangerOracleIdSet;
  if (!deck) return { pass: true, note: "no deck" };
  const base = scoreName(deck.commanders[0]?.name ?? "");
  const added = [
    { name: "Cyclonic Rift", role: "removal" },
    { name: "Sol Ring", role: "fast mana" },
    { name: "Rhystic Study", role: "game changer" },
  ].map((card) => ({ ...card, before: base.W, after: scoreName(deck.commanders[0]?.name ?? "").W }));
  const lowered = added.filter((r) => r.after < r.before);
  return {
    pass: lowered.length === 0,
    vacuous: added.every((r) => r.after === r.before),
    baseW: base.W,
    added,
    note: "Current casual weights are commanderPrior-only, so adding a Game Changer, removal, or fast mana leaves W unchanged. That satisfies 'never lowers' but does not show the list is being measured.",
  };
}

if (require.main === module) {
  casualDiagnosticsV1()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
