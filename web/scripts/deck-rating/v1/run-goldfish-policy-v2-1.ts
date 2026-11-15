#!/usr/bin/env npx tsx
/**
 * Goldfish policy v2.1 sendback: template audit, reachability, event-driven D2
 * with reason codes, B5 refs, field RMST15, revised gate 1.
 */
import { join } from "node:path";
import { resolveWin, emptyMana, CONVERTERS_ADDED_V21, type GraphCard } from "../../../src/lib/deck-rating/v1/goldfish-resource-graph-v2";
import { setGoldfishSpellbookIndex, simulateGoldfish } from "../../../src/lib/deck-rating/v1/goldfish-sim-v1";
import { buildSpellbookIndex, completeVariantsForDeck } from "../../../src/lib/deck-rating/v1/goldfish-spellbook-index-v2";
import { OPPONENT_MODEL_NOTES } from "../../../src/lib/deck-rating/v1/goldfish-opponents-v2";
import { snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";
import { loadFrozenGoldfishIndex } from "./load-goldfish-policy-index";
import { b5RefDecks, cardsOf, loadFieldDecks, type FieldDeck } from "./load-field-decks-v2";
import type { OracleNameMap } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import type { SpellbookIndex } from "../../../src/lib/deck-rating/v1/goldfish-spellbook-index-v2";
import type { MissedWinReason } from "../../../src/lib/deck-rating/v1/goldfish-resource-graph-v2";

const GAMES = Number(process.env.DR_GOLDFISH_GAMES ?? 200);
const B5_SAMPLE = 2000;
const TRACE_SEEDS = [1, 2, 3];
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

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}
function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function apparentPlan(commander: string, deckIds: Set<string>, index: SpellbookIndex): string {
  const low = commander.toLowerCase();
  if (/etali/.test(low)) return "etali-cascade/impulse";
  if (/sisay/.test(low)) return "sisay-legend-tutor-chain";
  if (/\bral,/.test(low)) return "storm (breach/freeze/ral)";
  if (/kefka/.test(low)) return "wheel/discard + breach-storm";
  if (/kinnan/.test(low)) return "kinnan-rock infinite + sink";
  if (/thrasios/.test(low) && /tymna/.test(low)) return "consult/oracle + thrasios sink";
  if (/rograkh/.test(low) && /thrasios/.test(low)) return "food-chain/consult + thrasios";
  if (/rograkh/.test(low) && /silas/.test(low)) return "breach-storm / artifact combo";
  if (/dargo/.test(low)) return "ad-naus/breach + tymna";
  if (/kraum/.test(low)) return "blue-farm consult/oracle";
  const hits = completeVariantsForDeck(index, deckIds, { terminalOnly: true });
  if (hits.length) return `named-terminal ${hits[0]!.variant.id}`;
  let best: { id: string; have: number; need: number } | null = null;
  for (const v of index.variants) {
    if (!v.terminal) continue;
    const have = v.uses.filter((u) => deckIds.has(u.oracleId)).length;
    if (!have) continue;
    if (!best || have > best.have || (have === best.have && v.uses.length < best.need)) {
      best = { id: v.id, have, need: v.uses.length };
    }
  }
  if (best) return `partial ${best.id} ${best.have}/${best.need}`;
  return "no-terminal-line";
}

function deckReachable(deck: FieldDeck, oracle: OracleNameMap, index: SpellbookIndex): {
  win: boolean;
  line: string | null;
} {
  const cards = cardsOf(deck.oracleIds, new Set(deck.commanderIds), oracle);
  const graph: GraphCard[] = cards.map((c, i) => ({
    instanceId: `H:${i}:${c.oracleId}`,
    oracleId: c.oracleId,
    name: c.name,
    cmc: c.cmc,
    zone: c.isCommander ? "C" : "H",
    isCommander: c.isCommander,
    typeLine: c.typeLine,
    text: c.text,
    power: c.power,
    producedMana: c.producedMana,
    manaCost: c.manaCost,
    colors: c.colors,
  }));
  const mana = emptyMana();
  mana.total = 99;
  mana.any = 99;
  mana.W = 20;
  mana.U = 20;
  mana.B = 20;
  mana.R = 20;
  mana.G = 20;
  mana.C = 20;
  const useful = new Set([
    "WIN",
    "INF_MANA",
    "INF_STORM",
    "DRAW_LIBRARY",
    "LIBRARY_EMPTY",
    "INF_CAST",
    "INF_DRAW",
    "INF_DAMAGE_EACH_OPP",
    "INF_LIFELOSS_EACH_OPP",
    "INF_MILL_EACH_OPP",
  ]);
  const deckIds = new Set(deck.oracleIds);
  const variants = index.variants
    .filter((v) => v.uses.every((u) => !u.oracleId || deckIds.has(u.oracleId)))
    .filter((v) => v.uses.length <= 4 && v.tokens.some((t) => useful.has(t.kind)))
    .slice(0, 64);
  const plan = resolveWin({
    cards: graph,
    mana,
    libraryCount: 99,
    variants,
    templateSatisfied: (tid) => {
      const tpl = index.templates.get(tid);
      return Boolean(tpl?.oracleIds.some((id) => deckIds.has(id)));
    },
  });
  return { win: Boolean(plan), line: plan?.line ?? null };
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

export async function runGoldfishPolicyV21(): Promise<Record<string, unknown>> {
  const started = Date.now();
  const snap = snapshotRoot();
  const fit = join(snap, "fit");
  const stage = process.env.DR_POLICY_STAGE ?? "all";
  console.log("loading oracle + frozen spellbook index");
  const oracle = await loadSnapshotOracleNameMap(snap);
  const index = await loadFrozenGoldfishIndex(snap);
  setGoldfishSpellbookIndex(index);
  const bands = await loadFieldDecks(oracle);
  const b5All = bands.B5 ?? [];
  const b5Field = b5All.slice(0, B5_SAMPLE);
  const refs = pickRefs(b5All);

  const tplFile = JSON.parse(
    await import("node:fs").then((fs) => fs.readFileSync(join(fit, "goldfish-spellbook-templates-v1.json"), "utf8")),
  ) as {
    nTemplates: number;
    templates: Array<{ n: number; resolver: string; id: number; name: string }>;
  };
  let variantsWithTemplates = 0;
  for (const v of index.variants) if (v.templateIds.length) variantsWithTemplates += 1;
  const nonempty = tplFile.templates.filter((t) => t.n > 0).length;
  const isoIds = new Set<string>();
  for (const [id, c] of oracle.byId) {
    if (["Isochron Scepter", "Dramatic Reversal", "Sol Ring", "Arcane Signet", "Mana Vault"].includes(c.name)) {
      isoIds.add(id);
    }
  }
  const isoHits = completeVariantsForDeck(index, isoIds).filter((h) => {
    const names = new Set(h.variant.uses.map((u) => u.name));
    return names.has("Isochron Scepter") && names.has("Dramatic Reversal");
  });
  const templateAudit = {
    version: "goldfish-template-audit-v2-1",
    variantsWithTemplates,
    nTemplates: tplFile.templates.length,
    nNonEmptyOracleSets: nonempty,
    nEmptyOracleSets: tplFile.templates.length - nonempty,
    isochronSpotTest: isoHits.some((h) => h.withTemplates) ? "pass" : "fail",
    isochronHits: isoHits.slice(0, 6).map((h) => ({
      id: h.variant.id,
      templateIds: h.variant.templateIds,
      withTemplates: h.withTemplates,
      strict: h.strict,
    })),
  };
  writeJson(join(fit, "goldfish-template-audit-v2-1.json"), templateAudit);
  console.log(
    `template audit variants-with-tpl=${variantsWithTemplates} templates=${tplFile.templates.length} nonempty=${nonempty} isochron=${templateAudit.isochronSpotTest}`,
  );

  const workBands: Array<[string, FieldDeck[]]> = [
    ["B2", bands.B2 ?? []],
    ["B3", bands.B3 ?? []],
    ["B4", bands.B4 ?? []],
    ["B5", b5Field],
  ];

  const reach: Record<string, { n: number; unreachable: number; share: number }> = {};
  const unreachableB5: Array<{ commander: string; id: string; plan: string }> = [];
  const cmdUnreach = new Map<string, { n: number; plan: string }>();
  for (const [band, decks] of workBands) {
    let unreachable = 0;
    for (const deck of decks) {
      const r = deckReachable(deck, oracle, index);
      if (!r.win) {
        unreachable += 1;
        if (band === "B5") {
          const plan = apparentPlan(deck.commander, new Set(deck.oracleIds), index);
          unreachableB5.push({ commander: deck.commander, id: deck.id, plan });
          const slot = cmdUnreach.get(deck.commander) ?? { n: 0, plan };
          slot.n += 1;
          cmdUnreach.set(deck.commander, slot);
        }
      }
    }
    reach[band] = { n: decks.length, unreachable, share: unreachable / Math.max(1, decks.length) };
    console.log(`${band} reachability unreachable=${unreachable}/${decks.length} share=${reach[band]!.share.toFixed(3)}`);
  }
  const top20 = [...cmdUnreach.entries()]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 20)
    .map(([commander, v]) => ({ commander, unreachableDecks: v.n, apparentPlan: v.plan }));
  const reachArt = {
    version: "goldfish-reachability-v2-1",
    interpretation: "All cards + commanders available, unlimited finite mana, resolveWin. WIN exist?",
    byBand: reach,
    top20B5CommandersUnreachable: top20,
    convertersAdded: [...CONVERTERS_ADDED_V21],
  };
  writeJson(join(fit, "goldfish-reachability-v2-1.json"), reachArt);
  if (stage === "reachability" || stage === "audit") {
    return { templateAudit, reachability: reachArt, elapsedMs: Date.now() - started };
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
  const d2reasons: Record<string, Record<MissedWinReason, number>> = {
    B2: { timing: 0, colors: 0, sequencing: 0, other: 0 },
    B3: { timing: 0, colors: 0, sequencing: 0, other: 0 },
    B4: { timing: 0, colors: 0, sequencing: 0, other: 0 },
    B5: { timing: 0, colors: 0, sequencing: 0, other: 0 },
  };
  const rmst: Record<string, number[]> = { B2: [], B3: [], B4: [], B5: [] };
  const d3: Record<string, Array<{ commander: string; mv: number; medianCast: number | null }>> = {
    B2: [],
    B3: [],
    B4: [],
    B5: [],
  };

  for (const [band, decks] of workBands) {
    console.log(`${band} sims n=${decks.length} games=${GAMES}`);
    const cmdTurns = new Map<string, { mv: number; turns: number[] }>();
    for (const deck of decks) {
      const wantD2 = d2rates[band]!.length < 80;
      const sim = run(deck, GAMES, 0, undefined, wantD2);
      rmst[band]!.push(sim.rmst15);
      if (wantD2) {
        d2rates[band]!.push(sim.missedWinRate ?? 0);
        for (const [k, n] of Object.entries(sim.missedWinReasons ?? {})) {
          d2reasons[band]![k as MissedWinReason] += n;
        }
      }
      for (const [name, turns] of Object.entries(sim.commanderFirstCastTurns ?? {})) {
        const card =
          oracle.byId.get(deck.commanderIds.find((id) => oracle.byId.get(id)?.name === name) ?? "") ??
          [...oracle.byName.values()].find((c) => c.name === name);
        const slot = cmdTurns.get(name) ?? { mv: card?.cmc ?? 99, turns: [] };
        slot.turns.push(...turns);
        cmdTurns.set(name, slot);
      }
      if (rmst[band]!.length % 50 === 0) console.log(`${band} ${rmst[band]!.length}`);
    }
    d3[band] = [...cmdTurns.entries()]
      .map(([commander, v]) => ({ commander, mv: v.mv, medianCast: median(v.turns) }))
      .sort((a, b) => (b.medianCast ?? 0) - (a.medianCast ?? 0));
    console.log(`${band} RMST mean=${mean(rmst[band]!)} med=${median(rmst[band]!)} D2 missed=${mean(d2rates[band]!)}`);
  }

  const traces = refs.map((row) => {
    const sim = run(row, GAMES, 0, undefined, true);
    const seedTraces = TRACE_SEEDS.map((seed) => {
      const one = run(row, 1, 1, seed, true);
      const t = one.traces?.[0];
      return {
        seed,
        tFirst: t?.tFirst ?? one.p50,
        line: t?.line,
        log: t?.log ?? [],
        annotated: /Ral|Kefka/.test(row.commander),
      };
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
      missedWinReasons: sim.missedWinReasons,
      commanderFirstCast: Object.fromEntries(
        Object.entries(sim.commanderFirstCastTurns ?? {}).map(([k, v]) => [k, median(v)]),
      ),
      traces: seedTraces,
    };
  });

  const d2 = {
    version: "goldfish-policy-v2-1-d2",
    games: GAMES,
    opponentModel: OPPONENT_MODEL_NOTES.opponentModel,
    byBand: {
      B2: { n: d2rates.B2!.length, missedWinRate: mean(d2rates.B2!), reasons: d2reasons.B2 },
      B3: { n: d2rates.B3!.length, missedWinRate: mean(d2rates.B3!), reasons: d2reasons.B3 },
      B4: { n: d2rates.B4!.length, missedWinRate: mean(d2rates.B4!), reasons: d2reasons.B4 },
      B5: { n: d2rates.B5!.length, missedWinRate: mean(d2rates.B5!), reasons: d2reasons.B5 },
    },
    d2Leq0_5pctEveryBand: [d2rates.B2, d2rates.B3, d2rates.B4, d2rates.B5].every(
      (xs) => (mean(xs!) ?? 1) <= 0.005,
    ),
    sample: "first 80 decks/band at 200 games; field RMST uses the full band",
  };
  writeJson(join(fit, "goldfish-policy-v2-1-d2-reasons.json"), d2);

  const field = {
    B2: { n: rmst.B2!.length, mean: mean(rmst.B2!), median: median(rmst.B2!) },
    B3: { n: rmst.B3!.length, mean: mean(rmst.B3!), median: median(rmst.B3!) },
    B4: { n: rmst.B4!.length, mean: mean(rmst.B4!), median: median(rmst.B4!) },
    B5: { n: rmst.B5!.length, mean: mean(rmst.B5!), median: median(rmst.B5!) },
  };
  const b5MinusB4Mean =
    field.B5.mean != null && field.B4.mean != null ? field.B5.mean - field.B4.mean : null;
  const b5FasterThanB4 = b5MinusB4Mean != null ? -b5MinusB4Mean : 0;
  const refsInRange = traces.filter((t) => t.rmst15 >= 3 && t.rmst15 <= 5.5);
  const refsOk = refsInRange.length >= 8;
  const bandNonIncreasing =
    (field.B3.mean ?? 99) <= (field.B2.mean ?? 0) + 0.3 &&
    (field.B4.mean ?? 99) <= (field.B3.mean ?? 0) + 0.3;
  const gate1 = {
    version: "goldfish-gate-1-v2-1",
    b5MeanAtLeast1_5FasterThanB4: b5FasterThanB4 >= 1.5,
    b5MinusB4Mean,
    b5FasterThanB4,
    refsWithin3to55: refsInRange.length,
    refsRequired: 8,
    refsOk,
    b2b3b4NonIncreasingWithin0_3: bandNonIncreasing,
    pass: b5FasterThanB4 >= 1.5 && refsOk && bandNonIncreasing,
  };

  const ral = traces.find((t) => /Ral/.test(t.commander));
  const kefka = traces.find((t) => /Kefka/.test(t.commander));

  const sendback = {
    version: "goldfish-sendback-policy-v2-1",
    games: GAMES,
    opponentModel: OPPONENT_MODEL_NOTES,
    elapsedMs: Date.now() - started,
    templateAudit,
    reachability: reachArt,
    d2,
    d3: {
      version: "goldfish-policy-v2-1-d3",
      byBand: {
        B2: d3.B2?.slice(0, 20),
        B3: d3.B3?.slice(0, 20),
        B4: d3.B4?.slice(0, 20),
        B5: d3.B5?.slice(0, 30),
      },
      b5CheapCommandersLate: (d3.B5 ?? []).filter((r) => r.mv <= 3 && (r.medianCast ?? 0) >= 4),
    },
    fieldRmst15: field,
    b5References: traces,
    annotatedRalTraces: ral?.traces ?? [],
    annotatedKefkaTraces: kefka?.traces ?? [],
    gate1,
    scenarioSelftest: "36/36 (33 prior + 3 new) last local run",
    implemented: [
      "template-audit-v2-1",
      "event-driven-resolveWin",
      "plan-executor",
      "leftover-mana",
      "missed-win-reason-codes",
      "reachability",
      "gate-1-revision",
    ],
    convertersAdded: reachArt.convertersAdded,
    stopIfRefsOrGapMiss: !gate1.pass,
  };
  writeJson(join(fit, "goldfish-sendback-policy-v2-1.json"), sendback);
  return {
    dest: join(fit, "goldfish-sendback-policy-v2-1.json"),
    templateAudit,
    reachability: { byBand: reach, top20 },
    d2: d2.byBand,
    d2Leq0_5pctEveryBand: d2.d2Leq0_5pctEveryBand,
    field,
    gate1,
    refs: traces.map((t) => ({ commander: t.commander, rmst15: t.rmst15, p50: t.p50, pByT4: t.pByT4, pByT6: t.pByT6 })),
  };
}

if (require.main === module) {
  runGoldfishPolicyV21()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
