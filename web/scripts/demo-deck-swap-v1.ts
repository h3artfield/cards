/**
 * End-to-end swap demo on a real sol-directed build artifact.
 * Runs without store inventory so it works outside a Firestore session.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { loadRc8OracleTextIndex } from "../src/lib/card-oracle-text/rc8-oracle-text-index";
import { suggestSwapsForCard } from "../src/lib/deck-swap/v1/suggest-swaps-server";
import type { BracketRubricCard } from "../src/lib/commander-bracket-rubric/v1";

const ARTIFACT = process.env.ARTIFACT ?? ".chatterfang-speed-test-result2.json";
const SWAP_TARGET = process.env.SWAP_TARGET ?? "Putrefy";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

async function main(): Promise<void> {
  const path = resolve(process.cwd(), ARTIFACT);
  if (!existsSync(path)) throw new Error(`missing artifact ${ARTIFACT}`);

  const textIndex = await loadRc8OracleTextIndex();
  const byName = new Map<string, { oracleId: string; name: string; oracleText: string }>();
  for (const entry of textIndex.values()) byName.set(normalize(entry.name), entry);

  const deckJson = JSON.parse(readFileSync(path, "utf8")).result.constructedDeck;
  const cards: BracketRubricCard[] = [];
  const push = (name: string, copies: number, isCommander: boolean) => {
    const hit = byName.get(normalize(name));
    if (!hit) return;
    cards.push({
      oracleId: hit.oracleId,
      name: hit.name,
      typeLine: "",
      oracleText: hit.oracleText,
      quantity: copies,
      isCommander,
    });
  };
  push(deckJson.commander.name, 1, true);
  for (const row of deckJson.nonlands ?? []) push(row.name, row.copies ?? 1, false);
  for (const row of deckJson.lands ?? []) push(row.name, row.copies ?? 1, false);

  const target = cards.find((c) => normalize(c.name) === normalize(SWAP_TARGET));
  if (!target) {
    console.log(`"${SWAP_TARGET}" is not in this deck. Nonlands available:`);
    console.log(cards.filter((c) => !c.isCommander).slice(0, 40).map((c) => `  ${c.name}`).join("\n"));
    return;
  }

  console.log(`deck: ${deckJson.commander.name} (${cards.length} resolved cards)`);
  console.log(`swapping out: ${target.name}\n`);

  const result = await suggestSwapsForCard({
    deck: cards,
    outgoingOracleId: target.oracleId,
    gameChangerOracleIds: gameChangerOracleIdSet(loadCommanderGameChangerSnapshot()),
    constraints: {
      commanderColorIdentity: deckJson.commander.colorIdentity ?? [],
      maxBracket: Number(process.env.MAX_BRACKET ?? 3) as 2 | 3 | 4,
    },
    suggestionLimit: 8,
    rankBy: (process.env.RANK_BY as "similarity" | "play_rate" | "price") ?? "play_rate",
  });

  console.log(`${result.suggestions.length} suggestions:`);
  for (const s of result.suggestions) {
    const bracket =
      s.bracketBefore === s.bracketAfter
        ? `b${s.bracketAfter}`
        : `b${s.bracketBefore}->${s.bracketAfter}`;
    const rate = s.incomingPlayRate != null ? `${(s.incomingPlayRate * 100).toFixed(0)}%` : "  -";
    console.log(
      `  ${s.in.name.padEnd(26)} ${s.verdict.padEnd(9)} play ${rate.padStart(4)}  ${bracket}  ${s.source}`,
    );
  }

  console.log(`\n${result.rejected.length} rejected:`);
  const byCode = new Map<string, string[]>();
  for (const r of result.rejected) {
    byCode.set(r.code, [...(byCode.get(r.code) ?? []), r.name]);
  }
  for (const [code, names] of byCode) {
    console.log(`  ${code.padEnd(18)} ${names.slice(0, 6).join(", ")}${names.length > 6 ? ", ..." : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
