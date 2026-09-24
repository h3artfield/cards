import { classifyInventoryGame } from "./analytics";
import { cardNameFromInventoryItem } from "./image-fallback";
import { INVENTORY_IMAGE_FETCH_TIMEOUT_MS } from "./resolve-display-image";
import type { InventoryItem } from "../types";

type ImageFetchResult = { buffer: Buffer; contentType: string };

async function fetchRemoteImage(url: string): Promise<ImageFetchResult> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "CardScanner/1.0 (https://cardscanner9000.com)",
      Accept: "image/avif,image/webp,image/apng,image/jpeg,image/png,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 100) throw new Error("Image response too small");
  return { buffer, contentType };
}

type LorcastCard = {
  name?: string;
  version?: string;
  collector_number?: string;
  tcgplayer_id?: number;
  set?: { name?: string };
  image_uris?: { digital?: { large?: string; normal?: string; full?: string } };
};

function normalizeCardNumber(value: string | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const left = raw.split("/")[0]?.trim();
  if (!left) return undefined;
  return left.replace(/^0+/, "") || "0";
}

function lorcastCardMatchesItem(
  item: InventoryItem,
  card: LorcastCard,
): boolean {
  const wantedNum = normalizeCardNumber(item.cardNumber);
  const gotNum = normalizeCardNumber(card.collector_number);
  if (wantedNum && gotNum && wantedNum !== gotNum) return false;

  const setHint = item.setName?.trim().toLowerCase();
  const gotSet = card.set?.name?.trim().toLowerCase();
  if (setHint && gotSet) {
    const setToken = setHint.split(/[^a-z0-9]+/i).filter((t) => t.length > 3)[0];
    if (setToken && !gotSet.includes(setToken)) return false;
  }

  const wantedName = cardNameFromInventoryItem(item).toLowerCase();
  const gotName = [card.name, card.version].filter(Boolean).join(" ").toLowerCase();
  if (!wantedName || !gotName) return true;

  const wantedTokens = wantedName
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (!wantedTokens.length) return true;
  return wantedTokens.every((token) => gotName.includes(token));
}

function lorcastImageUrl(card: LorcastCard | undefined): string | undefined {
  if (!card) return undefined;
  return (
    card.image_uris?.digital?.full ??
    card.image_uris?.digital?.large ??
    card.image_uris?.digital?.normal
  );
}

async function searchLorcastCards(q: string): Promise<LorcastCard[]> {
  const res = await fetch(
    `https://api.lorcast.com/v0/cards/search?q=${encodeURIComponent(q)}&unique=prints`,
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
    },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { results?: LorcastCard[] };
  return body.results ?? [];
}

export async function fetchLorcastInventoryImage(
  item: InventoryItem,
): Promise<ImageFetchResult | null> {
  if (classifyInventoryGame(item) !== "Lorcana") return null;

  const name = cardNameFromInventoryItem(item);
  const plainName = name
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const setName = item.setName?.trim();
  const num = item.cardNumber?.trim();
  const queries = [
    plainName && setName ? `${plainName} ${setName}` : null,
    plainName && num ? `${plainName} ${num}` : null,
    plainName,
    item.productName?.trim()?.replace(/\s*-\s*/g, " "),
    name,
  ].filter(Boolean) as string[];

  for (const query of queries) {
    const hits = await searchLorcastCards(query);
    const match =
      hits.find((card) => lorcastCardMatchesItem(item, card)) ?? hits[0];
    const img = lorcastImageUrl(match);
    if (!img) continue;
    try {
      return await fetchRemoteImage(img);
    } catch {
      /* try next query */
    }
  }
  return null;
}

type FabCardVaultHit = {
  print_id?: string;
  printed_name?: string;
  faces?: Array<{ image?: { normal?: string; large?: string } }>;
};

function fabCardMatchesItem(item: InventoryItem, hit: FabCardVaultHit): boolean {
  const num = item.cardNumber?.trim().toUpperCase();
  const printId = hit.print_id?.trim().toUpperCase();
  if (num && printId && num === printId) return true;

  const wanted = cardNameFromInventoryItem(item).toLowerCase();
  const got = hit.printed_name?.trim().toLowerCase();
  if (!wanted || !got) return false;
  const wantedTokens = wanted
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (!wantedTokens.length) return false;
  return wantedTokens.every((token) => got.includes(token));
}

export async function fetchFabCardVaultInventoryImage(
  item: InventoryItem,
): Promise<ImageFetchResult | null> {
  if (classifyInventoryGame(item) !== "Flesh & Blood") return null;

  const queries = [
    item.cardNumber?.trim(),
    cardNameFromInventoryItem(item),
    item.productName?.trim(),
  ].filter(Boolean) as string[];

  for (const query of queries) {
    const res = await fetch(
      `https://api.cardvault.fabtcg.com/carddb/api/v1/advanced-search/?q=${encodeURIComponent(query)}&page_size=24&orderby=name`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) continue;

    const body = (await res.json()) as { results?: FabCardVaultHit[] };
    const hits = body.results ?? [];
    const match =
      hits.find((hit) => fabCardMatchesItem(item, hit)) ??
      (item.cardNumber ? hits.find((hit) => hit.print_id === item.cardNumber) : undefined) ??
      hits[0];
    const img =
      match?.faces?.[0]?.image?.normal ?? match?.faces?.[0]?.image?.large;
    if (!img) continue;
    try {
      return await fetchRemoteImage(img);
    } catch {
      /* try next query */
    }
  }
  return null;
}

const RIFTBOUND_SET_CODES: Record<string, string> = {
  origins: "OGN",
  "proving grounds": "OGS",
  spiritforged: "SFD",
  unleashed: "UNL",
  vendetta: "VEN",
};

type RiftboundGalleryCard = {
  name?: string;
  publicCode?: string;
  cardImage?: { url?: string };
  set?: { value?: { id?: string; label?: string } };
};

type RiftboundGalleryJson = {
  pageProps?: {
    page?: {
      blades?: Array<{
        fragmentId?: string;
        cards?: { items?: RiftboundGalleryCard[] };
      }>;
    };
  };
};

let riftboundGalleryCache:
  | { fetchedAt: number; byPublicCode: Map<string, string>; byNameSet: Map<string, string> }
  | undefined;

const RIFTBOUND_GALLERY_TTL_MS = 6 * 60 * 60 * 1000;

function riftboundPublicCode(item: InventoryItem): string | undefined {
  const setName = item.setName?.trim().toLowerCase();
  const setCode = setName ? RIFTBOUND_SET_CODES[setName] : undefined;
  const num = item.cardNumber?.trim();
  if (!setCode || !num) return undefined;
  return `${setCode}-${num}`;
}

function indexRiftboundGallery(cards: RiftboundGalleryCard[]): {
  byPublicCode: Map<string, string>;
  byNameSet: Map<string, string>;
} {
  const byPublicCode = new Map<string, string>();
  const byNameSet = new Map<string, string>();
  for (const card of cards) {
    const url = card.cardImage?.url?.trim();
    if (!url) continue;
    if (card.publicCode) byPublicCode.set(card.publicCode.toUpperCase(), url);
    const setId = card.set?.value?.id?.toUpperCase();
    const name = card.name?.trim().toLowerCase();
    if (setId && name) byNameSet.set(`${name}|${setId}`, url);
  }
  return { byPublicCode, byNameSet };
}

async function loadRiftboundGalleryIndex(): Promise<{
  byPublicCode: Map<string, string>;
  byNameSet: Map<string, string>;
}> {
  const now = Date.now();
  if (
    riftboundGalleryCache &&
    now - riftboundGalleryCache.fetchedAt < RIFTBOUND_GALLERY_TTL_MS
  ) {
    return riftboundGalleryCache;
  }

  const pageRes = await fetch("https://riftbound.leagueoflegends.com/en-us/card-gallery/", {
    signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "CardScanner/1.0" },
  });
  if (!pageRes.ok) throw new Error("Riftbound gallery page unavailable");
  const html = await pageRes.text();
  const buildId = html.match(/"buildId":"([^"]+)"/)?.[1];
  if (!buildId) throw new Error("Riftbound buildId unavailable");

  const jsonRes = await fetch(
    `https://riftbound.leagueoflegends.com/_next/data/${buildId}/en-us/card-gallery.json`,
    {
      signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    },
  );
  if (!jsonRes.ok) throw new Error("Riftbound gallery JSON unavailable");

  const payload = (await jsonRes.json()) as RiftboundGalleryJson;
  const blade = payload.pageProps?.page?.blades?.find(
    (entry) => entry.fragmentId === "card-gallery",
  );
  const cards = blade?.cards?.items ?? [];
  const indexed = indexRiftboundGallery(cards);
  riftboundGalleryCache = { fetchedAt: now, ...indexed };
  return riftboundGalleryCache;
}

export async function fetchRiftboundGalleryInventoryImage(
  item: InventoryItem,
): Promise<ImageFetchResult | null> {
  if (classifyInventoryGame(item) !== "Riftbound") return null;

  let index: { byPublicCode: Map<string, string>; byNameSet: Map<string, string> };
  try {
    index = await loadRiftboundGalleryIndex();
  } catch {
    return null;
  }

  const publicCode = riftboundPublicCode(item)?.toUpperCase();
  const direct = publicCode ? index.byPublicCode.get(publicCode) : undefined;
  if (direct) return fetchRemoteImage(direct);

  const setCode = item.setName
    ? RIFTBOUND_SET_CODES[item.setName.trim().toLowerCase()]
    : undefined;
  const name = cardNameFromInventoryItem(item).toLowerCase();
  if (setCode && name) {
    const keyed = index.byNameSet.get(`${name}|${setCode.toUpperCase()}`);
    if (keyed) return fetchRemoteImage(keyed);
  }

  return null;
}

export async function fetchGameCatalogInventoryImage(
  item: InventoryItem,
): Promise<ImageFetchResult | null> {
  const game = classifyInventoryGame(item);
  if (game === "Lorcana") return fetchLorcastInventoryImage(item);
  if (game === "Flesh & Blood") return fetchFabCardVaultInventoryImage(item);
  if (game === "Riftbound") return fetchRiftboundGalleryInventoryImage(item);
  return null;
}

export function riftboundPublicCodeForItem(item: InventoryItem): string | undefined {
  return riftboundPublicCode(item);
}
