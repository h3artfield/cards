import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { hexToHash, hashToHex } from "./dhash";
import { binary384ToHex, hexToBinary384 } from "./dinov3-embed";
import { decodeScanIndexPack, encodeScanIndexPack } from "./pack";
import {
  SCAN_INDEX_ALGORITHM,
  SCAN_INDEX_FORMAT_VERSION,
  SCAN_INDEX_GAMES,
  isScanIndexGame,
  type ScanIndexCard,
  type ScanIndexGame,
  type ScanIndexManifest,
} from "./types";

export function scanIndexRoot(): string {
  return path.join(process.cwd(), "data", "scan-index");
}

export function scanIndexGameDir(game: ScanIndexGame): string {
  return path.join(scanIndexRoot(), game);
}

type JsonCard = Omit<ScanIndexCard, "hash" | "vHash" | "dinoHash"> & {
  hash: string;
  vHash?: string;
  dinoHash?: string;
};

export function manifestPath(game: ScanIndexGame): string {
  return path.join(scanIndexGameDir(game), "manifest.json");
}

export function packPath(game: ScanIndexGame): string {
  return path.join(scanIndexGameDir(game), "cards.bin");
}

export function jsonCardsPath(game: ScanIndexGame): string {
  return path.join(scanIndexGameDir(game), "cards.json");
}

export function readScanIndexManifest(game: ScanIndexGame): ScanIndexManifest | null {
  const file = manifestPath(game);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as ScanIndexManifest;
}

export function scanIndexPackBuffer(game: ScanIndexGame): Buffer {
  const bin = packPath(game);
  if (existsSync(bin)) return readFileSync(bin);
  return encodeScanIndexPack(readScanIndexCards(game));
}

export function readScanIndexCards(game: ScanIndexGame): ScanIndexCard[] {
  const bin = packPath(game);
  if (existsSync(bin)) return decodeScanIndexPack(readFileSync(bin));
  const json = jsonCardsPath(game);
  if (!existsSync(json)) return [];
  const rows = JSON.parse(readFileSync(json, "utf8")) as JsonCard[];
  return rows.map((row) => ({
    ...row,
    hash: hexToHash(row.hash),
    ...(row.vHash ? { vHash: hexToHash(row.vHash) } : {}),
    ...(row.dinoHash ? { dinoHash: hexToBinary384(row.dinoHash) } : {}),
  }));
}

export function writeScanIndexPack(args: {
  game: ScanIndexGame;
  cards: ScanIndexCard[];
  version?: string;
}): ScanIndexManifest {
  const dir = scanIndexGameDir(args.game);
  mkdirSync(dir, { recursive: true });
  const builtAt = new Date().toISOString();
  const manifest: ScanIndexManifest = {
    game: args.game,
    version: args.version ?? builtAt.replace(/[:.]/g, "-").slice(0, 19),
    algorithm: SCAN_INDEX_ALGORITHM,
    formatVersion: SCAN_INDEX_FORMAT_VERSION,
    cardCount: args.cards.length,
    builtAt,
    packFile: "cards.bin",
  };
  writeFileSync(packPath(args.game), encodeScanIndexPack(args.cards));
  writeFileSync(
    jsonCardsPath(args.game),
    `${JSON.stringify(
      args.cards.map((card) => ({
        ...card,
        hash: hashToHex(card.hash),
        ...(card.vHash != null ? { vHash: hashToHex(card.vHash) } : {}),
        ...(card.dinoHash != null ? { dinoHash: binary384ToHex(card.dinoHash) } : {}),
      })),
      null,
      2,
    )}\n`,
  );
  writeFileSync(manifestPath(args.game), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function listScanIndexGames(): ScanIndexManifest[] {
  return SCAN_INDEX_GAMES.map((game) => readScanIndexManifest(game)).filter(
    (row): row is ScanIndexManifest => Boolean(row),
  );
}

export function parseScanIndexGameParam(value: string): ScanIndexGame | null {
  const game = value.trim().toLowerCase();
  return isScanIndexGame(game) ? game : null;
}
