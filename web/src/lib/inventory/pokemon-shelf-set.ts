import { POKEMON_TCG_SETS } from "./pokemon-tcg-sets";

/** TCGplayer prints "SM - Crimson Invasion"; the catalog set is "Crimson Invasion". */
const SERIES_PREFIX =
  /^(?:swsh|sv|sm|xy|ex|me|bw|dp|hgss|pop)(?:\d+)?(?:pt\d*)?\s+/;

/** Shelf buckets that are not a printing. Hints live on the product title instead. */
const JUNK_SET =
  /^(?:miscellaneous cards and products|deck exclusives|blister exclusives|league and championship cards|jumbo cards|world championship decks)$/;

const HINT_NOISE =
  /\b(?:stamps?|stamped|cosmos holo|cracked ice holo|reverse holo|holo|1st place|league challenges?|pokemon league|gamestop exclusive|general mills|premium collection promo|prerelease|staff)\b/gi;

/**
 * Shelf wording that is not the catalog set name.
 * Keys and values are both `normalizePokemonShelfLabel` output.
 */
const NAME_ALIASES: Record<string, string> = {
  "scarlet and violet 151": "151",
  "sv scarlet and violet 151": "151",
  "scarlet and violet base set": "scarlet and violet",
  "sv scarlet and violet base set": "scarlet and violet",
  "sv01 scarlet and violet base set": "scarlet and violet",
  "scarlet and violet promo cards": "scarlet and violet black star promos",
  "sv scarlet and violet promo cards": "scarlet and violet black star promos",
  "sword and shield promo cards": "swsh black star promos",
  "swsh sword and shield promo cards": "swsh black star promos",
  "sm promos": "sm black star promos",
  "xy promos": "xy black star promos",
  "black and white promos": "bw black star promos",
  "wotc promo": "wizards black star promos",
  "sm base set": "sun and moon",
  "base set": "base",
  "xy base set": "xy",
  "expedition": "expedition base set",
  "heartgold soulsilver": "heartgold and soulsilver",
  "generations radiant collection": "generations",
  "legendary treasures radiant collection": "legendary treasures",
  "unleashed": "hs unleashed",
  "triumphant": "hs triumphant",
  "undaunted": "hs undaunted",
  "diamond and pearl promos": "dp black star promos",
  "mcdonalds 25th anniversary promos": "mcdonalds collection 2021",
};

/** Sets the shelf label names, but the public set list does not. */
const ID_ALIASES: Record<string, string> = {
  "mega evolution promo": "mep",
  "me mega evolution promo": "mep",
  "mcdonalds 25th anniversary promos": "mcd21",
};

const setIdByName = new Map<string, string>();
const idsByPrintedTotal = new Map<number, string[]>();
const idsByTotal = new Map<number, string[]>();

function pushTotal(map: Map<number, string[]>, total: number | null, id: string) {
  if (total == null) return;
  const ids = map.get(total);
  if (ids) {
    if (!ids.includes(id)) ids.push(id);
  } else {
    map.set(total, [id]);
  }
}

for (const set of POKEMON_TCG_SETS) {
  const key = normalizePokemonShelfLabel(set.name);
  if (key && !setIdByName.has(key)) setIdByName.set(key, set.id);
  pushTotal(idsByPrintedTotal, set.printedTotal, set.id);
  pushTotal(idsByTotal, set.total, set.id);
}

export function normalizePokemonShelfLabel(value?: string): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/é/g, "e")
    .replace(/[’']/g, "")
    .replace(/[—–]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function shelfSetCandidates(label: string): string[] {
  const out: string[] = [];
  const add = (value: string) => {
    if (value && !out.includes(value)) out.push(value);
  };
  const plain = label.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
  for (const form of [label, plain]) {
    const normalized = normalizePokemonShelfLabel(form);
    add(normalized);
    add(NAME_ALIASES[normalized] ?? "");
    const stripped = normalized.replace(SERIES_PREFIX, "");
    if (stripped !== normalized) {
      add(stripped);
      add(NAME_ALIASES[stripped] ?? "");
    }
  }
  return out;
}

function setIdFromLabel(label: string): string | null {
  for (const candidate of shelfSetCandidates(label)) {
    const aliased = ID_ALIASES[candidate];
    if (aliased) return aliased;
    const mcdonald = mcdonaldSetId(candidate);
    if (mcdonald) return mcdonald;
    const named = setIdByName.get(candidate);
    if (named) return named;
  }
  return null;
}

function productSetHints(productName?: string): string[] {
  if (!productName) return [];
  const hints: string[] = [];
  for (const match of productName.matchAll(/\(([^)]+)\)/g)) {
    const cleaned = match[1]!.replace(HINT_NOISE, " ").replace(/\s+/g, " ").trim();
    if (cleaned.length >= 3) hints.push(cleaned);
  }
  return hints;
}

/** DP43 / SWSH039 / XY70 name a promo set when the shelf label does not. */
function promoSetFromNumber(cardNumber?: string): string | null {
  const local = pokemonImageLocalId(cardNumber);
  if (!local) return null;
  if (/^DP\d/.test(local)) return "dpp";
  if (/^XY\d/.test(local)) return "xyp";
  if (/^BW\d/.test(local)) return "bwp";
  if (/^SM\d/.test(local)) return "smp";
  if (/^SWSH\d/.test(local)) return "swshp";
  if (/^SVP\d/.test(local)) return "svp";
  if (/^MEP\d/.test(local)) return "mep";
  return null;
}

function mcdonaldSetId(candidate: string): string | null {
  const year = candidate.match(/^mcdonalds promos (\d{4})$/);
  if (!year) return null;
  return `mcd${year[1]!.slice(2)}`;
}

function uniqueSetId(map: Map<number, string[]>, total: number): string | null {
  const ids = map.get(total);
  return ids && ids.length === 1 ? ids[0]! : null;
}

function printedDenominator(cardNumber?: string): number | null {
  const compact = cardNumber?.trim().replace(/\s+/g, "");
  const match = compact?.match(/\/[A-Za-z]*(\d+)/);
  if (!match) return null;
  const total = parseInt(match[1]!, 10);
  return Number.isNaN(total) ? null : total;
}

/** pokemontcg.io / Scrydex set id for a TCGplayer shelf label. */
export function pokemonShelfSetId(
  setName?: string,
  cardNumber?: string,
  productName?: string,
): string | null {
  const shelfKey = normalizePokemonShelfLabel(
    (setName ?? "").replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " "),
  );
  const shelfIsJunk = JUNK_SET.test(shelfKey);
  if (setName?.trim() && !shelfIsJunk) {
    const named = setIdFromLabel(setName);
    if (named) return named;
  }

  for (const hint of productSetHints(productName)) {
    const hinted = setIdFromLabel(hint);
    if (hinted) return hinted;
  }

  const promo = promoSetFromNumber(cardNumber);
  if (promo) return promo;

  const denominator = printedDenominator(cardNumber);
  if (denominator == null) return null;
  return (
    uniqueSetId(idsByPrintedTotal, denominator) ??
    uniqueSetId(idsByTotal, denominator)
  );
}

export function pokemonTcgSetName(setId?: string | null): string | null {
  if (!setId) return null;
  return POKEMON_TCG_SETS.find((set) => set.id === setId)?.name ?? null;
}

/**
 * Catalog local id. Numeric shelf numbers drop leading zeros (`008/012` → `8`).
 * Prefixed numbers keep them (`TG08/TG30` → `TG08`, `SWSH260` → `SWSH260`).
 */
export function pokemonImageLocalId(cardNumber?: string): string | null {
  const compact = cardNumber?.trim().replace(/\s+/g, "");
  if (!compact || compact.toLowerCase() === "none") return null;
  const match = compact.match(
    /^([A-Za-z]*)(\d+)([A-Za-z]*)(?:\/[A-Za-z]*\d+[A-Za-z]*)?$/,
  );
  if (!match) return null;
  const prefix = match[1]!.toUpperCase();
  const digits = prefix ? match[2]! : String(parseInt(match[2]!, 10));
  const suffix = match[3]!.toLowerCase();
  if (!digits || digits === "NaN") return null;
  return `${prefix}${digits}${suffix}`;
}

/** "Alakazam ex - 201/165" and "Alolan Golem GX (Secret)" → catalog name. */
export function pokemonShelfCatalogName(raw?: string): string {
  let name = raw?.trim() ?? "";
  if (!name) return "";
  name = name.replace(
    /\s+-\s+[A-Za-z]{0,6}\d+[A-Za-z]?(?:\/[A-Za-z]{0,6}\d+[A-Za-z]?)?\s*$/i,
    "",
  );
  let previous = "";
  while (name !== previous) {
    previous = name;
    name = name
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/\s*\[[^\]]*\]\s*$/, "")
      .trim();
  }
  return name.trim();
}

/** Direct art for one shelf printing. Scrydex first; its missing-card image is rejected by the fetcher. */
export function pokemonShelfImageUrls(
  setName?: string,
  cardNumber?: string,
  productName?: string,
): string[] {
  const setId = pokemonShelfSetId(setName, cardNumber, productName);
  const localId = pokemonImageLocalId(cardNumber);
  if (!setId || !localId) return [];
  // Classic Collection repeats a number as 54_A when several originals share it.
  const lettered = `${localId}_A`;
  return [
    `https://images.scrydex.com/pokemon/${setId}-${localId}/large`,
    `https://images.pokemontcg.io/${setId}/${localId}_hires.png`,
    `https://images.pokemontcg.io/${setId}/${localId}.png`,
    `https://images.scrydex.com/pokemon/${setId}-${lettered}/large`,
    `https://images.pokemontcg.io/${setId}/${lettered}_hires.png`,
    `https://images.pokemontcg.io/${setId}/${lettered}.png`,
  ];
}
