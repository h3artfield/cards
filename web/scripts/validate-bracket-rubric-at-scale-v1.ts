/**
 * Runs the bracket rubric across real TopDeck tournament decklists.
 *
 * These are competitive-event lists, so a sound rubric should place the great
 * majority at Optimized. A heavy Core tail would mean the detectors are missing
 * signals rather than that the decks are casual.
 */
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { join, resolve } from "node:path";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { classifyCommanderBracketV1 } from "../src/lib/commander-bracket-rubric/v1";
import { comboSummaryForDeck } from "../src/lib/commander-bracket-rubric/v1/combos-server";
import type { BracketRubricCard } from "../src/lib/commander-bracket-rubric/v1";

const TOPDECK_ROOT = "data/milestones/topdeck/topdeckImportRuns";
const RC8_PATH = "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz";
const SAMPLE_SIZE = Number(process.env.SAMPLE_SIZE ?? 3000);
/** Guards against grading a deck whose card names never resolved. */
const MIN_RESOLVED_CARDS = Number(process.env.MIN_RESOLVED_CARDS ?? 60);

type TopDeckRow = {
  commanderOracleIds?: string[];
  mainboard?: Array<{ oracleId?: string | null; sourceName?: string; quantity?: number }>;
};

async function loadOracleIndex(): Promise<Map<string, { name: string; text: string }>> {
  const byOracleId = new Map<string, { name: string; text: string }>();
  const rl = createInterface({
    input: createReadStream(resolve(process.cwd(), RC8_PATH)).pipe(createGunzip()),
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line) as {
      oracleId?: string;
      canonicalName?: string;
      semantic?: { abilities?: Array<{ abilitySpan?: { text?: string } }> };
    };
    if (!rec.oracleId) continue;
    byOracleId.set(rec.oracleId, {
      name: rec.canonicalName ?? rec.oracleId,
      text: (rec.semantic?.abilities ?? []).map((a) => a.abilitySpan?.text ?? "").filter(Boolean).join(" "),
    });
  }
  return byOracleId;
}

function largestDeckFile(): string {
  const candidates: Array<{ path: string; size: number }> = [];
  for (const dir of readdirSync(resolve(process.cwd(), TOPDECK_ROOT))) {
    const path = join(resolve(process.cwd(), TOPDECK_ROOT), dir, "normalized-decks-v3.json");
    if (!existsSync(path)) continue;
    candidates.push({ path, size: statSync(path).size });
  }
  candidates.sort((a, b) => b.size - a.size);
  if (!candidates[0]) throw new Error("no TopDeck normalized deck files found");
  return candidates[0].path;
}

async function main(): Promise<void> {
  const oracleIndex = await loadOracleIndex();
  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const file = largestDeckFile();
  console.log(`${oracleIndex.size} cards indexed, ${gcSet.size} Game Changers`);
  console.log(`reading ${file}\n`);

  const decks = JSON.parse(readFileSync(file, "utf8")) as TopDeckRow[];
  const usable = decks.filter(
    (d) => (d.commanderOracleIds?.length ?? 0) > 0 && (d.mainboard?.length ?? 0) >= 60,
  );
  console.log(`${decks.length} decks in file, ${usable.length} with a resolved commander and mainboard`);

  const sample = usable.slice(0, SAMPLE_SIZE);
  const bracketCounts = new Map<number, number>();
  const resolvedByBracket = new Map<number, number[]>();
  const signalCounts = new Map<string, number>();
  let totalGameChangers = 0;
  let decksWithCombo = 0;
  let decksWithTwoCardCombo = 0;
  let scored = 0;

  for (const deck of sample) {
    const commanderIds = new Set(deck.commanderOracleIds ?? []);
    const cards: BracketRubricCard[] = [];
    for (const oracleId of commanderIds) {
      const hit = oracleIndex.get(oracleId);
      if (hit) cards.push({ oracleId, name: hit.name, typeLine: "", oracleText: hit.text, quantity: 1, isCommander: true });
    }
    for (const row of deck.mainboard ?? []) {
      if (!row.oracleId || commanderIds.has(row.oracleId)) continue;
      const hit = oracleIndex.get(row.oracleId);
      if (!hit) continue;
      cards.push({
        oracleId: row.oracleId,
        name: hit.name,
        typeLine: "",
        oracleText: hit.text,
        quantity: row.quantity ?? 1,
        isCommander: false,
      });
    }
    if (cards.length < MIN_RESOLVED_CARDS) continue;

    const combos = await comboSummaryForDeck({ cards });
    const result = classifyCommanderBracketV1({ cards, gameChangerOracleIds: gcSet, combos });

    scored += 1;
    resolvedByBracket.set(result.assignedBracket, [
      ...(resolvedByBracket.get(result.assignedBracket) ?? []),
      cards.length,
    ]);
    bracketCounts.set(result.assignedBracket, (bracketCounts.get(result.assignedBracket) ?? 0) + 1);
    for (const signal of result.signals) {
      if (signal.count > 0) signalCounts.set(signal.id, (signalCounts.get(signal.id) ?? 0) + 1);
    }
    totalGameChangers += result.signals.find((s) => s.id === "game_changers")!.count;
    if (combos.totalCombos > 0) decksWithCombo += 1;
    if (combos.twoCardCombos > 0) decksWithTwoCardCombo += 1;

    if (scored % 500 === 0) console.log(`  scored ${scored}...`);
  }

  const pct = (n: number) => `${((n / scored) * 100).toFixed(1)}%`;
  console.log(`\n=== Bracket distribution across ${scored} real tournament decks`);
  for (const bracket of [2, 3, 4]) {
    const n = bracketCounts.get(bracket) ?? 0;
    console.log(`  bracket ${bracket}: ${String(n).padStart(5)}  ${pct(n).padStart(6)}`);
  }
  console.log(`\n=== Median resolved cards per bracket (low values mean incomplete data, not casual decks)`);
  for (const bracket of [2, 3, 4]) {
    const sizes = (resolvedByBracket.get(bracket) ?? []).sort((a, b) => a - b);
    if (!sizes.length) continue;
    const median = sizes[Math.floor(sizes.length / 2)]!;
    const under90 = sizes.filter((s) => s < 90).length;
    console.log(
      `  bracket ${bracket}: median ${String(median).padStart(3)} cards, ${under90}/${sizes.length} decks under 90 resolved`,
    );
  }
  console.log(`\n=== Signal presence`);
  for (const [id, n] of [...signalCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${id.padEnd(22)} ${String(n).padStart(5)}  ${pct(n).padStart(6)}`);
  }
  console.log(`\n  mean Game Changers per deck: ${(totalGameChangers / scored).toFixed(2)}`);
  console.log(`  decks with any complete combo: ${decksWithCombo} (${pct(decksWithCombo)})`);
  console.log(`  decks with a two-card combo:   ${decksWithTwoCardCombo} (${pct(decksWithTwoCardCombo)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
