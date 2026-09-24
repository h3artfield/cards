import assert from "node:assert/strict";
import { dHashFromGray, hamming64, hashToHex, hexToHash } from "./dhash";
import { matchCluster, matchScanIndex } from "./match";
import { decodeScanIndexPack, encodeScanIndexPack } from "./pack";
import type { ScanIndexCard } from "./types";

const pixels = new Uint8Array(32 * 32);
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) {
    pixels[y * 32 + x] = x > 16 ? 20 : 220;
  }
}
const hash = dHashFromGray(pixels, 32, 32);
assert.ok(hash > 0n);
assert.equal(hexToHash(hashToHex(hash)), hash);
assert.equal(hamming64(hash, hash), 0);

const card: ScanIndexCard = {
  catalogId: "abc",
  catalogSource: "scryfall",
  name: "Sol Ring",
  setCode: "c21",
  setName: "Commander 2021",
  cardNumber: "263",
  hash,
};
const packed = encodeScanIndexPack([card]);
const decoded = decodeScanIndexPack(packed);
assert.equal(decoded.length, 1);
assert.equal(decoded[0]?.catalogId, "abc");
assert.equal(decoded[0]?.hash, hash);

const near = { ...card, catalogId: "def", hash: hash ^ 1n };
const far: ScanIndexCard = { ...card, catalogId: "zzz", name: "Other", hash: ~hash };
const hits = matchScanIndex(hash, [far, card, near]);
assert.equal(hits[0]?.card.catalogId, "abc");
assert.equal(matchCluster(hits).length, 2);

console.log("PASS  scan index pack + match");
