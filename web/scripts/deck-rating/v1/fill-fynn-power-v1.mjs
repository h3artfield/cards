import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../../../data/milestones/deck-rating/v1/plan-factory/status.json", import.meta.url);
const status = JSON.parse(readFileSync(path, "utf8"));
const cards = [...status.deck.cards, ...status.deck.commanders];
const ids = [...new Set(cards.map((card) => card.oracleId))];
const response = await fetch("https://api.scryfall.com/cards/collection", {
  method: "POST",
  headers: { "Content-Type": "application/json", "User-Agent": "cards-plan-checker/1.0", Accept: "application/json" },
  body: JSON.stringify({ identifiers: ids.map((oracle_id) => ({ oracle_id })) }),
});
if (!response.ok) {
  console.error(response.status, await response.text());
  process.exit(1);
}
const body = await response.json();
const byId = new Map(body.data.map((card) => [card.oracle_id, card]));
let filled = 0;
let skipped = 0;
for (const card of cards) {
  const row = byId.get(card.oracleId);
  if (!row || row.power == null || row.power === "") {
    skipped += 1;
    continue;
  }
  const power = Number(row.power);
  if (!Number.isFinite(power)) {
    skipped += 1;
    continue;
  }
  card.power = power;
  filled += 1;
}
writeFileSync(path, JSON.stringify(status));
const fynn = status.deck.commanders[0];
console.log(JSON.stringify({ filled, skipped, notFound: (body.not_found ?? []).length, fynn: { name: fynn.name, power: fynn.power, cmc: fynn.cmc } }));
