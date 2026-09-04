/**
 * Build a card play-rate index from the TopDeck tournament corpus.
 *
 * RC8 semantic distance says what a card does, not how well it does it: Sol
 * Ring and Mana Screw sit at distance 0.000. Play rate supplies the missing
 * quality axis, so a swap engine can tell an upgrade from a look-alike.
 *
 * The rate is conditioned on eligibility rather than global: a card is only
 * counted against decks whose commander could legally run it. Otherwise every
 * mono-color card looks unplayed next to colorless staples.
 *
 * Run: cd web && npx tsx scripts/build-topdeck-card-play-rate-v1.ts
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  getSemanticMapPoint,
  loadSemanticMapPoints,
} from "../src/lib/semantic-visualization/artifact-loader";

const TOPDECK_ROOT = "data/milestones/topdeck/topdeckImportRuns";
const OUT_PATH = "data/milestones/commander-strategy/topdeck-card-play-rate-v1.json";
const COLORS = ["W", "U", "B", "R", "G"] as const;
/** Below this, a rate is noise rather than a signal. */
const MIN_ELIGIBLE_DECKS = 50;

type TopDeckRow = {
  commanderOracleIds?: string[];
  mainboard?: Array<{ oracleId?: string | null }>;
};

function identityMask(colors: readonly string[]): number {
  let mask = 0;
  for (const color of colors) {
    const index = COLORS.indexOf(color as (typeof COLORS)[number]);
    if (index >= 0) mask |= 1 << index;
  }
  return mask;
}

function largestRun(): string {
  const root = resolve(process.cwd(), TOPDECK_ROOT);
  const files = readdirSync(root)
    .map((dir) => join(root, dir, "normalized-decks-v3.json"))
    .filter((path) => existsSync(path))
    .map((path) => ({ path, size: statSync(path).size }))
    .sort((a, b) => b.size - a.size);
  if (!files[0]) throw new Error("no TopDeck run files found");
  return files[0].path;
}

function main(): void {
  loadSemanticMapPoints();
  const file = largestRun();
  console.log(`reading ${file}`);
  const decks = JSON.parse(readFileSync(file, "utf8")) as TopDeckRow[];

  /** Deck counts per commander identity mask, used to derive eligibility. */
  const decksByMask = new Array<number>(32).fill(0);
  const timesPlayed = new Map<string, number>();
  let usableDecks = 0;

  for (const deck of decks) {
    const commanderIds = deck.commanderOracleIds ?? [];
    const mainboard = deck.mainboard ?? [];
    if (!commanderIds.length || mainboard.length < 60) continue;

    let commanderMask = 0;
    let resolvedCommander = false;
    for (const oracleId of commanderIds) {
      const point = getSemanticMapPoint(oracleId);
      if (!point) continue;
      resolvedCommander = true;
      commanderMask |= identityMask(point.colorIdentity);
    }
    if (!resolvedCommander) continue;

    usableDecks += 1;
    decksByMask[commanderMask] = (decksByMask[commanderMask] ?? 0) + 1;

    const seen = new Set<string>();
    for (const row of mainboard) {
      if (!row.oracleId || seen.has(row.oracleId)) continue;
      seen.add(row.oracleId);
      timesPlayed.set(row.oracleId, (timesPlayed.get(row.oracleId) ?? 0) + 1);
    }
  }

  /** Decks whose commander identity is a superset of each card identity. */
  const eligibleByMask = new Array<number>(32).fill(0);
  for (let cardMask = 0; cardMask < 32; cardMask++) {
    let total = 0;
    for (let deckMask = 0; deckMask < 32; deckMask++) {
      if ((cardMask & ~deckMask) === 0) total += decksByMask[deckMask] ?? 0;
    }
    eligibleByMask[cardMask] = total;
  }

  const cards: Record<string, { n: number; eligible: number; rate: number }> = {};
  let recorded = 0;
  for (const [oracleId, n] of timesPlayed) {
    const point = getSemanticMapPoint(oracleId);
    if (!point) continue;
    const eligible = eligibleByMask[identityMask(point.colorIdentity)] ?? 0;
    if (eligible < MIN_ELIGIBLE_DECKS) continue;
    cards[oracleId] = { n, eligible, rate: n / eligible };
    recorded += 1;
  }

  const payload = {
    version: "topdeck-card-play-rate-v1",
    builtAt: new Date().toISOString(),
    sourceRun: file.replace(/\\/g, "/").split("/").slice(-2, -1)[0],
    deckCount: usableDecks,
    minEligibleDecks: MIN_ELIGIBLE_DECKS,
    cards,
  };
  writeFileSync(resolve(process.cwd(), OUT_PATH), JSON.stringify(payload));

  console.log(`${usableDecks} usable decks, ${recorded} cards recorded`);
  console.log(`wrote ${OUT_PATH}`);

  const top = Object.entries(cards)
    .sort((a, b) => b[1].rate - a[1].rate)
    .slice(0, 15);
  console.log(`\nmost-played cards by eligibility-conditioned rate:`);
  for (const [oracleId, stat] of top) {
    console.log(
      `  ${(getSemanticMapPoint(oracleId)?.name ?? oracleId).padEnd(28)} ${(stat.rate * 100).toFixed(1)}%  (${stat.n}/${stat.eligible})`,
    );
  }
}

main();
