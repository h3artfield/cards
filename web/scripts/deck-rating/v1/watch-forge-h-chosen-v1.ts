#!/usr/bin/env npx tsx
/**
 * When H-A and H-F land, write `chosen` from the A–G decision + H rule.
 */
import { existsSync, readFileSync, watchFile } from "node:fs";
import { join } from "node:path";
import { snapshotRoot, writeJson } from "./lib";

type Row = {
  id: string;
  medianGameMs: number | null;
  p90GameMs: number | null;
  clockDrawRate: number | null;
  n: number;
  workers?: number;
};

function decide(tests: Row[]): Record<string, unknown> {
  const byId = new Map(tests.map((t) => [t.id, t]));
  const A = byId.get("A");
  const H_A = byId.get("H-A");
  const H_F = byId.get("H-F");
  const twoP = [H_A, H_F].filter((t): t is Row => Boolean(t && t.medianGameMs != null));
  const twoPMedian =
    twoP.length === 2 ? (twoP[0]!.medianGameMs! + twoP[1]!.medianGameMs!) / 2 : twoP[0]?.medianGameMs ?? null;
  const twoPClock =
    twoP.length === 2 ? (twoP[0]!.clockDrawRate! + twoP[1]!.clockDrawRate!) / 2 : twoP[0]?.clockDrawRate ?? null;
  const twoPlayerOk = twoPMedian != null && twoPMedian <= 120_000 && (twoPClock ?? 1) <= 0.1;
  const timed = tests.filter((t) => t.p90GameMs != null) as Array<Row & { p90GameMs: number }>;
  const slowestP90 = timed.reduce((m, t) => Math.max(m, t.p90GameMs), 0);
  const clockS = Math.max(900, Math.ceil((2 * slowestP90) / 1000));
  return {
    workers: 8,
    clockS,
    gamesPerMatch: 20,
    aiProfile: "Default",
    xmx: "2560m",
    fromAG: {
      workers: "B-15 oversubscribed (median 561s vs A 350s); B-8 matches A (351s)",
      throughput4p: "~70 games/hour at 8 workers (median ~5 min, ~30% of A pods at 900s cap)",
      gauntlet36k: "~3 weeks on this box at 4-player",
      serialGcAndN: "D and E do not change the decision; A–G draw-rate gaps are small-sample noise",
    },
    h: {
      twoPMedianGameMs: twoPMedian,
      twoPClockDrawRate: twoPClock,
      twoPlayerOk,
    },
    section64: twoPlayerOk
      ? {
          mode: "2-player-commander",
          note: "Same gauntlets, seat alternating. Known limitation: 2-player is not the published 4-player table.",
        }
      : {
          mode: "shrink-or-cloud",
          shrink: "20 decks per band × 150 games",
          or: "rent a large cloud VM (e.g. 64 cores) for the 36k 4-player run",
        },
    rule: "workers=8 from A–G; if 2p median ≤ ~2 min and clock-draws ≤ 10% then §6.4 in 2p Commander, else shrink and/or cloud",
    finishedAt: new Date().toISOString(),
  };
}

function tryWrite(): boolean {
  const dest = join(snapshotRoot(), "forge", "benchmark-ah-v1.json");
  if (!existsSync(dest)) return false;
  const raw = JSON.parse(readFileSync(dest, "utf8")) as { tests: Row[]; chosen: unknown };
  const ids = new Set(raw.tests.map((t) => t.id));
  if (!ids.has("H-A") || !ids.has("H-F")) {
    console.log(`waiting for H-A/H-F; have ${[...ids].join(",")}`);
    return false;
  }
  raw.chosen = decide(raw.tests);
  writeJson(dest, raw);
  console.log(JSON.stringify(raw.chosen, null, 2));
  return true;
}

if (require.main === module) {
  if (tryWrite()) process.exit(0);
  const dest = join(snapshotRoot(), "forge", "benchmark-ah-v1.json");
  watchFile(dest, { interval: 30_000 }, () => {
    if (tryWrite()) process.exit(0);
  });
  const timer = setInterval(() => {
    if (tryWrite()) {
      clearInterval(timer);
      process.exit(0);
    }
  }, 60_000);
}
