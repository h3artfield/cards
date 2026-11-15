import {
  isPokemonInventoryItem,
  isPokemonJapanInventoryItem,
} from "./image-cache-trust";
import { fetchGameCatalogInventoryImage } from "./game-catalog-images";
import {
  fetchEnglishPokemonTcgImage,
  fetchPokemonJapanInventoryImage,
} from "./pokemon-inventory-images";
import { classifyInventoryGame } from "./analytics";
import { isEnrichableMagicSingle } from "./magic-items";
import { fetchTcgplayerProductDetails } from "../card-flow-v2/tcgplayer-japan-catalog";
import { fetchTcgplayerCdnImage } from "../tcgplayer-inventory/cdn-image-fetch";
import { normalizeScryfallCollectorNumber, scryfallFetch } from "../processing/scryfall-client";
import {
  INVENTORY_IMAGE_FETCH_TIMEOUT_MS,
  catalogMatchesInventoryItem,
  collectorNumbersAgree,
  setNamesLookLikeSamePrinting,
} from "./resolve-display-image";
import type { CatalogCard } from "../deck-builder/types";
import type { InventoryItem } from "../types";

/** Strip condition suffix and promo SKU tails from TCGplayer display names. */
export function cardNameFromInventoryItem(item: InventoryItem): string {
  const raw =
    item.displayName.split(" — ")[0]?.trim() ||
    item.productName?.trim() ||
    item.title?.trim() ||
    item.displayName.trim();

  return raw
    .replace(/\s*-\s*Near Mint.*$/i, "")
    .replace(/\s*-\s*Lightly Played.*$/i, "")
    .replace(/\s*-\s*Moderately Played.*$/i, "")
    .replace(/\s*-\s*Heavily Played.*$/i, "")
    .replace(/\s*-\s*Damaged.*$/i, "")
    .replace(/\s*-\s*[A-Z]{2,}\d+[A-Z0-9-]*\s*$/i, "")
    .trim();
}

/** Names to try against Scryfall — TCGplayer titles often append parenthetical variant tags. */
export function scryfallLookupNames(item: InventoryItem): string[] {
  const names = new Set<string>();
  const raw = cardNameFromInventoryItem(item);
  if (raw) names.add(raw);

  let stripped = raw;
  // Each pass must shorten the string. Matching a tag anywhere while only
  // stripping one at the end spins forever on names like "Foo (Inks) - Bar".
  while (/\([^)]*\)/.test(stripped)) {
    const next = stripped
      .replace(/\s*\([^)]*\)\s*/, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (next === stripped) break;
    stripped = next;
    if (stripped) names.add(stripped);
  }

  const beforeParen = raw.split("(")[0]?.trim();
  if (beforeParen && beforeParen.length > 2) names.add(beforeParen);

  const productName = item.productName?.trim();
  if (productName && productName !== raw) names.add(productName);

  // TCGplayer dual-face titles use "Front - Back"; Scryfall uses "Front // Back".
  // Do not also add the short front name here — "Bag End" is too loose for
  // PriceCharting / TCGplayer search and can match Pokémon "Adventure Bag".
  for (const candidate of [...names]) {
    const dual = dualFaceScryfallName(candidate);
    if (dual) names.add(dual);
  }

  return [...names].filter(Boolean);
}

const NON_CARD_HYPHEN_TAIL =
  /\b(foil|etched|edition|unopened|near mint|showcase|borderless|extended|promo)\b/i;

/** "Bag End - Horizon Canopy" → "Bag End // Horizon Canopy", or null. */
export function dualFaceScryfallName(name: string): string | null {
  const match = name.match(/^(.+?)\s+-\s+(.+)$/);
  if (!match) return null;
  const left = match[1]?.trim() ?? "";
  const right = match[2]?.trim() ?? "";
  if (!left || !right) return null;
  if (NON_CARD_HYPHEN_TAIL.test(right)) return null;
  return `${left} // ${right}`;
}

const MAGIC_TCGPLAYER_LINES = [
  "Magic",
  "Magic: The Gathering",
  "Magic Singles",
  "Magic Sealed Products",
  "Magic Sealed Product",
  "Magic: The Gathering Singles",
  "Magic: The Gathering Sealed",
];

const POKEMON_TCGPLAYER_LINES = ["Pokemon", "Pokémon"];

function tcgplayerProductLinesForGame(game: string): string[] | undefined {
  if (game === "Magic") return MAGIC_TCGPLAYER_LINES;
  if (game === "Pokémon") return POKEMON_TCGPLAYER_LINES;
  if (game === "Flesh & Blood") return ["Flesh & Blood TCG", "Flesh & Blood"];
  if (game === "Lorcana") return ["Lorcana TCG", "Disney Lorcana"];
  if (game === "One Piece") return ["One Piece Card Game", "One Piece"];
  if (game === "Star Wars") return ["Star Wars Unlimited", "Star Wars"];
  if (game === "Riftbound") return ["Riftbound"];
  if (game === "Gundam") return ["Gundam Card Game"];
  return undefined;
}

function tcgplayerProductLinesForItem(item: InventoryItem): string[] | undefined {
  const line = item.productLine?.trim();
  if (line) return [line];
  return tcgplayerProductLinesForGame(classifyInventoryGame(item));
}

/** Reject cross-game TCGplayer hits (e.g. Pokémon "Survival Brace" for MTG "Survival of the Fittest"). */
export function tcgplayerProductLineMatchesGame(
  productLineName: string | undefined,
  game: string,
): boolean {
  const line = (productLineName ?? "").toLowerCase();
  if (!line) return false;
  if (game === "Magic") return line.includes("magic");
  if (game === "Pokémon") return line.includes("pokemon") || line.includes("pokémon");
  if (game === "Yu-Gi-Oh!") return line.includes("yugioh") || line.includes("yu-gi-oh");
  if (game === "Flesh & Blood") return line.includes("flesh") && line.includes("blood");
  if (game === "Lorcana") return line.includes("lorcana");
  if (game === "One Piece") return line.includes("one piece");
  if (game === "Star Wars") return line.includes("star wars");
  if (game === "Riftbound") return line.includes("riftbound");
  if (game === "Gundam") return line.includes("gundam");
  return false;
}

export function tcgplayerProductLineMatchesItem(
  productLineName: string | undefined,
  item: InventoryItem,
): boolean {
  const expected = item.productLine?.trim().toLowerCase();
  const hit = (productLineName ?? "").toLowerCase();
  if (expected && hit) {
    return hit.includes(expected) || expected.includes(hit);
  }
  return tcgplayerProductLineMatchesGame(productLineName, classifyInventoryGame(item));
}

/** Extra search queries for Secret Lair sealed SKUs on TCGplayer. */
function secretLairImageSearchQueries(name: string): string[] {
  if (!/secret lair/i.test(name)) return [];
  const queries = new Set<string>();
  const withoutPrefix = name.replace(/^Secret Lair Drop:\s*/i, "").trim();
  if (withoutPrefix) queries.add(withoutPrefix);
  const withoutFoil = withoutPrefix.replace(/\s*-\s*Foil Edition$/i, "").trim();
  if (withoutFoil) queries.add(withoutFoil);
  const title = withoutFoil.replace(/^Secret Lair x\s*/i, "").trim();
  if (title) queries.add(title);
  if (title) queries.add(`Secret Lair ${title}`);
  return [...queries];
}

type TcgplayerSearchHit = {
  productId?: number;
  productName?: string;
  productLineName?: string;
  imageUrl?: string;
};

async function searchTcgplayerInventoryProducts(input: {
  q: string;
  productLineNames?: string[];
  limit?: number;
}): Promise<TcgplayerSearchHit[]> {
  const trimmed = input.q.trim();
  if (!trimmed) return [];

  const body = {
    algorithm: "sales",
    from: 0,
    size: input.limit ?? 8,
    filters: {
      ...(input.productLineNames?.length
        ? { term: { productLineName: input.productLineNames } }
        : {}),
      range: { quantity: { gte: 1 } },
      exclude: { channelExclusion: 0 },
    },
    context: { cart: {}, shippingCountry: "US", userProfile: {} },
  };

  try {
    const res = await fetch(
      `https://mp-search-api.tcgplayer.com/v1/search/request?q=${encodeURIComponent(trimmed)}&isList=false`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://www.tcgplayer.com",
          Referer: "https://www.tcgplayer.com/",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
      },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      results?: Array<{ results?: TcgplayerSearchHit[] }>;
    };
    return data.results?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

export function inventoryImageSearchQueries(item: InventoryItem): string[] {
  const name = cardNameFromInventoryItem(item);
  const set = item.setName?.trim();
  const num = item.cardNumber?.trim();
  const queries = new Set<string>();

  if (item.productName?.trim()) queries.add(item.productName.trim());
  for (const q of secretLairImageSearchQueries(name)) queries.add(q);
  if (name && set && num) queries.add(`${name} ${set} ${num}`);
  if (name && set) queries.add(`${name} ${set}`);
  if (name && num) queries.add(`${name} ${num}`);
  if (name) queries.add(name);

  for (const variant of scryfallLookupNames(item)) {
    if (variant !== name) queries.add(variant);
    if (set && num) queries.add(`${variant} ${set} ${num}`);
    if (set) queries.add(`${variant} ${set}`);
  }

  const rawTitle = item.displayName.split(" — ")[0]?.trim();
  if (rawTitle && rawTitle !== name) queries.add(rawTitle);

  return [...queries].filter(Boolean);
}

async function fetchRemoteImage(
  url: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "CardScanner/1.0 (https://cardscanner9000.com)",
    },
  });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
  const contentType = res.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 100) throw new Error("Image response too small");
  return { buffer, contentType };
}

type ScryfallFaceJson = {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  flavor_text?: string;
  artist?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image_uris?: { normal?: string };
};

type ScryfallCardImageJson = {
  name?: string;
  layout?: string;
  colors?: string[];
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  keywords?: string[];
  color_identity?: string[];
  flavor_text?: string;
  artist?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  legalities?: Record<string, string>;
  rarity?: string;
  set_name?: string;
  image_uris?: { normal?: string };
  card_faces?: ScryfallFaceJson[];
  collector_number?: string;
  promo_types?: string[];
};

export type ScryfallShelfRules = {
  manaCost?: string;
  cmc?: number;
  typeLine?: string;
  oracleText?: string;
  keywords?: string[];
  colorIdentity?: string[];
  flavorText?: string;
  artist?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  legalities?: Record<string, string>;
  rarity?: string;
};

function scryfallImageFromJson(
  card: ScryfallCardImageJson | undefined,
  face: "front" | "back" = "front",
): string | undefined {
  if (face === "back") return card?.card_faces?.[1]?.image_uris?.normal;
  return card?.image_uris?.normal ?? card?.card_faces?.[0]?.image_uris?.normal;
}

/**
 * TCGplayer's set label is not always Scryfall's.
 * "Commander: Edge of Eternities" is "Edge of Eternities Commander".
 * The Scryfall name is listed first.
 */
export function setNamesForImageSearch(setName: string): string[] {
  const trimmed = setName.trim();
  if (!trimmed) return [];
  const names: string[] = [];
  const add = (value?: string) => {
    const next = value?.replace(/\s+/g, " ").trim();
    if (next && !names.some((existing) => existing.toLowerCase() === next.toLowerCase())) {
      names.push(next);
    }
  };

  const promoPack = trimmed.match(/^promo pack:\s*(.+)$/i);
  if (promoPack?.[1]) add(`${promoPack[1]} Promos`);

  const commander = trimmed.match(/^commander:\s*(.+)$/i);
  if (commander?.[1]) add(`${commander[1]} Commander`);

  const beyond = trimmed.match(/^universes beyond:\s*(.+)$/i);
  if (beyond?.[1]) add(beyond[1]);

  const eternal = trimmed.match(/^(.*?)(?::\s*|\s+)eternal-legal$/i);
  if (eternal?.[1]) add(`${eternal[1]} Eternal`);

  if (/^secret lair drop series$/i.test(trimmed)) add("Secret Lair Drop");
  if (/^the list reprints$/i.test(trimmed)) add("The List");

  // TCGplayer says "8th Edition". Scryfall says "Eighth Edition".
  const ordinal = trimmed.match(/^(10th|9th|8th|7th|6th|5th|4th)\s+edition$/i);
  if (ordinal) {
    const scryfallEdition: Record<string, string> = {
      "10th": "Tenth Edition",
      "9th": "Ninth Edition",
      "8th": "Eighth Edition",
      "7th": "Seventh Edition",
      "6th": "Classic Sixth Edition",
      "5th": "Fifth Edition",
      "4th": "Fourth Edition",
    };
    add(scryfallEdition[ordinal[1]!.toLowerCase()]);
  }

  add(trimmed);
  return names;
}

function scryfallQueryName(name: string): string {
  return name.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
}

const TOKEN_NAME_NOISE =
  /\b(double-sided|double sided|tokens?|surge foil|rainbow foil|foil)\b/gi;

/** TCGplayer sells the token; Scryfall files it under the creature type in the token set. */
export function isTokenShelfItem(
  item: Pick<InventoryItem, "rarity" | "displayName" | "productName" | "title">,
): boolean {
  const rarity = (item.rarity ?? "").trim().toLowerCase();
  if (rarity === "t" || rarity === "token") return true;
  return /\btokens?\b/i.test(cardNameFromInventoryItem(item as InventoryItem));
}

/** "Beast Token (Multicolor)" → Beast. "Zombie // Marit Lage Double-sided Token" → both faces. */
export function tokenFaceNames(item: InventoryItem): string[] {
  const cleaned = cardNameFromInventoryItem(item)
    .replace(/\([^)]*\)/g, " ")
    .replace(TOKEN_NAME_NOISE, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned
    .split(/\s*\/\/\s*/)
    .map((face) => face.trim())
    .filter((face) => face.length > 1);
}

function tokenFaceNumbers(cardNumber?: string): string[] {
  const raw = cardNumber?.trim();
  if (!raw) return [];
  if (raw.includes("//")) {
    return raw
      .split(/\s*\/\/\s*/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !part.includes("/"));
  }
  if (raw.includes("/")) return [];
  return [raw];
}

function tokenSetNames(setName?: string): string[] {
  if (!setName?.trim()) return [];
  const names = setNamesForImageSearch(setName);
  for (const name of [...names]) {
    if (!/tokens$/i.test(name)) names.push(`${name} Tokens`);
  }
  return names;
}

function tokenColorHint(item: InventoryItem): "multi" | "colorless" | string[] | undefined {
  const hints = [...cardNameFromInventoryItem(item).matchAll(/\(([^)]+)\)/g)].map((match) =>
    match[1]!.trim().toLowerCase(),
  );
  const color = hints.find((hint) =>
    /^(white|blue|black|red|green|multicolor|multi-color|colorless)$/.test(hint),
  );
  if (!color) return undefined;
  if (color === "multicolor" || color === "multi-color") return "multi";
  if (color === "colorless") return "colorless";
  const pip: Record<string, string> = {
    white: "W",
    blue: "U",
    black: "B",
    red: "R",
    green: "G",
  };
  const letter = pip[color];
  return letter ? [letter] : undefined;
}

function scryfallTokenCard(card: ScryfallCardImageJson): boolean {
  if (card.layout === "token" || card.layout === "double_faced_token") return true;
  return /^token\b/i.test(card.type_line ?? "");
}

function tokenCardNames(card: ScryfallCardImageJson): string[] {
  return [card.name, ...(card.card_faces ?? []).map((face) => face.name)]
    .filter((name): name is string => Boolean(name?.trim()))
    .flatMap((name) => name.split("//").map((face) => face.trim().toLowerCase()));
}

function tokenColors(card: ScryfallCardImageJson): string[] {
  if (card.colors?.length) return card.colors;
  return card.color_identity ?? [];
}

/** The token printing, not the regular card that happens to use the same collector number. */
export function pickTokenShelfCard(
  item: InventoryItem,
  cards: ScryfallCardImageJson[],
  face: "front" | "back" = "front",
): ScryfallCardImageJson | undefined {
  const faces = tokenFaceNames(item);
  const numbers = tokenFaceNumbers(item.cardNumber);
  const index = face === "back" ? 1 : 0;
  const faceName = faces[index]?.toLowerCase();
  const number = numbers[index];
  if (!faceName || !number) return undefined;
  const sets = tokenSetNames(item.setName);
  let matches = cards.filter((card) => {
    if (!scryfallTokenCard(card) || !scryfallImageFromJson(card, "front")) return false;
    if (!collectorNumbersAgree(number, card.collector_number)) return false;
    if (!tokenCardNames(card).includes(faceName)) return false;
    if (!sets.length) return true;
    return sets.some(
      (setName) =>
        setName.toLowerCase() === (card.set_name ?? "").toLowerCase() ||
        setNamesLookLikeSamePrinting(setName, card.set_name ?? ""),
    );
  });
  const hint = tokenColorHint(item);
  if (hint && matches.length > 1) {
    const colored = matches.filter((card) => {
      const colors = tokenColors(card);
      if (hint === "multi") return colors.length > 1;
      if (hint === "colorless") return colors.length === 0;
      return hint.every((pip) => colors.includes(pip)) && colors.length === hint.length;
    });
    if (colored.length) matches = colored;
  }
  if (matches.length === 1) return matches[0];
  const tokenSets = matches.filter((card) => /tokens$/i.test(card.set_name ?? ""));
  return tokenSets.length === 1 ? tokenSets[0] : undefined;
}

/** "001/062" is a list sheet index, not a Scryfall collector number. */
function searchableCollectorNumber(number?: string): string | undefined {
  const trimmed = number?.trim();
  if (!trimmed || trimmed.includes("/")) return undefined;
  return trimmed;
}

function numberedImageNames(item: InventoryItem): string[] {
  const base = scryfallLookupNames(item).map(scryfallQueryName).filter(Boolean);
  const faces: string[] = [];
  for (const name of base) {
    const parts = name
      .split("//")
      .map((part) => part.trim())
      .filter((part) => part.length > 2);
    if (parts.length > 1) faces.push(...parts);
  }
  return [...new Set([...base, ...faces])].sort((a, b) => a.length - b.length);
}

const SET_FLAVOR_WORDS = ["commander", "promo", "eternal", "prerelease"] as const;

function shelfSetScore(shelfNames: string[], catalogSet: string): number {
  const catalog = catalogSet.trim();
  if (!catalog) return 0;
  let best = 0;
  for (const shelf of shelfNames) {
    if (shelf.toLowerCase() === catalog.toLowerCase()) {
      best = Math.max(best, 100);
      continue;
    }
    if (!setNamesLookLikeSamePrinting(shelf, catalog)) continue;
    let score = 20;
    for (const word of SET_FLAVOR_WORDS) {
      const inShelf = shelf.toLowerCase().includes(word);
      const inCatalog = catalog.toLowerCase().includes(word);
      if (inShelf && inCatalog) score += 5;
      else if (inShelf !== inCatalog) score -= 3;
    }
    best = Math.max(best, score);
  }
  return best;
}

/** Keep the printings whose set is the shelf set, not another set that shares a number. */
export function cardsMatchingShelfSet<T extends { set_name?: string }>(
  cards: T[],
  shelfSets: string[],
): T[] {
  const scored = cards.map((card) => ({
    card,
    score: shelfSetScore(shelfSets, card.set_name ?? ""),
  }));
  const best = scored.reduce((max, row) => Math.max(max, row.score), 0);
  if (best <= 0) return [];
  return scored.filter((row) => row.score === best).map((row) => row.card);
}

type ShelfImageQuery = {
  q: string;
  matchSet: boolean;
  uniquePrinting: boolean;
};

export function scryfallShelfImageQueries(input: {
  names: string[];
  setNames: string[];
  collectorNumber?: string;
}): ShelfImageQuery[] {
  const number = searchableCollectorNumber(input.collectorNumber);
  const queries: ShelfImageQuery[] = [];
  const seen = new Set<string>();
  const push = (query: ShelfImageQuery) => {
    if (seen.has(query.q)) return;
    seen.add(query.q);
    queries.push(query);
  };

  if (number) {
    // The List's printed number is "MM2-1", not "1". cn:1 never returns it.
    for (const setName of input.setNames) {
      if (!isListShelfSet(setName)) continue;
      for (const name of input.names) {
        push({
          q: `!"${name}" set:"${setName}"`,
          matchSet: true,
          uniquePrinting: false,
        });
      }
    }
    for (const name of input.names) {
      for (const setName of input.setNames) {
        push({
          q: `!"${name}" set:"${setName}" cn:${number}`,
          matchSet: false,
          uniquePrinting: false,
        });
      }
      push({
        q: `!"${name}" cn:${number}`,
        matchSet: true,
        uniquePrinting: false,
      });
    }
    return queries;
  }

  for (const name of input.names) {
    for (const setName of input.setNames) {
      push({
        q: `!"${name}" set:"${setName}"`,
        matchSet: true,
        uniquePrinting: true,
      });
    }
  }
  return queries;
}

function shelfPrintKind(setName?: string): "prerelease" | "promo" | "any" {
  const set = (setName ?? "").toLowerCase();
  if (set.includes("prerelease")) return "prerelease";
  if (set.includes("promo")) return "promo";
  return "any";
}

function scryfallPrintKind(
  card: ScryfallCardImageJson,
): "prerelease" | "promo" | "standard" {
  const number = (card.collector_number ?? "").toLowerCase();
  const types = card.promo_types ?? [];
  if (number.endsWith("s") || types.includes("prerelease")) return "prerelease";
  if (number.endsWith("p") || types.includes("promopack")) return "promo";
  return "standard";
}

function scryfallCardNameMatchesItem(
  item: InventoryItem,
  card: ScryfallCardImageJson,
): boolean {
  if (!card.name) return true;
  return card.name.split("//").some((face) =>
    catalogMatchesInventoryItem(item, { name: face.trim() } as CatalogCard),
  );
}

function isListShelfSet(setName?: string): boolean {
  return /\blist\b/i.test(setName ?? "");
}

/**
 * The List collector number is a set code plus the reprinted number ("MM2-1").
 * The "2" belongs to Modern Masters, not to All Is Dust.
 */
function listReprintNumberAgrees(
  shelfNumber: string | undefined,
  scryfallNumber: string | undefined,
): boolean {
  const shelf = normalizeScryfallCollectorNumber(shelfNumber);
  const raw = scryfallNumber?.trim();
  if (!shelf || !raw) return false;
  const match = raw.match(/^([a-z0-9]+)-(\d+)[a-z★*]*$/i);
  if (!match?.[1] || !match[2] || !/[a-z]/i.test(match[1])) return false;
  return normalizeScryfallCollectorNumber(match[2]) === shelf;
}

function shelfCollectorNumbersAgree(
  item: Pick<InventoryItem, "cardNumber" | "setName">,
  scryfallNumber: string | undefined,
): boolean {
  if (isListShelfSet(item.setName) && scryfallNumber?.includes("-")) {
    return listReprintNumberAgrees(item.cardNumber, scryfallNumber);
  }
  return collectorNumbersAgree(item.cardNumber, scryfallNumber);
}

function pickScryfallShelfCard(
  item: Pick<InventoryItem, "cardNumber" | "setName">,
  cards: ScryfallCardImageJson[],
  face: "front" | "back" = "front",
): ScryfallCardImageJson | undefined {
  const usable = cards.filter(
    (card) =>
      scryfallImageFromJson(card, face) &&
      shelfCollectorNumbersAgree(item, card.collector_number),
  );
  if (!usable.length) return undefined;
  const reprints = isListShelfSet(item.setName)
    ? usable.filter((card) => listReprintNumberAgrees(item.cardNumber, card.collector_number))
    : [];
  const poolSource = reprints.length ? reprints : usable;
  const want = shelfPrintKind(item.setName);
  const kind = want === "any" ? "standard" : want;
  const ofKind = poolSource.filter((card) => scryfallPrintKind(card) === kind);
  const pool = ofKind.length ? ofKind : poolSource;
  // 314 and 314★ are the nonfoil and foil of one printing. The plain number is the shelf row.
  const shelfHasStar = (item.cardNumber ?? "").includes("★");
  const plain = pool.filter((card) => !(card.collector_number ?? "").includes("★"));
  const chosen = shelfHasStar || !plain.length ? pool : plain;
  return chosen[0];
}

/** Prefer the scan whose printed number matches the CSV, then the promo kind. */
export function pickScryfallShelfImage(
  item: Pick<InventoryItem, "cardNumber" | "setName">,
  cards: ScryfallCardImageJson[],
  face: "front" | "back" = "front",
): string | undefined {
  const card = pickScryfallShelfCard(item, cards, face);
  return card ? scryfallImageFromJson(card, face) : undefined;
}

function joinedFaceField(
  card: ScryfallCardImageJson,
  field: "oracle_text" | "flavor_text" | "type_line",
): string | undefined {
  const top = card[field]?.trim();
  if (top) return top;
  const parts = (card.card_faces ?? [])
    .map((face) => face[field]?.trim())
    .filter((part): part is string => Boolean(part));
  if (!parts.length) return undefined;
  return field === "type_line" ? parts.join(" // ") : parts.join("\n//\n");
}

/** Rules for the printing the shelf image lookup would choose. */
export function scryfallShelfRulesFromCard(
  card: ScryfallCardImageJson,
): ScryfallShelfRules {
  const front = card.card_faces?.[0];
  const manaCost = card.mana_cost?.trim() || front?.mana_cost?.trim() || undefined;
  return {
    manaCost,
    cmc: typeof card.cmc === "number" ? card.cmc : undefined,
    typeLine: joinedFaceField(card, "type_line"),
    oracleText: joinedFaceField(card, "oracle_text"),
    keywords: card.keywords?.length ? card.keywords : undefined,
    colorIdentity: card.color_identity?.length ? card.color_identity : undefined,
    flavorText: joinedFaceField(card, "flavor_text"),
    artist: card.artist?.trim() || front?.artist?.trim() || undefined,
    power: card.power?.trim() || front?.power?.trim() || undefined,
    toughness: card.toughness?.trim() || front?.toughness?.trim() || undefined,
    loyalty: card.loyalty?.trim() || front?.loyalty?.trim() || undefined,
    legalities: card.legalities,
    rarity: card.rarity,
  };
}

async function shelfCardFromQuery(
  item: InventoryItem,
  query: ShelfImageQuery,
  setNames: string[],
  face: "front" | "back" = "front",
): Promise<ScryfallCardImageJson | undefined> {
  const searchRes = await scryfallFetch(
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query.q)}&unique=prints`,
  );
  if (!searchRes.ok) return undefined;
  const search = (await searchRes.json()) as { data?: ScryfallCardImageJson[] };
  const cards = search.data ?? [];
  if (!query.matchSet) return pickScryfallShelfCard(item, cards, face);

  const matched = cardsMatchingShelfSet(cards, setNames);
  if (query.uniquePrinting) {
    if (matched.length !== 1) return undefined;
    return scryfallImageFromJson(matched[0], face) ? matched[0] : undefined;
  }
  if (matched.length > 0) return pickScryfallShelfCard(item, matched, face);
  // One printing in the game uses this number, so the set label is not required.
  // A foil twin (314 and 314★) is still that one printing.
  const agreeing = cards.filter((card) =>
    collectorNumbersAgree(item.cardNumber, card.collector_number),
  );
  const agreeingSets = new Set(
    agreeing
      .map((card) => card.set_name?.trim().toLowerCase())
      .filter((setName): setName is string => Boolean(setName)),
  );
  if (agreeing.length === 1 || (agreeing.length > 1 && agreeingSets.size === 1)) {
    return pickScryfallShelfCard(item, agreeing, face);
  }
  // "Prerelease Cards" shares no set words. The suffix on the collector number
  // is what distinguishes that scan.
  if (shelfPrintKind(item.setName) !== "any") return pickScryfallShelfCard(item, cards, face);
  return undefined;
}

async function lookupTokenShelfCard(
  item: InventoryItem,
  face: "front" | "back",
): Promise<ScryfallCardImageJson | undefined> {
  if (!isTokenShelfItem(item)) return undefined;
  const faces = tokenFaceNames(item);
  const numbers = tokenFaceNumbers(item.cardNumber);
  const index = face === "back" ? 1 : 0;
  const faceName = faces[index];
  const number = numbers[index];
  if (!faceName || !number) return undefined;
  const searchRes = await scryfallFetch(
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${faceName.replace(/"/g, "")}" cn:${number}`)}&unique=prints&include_extras=true`,
  );
  if (!searchRes.ok) return undefined;
  const search = (await searchRes.json()) as { data?: ScryfallCardImageJson[] };
  return pickTokenShelfCard(item, search.data ?? [], face);
}

async function lookupScryfallShelfCard(
  item: InventoryItem,
  face: "front" | "back" = "front",
): Promise<ScryfallCardImageJson | undefined> {
  const tokenCard = await lookupTokenShelfCard(item, face);
  if (tokenCard) return tokenCard;

  const productId = item.tcgplayerProductId?.trim();
  if (productId) {
    const byProduct = await scryfallFetch(
      `https://api.scryfall.com/cards/tcgplayer/${encodeURIComponent(productId)}`,
    );
    if (byProduct.ok) {
      const card = (await byProduct.json()) as ScryfallCardImageJson;
      if (scryfallCardNameMatchesItem(item, card) && pickScryfallShelfCard(item, [card], face)) {
        return card;
      }
    }
  }

  const setNames = item.setName?.trim() ? setNamesForImageSearch(item.setName) : [];
  const names = numberedImageNames(item);
  for (const query of scryfallShelfImageQueries({
    names,
    setNames,
    collectorNumber: item.cardNumber,
  })) {
    const card = await shelfCardFromQuery(item, query, setNames, face);
    if (card) return card;
  }

  // No collector number and no set: a single exact name hit is the printing.
  // A name-only search that returns several printings is how the wrong scan
  // was attached, so that result is left unused.
  if (!productId && !searchableCollectorNumber(item.cardNumber) && setNames.length === 0) {
    for (const cardName of names) {
      const searchRes = await scryfallFetch(
        `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${cardName}"`)}&unique=prints`,
      );
      if (!searchRes.ok) continue;
      const search = (await searchRes.json()) as { data?: ScryfallCardImageJson[] };
      const cards = search.data ?? [];
      if (cards.length === 1 && scryfallImageFromJson(cards[0], face)) return cards[0];
    }
  }

  const scryfallId = item.catalogScryfallId?.trim();
  if (scryfallId) {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`,
    );
    if (res.ok) {
      const card = (await res.json()) as ScryfallCardImageJson;
      if (scryfallCardNameMatchesItem(item, card) && pickScryfallShelfCard(item, [card], face)) {
        return card;
      }
    }
  }

  return undefined;
}

async function lookupScryfallDisplayImageUrl(
  item: InventoryItem,
  face: "front" | "back" = "front",
): Promise<string | undefined> {
  const card = await lookupScryfallShelfCard(item, face);
  // A double-sided token product is two token cards. Each scan is that card's front.
  const imageFace =
    isTokenShelfItem(item) && tokenFaceNames(item).length > 1 ? "front" : face;
  return scryfallImageFromJson(card, imageFace);
}

/** Rules text for the shelf printing when the catalog link has none. */
export async function lookupScryfallShelfRules(
  item: InventoryItem,
): Promise<ScryfallShelfRules | null> {
  const card = await lookupScryfallShelfCard(item, "front");
  if (!card) return null;
  const rules = scryfallShelfRulesFromCard(card);
  return rules.oracleText || rules.typeLine ? rules : null;
}

/** Resolve a Scryfall CDN art URL without downloading the image bytes. */
export async function resolveScryfallDisplayImageUrl(
  item: InventoryItem,
): Promise<string | undefined> {
  return lookupScryfallDisplayImageUrl(item);
}

async function fetchScryfallImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const img = await lookupScryfallDisplayImageUrl(item);
  if (!img) return null;
  return fetchRemoteImage(img);
}

/** The other face of a double-faced printing. Single-sided cards have none. */
export async function fetchScryfallBackImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const img = await lookupScryfallDisplayImageUrl(item, "back");
  if (!img) return null;
  return fetchRemoteImage(img);
}

/**
 * Loose token overlap, so PriceCharting's fuzzy search cannot hand back a
 * different product entirely (it will happily answer any query with something).
 */
export function priceChartingNameMatches(
  query: string,
  productName: string | undefined,
): boolean {
  if (!productName?.trim()) return false;
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9 ]+/g, " ")
        .split(/\s+/)
        .filter((token) => token.length > 2),
    );
  const wanted = tokens(query);
  const got = tokens(productName);
  if (!wanted.size || !got.size) return false;
  let hits = 0;
  for (const token of wanted) if (got.has(token)) hits += 1;
  // Short queries like "Bag End" must not match "Adventure Bag" (1/2 = 50%).
  const needed = wanted.size <= 2 ? wanted.size : Math.ceil(wanted.size * (2 / 3));
  return hits >= needed;
}

function priceChartingProductMatchesItem(
  item: InventoryItem,
  query: string,
  product: Record<string, unknown>,
): boolean {
  const productName = product["product-name"] as string | undefined;
  if (!priceChartingNameMatches(query, productName)) return false;

  const blob = [
    product["console-name"],
    product.genre,
    product["product-name"],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const line = `${item.productLine ?? ""} ${item.setName ?? ""}`.toLowerCase();
  if (line.includes("lorcana") && !blob.includes("lorcana")) return false;
  if (line.includes("one piece") && !blob.includes("one piece")) return false;
  if (line.includes("flesh") && line.includes("blood") && !blob.includes("flesh")) {
    return false;
  }
  if (line.includes("riftbound") && !blob.includes("riftbound")) return false;
  if (line.includes("pokemon") && !blob.includes("pokemon")) return false;
  if (
    (line.includes("magic") || classifyInventoryGame(item) === "Magic") &&
    !/\bmagic\b|\bmtg\b|gathering/.test(blob)
  ) {
    return false;
  }
  return true;
}

async function fetchPriceChartingImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string; tcgLowPrice?: number } | null> {
  const game = classifyInventoryGame(item);
  if (isPokemonInventoryItem(item)) return null;
  if (game === "Magic" && isEnrichableMagicSingle(item)) return null;

  const apiKey = process.env.PRICECHARTING_API_KEY?.trim();
  if (!apiKey) return null;

  for (const query of inventoryImageSearchQueries(item)) {
    const res = await fetch(
      `https://www.pricecharting.com/api/product?t=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}`,
      { signal: AbortSignal.timeout(INVENTORY_IMAGE_FETCH_TIMEOUT_MS) },
    );
    if (!res.ok) continue;

    const product = (await res.json()) as Record<string, unknown>;
    if (product.status === "error") continue;
    if (!priceChartingProductMatchesItem(item, query, product)) continue;

    const img =
      (product["image-url"] as string | undefined) ??
      (product.imageUrl as string | undefined);
    if (img?.trim()) {
      return fetchRemoteImage(img.trim());
    }

    const tcgId = product["tcg-id"] ?? product.tcgId;
    if (tcgId != null && String(tcgId).trim()) {
      const fetched = await fetchTcgplayerProductImageById(
        item,
        String(tcgId).trim(),
      );
      if (fetched) return fetched;
    }
  }
  return null;
}

async function fetchTcgplayerProductImageById(
  item: InventoryItem,
  productId: string,
  existingUrl?: string,
): Promise<{
  buffer: Buffer;
  contentType: string;
  tcgLowPrice?: number;
} | null> {
  const details = await fetchTcgplayerProductDetails(productId);
  if (
    details?.productLineName &&
    !tcgplayerProductLineMatchesItem(details.productLineName, item)
  ) {
    return null;
  }
  const lineMatches = Boolean(details?.productLineName);

  const tcgLowPrice = lineMatches
    ? details?.lowestPrice != null && details.lowestPrice > 0
      ? details.lowestPrice
      : details?.marketPrice != null && details.marketPrice > 0
        ? details.marketPrice
        : undefined
    : undefined;

  try {
    const fetched = await fetchTcgplayerCdnImage(productId, existingUrl);
    return {
      buffer: fetched.buffer,
      contentType: fetched.contentType,
      tcgLowPrice,
    };
  } catch {
    return null;
  }
}

async function fetchTcgplayerCatalogImage(
  item: InventoryItem,
): Promise<{
  buffer: Buffer;
  contentType: string;
  tcgLowPrice?: number;
} | null> {
  if (!item.tcgplayerProductId) return null;
  return fetchTcgplayerProductImageById(item, item.tcgplayerProductId);
}

async function fetchTcgplayerSearchImageByProductId(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string; tcgLowPrice?: number } | null> {
  const preferredId = item.tcgplayerProductId?.trim();
  if (!preferredId) return null;

  const hits = await searchTcgplayerInventoryProducts({
    q: preferredId,
    productLineNames: tcgplayerProductLinesForItem(item),
    limit: 6,
  });
  const match = hits.find((hit) => String(hit.productId) === preferredId);
  if (!match?.productId) return null;
  if (
    match.productLineName &&
    !tcgplayerProductLineMatchesItem(match.productLineName, item)
  ) {
    return null;
  }

  if (match.imageUrl?.trim()) {
    try {
      return await fetchRemoteImage(match.imageUrl.trim());
    } catch {
      /* try CDN next */
    }
  }

  return fetchTcgplayerProductImageById(item, String(match.productId));
}

async function fetchTcgplayerSearchImage(
  item: InventoryItem,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const productLineNames = tcgplayerProductLinesForItem(item);
  const queries = inventoryImageSearchQueries(item).slice(0, 6);
  const preferredId = item.tcgplayerProductId?.trim();

  for (const query of queries) {
    const hits = await searchTcgplayerInventoryProducts({
      q: query,
      productLineNames,
      limit: 8,
    });
    const gameFiltered = hits.filter(
      (hit) =>
        tcgplayerProductLineMatchesItem(hit.productLineName, item) &&
        priceChartingNameMatches(query, hit.productName),
    );
    const ordered = preferredId
      ? [
          ...gameFiltered.filter((h) => String(h.productId) === preferredId),
          ...gameFiltered.filter((h) => String(h.productId) !== preferredId),
        ]
      : gameFiltered;

    for (const hit of ordered.slice(0, 4)) {
      if (hit.imageUrl?.trim()) {
        try {
          return await fetchRemoteImage(hit.imageUrl.trim());
        } catch {
          /* try CDN next */
        }
      }
      if (!hit.productId) continue;
      const fetched = await fetchTcgplayerProductImageById(
        item,
        String(hit.productId),
      );
      if (fetched) {
        return { buffer: fetched.buffer, contentType: fetched.contentType };
      }
    }
  }
  return null;
}

/**
 * Resolve card art for server-side caching. Game catalogs (Scryfall, Pokémon TCG)
 * are tried first — TCGplayer CDN/API often blocks datacenter IPs (403).
 */
export async function fetchInventoryImageBuffer(
  item: InventoryItem,
  sourceUrl: string,
): Promise<{ buffer: Buffer; contentType: string; tcgLowPrice?: number }> {
  const game = classifyInventoryGame(item);

  if (game === "Magic") {
    const scryfall = await fetchScryfallImage(item);
    if (scryfall) return scryfall;
  }

  if (isPokemonJapanInventoryItem(item)) {
    const japan = await fetchPokemonJapanInventoryImage(item);
    if (japan) {
      return {
        buffer: japan.buffer,
        contentType: japan.contentType,
        tcgLowPrice: japan.tcgLowPrice,
      };
    }
  }

  if (isPokemonInventoryItem(item)) {
    const pokemon = await fetchEnglishPokemonTcgImage(item);
    if (pokemon) {
      return {
        buffer: pokemon.buffer,
        contentType: pokemon.contentType,
      };
    }
  }

  const gameCatalog = await fetchGameCatalogInventoryImage(item);
  if (gameCatalog) return gameCatalog;

  if (item.tcgplayerProductId) {
    const byId = await fetchTcgplayerSearchImageByProductId(item);
    if (byId) {
      return {
        buffer: byId.buffer,
        contentType: byId.contentType,
        tcgLowPrice: byId.tcgLowPrice,
      };
    }

    const fetched = await fetchTcgplayerProductImageById(
      item,
      item.tcgplayerProductId,
      sourceUrl.includes("tcgplayer-cdn") ? sourceUrl : undefined,
    );
    if (fetched) {
      return {
        buffer: fetched.buffer,
        contentType: fetched.contentType,
        tcgLowPrice: fetched.tcgLowPrice,
      };
    }
  }

  const tcgSearch = await fetchTcgplayerSearchImage(item);
  if (tcgSearch) return tcgSearch;

  const priceCharting = await fetchPriceChartingImage(item);
  if (priceCharting) {
    return {
      buffer: priceCharting.buffer,
      contentType: priceCharting.contentType,
      tcgLowPrice: priceCharting.tcgLowPrice,
    };
  }

  if (game === "Magic") {
    const scryfall = await fetchScryfallImage(item);
    if (scryfall) return scryfall;
  }

  throw new Error("No image source available");
}
