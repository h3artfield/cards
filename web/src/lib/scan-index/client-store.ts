import { decodeScanIndexPack } from "./pack";
import type { ScanIndexCard, ScanIndexGame, ScanIndexManifest } from "./types";

const DB_NAME = "cards9k_scan_index";
const DB_VERSION = 1;
const STORE_NAME = "packs";

type StoredPackRecord = {
  game: ScanIndexGame;
  version: string;
  packedBuffer: ArrayBuffer;
  savedAt: number;
};

const memoryCache: Partial<Record<ScanIndexGame, { version: string; cards: ScanIndexCard[] }>> = {};
const inflight: Partial<Record<ScanIndexGame, Promise<ScanIndexCard[]>>> = {};

function openIndexDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "game" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readIdbPack(game: ScanIndexGame): Promise<StoredPackRecord | null> {
  const db = await openIndexDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(game);
      req.onsuccess = () => resolve((req.result as StoredPackRecord | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeIdbPack(record: StoredPackRecord): Promise<void> {
  const db = await openIndexDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadBrowserScanIndex(game: ScanIndexGame): Promise<ScanIndexCard[]> {
  const existingMem = memoryCache[game];
  if (existingMem && existingMem.cards.length > 0) {
    return existingMem.cards;
  }

  if (inflight[game]) {
    return inflight[game]!;
  }

  const promise = (async () => {
    const manifestRes = await fetch(`/api/scan-index/${game}`);
    if (!manifestRes.ok) {
      throw new Error(`Could not load ${game} scan index (${manifestRes.status})`);
    }
    const manifest = (await manifestRes.json()) as ScanIndexManifest & { packUrl?: string };

    if (existingMem && existingMem.version === manifest.version) {
      return existingMem.cards;
    }

    const stored = await readIdbPack(game);
    if (stored && stored.version === manifest.version && stored.packedBuffer?.byteLength > 0) {
      try {
        const cards = decodeScanIndexPack(stored.packedBuffer);
        memoryCache[game] = { version: manifest.version, cards };
        return cards;
      } catch {
        // Re-download if stored pack is corrupted
      }
    }

    const packRes = await fetch(manifest.packUrl ?? `/api/scan-index/${game}/pack`);
    if (!packRes.ok) {
      throw new Error(`Could not download ${game} pack (${packRes.status})`);
    }
    const buffer = await packRes.arrayBuffer();
    const cards = decodeScanIndexPack(buffer);
    memoryCache[game] = { version: manifest.version, cards };
    void writeIdbPack({
      game,
      version: manifest.version,
      packedBuffer: buffer,
      savedAt: Date.now(),
    });
    return cards;
  })();

  inflight[game] = promise;
  try {
    return await promise;
  } finally {
    delete inflight[game];
  }
}

export function appendRuntimeIndexedCard(
  game: ScanIndexGame,
  card: ScanIndexCard,
): void {
  const current = memoryCache[game];
  if (!current) {
    memoryCache[game] = { version: "runtime", cards: [card] };
    return;
  }
  const exists = current.cards.some(
    (c) => c.catalogSource === card.catalogSource && c.catalogId === card.catalogId,
  );
  if (!exists) {
    current.cards.unshift(card);
  }
}
