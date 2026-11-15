#!/usr/bin/env npx tsx
/**
 * Forge harness (started now, not Phase 3).
 *
 * Same commander, stock precon vs an upgraded list, scored against the
 * frozen B2 / B3 / B4 fields. The jobs are the labels we cannot get from
 * Playgroup precons: only the 99 changes.
 *
 *   cd web && npx tsx scripts/deck-rating/v1/forge-harness-v1.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotRoot, writeJson } from "./lib";

type Precon = {
  playgroupName: string;
  commanders: Array<{ name?: string; oracleId?: string | null }>;
  mainboard: Array<{ name?: string; oracleId?: string | null; quantity?: number }>;
};

const UPGRADES: Array<{ name: string; oracleId?: string; role: "game-changer" | "removal" | "fast-mana" }> = [
  { name: "Rhystic Study", role: "game-changer" },
  { name: "Cyclonic Rift", role: "removal" },
  { name: "Sol Ring", role: "fast-mana" },
];

export function buildForgeJobs(): Record<string, unknown> {
  const snap = snapshotRoot();
  const labels = JSON.parse(readFileSync(join(snap, "labels", "precon-labels.json"), "utf8")) as { decks: Precon[] };
  const fields = JSON.parse(readFileSync(join(snap, "fields", "FIELDS.json"), "utf8")) as {
    b2: { n: number };
    b3: { n: number };
    b4: { n: number };
  };
  const jobs = [];
  for (const deck of labels.decks.filter((d) => d.commanders[0]?.name).slice(0, 24)) {
    const commander = deck.commanders[0]!;
    const stock = [
      ...deck.commanders.map((c) => ({ name: c.name, oracleId: c.oracleId, quantity: 1, isCommander: true })),
      ...deck.mainboard.map((c) => ({ ...c, isCommander: false })),
    ];
    const upgraded = [
      ...stock,
      ...UPGRADES.map((u) => ({ name: u.name, oracleId: u.oracleId ?? null, quantity: 1, isCommander: false })),
    ];
    jobs.push({
      id: `${deck.playgroupName}::stock-vs-upgrade`,
      commander: commander.name,
      commanderOracleId: commander.oracleId,
      stockPrecon: deck.playgroupName,
      variant: "add-GC-removal-fast-mana",
      stockCount: stock.length,
      upgradedCount: upgraded.length,
      fields: ["b2", "b3", "b4"],
      fieldNs: { b2: fields.b2.n, b3: fields.b3.n, b4: fields.b4.n },
      question: "Does the upgraded 99 beat the stock 99 against the same frozen field triples?",
    });
  }
  const report = {
    version: "deck-rating-forge-harness-v1",
    status: "jobs-written",
    runner: existsSync("C:/Program Files/Forge") || existsSync("/usr/local/bin/forge") ? "forge-binary-present" : "forge-binary-not-found",
    nJobs: jobs.length,
    design: {
      holdConstant: "commander",
      vary: "99 (stock precon vs the same list plus Rhystic Study, Cyclonic Rift, Sol Ring)",
      opponents: "frozen B2 / B3 / B4 field triples, fixed seed",
      label: "win rate difference is the deck-content signal Playgroup precons cannot identify",
    },
    jobs,
  };
  writeJson(join(snap, "forge", "harness-jobs-v1.json"), report);
  return { nJobs: jobs.length, dest: join(snap, "forge", "harness-jobs-v1.json"), runner: report.runner };
}

if (require.main === module) {
  console.log(JSON.stringify(buildForgeJobs(), null, 2));
}
