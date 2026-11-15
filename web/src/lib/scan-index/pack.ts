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

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

function encodeString(value: string): Uint8Array {
  const bytes = textEncoder.encode(value);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = bytes.length & 0xff;
  out[1] = (bytes.length >> 8) & 0xff;
  out.set(bytes, 2);
  return out;
}

function readUtf8Bytes(
  bytes: Uint8Array,
  offset: number,
): { value: string; next: number } {
  const length = (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
  const start = offset + 2;
  const end = start + length;
  return {
    value: textDecoder.decode(bytes.subarray(start, end)),
    next: end,
  };
}

const MASK_64 = BigInt("0xffffffffffffffff");

export function encodeScanIndexPack(cards: ScanIndexCard[]): Buffer {
  const chunks: Uint8Array[] = [];
  chunks.push(textEncoder.encode(SCAN_INDEX_MAGIC));
  const header = new Uint8Array(6);
  const headerView = new DataView(header.buffer);
  headerView.setUint16(0, SCAN_INDEX_FORMAT_VERSION, true);
  headerView.setUint32(2, cards.length, true);
  chunks.push(header);

  for (const card of cards) {
    const hasVHash = card.vHash != null && card.vHash !== BigInt(0);
    const hasDino = card.dinoHash != null && card.dinoHash.length === 6;
    const flags = (hasVHash ? 1 : 0) | (hasDino ? 2 : 0);
    const metaLen = 10 + (hasVHash ? 8 : 0) + (hasDino ? 48 : 0);
    const meta = new Uint8Array(metaLen);
    const metaView = new DataView(meta.buffer);
    metaView.setBigUint64(0, card.hash & MASK_64, true);
    metaView.setUint8(8, flags);
    metaView.setUint8(9, sourceCode(card.catalogSource));
    let metaOffset = 10;
    if (hasVHash) {
      metaView.setBigUint64(metaOffset, card.vHash! & MASK_64, true);
      metaOffset += 8;
    }
    if (hasDino) {
      for (let w = 0; w < 6; w++) {
        metaView.setBigUint64(metaOffset + w * 8, card.dinoHash![w]! & MASK_64, true);
      }
      metaOffset += 48;
    }
    chunks.push(meta);
    chunks.push(encodeString(card.catalogId));
    chunks.push(encodeString(card.name));
    chunks.push(encodeString(card.setCode ?? ""));
    chunks.push(encodeString(card.setName ?? ""));
    chunks.push(encodeString(card.cardNumber ?? ""));
    chunks.push(encodeString(card.imageUrl ?? ""));
  }

  let totalLength = 0;
  for (const chunk of chunks) totalLength += chunk.length;
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return typeof Buffer !== "undefined"
    ? Buffer.from(result.buffer, result.byteOffset, result.byteLength)
    : (result as unknown as Buffer);
}

export function decodeScanIndexPack(
  buf: Buffer | Uint8Array | ArrayBuffer,
): ScanIndexCard[] {
  const bytes =
    buf instanceof ArrayBuffer
      ? new Uint8Array(buf)
      : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const magic = textDecoder.decode(bytes.subarray(0, 8));
  if (magic !== SCAN_INDEX_MAGIC) {
    throw new Error("Not a scan index pack");
  }
  const version = view.getUint16(8, true);
  if (version !== SCAN_INDEX_FORMAT_VERSION) {
    throw new Error(`Unsupported scan index version ${version}`);
  }
  const count = view.getUint32(10, true);
  let offset = 14;
  const cards: ScanIndexCard[] = [];
  for (let i = 0; i < count; i++) {
    const hash = view.getBigUint64(offset, true);
    const flags = view.getUint8(offset + 8);
    const source = sourceFromCode(view.getUint8(offset + 9));
    offset += 10;
    let vHash: bigint | undefined;
    if ((flags & 1) === 1) {
      vHash = view.getBigUint64(offset, true);
      offset += 8;
    }
    let dinoHash: [bigint, bigint, bigint, bigint, bigint, bigint] | undefined;
    if ((flags & 2) === 2) {
      dinoHash = [
        view.getBigUint64(offset, true),
        view.getBigUint64(offset + 8, true),
        view.getBigUint64(offset + 16, true),
        view.getBigUint64(offset + 24, true),
        view.getBigUint64(offset + 32, true),
        view.getBigUint64(offset + 40, true),
      ];
      offset += 48;
    }
    const id = readUtf8Bytes(bytes, offset);
    const name = readUtf8Bytes(bytes, id.next);
    const setCode = readUtf8Bytes(bytes, name.next);
    const setName = readUtf8Bytes(bytes, setCode.next);
    const number = readUtf8Bytes(bytes, setName.next);
    const image = readUtf8Bytes(bytes, number.next);
    offset = image.next;
    cards.push({
      catalogId: id.value,
      catalogSource: source,
      name: name.value,
      setCode: setCode.value || undefined,
      setName: setName.value || undefined,
      cardNumber: number.value || undefined,
      hash,
      ...(vHash != null ? { vHash } : {}),
      ...(dinoHash != null ? { dinoHash } : {}),
      imageUrl: image.value || undefined,
    });
  }
  return cards;
}
