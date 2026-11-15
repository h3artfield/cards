#!/usr/bin/env npx tsx
/**
 * Goldfish policy v2.2 mid-point sendback: single-source distance (evaluateWin),
 * invariants (a)/(b) every turn, B5 reachable-only field, fixed-hand
 * missed-win scenarios, B5 publish decision rule.
 *
 * DR_POLICY_STAGE=shard DR_SHARD=k/N  → fit/_v22-shards/shard-k-of-N.json
 * DR_POLICY_STAGE=merge DR_SHARDS=N    → sendback + invariants + reachability + decision rule
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setGoldfishSpellbookIndex, simulateGoldfish, type GoldfishInvariantReport } from "../../../src/lib/deck-rating/v1/goldfish-sim-v1";
import { deckWinReachable } from "../../../src/lib/deck-rating/v1/goldfish-b5-reachability-v2-2";
import { runMissedWinScenarioFixtures, type MissedWinFixture } from "../../../src/lib/deck-rating/v1/goldfish-missed-win-scenarios-v2-2";
import { OPPONENT_MODEL_NOTES } from "../../../src/lib/deck-rating/v1/goldfish-opponents-v2";
import { DR_W_PUBLISH_CEDH, DR_W_WITHHELD_NO_REACHABLE_WIN } from "../../../src/lib/deck-rating/v1/publish";
import type { MissedWinReason } from "../../../src/lib/deck-rating/v1/goldfish-resource-graph-v2";
import { snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";
import { loadFrozenGoldfishIndex } from "./load-goldfish-policy-index";
import { cardsOf, loadFieldDecks, b5RefDecks, type FieldDeck } from "./load-field-decks-v2";

const GAMES = Number(process.env.DR_GOLDFISH_GAMES ?? 200);
const B5_SAMPLE = 2000;
const D2_FIRST_N = 80;
const TRACE_SEEDS = [1, 2, 3];
const REF_RANGE: [number, number] = [3, 5.5];
const REF_NAMES = [
  "Kraum, Ludevic's Opus / Tymna the Weaver",
  "Kinnan, Bonder Prodigy",
  "Rograkh, Son of Rohgahh / Thrasios, Triton Hero",
  "Rograkh, Son of Rohgahh / Silas Renn, Seeker Adept",
  "Sisay, Weatherlight Captain",
  "Thrasios, Triton Hero / Tymna the Weaver",
  "Etali, Primal Conqueror // Etali, Primal Sickness",
  "Ral, Monsoon Mage // Ral, Leyline Prodigy",
  "Dargo, the Shipwrecker / Tymna the Weaver",
  "Kefka, Court Mage // Kefka, Ruler of Ruin",
];
const BANDS = ["B2", "B3", "B4", "B5"] as const;
type Band = (typeof BANDS)[number];

type DeckRow = {
  band: Band;
  idx: number;
  id: string;
  commander: string;
  rmst15: number;
  iqr: number;
  p50: number;
  pByT4: number;
  pByT6: number;
  reachable: boolean;
  reachLine: string | null;
  missedWinRate: number;
  reasons: Record<MissedWinReason, number>;
  inv: Omit<GoldfishInvariantReport, "examples">;
  invExamples: GoldfishInvariantReport["examples"];
};

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function emptyReasons(): Record<MissedWinReason, number> {
  return { timing: 0, colors: 0, sequencing: 0, other: 0 };
}

function pickRefs(allB5: FieldDeck[]): FieldDeck[] {
  const byCmd = new Map<string, FieldDeck[]>();
  for (const row of allB5) {
    const list = byCmd.get(row.commander) ?? [];
    list.push(row);
    byCmd.set(row.commander, list);
  }
  const out: FieldDeck[] = [];
  for (const name of REF_NAMES) {
    const list = byCmd.get(name);
    if (list?.[0]) out.push(list[0]);
  }
  if (out.length < 10) {
    for (const row of b5RefDecks(allB5, 10)) {
      if (!out.some((r) => r.commander === row.commander)) out.push(row);
      if (out.length >= 10) break;
    }
  }
  return out.slice(0, 10);
}

async function load() {
  const snap = snapshotRoot();
  const oracle = await loadSnapshotOracleNameMap(snap);
  const index = await loadFrozenGoldfishIndex(snap);
  setGoldfishSpellbookIndex(index);
  const bands = await loadFieldDecks(oracle);
  const work: Record<Band, FieldDeck[]> = {
    B2: bands.B2 ?? [],
    B3: bands.B3 ?? [],
    B4: bands.B4 ?? [],
    B5: (bands.B5 ?? []).slice(0, B5_SAMPLE),
  };
  return { snap, oracle, index, allB5: bands.B5 ?? [], work };
}

async function runShard(k: number, n: number) {
  const started = Date.now();
  const { snap, oracle, index, work } = await load();
  const rows: DeckRow[] = [];
  let g = 0;
  const total = BANDS.reduce((s, b) => s + work[b].length, 0);
  for (const band of BANDS) {
    for (let idx = 0; idx < work[band].length; idx += 1) {
      const mine = g % n === k;
      g += 1;
      if (!mine) continue;
      const deck = work[band][idx]!;
      const cards = cardsOf(deck.oracleIds, new Set(deck.commanderIds), oracle);
      const reach = deckWinReachable(cards, index);
      const sim = simulateGoldfish({
        cards,
        games: GAMES,
        diagnostics: true,
        spellbook: index,
        invariants: true,
        deckId: `${band}:${deck.id}`,
        invariantExamples: 2,
      });
      const inv = sim.invariants!;
      rows.push({
        band,
        idx,
        id: deck.id,
        commander: deck.commander,
        rmst15: sim.rmst15,
        iqr: sim.iqr,
        p50: sim.p50,
        pByT4: sim.pByT4,
        pByT6: sim.pByT6,
        reachable: reach.win,
        reachLine: reach.line,
        missedWinRate: sim.missedWinRate ?? 0,
        reasons: sim.missedWinReasons ?? emptyReasons(),
        inv: { checks: inv.checks, a: inv.a, b: inv.b, unbackedWinText: inv.unbackedWinText },
        invExamples: inv.examples,
      });
      if (rows.length % 25 === 0) {
        const el = (Date.now() - started) / 1000;
        console.log(`shard ${k}/${n} ${rows.length}/${Math.ceil(total / n)} ${el.toFixed(0)}s last=${band}:${deck.commander}`);
      }
    }
  }
  const dir = join(snap, "fit", "_v22-shards");
  mkdirSync(dir, { recursive: true });
  const out = join(dir, `shard-${k}-of-${n}.json`);
  writeFileSync(out, JSON.stringify({ k, n, games: GAMES, elapsedMs: Date.now() - started, rows }));
  console.log(`shard ${k}/${n} done rows=${rows.length} → ${out}`);
}

async function runMerge(n: number) {
  const started = Date.now();
  const { snap, oracle, index, allB5, work } = await load();
  const fit = join(snap, "fit");
  const rows: DeckRow[] = [];
  let shardMs = 0;
  for (let k = 0; k < n; k += 1) {
    const p = join(fit, "_v22-shards", `shard-${k}-of-${n}.json`);
    if (!existsSync(p)) throw new Error(`missing shard ${p}`);
    const s = JSON.parse(readFileSync(p, "utf8")) as { rows: DeckRow[]; elapsedMs: number };
    rows.push(...s.rows);
    shardMs = Math.max(shardMs, s.elapsedMs);
  }
  const by = (band: Band) => rows.filter((r) => r.band === band).sort((a, b) => a.idx - b.idx);
  for (const band of BANDS) {
    if (by(band).length !== work[band].length) throw new Error(`${band} rows ${by(band).length} != ${work[band].length}`);
  }

  const reachability = {
    version: "goldfish-reachability-v2-2",
    interpretation: "All cards + commanders available, unlimited finite mana (99, 20 of each color), resolveWin (v2.2 evaluateWin) finds a lethal plan.",
    recomputedBecause: "resolver changed in v2.2 (single casting price, focused re-check of the closest line)",
    byBand: Object.fromEntries(
      BANDS.map((b) => {
        const xs = by(b);
        const un = xs.filter((r) => !r.reachable).length;
        return [b, { n: xs.length, unreachable: un, share: un / Math.max(1, xs.length) }];
      }),
    ),
    top20B5CommandersUnreachable: [...by("B5").filter((r) => !r.reachable).reduce((m, r) => m.set(r.commander, (m.get(r.commander) ?? 0) + 1), new Map<string, number>())]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([commander, unreachableDecks]) => ({ commander, unreachableDecks })),
    appliesTo: "B5 field statistics only. B2–B4 are fair/combat decks where 'no reachable combo win' is normal; their combat clock stays valid and they are not excluded.",
  };
  writeJson(join(fit, "goldfish-reachability-v2-2.json"), reachability);

  const d2 = Object.fromEntries(
    BANDS.map((b) => {
      const xs = by(b);
      const first = xs.slice(0, D2_FIRST_N);
      const reasons = emptyReasons();
      for (const r of first) for (const [k, v] of Object.entries(r.reasons)) reasons[k as MissedWinReason] += v;
      const reasonsAll = emptyReasons();
      for (const r of xs) for (const [k, v] of Object.entries(r.reasons)) reasonsAll[k as MissedWinReason] += v;
      return [
        b,
        {
          n: first.length,
          missedWinRate: mean(first.map((r) => r.missedWinRate)),
          reasons,
          allDecks: { n: xs.length, missedWinRate: mean(xs.map((r) => r.missedWinRate)), reasons: reasonsAll },
        },
      ];
    }),
  );

  const invByBand = Object.fromEntries(
    BANDS.map((b) => {
      const xs = by(b);
      const sum = (f: (r: DeckRow) => number) => xs.reduce((s, r) => s + f(r), 0);
      const ex = (kind: "a" | "b") => xs.flatMap((r) => r.invExamples.filter((e) => e.kind === kind)).slice(0, 5);
      return [
        b,
        {
          decks: xs.length,
          games: xs.length * GAMES,
          checks: sum((r) => r.inv.checks),
          a: sum((r) => r.inv.a),
          b: sum((r) => r.inv.b),
          decksWithA: xs.filter((r) => r.inv.a > 0).length,
          decksWithB: xs.filter((r) => r.inv.b > 0).length,
          unbackedWinText: sum((r) => r.inv.unbackedWinText),
          examplesA: ex("a"),
          examplesB: ex("b"),
        },
      ];
    }),
  );

  const stats = (xs: DeckRow[]) => ({ n: xs.length, mean: mean(xs.map((r) => r.rmst15)), median: median(xs.map((r) => r.rmst15)) });
  const b5All = by("B5");
  const b5Reach = b5All.filter((r) => r.reachable);
  const field = {
    B2: stats(by("B2")),
    B3: stats(by("B3")),
    B4: stats(by("B4")),
    B5: { ...stats(b5Reach), field: "reachable-only", nExcludedUnreachable: b5All.length - b5Reach.length },
    B5AllForReference: stats(b5All),
    note: "B5 field = reachable-only (no reachable win line → excluded, like low coverage). B2–B4 include all decks: combat clock is valid for fair decks.",
  };
  const b4 = field.B4.mean;
  const b5 = field.B5.mean;
  const gap = b4 != null && b5 != null ? b4 - b5 : null;

  const refs = pickRefs(allB5);
  const refRows = refs.map((row) => {
    const cards = cardsOf(row.oracleIds, new Set(row.commanderIds), oracle);
    const reach = deckWinReachable(cards, index);
    const sim = simulateGoldfish({ cards, games: GAMES, diagnostics: true, spellbook: index, invariants: true, deckId: `REF:${row.id}` });
    const traces = TRACE_SEEDS.map((seed) => {
      const one = simulateGoldfish({ cards, games: 1, traces: 1, seed, diagnostics: true, spellbook: index, invariants: true, deckId: `REF:${row.id}` });
      const t = one.traces?.[0];
      return { seed, tFirst: t?.tFirst ?? null, line: t?.line ?? null, log: t?.log ?? [] };
    });
    const r = sim.rmst15;
    return {
      commander: row.commander,
      id: row.id,
      rmst15: r,
      p50: sim.p50,
      pByT4: sim.pByT4,
      pByT6: sim.pByT6,
      missedWinRate: sim.missedWinRate ?? 0,
      missedWinReasons: sim.missedWinReasons,
      reachable: reach.win,
      reachLine: reach.line,
      inRange3to5_5: r >= REF_RANGE[0] && r <= REF_RANGE[1],
      invariants: { a: sim.invariants?.a ?? 0, b: sim.invariants?.b ?? 0, checks: sim.invariants?.checks ?? 0 },
      traces,
    };
  });
  const refsInRange = refRows.filter((r) => r.inRange3to5_5).length;

  const fxPath = join(__dirname, "../../../src/lib/deck-rating/v1/fixtures/goldfish-missed-win-scenarios-v2-2.json");
  const scenarioResults = existsSync(fxPath)
    ? runMissedWinScenarioFixtures(JSON.parse(readFileSync(fxPath, "utf8")) as MissedWinFixture)
    : [];

  const gapOk = gap != null && gap >= 1.5;
  const refsOk = refsInRange >= 8;
  const failed: string[] = [];
  if (!gapOk) failed.push(`B4−B5 mean gap ${gap?.toFixed(3)} < 1.5`);
  if (!refsOk) failed.push(`refs in [3, 5.5] ${refsInRange}/10 < 8`);
  const decisionRule = {
    version: "goldfish-b5-publish-decision-rule-v1",
    agreedBefore: "v2.2 mid-point results (pre-agreed)",
    rule: [
      { if: "gap ≥ 1.5 AND ≥ 8/10 refs in range", then: "publish B5 on production" },
      { if: "otherwise", then: "one more week, focused only on the missing refs via traces" },
      { if: "still failing after that week", then: "B5 stays unpublished; report which assumption failed (the ref range or the engine)" },
    ],
    definitions: {
      gap: "field RMST15 mean B4 − B5, B5 field reachable-only, 200 games/deck",
      refRange: "RMST15 in [3, 5.5] for the 10 named B5 reference decks",
      refs: REF_NAMES,
    },
    evaluation: {
      stage: "mid-point (policy v2.2)",
      gap,
      gapOk,
      refsInRange,
      refsOk,
      refsOutOfRange: refRows.filter((r) => !r.inRange3to5_5).map((r) => ({ commander: r.commander, rmst15: r.rmst15, reachable: r.reachable })),
      failed,
      verdict: gapOk && refsOk ? "publish B5 on production" : "one more week, focused only on the missing refs via traces",
      publishFlagChanged: false,
      DR_W_PUBLISH_CEDH,
    },
  };
  writeJson(join(fit, "goldfish-b5-publish-decision-rule-v1.json"), decisionRule);

  const invariants = {
    version: "goldfish-invariants-v2-2",
    definitions: {
      a: "distance == 0 ⇔ resolveWin returns a plan (distance = missing pieces + ceil(manaShort / mana per turn) + timingBlocked, all from evaluateWin's closest line); checked at the start and end of every simulated turn",
      b: "never end a turn holding a castable tutor that can legally fetch (type + destination) a missing piece of the target line; checked at end of turn",
      unbackedWinText: "win-text card cast with no resolver plan (v2.1 scored each as a win; v2.2 does not)",
      traceId: "deck=<band>:<deckId> seed=<sim seed> game=<index> T<turn>",
    },
    games: GAMES,
    byBand: invByBand,
    refs: refRows.map((r) => ({ commander: r.commander, ...r.invariants })),
    scenarios: {
      n: scenarioResults.length,
      a: scenarioResults.reduce((s, r) => s + r.invariantA, 0),
      b: scenarioResults.reduce((s, r) => s + r.invariantB, 0),
    },
  };
  writeJson(join(fit, "goldfish-invariants-v2-2.json"), invariants);

  const ral = refRows.find((r) => /^Ral/.test(r.commander));
  const kefka = refRows.find((r) => /^Kefka/.test(r.commander));
  const sendback = {
    version: "goldfish-sendback-policy-v2-2",
    games: GAMES,
    opponentModel: OPPONENT_MODEL_NOTES,
    elapsedMs: { merge: Date.now() - started, slowestShard: shardMs },
    changes: [
      "evaluateWin: one fixed point returns a plan or the closest line {missingPieces, manaShort, timingBlocked}; distance derives only from it (distanceToLine deleted)",
      "resolver + executor share one casting price (each card cast once; converter pieces from hand are paid); executor pays plan.manaSpent instead of re-pricing steps",
      "tutors fetch only pieces they can legally find (type restriction, destination, piece in library); legal-fetch tutors are cast first",
      "Oracle/Consult/Pact are not cast outside a resolver plan; combo instants/sorceries are held",
      "win-text cards are not wins without a resolver plan (counted as unbackedWinText)",
      "opening battlefield lands no longer double-count as rocks",
      "invariants (a)/(b) every turn (simulateGoldfish invariants option / DR_GOLDFISH_INVARIANTS=1)",
      "B5 field reachable-only; B5 decks with no reachable win withhold W (publish.ts: display 5··· + reason)",
    ],
    d2: {
      byBand: d2,
      sample: `first ${D2_FIRST_N} decks/band (v2.1-comparable) plus allDecks`,
      definitionChange:
        "missed-win is checked at the end of our turn (before opponent-turn draws), not after them; the executor pays the resolver's plan price, so re-pricing 'sequencing' misses cannot occur",
    },
    invariantsRun1BeforeColorFix: "goldfish-invariants-v2-2-run1-before-color-fix.json (same engine minus the color-blind focused re-check; all (a) were resolver-rejected closest lines)",
    invariants: { byBand: Object.fromEntries(BANDS.map((b) => [b, { a: invByBand[b]!.a, b: invByBand[b]!.b, checks: invByBand[b]!.checks, decksWithA: invByBand[b]!.decksWithA, decksWithB: invByBand[b]!.decksWithB, unbackedWinText: invByBand[b]!.unbackedWinText, examplesA: invByBand[b]!.examplesA.slice(0, 3).map((e) => e.traceId), examplesB: invByBand[b]!.examplesB.slice(0, 3).map((e) => e.traceId) }])) },
    fieldRmst15: field,
    b5MinusB4Mean: gap != null ? -gap : null,
    b5FasterThanB4: gap,
    b5References: refRows.map(({ traces, ...r }) => r),
    refsInRange3to5_5: refsInRange,
    reachability: reachability.byBand,
    withheld: { rule: "B5 deck with no reachable win → W withheld", display: "5···", reason: DR_W_WITHHELD_NO_REACHABLE_WIN },
    scenarios: {
      prior: "41/41 unit scenarios (36 v2.1 + 5 v2.2) — see goldfish-sim-v1.selftest",
      missedWinFixtures: {
        n: scenarioResults.length,
        passed: scenarioResults.filter((r) => r.ok).length,
        results: scenarioResults.map((r) => ({ id: r.id, v21Kind: r.v21Kind, ok: r.ok, tWin: r.tWin, line: r.line, a: r.invariantA, b: r.invariantB })),
      },
    },
    annotatedRalTraces: ral?.traces ?? [],
    annotatedKefkaTraces: kefka?.traces ?? [],
    traceLegend: "per turn: target=<closest line> dist missing short need=[piece@zone] from evaluateWin; wins log plan line, spent and token provenance",
    gate1: { gap, gapOk, refsInRange, refsOk, pass: gapOk && refsOk },
    decisionRuleVerdict: decisionRule.evaluation.verdict,
  };
  writeJson(join(fit, "goldfish-sendback-policy-v2-2.json"), sendback);
  console.log(
    JSON.stringify(
      {
        d2: Object.fromEntries(BANDS.map((b) => [b, { first80: d2[b]!.missedWinRate, reasons: d2[b]!.reasons, all: d2[b]!.allDecks.missedWinRate }])),
        invariants: sendback.invariants.byBand,
        field,
        gap,
        refs: refRows.map((r) => ({ c: r.commander, rmst15: r.rmst15, p50: r.p50, pByT4: r.pByT4, pByT6: r.pByT6, missed: r.missedWinRate, reachable: r.reachable })),
        refsInRange,
        scenarios: `${scenarioResults.filter((r) => r.ok).length}/${scenarioResults.length}`,
        verdict: decisionRule.evaluation.verdict,
      },
      null,
      1,
    ),
  );
}

async function main() {
  const stage = process.env.DR_POLICY_STAGE ?? "shard";
  if (stage === "shard") {
    const [k, n] = (process.env.DR_SHARD ?? "0/1").split("/").map(Number);
    await runShard(k!, n!);
  } else if (stage === "merge") {
    await runMerge(Number(process.env.DR_SHARDS ?? 1));
  } else {
    throw new Error(`unknown DR_POLICY_STAGE ${stage}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
