#!/usr/bin/env npx tsx
/**
 * §10 items 2+3: B5 reference traces, field RMST₁₅, after inert/lands/authoring.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import { classifyGoldfishCard, simulateGoldfish } from "../../../src/lib/deck-rating/v1/goldfish-sim-v1";
import { resolveOracleName } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";
import { snapshotRoot, writeJson } from "./lib";

const GAMES = Number(process.env.DR_GOLDFISH_GAMES ?? 200);
const B5_SAMPLE = 2000;

function cardsOf(
  ids: string[],
  commanderIds: Set<string>,
  oracle: Awaited<ReturnType<typeof loadSnapshotOracleNameMap>>,
) {
  const out = [];
  for (const id of ids) {
    const info = oracle.byId.get(id);
    if (!info) continue;
    out.push(
      classifyGoldfishCard({
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

function legal(
  ids: string[],
  oracle: Awaited<ReturnType<typeof loadSnapshotOracleNameMap>>,
): boolean {
  return ids.every((id) => {
    const info = oracle.byId.get(id);
    return !info || (info.commanderLegal !== "banned" && info.commanderLegal !== "not_legal");
  });
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export async function runGoldfishSendback23(): Promise<Record<string, unknown>> {
  const started = Date.now();
  const snap = snapshotRoot();
  console.log(`sendback games=${GAMES} started`);
  const oracle = await loadSnapshotOracleNameMap(snap);
  const run = (ids: string[], commanderIds: Set<string>, games = GAMES, traces = 0, seed?: number) =>
    simulateGoldfish({ cards: cardsOf(ids, commanderIds, oracle), games, traces, seed });

  const rmst: Record<string, number[]> = { B2: [], B3: [], B4: [], B5: [] };
  const fields = JSON.parse(readFileSync(join(snap, "fields", "FIELDS.json"), "utf8")) as { b2: { names: string[] } };
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    decks: Array<{
      playgroupName: string;
      commanders: Array<{ name?: string; oracleId?: string | null }>;
      mainboard: Array<{ oracleId?: string | null }>;
    }>;
  };
  const b2Names = new Set(fields.b2.names);
  for (const d of labels.decks.filter((x) => b2Names.has(x.playgroupName))) {
    const cmd = new Set(d.commanders.map((c) => c.oracleId).filter((id): id is string => Boolean(id)));
    const ids = [...cmd, ...d.mainboard.map((c) => c.oracleId).filter((id): id is string => Boolean(id))];
    rmst.B2!.push(run(ids, cmd).rmst15);
  }
  console.log(`B2 RMST n=${rmst.B2!.length} med=${median(rmst.B2!)}`);

  for (const [band, file] of [
    ["B3", "field-b3.jsonl.gz"],
    ["B4", "field-b4.jsonl.gz"],
  ] as const) {
    const path = join(snap, "archidekt", file);
    if (!existsSync(path)) continue;
    const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { commanders?: string[]; oracleIds?: string[] };
      const ids = rec.oracleIds ?? [];
      if (ids.length < 90 || !legal(ids, oracle)) continue;
      const cmd = new Set(
        (rec.commanders ?? [])
          .map((n) => resolveOracleName(oracle, n)?.oracleId)
          .filter((id): id is string => Boolean(id)),
      );
      rmst[band]!.push(run(ids, cmd).rmst15);
      if (rmst[band]!.length % 50 === 0) console.log(`${band} ${rmst[band]!.length}`);
    }
    console.log(`${band} RMST n=${rmst[band]!.length} med=${median(rmst[band]!)}`);
  }

  const b5Legal: Array<{ id: string; commander: string; commanderIds: string[]; oracleIds: string[] }> = [];
  const b5Path = join(snap, "b5", "b5-identity-sets.jsonl.gz");
  if (existsSync(b5Path)) {
    const rl = createInterface({ input: createReadStream(b5Path).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { deckHash?: string; commanderOracleIds?: string[]; oracleIds?: string[] };
      const ids = rec.oracleIds ?? [];
      if (ids.length < 90 || !legal(ids, oracle)) continue;
      const commander = (rec.commanderOracleIds ?? [])
        .map((id) => oracle.byId.get(id)?.name)
        .filter(Boolean)
        .join(" / ");
      b5Legal.push({
        id: rec.deckHash ?? String(b5Legal.length),
        commander: commander || "unknown",
        commanderIds: rec.commanderOracleIds ?? [],
        oracleIds: ids,
      });
    }
  }
  for (const row of b5Legal.slice(0, B5_SAMPLE)) {
    rmst.B5!.push(run(row.oracleIds, new Set(row.commanderIds)).rmst15);
    if (rmst.B5!.length % 100 === 0) console.log(`B5 ${rmst.B5!.length}`);
  }
  console.log(`B5 RMST n=${rmst.B5!.length} med=${median(rmst.B5!)}`);

  const byCmd = new Map<string, typeof b5Legal>();
  for (const row of b5Legal) {
    const list = byCmd.get(row.commander) ?? [];
    list.push(row);
    byCmd.set(row.commander, list);
  }
  const refs = [...byCmd.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 10)
    .map(([commander, list]) => list[0]!);

  const TRACE_SEEDS = [1, 2, 3];
  const traces = refs.map((row) => {
    const cmd = new Set(row.commanderIds);
    const sim = run(row.oracleIds, cmd, GAMES, 0);
    const seedTraces = TRACE_SEEDS.map((seed) => {
      const one = run(row.oracleIds, cmd, 1, 1, seed);
      const t = one.traces?.[0];
      return { seed, tFirst: t?.tFirst ?? one.p50, log: t?.log ?? [] };
    });
    return {
      commander: row.commander,
      id: row.id,
      rmst15: sim.rmst15,
      p50: sim.p50,
      pByT4: sim.pByT4,
      pByT6: sim.pByT6,
      coverage: sim.coverage,
      traces: seedTraces,
    };
  });

  const field = {
    B2: { n: rmst.B2!.length, mean: mean(rmst.B2!), median: median(rmst.B2!) },
    B3: { n: rmst.B3!.length, mean: mean(rmst.B3!), median: median(rmst.B3!) },
    B4: { n: rmst.B4!.length, mean: mean(rmst.B4!), median: median(rmst.B4!) },
    B5: { n: rmst.B5!.length, mean: mean(rmst.B5!), median: median(rmst.B5!) },
    b5MinusB4:
      median(rmst.B5!) != null && median(rmst.B4!) != null ? median(rmst.B5!)! - median(rmst.B4!)! : null,
    refOutside35to55: traces.filter((t) => t.rmst15 < 3 || t.rmst15 > 5.5).map((t) => t.commander),
  };
  const dest = join(snap, "fit", "goldfish-sendback-23-v1.json");
  writeJson(dest, {
    version: "deck-rating-goldfish-sendback-23-v1",
    games: GAMES,
    gamesNote: GAMES < 400 ? "200 games/deck (400 estimated too slow for full field)" : "400 games/deck",
    elapsedMs: Date.now() - started,
    legal: "commanderLegal !== banned && !== not_legal on Archidekt B3/B4 and TopDeck B5",
    b5Sample: B5_SAMPLE,
    fieldRmst15: field,
    b5References: traces,
    refsInside35to55: field.refOutside35to55.length === 0,
    stopAuthoringIfOutside: field.refOutside35to55.length
      ? "B5 refs outside ~3–5.5 after this authoring pass — treat as policy, not missing cards"
      : null,
  });
  return { dest, field, refs: traces.map((t) => ({ commander: t.commander, rmst15: t.rmst15, p50: t.p50 })) };
}

if (require.main === module) {
  runGoldfishSendback23()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
