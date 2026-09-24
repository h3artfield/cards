import type { CatalogSource } from "../card-flow-v2/types";
import {
  SCAN_INDEX_FORMAT_VERSION,
  SCAN_INDEX_MAGIC,
  type ScanIndexCard,
} from "./types";

const SOURCE_CODES: CatalogSource[] = [
  "scryfall",
  "pokemon_tcg",
  "ygoprodeck",
];

function sourceCode(source: CatalogSource): number {
  const index = SOURCE_CODES.indexOf(source);
  return index >= 0 ? index : 0;
}

function sourceFromCode(code: number): CatalogSource {
  return SOURCE_CODES[code] ?? "unknown";
}

function writeUtf8(chunks: Buffer[], value: string): void {
  const buf = Buffer.from(value, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16LE(buf.length);
  chunks.push(len, buf);
}

function readUtf8(buf: Buffer, offset: number): { value: string; next: number } {
  const length = buf.readUInt16LE(offset);
  const start = offset + 2;
  const end = start + length;
  return { value: buf.subarray(start, end).toString("utf8"), next: end };
}

export function encodeScanIndexPack(cards: ScanIndexCard[]): Buffer {
  const chunks: Buffer[] = [];
  chunks.push(Buffer.from(SCAN_INDEX_MAGIC, "utf8"));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(SCAN_INDEX_FORMAT_VERSION, 0);
  header.writeUInt32LE(cards.length, 2);
  chunks.push(header);

  for (const card of cards) {
    const meta = Buffer.alloc(10);
    meta.writeBigUInt64LE(card.hash & 0xffffffffffffffffn, 0);
    meta.writeUInt8(0, 8);
    meta.writeUInt8(sourceCode(card.catalogSource), 9);
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

export function decodeScanIndexPack(buf: Buffer): ScanIndexCard[] {
  const magic = buf.subarray(0, 8).toString("utf8");
  if (magic !== SCAN_INDEX_MAGIC) {
    throw new Error("Not a scan index pack");
  }
  const version = buf.readUInt16LE(8);
  if (version !== SCAN_INDEX_FORMAT_VERSION) {
    throw new Error(`Unsupported scan index version ${version}`);
  }
  const count = buf.readUInt32LE(10);
  let offset = 14;
  const cards: ScanIndexCard[] = [];
  for (let i = 0; i < count; i++) {
    const hash = buf.readBigUInt64LE(offset);
    const source = sourceFromCode(buf.readUInt8(offset + 9));
    offset += 10;
    const id = readUtf8(buf, offset);
    const name = readUtf8(buf, id.next);
    const setCode = readUtf8(buf, name.next);
    const setName = readUtf8(buf, setCode.next);
    const number = readUtf8(buf, setName.next);
    const image = readUtf8(buf, number.next);
    offset = image.next;
    cards.push({
      catalogId: id.value,
      catalogSource: source,
      name: name.value,
      setCode: setCode.value || undefined,
      setName: setName.value || undefined,
      cardNumber: number.value || undefined,
      hash,
      imageUrl: image.value || undefined,
    });
  }
  return cards;
}
