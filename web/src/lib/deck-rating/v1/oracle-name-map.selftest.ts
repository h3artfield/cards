import assert from "node:assert/strict";
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { resolve } from "node:path";
import {
  emptyOracleNameMap,
  ingestOracleRecord,
  putOracleName,
  resolveOracleName,
  type OracleNameInfo,
} from "./oracle-name-map";

function info(partial: Partial<OracleNameInfo> & Pick<OracleNameInfo, "oracleId" | "name" | "commanderLegal">): OracleNameInfo {
  return {
    typeLine: "Land",
    text: "",
    colorIdentity: [],
    cmc: 0,
    power: null,
    edhrecRank: null,
    ...partial,
  };
}

const legalTower = info({
  oracleId: "tower-legal",
  name: "Command Tower",
  commanderLegal: "legal",
  typeLine: "Land",
});
const reprintTower = info({
  oracleId: "tower-reprint",
  name: "Command Tower",
  commanderLegal: "not_legal",
  typeLine: "Card // Card",
});

{
  const map = emptyOracleNameMap();
  putOracleName(map, legalTower);
  putOracleName(map, reprintTower);
  assert.equal(resolveOracleName(map, "Command Tower")?.oracleId, "tower-legal");
}
{
  const map = emptyOracleNameMap();
  putOracleName(map, reprintTower);
  putOracleName(map, legalTower);
  assert.equal(resolveOracleName(map, "Command Tower")?.oracleId, "tower-legal");
}
{
  const map = emptyOracleNameMap();
  ingestOracleRecord(map, {
    oracle_id: "tower-reprint",
    name: "Command Tower",
    type_line: "Card // Card",
    legalities: { commander: "not_legal" },
  });
  ingestOracleRecord(map, {
    oracle_id: "tower-legal",
    name: "Command Tower",
    type_line: "Land",
    legalities: { commander: "legal" },
  });
  assert.equal(resolveOracleName(map, "Command Tower")?.oracleId, "tower-legal");
}

async function preconRegression(): Promise<void> {
  const snap = resolve(process.cwd(), "data/milestones/deck-rating/v1/snapshots/2026-09-25");
  const indexPath = resolve(snap, "mtgjson/commander-deck-index.json");
  const scryDir = resolve(snap, "scryfall");
  if (!existsSync(indexPath) || !existsSync(scryDir)) {
    console.log("oracle-name-map.selftest ok (synthetic only; snapshot missing)");
    return;
  }
  const dump =
    readdirSync(scryDir)
      .filter((n) => /^oracle-cards-.*\.jsonl\.gz$/.test(n))
      .sort()
      .map((n) => resolve(scryDir, n))
      .at(-1) ?? null;
  if (!dump) throw new Error("oracle-cards dump missing for precon regression");
  const map = emptyOracleNameMap();
  const rl = createInterface({ input: createReadStream(dump).pipe(createGunzip()) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    ingestOracleRecord(map, JSON.parse(line));
  }

  const index = JSON.parse(readFileSync(indexPath, "utf8")) as {
    commanderDecks: Array<{ name: string; type: string | null; extractedPath: string | null }>;
  };
  let cards = 0;
  let decks = 0;
  const mismatches: string[] = [];
  const reprintPairs: string[] = [];
  let bannedOk = 0;
  let notLegalOk = 0;
  for (const deck of index.commanderDecks) {
    if (!deck.extractedPath || !existsSync(deck.extractedPath)) continue;
    if (deck.type && !/commander/i.test(deck.type)) continue;
    const raw = JSON.parse(readFileSync(deck.extractedPath, "utf8")) as {
      data?: {
        commander?: Array<{ name?: string; type?: string; identifiers?: { scryfallOracleId?: string } }>;
        mainBoard?: Array<{ name?: string; type?: string; identifiers?: { scryfallOracleId?: string } }>;
      };
    };
    decks += 1;
    for (const card of [...(raw.data?.commander ?? []), ...(raw.data?.mainBoard ?? [])]) {
      const expected = card.identifiers?.scryfallOracleId;
      if (!expected || !card.name) continue;
      if (/\b(token|emblem|sticker)\b/i.test(card.type ?? "")) continue;
      cards += 1;
      const hit = resolveOracleName(map, card.name);
      if (!hit || hit.oracleId !== expected) {
        mismatches.push(`${deck.name}: ${card.name} expected ${expected} got ${hit?.oracleId ?? "null"}`);
      } else if (/^card(\s|\/\/|$)/i.test(hit.typeLine)) {
        reprintPairs.push(`${deck.name}: ${card.name} → ${hit.typeLine}`);
      } else if (hit.commanderLegal === "banned") bannedOk += 1;
      else if (hit.commanderLegal !== "legal") notLegalOk += 1;
    }
  }
  assert.equal(mismatches.length, 0, mismatches.slice(0, 8).join(" | "));
  assert.equal(reprintPairs.length, 0, reprintPairs.slice(0, 8).join(" | "));
  assert.ok(decks > 0 && cards > 1000, `precon regression too small decks=${decks} cards=${cards}`);
  console.log(
    `oracle-name-map.selftest ok (${decks} precons, ${cards} cards, banned ${bannedOk}, playtest/not_legal ${notLegalOk})`,
  );
}

preconRegression().catch((err) => {
  console.error(err);
  process.exit(1);
});
