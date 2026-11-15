#!/usr/bin/env npx tsx
/**
 * Importance-weighted coverage. goldfishInert cards are excluded from
 * both numerator and denominator.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join } from "node:path";
import { loadCardStrengthTableV1 } from "../../../src/lib/deck-rating/v1/card-strength-table-v1";
import {
  GOLDFISH_CLOCK_EXCEPTIONS,
  GOLDFISH_INERT_FORCE,
  isGoldfishInert,
} from "../../../src/lib/deck-rating/v1/goldfish-inert-v1";
import {
  classifyGoldfishCard,
  FAST_MANA_NEEDS_AUTHORING,
  type GoldfishSimCard,
} from "../../../src/lib/deck-rating/v1/goldfish-sim-v1";
import { resolveOracleName } from "../../../src/lib/deck-rating/v1/oracle-name-map";
import { snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

const F_WEIGHT = { full: 1, partial: 0.5, castOnly: 0, goldfishInert: 0 } as const;
const B5_SAMPLE = 2000;
const HOT_N = 50;
const FIELD_MIN = 0.6;

type DeckRow = { id: string; commander: string; commanderIds: string[]; oracleIds: string[] };

function rescaleStrength(table: Map<string, number>): (oracleId: string) => number {
  let min = Infinity;
  let max = -Infinity;
  for (const s of table.values()) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const span = max - min || 1;
  return (oracleId) => {
    const s = table.get(oracleId);
    if (s == null) return 0.1;
    return 0.1 + (0.9 * (s - min)) / span;
  };
}

function isBasic(name: string): boolean {
  return /^(Snow-Covered )?(Plains|Island|Swamp|Mountain|Forest|Wastes)$/i.test(name);
}

function deckCards(
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

function scoredCards(
  cards: GoldfishSimCard[],
  wOf: (oracleId: string) => number,
): Array<{ card: GoldfishSimCard; w: number; f: number; floor: boolean }> {
  const rows = [];
  for (const card of cards) {
    if (card.isCommander || isBasic(card.name) || card.fidelity === "goldfishInert") continue;
    const raw = wOf(card.oracleId);
    rows.push({ card, w: raw, f: F_WEIGHT[card.fidelity], floor: raw === 0.1 });
  }
  return rows;
}

function deckCoverage(rows: Array<{ w: number; f: number }>): number {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    num += r.w * r.f;
    den += r.w;
  }
  return den ? num / den : 1;
}

function summarize(coverages: number[]): { n: number; mean: number; median: number; excludedBelow060: number } {
  if (!coverages.length) return { n: 0, mean: 0, median: 0, excludedBelow060: 0 };
  const s = coverages.slice().sort((a, b) => a - b);
  return {
    n: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    median: s[Math.floor(s.length / 2)]!,
    excludedBelow060: s.filter((x) => x < FIELD_MIN).length / s.length,
  };
}

function legalIds(
  ids: string[],
  oracle: Awaited<ReturnType<typeof loadSnapshotOracleNameMap>>,
): { ok: boolean; banned: string[] } {
  const banned: string[] = [];
  for (const id of ids) {
    const info = oracle.byId.get(id);
    if (!info) continue;
    if (info.commanderLegal === "banned" || info.commanderLegal === "not_legal") banned.push(info.name);
  }
  return { ok: banned.length === 0, banned };
}

export async function coverageHotmissV1(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const oracle = await loadSnapshotOracleNameMap(snap);
  const table = loadCardStrengthTableV1(snap);
  const wOf = rescaleStrength(table);
  const fields = JSON.parse(readFileSync(join(snap, "fields", "FIELDS.json"), "utf8")) as {
    b2: { names: string[] };
  };
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as {
    decks: Array<{
      playgroupName: string;
      commanders: Array<{ name?: string; oracleId?: string | null }>;
      mainboard: Array<{ oracleId?: string | null }>;
    }>;
  };
  const b2Names = new Set(fields.b2.names);
  const bands: Record<string, DeckRow[]> = {
    B2: labels.decks
      .filter((d) => b2Names.has(d.playgroupName))
      .map((d) => {
        const commanderIds = d.commanders.map((c) => c.oracleId).filter((id): id is string => Boolean(id));
        return {
          id: d.playgroupName,
          commander: d.commanders.map((c) => c.name).filter(Boolean).join(" / ") || "unknown",
          commanderIds,
          oracleIds: [
            ...commanderIds,
            ...d.mainboard.map((c) => c.oracleId).filter((id): id is string => Boolean(id)),
          ],
        };
      }),
    B3: [],
    B4: [],
    B5: [],
  };

  for (const [band, file] of [
    ["B3", "field-b3.jsonl.gz"],
    ["B4", "field-b4.jsonl.gz"],
  ] as const) {
    const path = join(snap, "archidekt", file);
    if (!existsSync(path)) continue;
    const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { archidektId?: number; commanders?: string[]; oracleIds?: string[] };
      const oracleIds = rec.oracleIds ?? [];
      if (oracleIds.length < 90) continue;
      const cmdNames = rec.commanders ?? [];
      bands[band]!.push({
        id: String(rec.archidektId ?? ""),
        commander: cmdNames.join(" / ") || "unknown",
        commanderIds: cmdNames
          .map((n) => resolveOracleName(oracle, n)?.oracleId)
          .filter((id): id is string => Boolean(id)),
        oracleIds,
      });
    }
  }

  const b5Legal: DeckRow[] = [];
  const b5Illegal = { n: 0, names: new Map<string, number>() };
  const b5Path = join(snap, "b5", "b5-identity-sets.jsonl.gz");
  if (existsSync(b5Path)) {
    const rl = createInterface({ input: createReadStream(b5Path).pipe(createGunzip()) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const rec = JSON.parse(line) as { deckHash?: string; commanderOracleIds?: string[]; oracleIds?: string[] };
      const oracleIds = rec.oracleIds ?? [];
      if (oracleIds.length < 90) continue;
      const gate = legalIds(oracleIds, oracle);
      if (!gate.ok) {
        b5Illegal.n += 1;
        for (const n of gate.banned) b5Illegal.names.set(n, (b5Illegal.names.get(n) ?? 0) + 1);
        continue;
      }
      const cmdNames = (rec.commanderOracleIds ?? [])
        .map((id) => oracle.byId.get(id)?.name)
        .filter((n): n is string => Boolean(n));
      b5Legal.push({
        id: rec.deckHash ?? String(b5Legal.length),
        commander: cmdNames.join(" / ") || "unknown",
        commanderIds: rec.commanderOracleIds ?? [],
        oracleIds,
      });
    }
  }
  bands.B5 = b5Legal.slice(0, B5_SAMPLE);

  const otherLegal: Record<string, { scanned: number; droppedIllegal: number; bannedNameCounts: [string, number][] }> =
    {};
  for (const band of ["B2", "B3", "B4"] as const) {
    const names = new Map<string, number>();
    let dropped = 0;
    for (const deck of bands[band] ?? []) {
      const gate = legalIds(deck.oracleIds, oracle);
      if (!gate.ok) {
        dropped += 1;
        for (const n of gate.banned) names.set(n, (names.get(n) ?? 0) + 1);
      }
    }
    otherLegal[band] = {
      scanned: bands[band]?.length ?? 0,
      droppedIllegal: dropped,
      bannedNameCounts: [...names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20),
    };
  }
  writeJson(join(snap, "fit", "b5-legal-filter-v1.json"), {
    version: "deck-rating-b5-legal-now-v1",
    filter: "drop identity sets with any commander-banned or not_legal card (same legal-now as Archidekt)",
    totalLegal: b5Legal.length,
    sampled: bands.B5.length,
    droppedIllegal: b5Illegal.n,
    redraw: `first ${B5_SAMPLE} legal-now identity sets after dropping banned/not_legal`,
    bannedNameCounts: [...b5Illegal.names.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
    otherBandsLegalNow: otherLegal,
  });

  const inertSeen = new Map<string, { name: string; source: string; decks: number }>();
  const reportBands: Record<string, unknown> = {};
  const hot: Record<string, unknown[]> = {};
  const floors: Record<string, unknown> = {};
  const exclusionByCmd: Record<string, unknown> = {};

  for (const [band, decks] of Object.entries(bands)) {
    const coverages: number[] = [];
    const excludedCmd = new Map<string, { n: number; excluded: number }>();
    const miss = new Map<
      string,
      { name: string; oracleId: string; fidelity: string; w: number; decks: number; inFastManaTable: boolean }
    >();
    const floorHits = new Map<string, { name: string; decks: number; inTable: boolean }>();
    for (const deck of decks) {
      const cards = deckCards(deck.oracleIds, new Set(deck.commanderIds), oracle);
      for (const card of cards) {
        if (card.fidelity !== "goldfishInert") continue;
        const prev = inertSeen.get(card.oracleId);
        if (prev) prev.decks += 1;
        else {
          inertSeen.set(card.oracleId, {
            name: card.name,
            source: GOLDFISH_INERT_FORCE.has(card.name) ? "force-list" : "tag-or-stax",
            decks: 1,
          });
        }
      }
      const rows = scoredCards(cards, wOf);
      const cov = deckCoverage(rows);
      coverages.push(cov);
      const cmd = deck.commander || "unknown";
      const slot = excludedCmd.get(cmd) ?? { n: 0, excluded: 0 };
      slot.n += 1;
      if (cov < FIELD_MIN) slot.excluded += 1;
      excludedCmd.set(cmd, slot);
      const seen = new Set<string>();
      for (const row of rows) {
        if (row.floor) {
          const f = floorHits.get(row.card.oracleId);
          if (f) f.decks += 1;
          else floorHits.set(row.card.oracleId, { name: row.card.name, decks: 1, inTable: table.has(row.card.oracleId) });
        }
        if (row.f >= 1 || seen.has(row.card.oracleId)) continue;
        seen.add(row.card.oracleId);
        const prev = miss.get(row.card.oracleId);
        if (prev) prev.decks += 1;
        else {
          miss.set(row.card.oracleId, {
            name: row.card.name,
            oracleId: row.card.oracleId,
            fidelity: row.card.fidelity,
            w: row.w,
            decks: 1,
            inFastManaTable: FAST_MANA_NEEDS_AUTHORING.has(row.card.name),
          });
        }
      }
    }
    const hot50 = [...miss.values()]
      .map((m) => ({ ...m, heat: m.w * m.decks, heatShare: decks.length ? (m.w * m.decks) / decks.length : 0 }))
      .sort((a, b) => b.heat - a.heat)
      .slice(0, HOT_N);
    const sum = summarize(coverages);
    const cmdRows = [...excludedCmd.entries()]
      .map(([commander, v]) => ({ commander, decks: v.n, excluded: v.excluded, rate: v.n ? v.excluded / v.n : 0 }))
      .sort((a, b) => b.excluded - a.excluded || b.rate - a.rate);
    const topCmdShare = cmdRows.slice(0, 8).reduce((s, r) => s + r.excluded, 0);
    const floorList = [...floorHits.values()].sort((a, b) => b.decks - a.decks);
    const highPlayCut = Math.max(10, Math.ceil(decks.length * 0.2));
    reportBands[band] = { ...sum, sampled: decks.length, publishMedianGate080: sum.median >= 0.8 };
    hot[band] = hot50;
    floors[band] = {
      uniqueFloorCards: floorHits.size,
      occurrenceDecks: floorList.reduce((s, x) => s + x.decks, 0),
      highPlayCut,
      highPlayAtFloor: floorList.filter((x) => x.decks >= highPlayCut),
      ancientTomb: floorList.find((x) => x.name === "Ancient Tomb") ?? null,
      top: floorList.slice(0, 15),
    };
    exclusionByCmd[band] = {
      commanders: cmdRows.slice(0, 20),
      excludedDecks: Math.round(sum.excludedBelow060 * decks.length),
      top8ShareOfExclusions: sum.n && sum.excludedBelow060 ? topCmdShare / (sum.excludedBelow060 * decks.length) : 0,
    };
    console.log(
      `${band} n=${decks.length} median=${sum.median.toFixed(3)} mean=${sum.mean.toFixed(3)} excluded<0.60=${sum.excludedBelow060.toFixed(3)}`,
    );
  }

  writeJson(join(snap, "fit", "goldfish-inert-v1.json"), {
    version: "deck-rating-goldfish-inert-v1",
    rule: "interact/protect tags + stax/tax/fog text, minus clock exceptions, plus reviewed force list",
    clockExceptions: [...GOLDFISH_CLOCK_EXCEPTIONS],
    forceInert: [...GOLDFISH_INERT_FORCE],
    observed: [...inertSeen.values()].sort((a, b) => b.decks - a.decks).slice(0, 200),
  });

  const dest = join(snap, "fit", "coverage-hotmiss-v1.json");
  const report = {
    version: "deck-rating-coverage-hotmiss-v1.1",
    spec: "rev2-§10-item-1-corrected",
    formula: {
      w_c: "card-strength-v1 min-max → [0.1, 1]; missing → 0.1",
      f: { full: 1, partial: 0.5, castOnly: 0 },
      coverage: "Σ w_c f / Σ w_c over clock-relevant cards (exclude commander, basics, goldfishInert)",
      hotMiss: "w_c × #decks where card is partial or castOnly (inert excluded)",
      publishGate: "median coverage ≥ 0.80 (does not block authoring)",
      fieldInclude: "deck coverage ≥ 0.60 to count in a published field",
    },
    b5Legal: { sampled: bands.B5!.length, legalPool: b5Legal.length, droppedIllegal: b5Illegal.n },
    bands: reportBands,
    floor01: floors,
    exclusionByCommander: exclusionByCmd,
    hotMisses: hot,
  };
  writeJson(dest, report);
  return { dest, bands: reportBands, b5Legal: report.b5Legal };
}

if (require.main === module) {
  coverageHotmissV1()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
