/**
 * Build on-device scan packs: official art → dHash → cards.bin.
 *
 *   npx tsx scripts/scan-index/build-scan-index.ts --game magic --limit 50
 *   npx tsx scripts/scan-index/build-scan-index.ts --game all
 *
 * Install `sharp` in web/ for image decode. Without it, JPEG-only cards
 * still hash via the built-in decoder fallback.
 */
import { writeScanIndexPack } from "../../src/lib/scan-index/host";
import { dHashFromGray } from "../../src/lib/scan-index/dhash";
import type { ScanIndexCard, ScanIndexGame } from "../../src/lib/scan-index/types";
import { SCAN_INDEX_GAMES } from "../../src/lib/scan-index/types";
import { catalogCardFromScryfall } from "../../src/lib/deck-builder/scryfall-catalog";
import { scryfallFetch } from "../../src/lib/processing/scryfall-client";

type Args = {
  game: ScanIndexGame | "all";
  limit: number;
};

function parseArgs(argv: string[]): Args {
  let game: Args["game"] = "all";
  let limit = 0;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === "--game" && next) {
      game = next as Args["game"];
      i += 1;
    } else if (flag === "--limit" && next) {
      limit = Math.max(0, Number(next) || 0);
      i += 1;
    }
  }
  return { game, limit };
}

async function decodeGray(
  buffer: Buffer,
): Promise<{ pixels: Uint8Array; width: number; height: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(buffer)
      .greyscale()
      .resize(32, 32, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return { pixels: data, width: info.width, height: info.height };
  } catch {
    return decodeJpegGray(buffer);
  }
}

function decodeJpegGray(
  buffer: Buffer,
): { pixels: Uint8Array; width: number; height: number } | null {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  try {
    // jpeg-js is optional — the builder still writes metadata if it is missing.
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

async function hashImageUrl(url: string): Promise<bigint | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "cards-scan-index/1.0" },
    });
    if (!res.ok) return null;
    const gray = await decodeGray(Buffer.from(await res.arrayBuffer()));
    if (!gray) return null;
    return dHashFromGray(gray.pixels, gray.width, gray.height);
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectMagic(limit: number): Promise<ScanIndexCard[]> {
  const cards: ScanIndexCard[] = [];
  let url =
    "https://api.scryfall.com/cards/search?q=game%3Apaper+unique%3Aprints&unique=prints";
  while (url) {
    const res = await scryfallFetch(url);
    if (!res.ok) throw new Error(`Scryfall search failed (${res.status})`);
    const body = (await res.json()) as {
      data?: Record<string, unknown>[];
      has_more?: boolean;
      next_page?: string;
    };
    for (const raw of body.data ?? []) {
      const catalog = catalogCardFromScryfall(raw);
      const image = catalog?.imageArtCrop ?? catalog?.imageNormal;
      if (!catalog || !image) continue;
      const hash = await hashImageUrl(image);
      if (hash == null) continue;
      cards.push({
        catalogId: catalog.id,
        catalogSource: "scryfall",
        name: catalog.name,
        setCode: catalog.set,
        setName: catalog.setName,
        cardNumber: catalog.collectorNumber,
        hash,
        imageUrl: image,
      });
      if (limit && cards.length >= limit) return cards;
      await sleep(50);
    }
    url = body.has_more && body.next_page ? body.next_page : "";
    if (url) await sleep(100);
  }
  return cards;
}

async function collectPokemon(limit: number): Promise<ScanIndexCard[]> {
  const cards: ScanIndexCard[] = [];
  const apiKey = process.env.POKEMON_TCG_API_KEY;
  const headers: HeadersInit = apiKey ? { "X-Api-Key": apiKey } : {};
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.pokemontcg.io/v2/cards?pageSize=250&page=${page}`,
      { headers },
    );
    if (!res.ok) break;
    const body = (await res.json()) as {
      data?: Array<{
        id?: string;
        name?: string;
        number?: string;
        set?: { id?: string; name?: string };
        images?: { large?: string; small?: string };
      }>;
      count?: number;
    };
    const rows = body.data ?? [];
    if (!rows.length) break;
    for (const row of rows) {
      const id = row.id?.trim();
      const name = row.name?.trim();
      const image = row.images?.large ?? row.images?.small;
      if (!id || !name || !image) continue;
      const hash = await hashImageUrl(image);
      if (hash == null) continue;
      cards.push({
        catalogId: id,
        catalogSource: "pokemon_tcg",
        name,
        setCode: row.set?.id,
        setName: row.set?.name,
        cardNumber: row.number,
        hash,
        imageUrl: image,
      });
      if (limit && cards.length >= limit) return cards;
      await sleep(20);
    }
    page += 1;
  }
  return cards;
}

async function collectYugioh(limit: number): Promise<ScanIndexCard[]> {
  const res = await fetch("https://db.ygoprodeck.com/api/v7/cardinfo.php");
  if (!res.ok) throw new Error(`YGOProDeck failed (${res.status})`);
  const body = (await res.json()) as {
    data?: Array<{
      id?: number;
      name?: string;
      card_images?: Array<{ image_url?: string }>;
      card_sets?: Array<{ set_name?: string; set_code?: string }>;
    }>;
  };
  const cards: ScanIndexCard[] = [];
  for (const row of body.data ?? []) {
    const id = row.id != null ? String(row.id) : "";
    const name = row.name?.trim();
    const image = row.card_images?.[0]?.image_url;
    if (!id || !name || !image) continue;
    const hash = await hashImageUrl(image);
    if (hash == null) continue;
    const set = row.card_sets?.[0];
    cards.push({
      catalogId: id,
      catalogSource: "ygoprodeck",
      name,
      setCode: set?.set_code,
      setName: set?.set_name,
      hash,
      imageUrl: image,
    });
    if (limit && cards.length >= limit) return cards;
    await sleep(20);
  }
  return cards;
}

async function buildGame(game: ScanIndexGame, limit: number): Promise<void> {
  console.log(`[scan-index] building ${game}${limit ? ` (limit ${limit})` : ""}`);
  const cards =
    game === "magic"
      ? await collectMagic(limit)
      : game === "pokemon"
        ? await collectPokemon(limit)
        : await collectYugioh(limit);
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
    await buildGame(game, args.limit);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
