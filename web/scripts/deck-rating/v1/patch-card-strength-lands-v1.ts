#!/usr/bin/env npx tsx
/**
 * Add nonbasic lands to card-strength-v1 via edhrec_rank (−log10), same as spells.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { snapshotRoot, writeJson } from "./lib";
import { loadSnapshotOracleNameMap } from "./load-oracle-name-map";

const BASICS = new Set(["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"]);

export async function patchCardStrengthLandsV1(): Promise<Record<string, unknown>> {
  const snap = snapshotRoot();
  const dest = join(snap, "fit", "card-strength-v1.json");
  const table = JSON.parse(readFileSync(dest, "utf8")) as {
    nCards: number;
    used: string;
    cards: Array<{ oracleId: string; name: string; strength: number }>;
    landPatch?: unknown;
  };
  const have = new Set(table.cards.map((c) => c.oracleId));
  const oracle = await loadSnapshotOracleNameMap(snap);
  let added = 0;
  let skippedBasic = 0;
  let skippedNoRank = 0;
  for (const info of oracle.byId.values()) {
    if (have.has(info.oracleId)) continue;
    if (!/\bland\b/i.test(info.typeLine)) continue;
    if (BASICS.has(info.name.split(" // ")[0]!)) {
      skippedBasic += 1;
      continue;
    }
    if (info.edhrecRank == null) {
      skippedNoRank += 1;
      continue;
    }
    table.cards.push({
      oracleId: info.oracleId,
      name: info.name,
      strength: -Math.log10(Math.max(info.edhrecRank, 1)),
    });
    added += 1;
  }
  table.nCards = table.cards.length;
  const tomb = table.cards.find((c) => c.name === "Ancient Tomb");
  table.landPatch = {
    version: "card-strength-lands-v1",
    added,
    skippedBasic,
    skippedNoRank,
    method: "edhrec_rank −log10, nonbasic only",
    ancientTomb: tomb ?? null,
  };
  writeJson(dest, table);
  return { dest, added, nCards: table.nCards, ancientTomb: tomb ?? null };
}

if (require.main === module) {
  patchCardStrengthLandsV1()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
