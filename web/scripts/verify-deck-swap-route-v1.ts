/**
 * Exercises the swap route's server path against a real build artifact.
 * Runs without a store so it works outside a Firestore session; stock is
 * injected so the in-stock and price paths are still covered.
 */
import { readFileSync } from "node:fs";
import {
  loadRc8OracleTextByName,
  normalizeCardNameKey,
} from "../src/lib/card-oracle-text/rc8-oracle-text-index";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "../src/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { suggestSwapsForCard } from "../src/lib/deck-swap/v1/suggest-swaps-server";
import type { BracketRubricCard } from "../src/lib/commander-bracket-rubric/v1";
import type { SwapStock } from "../src/lib/deck-swap/v1";

async function main(): Promise<void> {
  const deck = JSON.parse(readFileSync(".chatterfang-speed-test-result2.json", "utf8")).result
    .constructedDeck;
  const byName = await loadRc8OracleTextByName();

  const cards: BracketRubricCard[] = [];
  const push = (name: string, copies: number, isCommander: boolean) => {
    const entry = byName.get(normalizeCardNameKey(name));
    if (!entry) return;
    cards.push({
      oracleId: entry.oracleId,
      name: entry.name,
      typeLine: "",
      oracleText: entry.oracleText,
      quantity: copies,
      isCommander,
    });
  };
  push(deck.commander.name, 1, true);
  for (const row of deck.nonlands ?? []) push(row.name, row.copies ?? 1, false);
  for (const row of deck.lands ?? []) push(row.name, row.copies ?? 1, false);

  const gcSet = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const colorIdentity = deck.commander.colorIdentity ?? [];
  const target = cards.find((c) => normalizeCardNameKey(c.name) === "rampant growth")!;

  const ask = async (
    label: string,
    rankBy: "play_rate" | "price",
    opts: { requireInStock?: boolean; maxBracket?: 2 | 3 | 4; stock?: Map<string, SwapStock> },
  ) => {
    const result = await suggestSwapsForCard({
      deck: cards,
      outgoingOracleId: target.oracleId,
      gameChangerOracleIds: gcSet,
      constraints: {
        commanderColorIdentity: colorIdentity,
        maxBracket: opts.maxBracket ?? null,
        requireInStock: opts.requireInStock ?? false,
      },
      stockByOracleId: opts.stock,
      rankBy,
      suggestionLimit: 5,
    });
    console.log(`\n=== ${label}`);
    for (const s of result.suggestions) {
      const bracket =
        s.bracketAfter === s.bracketBefore ? `b${s.bracketAfter}` : `b${s.bracketBefore}->${s.bracketAfter}`;
      const price = s.stock?.priceUsd != null ? `$${s.stock.priceUsd.toFixed(2)}` : "-";
      console.log(`  ${s.in.name.padEnd(24)} ${s.verdict.padEnd(9)} ${bracket.padEnd(8)} ${price}`);
    }
    if (result.suggestions.length === 0) console.log("  (none)");
    const held = result.rejected.filter((r) => r.code === "RAISES_BRACKET");
    if (held.length) console.log(`  held for bracket: ${held.map((r) => r.name).join(", ")}`);
    return result;
  };

  const unbounded = await ask("stronger, no bracket ceiling", "play_rate", { maxBracket: 4 });
  const capped = await ask("stronger, capped at the requested bracket 3", "play_rate", {
    maxBracket: 3,
  });

  // Only two cards on the shelf, one of them cheap, to prove both filters bite.
  const stock = new Map<string, SwapStock>();
  for (const s of unbounded.suggestions.slice(0, 2)) {
    stock.set(s.in.oracleId, {
      quantity: 3,
      priceUsd: s.in.name.length % 2 === 0 ? 2.5 : 45,
    });
  }
  await ask("stronger, in stock only", "play_rate", {
    requireInStock: true,
    maxBracket: 4,
    stock,
  });
  await ask("cheaper, in stock only", "price", { requireInStock: true, maxBracket: 4, stock });

  // The requested bracket of 3 admits every suggestion above, so the ceiling
  // only proves itself at 2, where the Game Changers must be refused.
  const strict = await ask("stronger, held to bracket 2", "play_rate", { maxBracket: 2 });
  const held = strict.rejected.filter((r) => r.code === "RAISES_BRACKET");
  console.log(`\nceiling at 3 held back: ${capped.rejected.filter((r) => r.code === "RAISES_BRACKET").length}`);
  console.log(`ceiling at 2 held back: ${held.length}`);
  if (held.length === 0) {
    console.error("FAIL: a bracket-2 ceiling should have refused the Game Changer tutors");
    process.exit(1);
  }
  for (const r of held.slice(0, 4)) console.log(`  refused ${r.name}: ${r.detail}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
