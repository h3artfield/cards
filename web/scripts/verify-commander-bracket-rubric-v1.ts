/**
 * Runs the bracket rubric against real sol-directed build artifacts so the
 * classifier is checked on decks the Professor actually produced.
 */
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { resolve } from "node:path";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { classifyCommanderBracketV1 } from "../src/lib/commander-bracket-rubric/v1";
import { comboSummaryForDeck } from "../src/lib/commander-bracket-rubric/v1/combos-server";
import type { BracketRubricCard } from "../src/lib/commander-bracket-rubric/v1";

const ARTIFACTS = [
  { file: ".chatterfang-speed-test-result2.json", requestedBracket: 3 },
  { file: ".omnath-after-fix.json", requestedBracket: 4 },
  { file: ".kodama-speed-test-result3.json", requestedBracket: 4 },
];

type DeckRow = { name: string; copies?: number; oracleId?: string | null };

type OracleEntry = { oracleId: string; name: string; text: string };

const RC8_PATH = "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-firestore-v2.jsonl.gz";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The rubric's detectors read names and oracle text only, so the local RC8
 * snapshot is sufficient and keeps this check runnable without Firestore.
 */
async function loadOracleTextIndex(): Promise<Map<string, OracleEntry>> {
  const byName = new Map<string, OracleEntry>();
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
    if (!rec.oracleId || !rec.canonicalName) continue;
    const text = (rec.semantic?.abilities ?? [])
      .map((ability) => ability.abilitySpan?.text ?? "")
      .filter(Boolean)
      .join(" ");
    byName.set(normalize(rec.canonicalName), {
      oracleId: rec.oracleId,
      name: rec.canonicalName,
      text,
    });
  }
  return byName;
}

async function main(): Promise<void> {
  const oracleByName = await loadOracleTextIndex();
  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  console.log(`${oracleByName.size} cards indexed; ${gcSet.size} Game Changers in snapshot\n`);

  for (const entry of ARTIFACTS) {
    const path = resolve(process.cwd(), entry.file);
    if (!existsSync(path)) {
      console.log(`${entry.file}: not present locally, skipping\n`);
      continue;
    }
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const deck = raw.result?.constructedDeck;
    if (!deck) {
      console.log(`${entry.file}: no constructedDeck, skipping\n`);
      continue;
    }

    const cards: BracketRubricCard[] = [];
    let unresolved = 0;

    const push = (row: DeckRow, isCommander: boolean) => {
      const hit = oracleByName.get(normalize(row.name));
      if (!hit) {
        unresolved += 1;
        return;
      }
      cards.push({
        oracleId: hit.oracleId,
        name: hit.name,
        typeLine: "",
        oracleText: hit.text,
        quantity: row.copies ?? 1,
        isCommander,
      });
    };

    push({ name: deck.commander.name, oracleId: deck.commander.oracleId }, true);
    for (const row of deck.nonlands ?? []) push(row as DeckRow, false);
    for (const row of deck.lands ?? []) push(row as DeckRow, false);

    const combos = await comboSummaryForDeck({ cards });
    const result = classifyCommanderBracketV1({ cards, gameChangerOracleIds: gcSet, combos });

    console.log(`===== ${deck.commander.name}`);
    console.log(`  requested bracket: ${entry.requestedBracket}`);
    console.log(`  rubric assigned:   ${result.assignedBracket} (${result.assignedBracketName})`);
    console.log(
      `  combos detected:   ${combos.totalCombos} total, ${combos.twoCardCombos} two-card, ${combos.terminalRoutes} winning, ${combos.resourceOnlyLoops} resource loops`,
    );
    if (unresolved) console.log(`  unresolved cards:  ${unresolved}`);
    for (const signal of result.signals) {
      const floor = signal.bracketFloor === null ? "-" : `floor ${signal.bracketFloor}`;
      const names = signal.evidence.slice(0, 6).map((e) => e.name).join(", ");
      console.log(
        `    ${signal.label.padEnd(26)} ${String(signal.count).padStart(3)}  ${floor.padEnd(8)} ${names}${signal.evidence.length > 6 ? ", ..." : ""}`,
      );
    }
    if (result.determiningSignals.length) {
      console.log(`  reason: ${result.determiningSignals.map((s) => s.label).join(" + ")}`);
    } else {
      console.log("  reason: no signal raised the deck above Core");
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
