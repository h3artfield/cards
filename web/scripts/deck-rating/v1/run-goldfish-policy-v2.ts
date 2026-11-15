#!/usr/bin/env npx tsx
/**
 * D1/D2/D3 + field RMST / B5 refs sendback for goldfish policy v2.
 */
import { join } from "node:path";
import { setGoldfishSpellbookIndex, simulateGoldfish } from "../../../src/lib/deck-rating/v1/goldfish-sim-v1";
import { buildSpellbookIndex, deckSatisfiesTemplate, type SpellbookIndex } from "../../../src/lib/deck-rating/v1/goldfish-spellbook-index-v2";
import { OPPONENT_MODEL_NOTES } from "../../../src/lib/deck-rating/v1/goldfish-opponents-v2";
import { snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";
import { loadFrozenGoldfishIndex } from "./load-goldfish-policy-index";
import { b5RefDecks, cardsOf, loadFieldDecks, type FieldDeck } from "./load-field-decks-v2";

const GAMES = Number(process.env.DR_GOLDFISH_GAMES ?? 200);
const B5_SAMPLE = 2000;
const TRACE_SEEDS = [1, 2, 3];

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function d1ForBand(index: SpellbookIndex, decks: FieldDeck[]) {
  const strict: number[] = [];
  const templated: number[] = [];
  let zeroA = 0;
  let zeroB = 0;
  for (const d of decks) {
    const ids = new Set(d.oracleIds);
    let a = 0;
    let b = 0;
    for (const v of index.variants) {
      if (!v.terminal) continue;
      if (!v.uses.every((u) => !u.oracleId || ids.has(u.oracleId))) continue;
      if (v.templateIds.length === 0) a += 1;
      if (v.templateIds.every((tid) => deckSatisfiesTemplate(ids, index.templates.get(tid)))) b += 1;
    }
    strict.push(a);
    templated.push(b);
    if (a === 0) zeroA += 1;
    if (b === 0) zeroB += 1;
  }
  return {
    n: decks.length,
    strict: { mean: mean(strict), median: median(strict), p0: zeroA / Math.max(1, decks.length), max: Math.max(0, ...strict) },
    withTemplates: {
      mean: mean(templated),
      median: median(templated),
      p0: zeroB / Math.max(1, decks.length),
      max: Math.max(0, ...templated),
    },
  };
}

export async function runGoldfishPolicyV2(): Promise<Record<string, unknown>> {
  const started = Date.now();
  const snap = snapshotRoot();
  const fit = join(snap, "fit");
  console.log("loading oracle + frozen spellbook index");
  const oracle = await loadSnapshotOracleNameMap(snap);
  const index = await loadFrozenGoldfishIndex(snap);
  const terminalIndex = buildSpellbookIndex(
    index.variants.filter((v) => v.terminal),
    [...index.templates.values()],
  );
  setGoldfishSpellbookIndex(index);
  const bands = await loadFieldDecks(oracle);
  const b5All = bands.B5 ?? [];
  const b5Field = b5All.slice(0, B5_SAMPLE);
  const refs = b5RefDecks(b5All, 10);

  const d1 = {
    version: "goldfish-policy-v2-d1-v1",
    interpretation:
      "If B5 (a) is 0–1 but (b) is several → templates were the blocker. If (a) is already several → planner is the blocker.",
    B2: d1ForBand(terminalIndex, bands.B2 ?? []),
    B3: d1ForBand(terminalIndex, bands.B3 ?? []),
    B4: d1ForBand(terminalIndex, bands.B4 ?? []),
    B5: d1ForBand(terminalIndex, b5Field),
  };
  const b5A = d1.B5.strict.median ?? 0;
  const b5B = d1.B5.withTemplates.median ?? 0;
  d1.interpretation =
    b5A <= 1 && b5B >= 2
      ? "B5 templates are the blocker (strict 0–1, several with templates)."
      : b5A >= 2
        ? "B5 already has several strict named terminal variants — planner/closure was the remaining blocker before F1–F4."
        : "B5 has few terminal variants even with templates.";
  writeJson(join(fit, "goldfish-policy-v2-d1-v1.json"), d1);
  console.log(`D1 B2 a/b med=${d1.B2.strict.median}/${d1.B2.withTemplates.median}`);
  console.log(`D1 B3 a/b med=${d1.B3.strict.median}/${d1.B3.withTemplates.median}`);
  console.log(`D1 B4 a/b med=${d1.B4.strict.median}/${d1.B4.withTemplates.median}`);
  console.log(`D1 B5 a/b med=${d1.B5.strict.median}/${d1.B5.withTemplates.median} ${d1.interpretation}`);
  if (process.env.DR_POLICY_STAGE === "d1") {
    return { d1, elapsedMs: Date.now() - started };
  }

  const run = (deck: FieldDeck, games = GAMES, traces = 0, seed?: number, diagnostics = false) =>
    simulateGoldfish({
      cards: cardsOf(deck.oracleIds, new Set(deck.commanderIds), oracle),
      games,
      traces,
      seed,
      diagnostics,
      spellbook: index,
    });

  const d2rates: Record<string, number[]> = { B2: [], B3: [], B4: [], B5: [] };
  const d3: Record<string, Array<{ commander: string; mv: number; medianCast: number | null }>> = {
    B2: [],
    B3: [],
    B4: [],
    B5: [],
  };
  const rmst: Record<string, number[]> = { B2: [], B3: [], B4: [], B5: [] };
  const d2FirstMiss: Array<{ commander: string; turn: number | null }> = [];

  const work: Array<[string, FieldDeck[]]> = [
    ["B2", bands.B2 ?? []],
    ["B3", bands.B3 ?? []],
    ["B4", bands.B4 ?? []],
    ["B5", b5Field],
  ];
  for (const [band, decks] of work) {
    console.log(`${band} sims n=${decks.length} games=${GAMES}`);
    const cmdTurns = new Map<string, { mv: number; turns: number[] }>();
    for (const deck of decks) {
      const wantD2 = d2rates[band]!.length < 80;
      const sim = run(deck, GAMES, 0, undefined, wantD2);
      rmst[band]!.push(sim.rmst15);
      if (wantD2) d2rates[band]!.push(sim.missedWinRate ?? 0);
      for (const [name, turns] of Object.entries(sim.commanderFirstCastTurns ?? {})) {
        const card = oracle.byId.get(deck.commanderIds.find((id) => oracle.byId.get(id)?.name === name) ?? "") ?? [
          ...oracle.byName.values(),
        ].find((c) => c.name === name);
        const slot = cmdTurns.get(name) ?? { mv: card?.cmc ?? 99, turns: [] };
        slot.turns.push(...turns);
        cmdTurns.set(name, slot);
      }
      if (rmst[band]!.length % 50 === 0) console.log(`${band} ${rmst[band]!.length}`);
    }
    d3[band] = [...cmdTurns.entries()]
      .map(([commander, v]) => ({ commander, mv: v.mv, medianCast: median(v.turns) }))
      .sort((a, b) => (b.medianCast ?? 0) - (a.medianCast ?? 0));
    console.log(`${band} RMST med=${median(rmst[band]!)} D2 missed=${mean(d2rates[band]!)}`);
  }

  const traces = refs.map((row) => {
    const sim = run(row, GAMES, 0, undefined, true);
    const seedTraces = TRACE_SEEDS.map((seed) => {
      const one = run(row, 1, 1, seed, true);
      const t = one.traces?.[0];
      if ((one.missedWinRate ?? 0) > 0) {
        d2FirstMiss.push({ commander: row.commander, turn: one.firstMissedWinTurns?.[0] ?? t?.tFirst ?? null });
      }
      return { seed, tFirst: t?.tFirst ?? one.p50, line: t?.line, log: (t?.log ?? []).slice(0, 24) };
    });
    return {
      commander: row.commander,
      id: row.id,
      rmst15: sim.rmst15,
      p50: sim.p50,
      pByT4: sim.pByT4,
      pByT6: sim.pByT6,
      coverage: sim.coverage,
      missedWinRate: sim.missedWinRate ?? 0,
      commanderFirstCast: Object.fromEntries(
        Object.entries(sim.commanderFirstCastTurns ?? {}).map(([k, v]) => [k, median(v)]),
      ),
      traces: seedTraces,
    };
  });

  const d2 = {
    version: "goldfish-policy-v2-d2-v1",
    games: GAMES,
    opponentModel: OPPONENT_MODEL_NOTES.opponentModel,
    byBand: {
      B2: { n: d2rates.B2!.length, missedWinRate: mean(d2rates.B2!) },
      B3: { n: d2rates.B3!.length, missedWinRate: mean(d2rates.B3!) },
      B4: { n: d2rates.B4!.length, missedWinRate: mean(d2rates.B4!) },
      B5: { n: d2rates.B5!.length, missedWinRate: mean(d2rates.B5!) },
    },
    b5RefFirstMissedWinTurn: d2FirstMiss,
    sample: "first 80 decks/band at 200 games with end-of-turn resolveWin; field RMST uses the full band",
  };
  writeJson(join(fit, "goldfish-policy-v2-d2-v1.json"), d2);

  const cheapB5 = (d3.B5 ?? []).filter((r) => r.mv <= 3 && (r.medianCast ?? 0) >= 4);
  const d3art = {
    version: "goldfish-policy-v2-d3-v1",
    byBand: {
      B2: d3.B2?.slice(0, 20),
      B3: d3.B3?.slice(0, 20),
      B4: d3.B4?.slice(0, 20),
      B5: d3.B5?.slice(0, 30),
    },
    b5CheapCommandersLate: cheapB5,
    note: "Any B5 commander MV≤3 with median first cast ≥4 is a policy bug.",
  };
  writeJson(join(fit, "goldfish-policy-v2-d3-v1.json"), d3art);

  const field = {
    B2: { n: rmst.B2!.length, mean: mean(rmst.B2!), median: median(rmst.B2!) },
    B3: { n: rmst.B3!.length, mean: mean(rmst.B3!), median: median(rmst.B3!) },
    B4: { n: rmst.B4!.length, mean: mean(rmst.B4!), median: median(rmst.B4!) },
    B5: { n: rmst.B5!.length, mean: mean(rmst.B5!), median: median(rmst.B5!) },
    b5MinusB4:
      median(rmst.B5!) != null && median(rmst.B4!) != null ? median(rmst.B5!)! - median(rmst.B4!)! : null,
    refOutside35to55: traces.filter((t) => t.rmst15 < 3 || t.rmst15 > 5.5).map((t) => t.commander),
  };
  const d2Near0 = (d2.byBand.B5.missedWinRate ?? 1) <= 0.05;
  const refsIn = field.refOutside35to55.length === 0;
  const order =
    (field.B5.median ?? 99) < (field.B4.median ?? 0) &&
    (field.B4.median ?? 99) < (field.B3.median ?? 0) &&
    (field.B3.median ?? 99) < (field.B2.median ?? 0);
  const gap = field.b5MinusB4 != null ? -field.b5MinusB4 : 0;
  const preconOk = (field.B2.median ?? 0) >= 8 && (field.B2.median ?? 99) <= 10;
  const go = refsIn && order && gap >= 1.5 && preconOk;
  const stop = !refsIn && d2Near0;
  const sendback = {
    version: "goldfish-sendback-policy-v2",
    games: GAMES,
    opponentModel: OPPONENT_MODEL_NOTES,
    elapsedMs: Date.now() - started,
    d1,
    d2,
    d3: d3art,
    fieldRmst15: field,
    b5References: traces,
    refsInside35to55: refsIn,
    gate: {
      refsInRange: refsIn,
      strictOrderB5ltB4ltB3ltB2: order,
      b5AtLeast1_5FasterThanB4: gap >= 1.5,
      b5MinusB4: field.b5MinusB4,
      precons8to10: preconOk,
      d2Near0,
      verdict: go ? "GO" : stop ? "STOP-draw-density" : "STOP-policy-or-gap",
    },
    implemented: ["F1", "F2", "F3", "F4", "F5"],
    deferred: [],
  };
  writeJson(join(fit, "goldfish-sendback-policy-v2.json"), sendback);
  return {
    dest: join(fit, "goldfish-sendback-policy-v2.json"),
    field,
    d1: { B5: d1.B5, interpretation: d1.interpretation },
    d2: d2.byBand,
    refs: traces.map((t) => ({ commander: t.commander, rmst15: t.rmst15, p50: t.p50 })),
    gate: sendback.gate,
  };
}

if (require.main === module) {
  runGoldfishPolicyV2()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
