/**
 * Build on-device scan packs: official art → canonical dHash → cards.bin.
 *
 *   npx tsx scripts/scan-index/build-scan-index.ts --game magic --limit 50
 *   npx tsx scripts/scan-index/build-scan-index.ts --game all
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { readScanIndexCards, writeScanIndexPack } from "../../src/lib/scan-index/host";
import {
  dHashCanonicalCardFromGray,
  dHashFromGray,
  vHashCanonicalCardFromGray,
} from "../../src/lib/scan-index/dhash";
import {
  DINOV3_MODEL_ID,
  poolDinoV3Features,
  quantizeDinoV3ToBinary384,
  type Binary384,
} from "../../src/lib/scan-index/dinov3-embed";
import type { ScanIndexCard, ScanIndexGame } from "../../src/lib/scan-index/types";
import { SCAN_INDEX_GAMES } from "../../src/lib/scan-index/types";
import {
  catalogCardFromScryfall,
  fetchScryfallBulkDownloadUri,
} from "../../src/lib/deck-builder/scryfall-catalog";
import { scryfallFetch } from "../../src/lib/processing/scryfall-client";

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  try {
    const content = readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  } catch {
    // ignore
  }
}
loadEnvLocal();

type Args = {
  game: ScanIndexGame | "all";
  limit: number;
  concurrency: number;
  withDino: boolean;
};

function parseArgs(argv: string[]): Args {
  let game: Args["game"] = "all";
  let limit = 0;
  let concurrency = 20;
  let withDino = argv.includes("--dinov3");
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === "--game" && next) {
      game = next as Args["game"];
      i += 1;
    } else if (flag === "--limit" && next) {
      limit = Math.max(0, Number(next) || 0);
      i += 1;
    } else if (flag === "--concurrency" && next) {
      concurrency = Math.max(1, Math.min(64, Number(next) || 20));
      i += 1;
    }
  }
  return { game, limit, concurrency, withDino };
}

let sharpModulePromise: Promise<typeof import("sharp") | null> | null = null;
function getSharp() {
  if (!sharpModulePromise) {
    sharpModulePromise = import("sharp")
      .then((m) => m.default ?? (m as unknown as typeof import("sharp")))
      .catch(() => null);
  }
  return sharpModulePromise;
}

async function decodeGray(
  buffer: Buffer,
  width: number,
  height: number,
): Promise<{ pixels: Uint8Array; width: number; height: number } | null> {
  const sharp = await getSharp();
  if (sharp) {
    try {
      const { data, info } = await sharp(buffer)
        .greyscale()
        .resize(width, height, { fit: "fill" })
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { pixels: data, width: info.width, height: info.height };
    } catch {
      return null;
    }
  }
  return decodeJpegGray(buffer);
}

function decodeJpegGray(
  buffer: Buffer,
): { pixels: Uint8Array; width: number; height: number } | null {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jpeg = require("jpeg-js") as {
      decode: (
        buf: Buffer,
        opts?: { formatAsRGBA?: boolean },
      ) => { data: Uint8Array; width: number; height: number };
    };
    const decoded = jpeg.decode(buffer, { formatAsRGBA: true });
    const gray = new Uint8Array(decoded.width * decoded.height);
    for (let i = 0; i < gray.length; i++) {
      const r = decoded.data[i * 4] ?? 0;
      const g = decoded.data[i * 4 + 1] ?? 0;
      const b = decoded.data[i * 4 + 2] ?? 0;
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
    return { pixels: gray, width: decoded.width, height: decoded.height };
  } catch {
    return null;
  }
}

let dinoExtractorPromise: Promise<
  ((input: unknown) => Promise<{ data: Float32Array | number[]; dims: number[] }>) | null
> | null = null;

function getDinoExtractor() {
  if (!dinoExtractorPromise) {
    dinoExtractorPromise = import("@huggingface/transformers")
      .then(async ({ pipeline }) => {
        const pipe = await pipeline("image-feature-extraction", DINOV3_MODEL_ID, {
          dtype: "q8",
        });
        return pipe as unknown as (
          input: unknown,
        ) => Promise<{ data: Float32Array | number[]; dims: number[] }>;
      })
      .catch((err) => {
        console.warn("[scan-index] DINOv3 extractor unavailable:", err);
        return null;
      });
  }
  return dinoExtractorPromise;
}

async function computeDinoHashFromUrl(url: string): Promise<Binary384 | undefined> {
  const extractor = await getDinoExtractor();
  if (!extractor) return undefined;
  try {
    const tensor = await extractor(url);
    if (!tensor?.data || !tensor?.dims) return undefined;
    return quantizeDinoV3ToBinary384(poolDinoV3Features(tensor.data, tensor.dims));
  } catch {
    return undefined;
  }
}

async function hashCardImageUrl(
  url: string,
  isArtCropOnly = false,
  withDino = false,
): Promise<{ hash: bigint; vHash: bigint; dinoHash?: Binary384 } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "cards-scan-index/1.0" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const dinoHash = withDino ? await computeDinoHashFromUrl(url) : undefined;
    if (isArtCropOnly) {
      const gray = await decodeGray(buffer, 32, 32);
      if (!gray) return null;
      const h = dHashFromGray(gray.pixels, gray.width, gray.height);
      return { hash: h, vHash: BigInt(0), ...(dinoHash ? { dinoHash } : {}) };
    }
    const fullGray = await decodeGray(buffer, 160, 224);
    if (!fullGray) return null;
    const hash = dHashCanonicalCardFromGray(
      fullGray.pixels,
      fullGray.width,
      fullGray.height,
    );
    const vHash = vHashCanonicalCardFromGray(
      fullGray.pixels,
      fullGray.width,
      fullGray.height,
    );
    return { hash, vHash, ...(dinoHash ? { dinoHash } : {}) };
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        await worker(items[idx]!, idx);
      }
    },
  );
  await Promise.all(runners);
}

async function collectMagic(
  limit: number,
  concurrency: number,
  withDino: boolean,
): Promise<ScanIndexCard[]> {
  const existing = new Map(
    readScanIndexCards("magic").map((c) => [c.catalogId, c]),
  );
  const cards: ScanIndexCard[] = [];
  // Order by edhrec rank so the most played / traded Magic cards are indexed first!
  let url =
    "https://api.scryfall.com/cards/search?q=game%3Apaper&unique=cards&order=edhrec";
  let pageCount = 0;

  while (url) {
    const res = await scryfallFetch(url);
    if (!res.ok) throw new Error(`Scryfall search failed (${res.status})`);
    const body = (await res.json()) as {
      data?: Record<string, unknown>[];
      has_more?: boolean;
      next_page?: string;
    };
    const rawBatch = body.data ?? [];
    pageCount += 1;

    const batchTargets = rawBatch
      .map((raw) => catalogCardFromScryfall(raw))
      .filter((c): c is NonNullable<typeof c> =>
        Boolean(c && (c.imageNormal ?? c.imageArtCrop)),
      );

    const needed = limit
      ? batchTargets.slice(0, Math.max(0, limit - cards.length))
      : batchTargets;

    const batchResults: Array<ScanIndexCard | null> = new Array(needed.length).fill(null);

    await runPool(needed, concurrency, async (catalog, i) => {
      const cached = existing.get(catalog.id);
      if (cached && cached.hash && cached.vHash && (!withDino || cached.dinoHash)) {
        batchResults[i] = cached;
        return;
      }
      const image = catalog.imageNormal ?? catalog.imageArtCrop!;
      const isArtCropOnly = !catalog.imageNormal && Boolean(catalog.imageArtCrop);
      if (cached && cached.hash && cached.vHash && withDino) {
        const dinoHash = await computeDinoHashFromUrl(image);
        batchResults[i] = {
          ...cached,
          ...(dinoHash ? { dinoHash } : {}),
        };
        return;
      }
      const hashes = await hashCardImageUrl(image, isArtCropOnly, withDino);
      if (!hashes) return;
      batchResults[i] = {
        catalogId: catalog.id,
        catalogSource: "scryfall",
        name: catalog.name,
        setCode: catalog.set,
        setName: catalog.setName,
        cardNumber: catalog.collectorNumber,
        hash: hashes.hash,
        vHash: hashes.vHash,
        ...(hashes.dinoHash ? { dinoHash: hashes.dinoHash } : {}),
        imageUrl: catalog.imageNormal ?? image,
      };
    });

    for (const item of batchResults) {
      if (item) cards.push(item);
    }

    console.log(
      `[scan-index:magic] page ${pageCount} · ${cards.length} cards hashed`,
    );

    if (pageCount % 3 === 0) {
      writeScanIndexPack({ game: "magic", cards });
    }

    if (limit && cards.length >= limit) {
      const merged = cards.slice(0, limit);
      for (const prevCard of existing.values()) {
        if (!merged.some((c) => c.catalogId === prevCard.catalogId)) {
          merged.push(prevCard);
        }
      }
      return merged;
    }
    url = body.has_more && body.next_page ? body.next_page : "";
    if (url) await sleep(80);
  }
  for (const prevCard of existing.values()) {
    if (!cards.some((c) => c.catalogId === prevCard.catalogId)) {
      cards.push(prevCard);
    }
  }
  return cards;
}

async function collectPokemon(
  limit: number,
  concurrency: number,
  withDino: boolean,
): Promise<ScanIndexCard[]> {
  const existing = new Map(
    readScanIndexCards("pokemon").map((c) => [c.catalogId, c]),
  );
  const cards: ScanIndexCard[] = [];
  const apiKey = process.env.POKEMON_TCG_API_KEY;
  const headers: HeadersInit = apiKey ? { "X-Api-Key": apiKey } : {};
  let page = 1;
  while (true) {
    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(
          `https://api.pokemontcg.io/v2/cards?select=id,name,number,set,images&pageSize=250&page=${page}`,
          { headers, signal: AbortSignal.timeout(45_000) },
        );
        if (res.ok) break;
      } catch (err) {
        if (attempt === 2) {
          console.warn(`[scan-index:pokemon] page ${page} fetch error:`, err);
        }
      }
      await sleep(1000 * (attempt + 1));
    }
    if (!res || !res.ok) break;
    const body = (await res.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        number?: string;
        set?: { id?: string; name?: string };
        images?: { large?: string; small?: string };
      }>;
    };
    const rows = (body.data ?? []).filter(
      (r) => r.id?.trim() && r.name?.trim() && (r.images?.small ?? r.images?.large),
    );
    if (!rows.length) break;

    const needed = limit
      ? rows.slice(0, Math.max(0, limit - cards.length))
      : rows;
    const batchResults: Array<ScanIndexCard | null> = new Array(needed.length).fill(null);

    await runPool(needed, concurrency, async (row, i) => {
      const id = row.id!.trim();
      const cached = existing.get(id);
      if (cached && cached.hash && cached.vHash && (!withDino || cached.dinoHash)) {
        batchResults[i] = cached;
        return;
      }
      // Prefer small image during bulk indexing for 4x faster download, identical 160x224 dHash
      const hashImage = row.images?.small ?? row.images?.large!;
      const displayImage = row.images?.large ?? row.images?.small!;
      if (cached && cached.hash && cached.vHash && withDino) {
        const dinoHash = await computeDinoHashFromUrl(hashImage);
        batchResults[i] = {
          ...cached,
          ...(dinoHash ? { dinoHash } : {}),
        };
        return;
      }
      const hashes = await hashCardImageUrl(hashImage, false, withDino);
      if (!hashes) return;
      batchResults[i] = {
        catalogId: id,
        catalogSource: "pokemon_tcg",
        name: row.name!.trim(),
        setCode: row.set?.id,
        setName: row.set?.name,
        cardNumber: row.number,
        hash: hashes.hash,
        vHash: hashes.vHash,
        ...(hashes.dinoHash ? { dinoHash: hashes.dinoHash } : {}),
        imageUrl: displayImage,
      };
    });

    for (const item of batchResults) {
      if (item) cards.push(item);
    }

    console.log(
      `[scan-index:pokemon] page ${page} · ${cards.length} cards hashed`,
    );
    writeScanIndexPack({ game: "pokemon", cards });

    if (limit && cards.length >= limit) {
      const merged = cards.slice(0, limit);
      for (const prevCard of existing.values()) {
        if (!merged.some((c) => c.catalogId === prevCard.catalogId)) {
          merged.push(prevCard);
        }
      }
      return merged;
    }
    page += 1;
  }
  for (const prevCard of existing.values()) {
    if (!cards.some((c) => c.catalogId === prevCard.catalogId)) {
      cards.push(prevCard);
    }
  }
  return cards;
}

async function collectYugioh(
  limit: number,
  concurrency: number,
): Promise<ScanIndexCard[]> {
  const existing = new Map(
    readScanIndexCards("yugioh").map((c) => [c.catalogId, c]),
  );
  const res = await fetch("https://db.ygoprodeck.com/api/v7/cardinfo.php", {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`YGOProDeck failed (${res.status})`);
  const body = (await res.json()) as {
    data?: Array<{
      id?: number;
      name?: string;
      card_images?: Array<{ image_url?: string; image_url_small?: string }>;
      card_sets?: Array<{ set_name?: string; set_code?: string }>;
    }>;
  };
  const allRows = (body.data ?? []).filter(
    (row) =>
      row.id != null &&
      row.name?.trim() &&
      (row.card_images?.[0]?.image_url_small ?? row.card_images?.[0]?.image_url),
  );
  const targetRows = limit ? allRows.slice(0, limit) : allRows;
  const cards: ScanIndexCard[] = [];

  const CHUNK_SIZE = 250;
  for (let offset = 0; offset < targetRows.length; offset += CHUNK_SIZE) {
    const slice = targetRows.slice(offset, offset + CHUNK_SIZE);
    const batchResults: Array<ScanIndexCard | null> = new Array(slice.length).fill(null);

    await runPool(slice, concurrency, async (row, i) => {
      const id = String(row.id);
      const cached = existing.get(id);
      if (cached && cached.hash) {
        batchResults[i] = cached;
        return;
      }
      const hashImg =
        row.card_images?.[0]?.image_url_small ??
        row.card_images?.[0]?.image_url!;
      const displayImg = row.card_images?.[0]?.image_url ?? hashImg;
      const hash = await hashCardImageUrl(hashImg, false);
      if (hash == null) return;
      const set = row.card_sets?.[0];
      batchResults[i] = {
        catalogId: id,
        catalogSource: "ygoprodeck",
        name: row.name!.trim(),
        setCode: set?.set_code,
        setName: set?.set_name,
        hash,
        imageUrl: displayImg,
      };
    });

    for (const item of batchResults) {
      if (item) cards.push(item);
    }

    console.log(
      `[scan-index:yugioh] ${cards.length}/${targetRows.length} cards hashed`,
    );
    writeScanIndexPack({ game: "yugioh", cards });
  }

  return cards;
}

async function buildGame(
  game: ScanIndexGame,
  limit: number,
  concurrency: number,
  withDino: boolean,
): Promise<void> {
  console.log(
    `[scan-index] building ${game}${limit ? ` (limit ${limit})` : ""} with concurrency=${concurrency}${withDino ? " + DINOv3" : ""}`,
  );
  const cards =
    game === "magic"
      ? await collectMagic(limit, concurrency, withDino)
      : await collectPokemon(limit, concurrency, withDino);
  const manifest = writeScanIndexPack({ game, cards });
  console.log(
    `[scan-index] wrote ${manifest.cardCount} ${game} cards → data/scan-index/${game}/`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const games =
    args.game === "all" ? [...SCAN_INDEX_GAMES] : [args.game as ScanIndexGame];
  if (args.game !== "all" && !SCAN_INDEX_GAMES.includes(args.game)) {
    throw new Error(`Unknown game ${args.game}`);
  }
  for (const game of games) {
    await buildGame(game, args.limit, args.concurrency, args.withDino);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
