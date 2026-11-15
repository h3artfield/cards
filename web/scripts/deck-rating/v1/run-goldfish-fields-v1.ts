#!/usr/bin/env npx tsx
/**
 * Goldfish every frozen field deck + ranked precons + stock vs +Sol Ring.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import { detectCompleteCombos } from "../../../src/lib/commander-optimization-score/v1/detect";
import { loadSpellbookComboArtifacts } from "../../../src/lib/commander-optimization-score/v1/load-artifacts";
import {
  classifyGoldfishCard,
  DR_GOLDFISH_GAMES,
  DR_GOLDFISH_SIM_V1,
  simulateGoldfish,
  speedConsistencyW,
  type GoldfishSimCard,
  type GoldfishSimResult,
} from "../../../src/lib/deck-rating/v1/goldfish-sim-v1";
import { publishedDeckRating } from "../../../src/lib/deck-rating/v1/publish";
import { resolveOracleName } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

const GAMES = Number(process.env.DR_GOLDFISH_GAMES ?? DR_GOLDFISH_GAMES);
const B5_CAP = 400;

function cardsFromIds(
  ids: string[],
  commanderIds: Set<string>,
  oracle: Awaited<ReturnType<typeof loadSnapshotOracleNameMap>>,
): GoldfishSimCard[] {
  const out: GoldfishSimCard[] = [];
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

async function loadField(
  path: string,
): Promise<Array<{ id: string; commander: string; oracleIds: string[] }>> {
  const rows: Array<{ id: string; commander: string; oracleIds: string[] }> = [];
  if (!existsSync(path)) return rows;
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as { archidektId?: number; commanders?: string[]; oracleIds?: string[] };
    rows.push({
      id: String(rec.archidektId ?? rows.length),
      commander: rec.commanders?.[0] ?? "",
      oracleIds: rec.oracleIds ?? [],
    });
  }
  return rows;
}

export async function runGoldfishFieldsV1(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const oracle = await loadSnapshotOracleNameMap(snap);
  const { compiled } = await loadSpellbookComboArtifacts();
  const sol = resolveOracleName(oracle, "Sol Ring");

  const runDeck = (ids: string[], commanderIds: Set<string>, extra?: GoldfishSimCard) => {
    const cards = cardsFromIds(ids, commanderIds, oracle);
    if (extra) cards.push(extra);
    const present = new Set(cards.map((c) => c.oracleId));
    const combos = detectCompleteCombos({
      deckOracleIds: present,
      commanderOracleIds: commanderIds,
      compiled,
    }).hits.map((h) => h.cardSetSignature.split("|").filter(Boolean));
    return simulateGoldfish({ cards, combos, games: GAMES });
  };

  const bands: Record<string, GoldfishSimResult[]> = { 2: [], 3: [], 4: [], 5: [] };
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    decks: Array<{
      playgroupName: string;
      last3Years?: boolean;
      commanders: Array<{ name?: string; oracleId?: string | null }>;
      mainboard: Array<{ oracleId?: string | null }>;
    }>;
  };
  const preconRows: Array<{
    name: string;
    last3Years: boolean;
    stock: GoldfishSimResult;
    plusSol: { minus: GoldfishSimResult; plus: GoldfishSimResult } | null;
  }> = [];
  for (const deck of labels.decks) {
    const cmdIds = new Set(deck.commanders.map((c) => c.oracleId).filter((id): id is string => Boolean(id)));
    const ids = [...cmdIds, ...deck.mainboard.map((c) => c.oracleId).filter((id): id is string => Boolean(id))];
    const withoutSol = ids.filter((id) => id !== sol?.oracleId);
    const stock = runDeck(ids, cmdIds);
    const plusSol = sol
      ? {
          minus: runDeck(withoutSol, cmdIds),
          plus: runDeck(withoutSol, cmdIds, classifyGoldfishCard({ ...sol, isCommander: false })),
        }
      : null;
    preconRows.push({ name: deck.playgroupName, last3Years: Boolean(deck.last3Years), stock, plusSol });
    if (deck.last3Years) bands[2]!.push(stock);
    if (preconRows.length % 10 === 0) console.log(`goldfish precons ${preconRows.length}/${labels.decks.length}`);
  }

  for (const [band, file] of [
    [3, "field-b3.jsonl.gz"],
    [4, "field-b4.jsonl.gz"],
  ] as const) {
    const rows = await loadField(join(snap, "archidekt", file));
    for (const row of rows) {
      const cmd = [...oracle.byName.values()].find((c) => c.name === row.commander);
      const cmdIds = new Set(cmd ? [cmd.oracleId] : []);
      bands[String(band)]!.push(runDeck(row.oracleIds, cmdIds));
    }
    console.log(`goldfish B${band} ${bands[String(band)]!.length}`);
  }

  const b5Path = join(snap, "b5", "b5-identity-sets.jsonl.gz");
  if (existsSync(b5Path)) {
    const rl = createInterface({ input: createReadStream(b5Path).pipe(createGunzip()) });
    let n = 0;
    for await (const line of rl) {
      if (!line.trim() || n >= B5_CAP) continue;
      const rec = JSON.parse(line) as { oracleIds?: string[] };
      const ids = rec.oracleIds ?? [];
      if (ids.length < 90) continue;
      bands[5]!.push(runDeck(ids, new Set()));
      n += 1;
    }
    console.log(`goldfish B5 sample ${bands[5]!.length}`);
  }

  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };
  const med = {
    2: median(bands[2]!.map((r) => r.p50)),
    3: median(bands[3]!.map((r) => r.p50)),
    4: median(bands[4]!.map((r) => r.p50)),
    5: median(bands[5]!.map((r) => r.p50)),
  };
  const preconMed = median(preconRows.map((r) => r.stock.p50));
  const solFaster = preconRows.filter((r) => r.plusSol && r.plusSol.plus.mean < r.plusSol.minus.mean).length;
  const solN = preconRows.filter((r) => r.plusSol).length;
  const orderOk =
    med[5] != null &&
    med[4] != null &&
    med[3] != null &&
    med[2] != null &&
    med[5] < med[4] &&
    med[4] < med[3] &&
    med[3] < med[2];
  const preconBandOk = preconMed != null && preconMed >= 8 && preconMed <= 10;
  const solOk = solN > 0 && solFaster / solN >= 0.7;
  const checksPass = Boolean(orderOk && preconBandOk && solOk);

  const examples = preconRows.slice(0, 5).map((r) => {
    const field = bands[2]!.length ? bands[2]! : preconRows.map((x) => x.stock);
    const w = speedConsistencyW(r.stock, field);
    return {
      name: r.name,
      p50: r.stock.p50,
      coverage: r.stock.coverage,
      lowConfidence: r.stock.lowConfidence,
      W: w.W,
      published: publishedDeckRating(2, w.W),
    };
  });

  const report = {
    version: DR_GOLDFISH_SIM_V1,
    games: GAMES,
    n: { 2: bands[2]!.length, 3: bands[3]!.length, 4: bands[4]!.length, 5: bands[5]!.length, precons: preconRows.length },
    medianThreatTurn: med,
    preconMedian: preconMed,
    solRing: { n: solN, faster: solFaster, rate: solN ? solFaster / solN : null },
    checks: {
      bracketOrder: { pass: Boolean(orderOk), medianThreatTurn: med },
      preconMedian8to10: { pass: Boolean(preconBandOk), median: preconMed },
      stockVsSolRing: { pass: Boolean(solOk), faster: solFaster, n: solN },
      pass: checksPass,
    },
    meanCoverage: {
      2: bands[2]!.length ? bands[2]!.reduce((s, r) => s + r.coverage, 0) / bands[2]!.length : null,
      precons: preconRows.reduce((s, r) => s + r.stock.coverage, 0) / Math.max(preconRows.length, 1),
    },
    wPublish: checksPass,
    label: "Speed & consistency vs. typical Bracket N decks.",
    examples,
  };
  writeJson(join(snap, "fit", "goldfish-field-v1.json"), report);
  writeJson(join(snap, "fit", "goldfish-speed-v1.1.json"), {
    version: "deck-rating-goldfish-speed-v1.1",
    status: checksPass ? "sim-live" : "sim-ran-checks-failed",
    source: "goldfish-sim",
    module: "web/src/lib/deck-rating/v1/goldfish-sim-v1.ts",
    games: GAMES,
    checksPass,
  });
  return report;
}

if (require.main === module) {
  runGoldfishFieldsV1()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
