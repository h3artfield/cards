import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAGIC = "CS9KID01";
const SOURCES = ["scryfall", "pokemon_tcg", "ygoprodeck"];
const games = ["magic", "pokemon", "yugioh"];
const root = path.join(process.cwd(), "data", "scan-index");

function writeUtf8(chunks, value) {
  const buf = Buffer.from(value, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16LE(buf.length);
  chunks.push(len, buf);
}

function encode(cards) {
  const chunks = [Buffer.from(MAGIC, "utf8")];
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 0);
  header.writeUInt32LE(cards.length, 2);
  chunks.push(header);
  for (const card of cards) {
    const meta = Buffer.alloc(10);
    meta.writeBigUInt64LE(BigInt(`0x${card.hash}`), 0);
    meta.writeUInt8(0, 8);
    meta.writeUInt8(Math.max(0, SOURCES.indexOf(card.catalogSource)), 9);
    chunks.push(meta);
    writeUtf8(chunks, card.catalogId);
    writeUtf8(chunks, card.name);
    writeUtf8(chunks, card.setCode ?? "");
    writeUtf8(chunks, card.setName ?? "");
    writeUtf8(chunks, card.cardNumber ?? "");
    writeUtf8(chunks, card.imageUrl ?? "");
  }
  return Buffer.concat(chunks);
}

for (const game of games) {
  const cards = JSON.parse(readFileSync(path.join(root, game, "cards.json"), "utf8"));
  const bin = encode(cards);
  writeFileSync(path.join(root, game, "cards.bin"), bin);
  console.log(`wrote ${game} pack (${cards.length} cards, ${bin.length} bytes)`);
}
