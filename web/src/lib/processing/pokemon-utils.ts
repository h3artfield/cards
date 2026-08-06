import type { ConditionEstimate, VisionResult } from "../types";
import { normalizeCollectorNumber } from "./vision";

/** Strip leading zeros so API queries use `26` not `026`. */
function apiCollectorNumber(token: string): string {
  if (/^\d+$/.test(token)) {
    const n = parseInt(token, 10);
    return Number.isNaN(n) ? token : String(n);
  }
  return token.toUpperCase();
}

export function pokemonCollectorQuery(cardNumber?: string): string | null {
  const normalized = normalizeCollectorNumber(cardNumber, "pokemon");
  if (!normalized) return null;
  const slash = normalized.match(/^(\d{1,3})\s*\/\s*\d+/);
  if (slash) return apiCollectorNumber(slash[1]);
  if (/^\d{1,3}$/.test(normalized)) return apiCollectorNumber(normalized);
  if (/^[A-Z]{1,4}\d+$/i.test(normalized)) return normalized.toUpperCase();
  return null;
}

/** Denominator from collector number (026/264 → 264) for set inference. */
export function pokemonPrintedTotal(cardNumber?: string): number | null {
  const normalized = normalizeCollectorNumber(cardNumber, "pokemon");
  if (!normalized) return null;
  const m = normalized.match(/\d+\/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? null : n;
}

/** Japanese Pokémon card name → English catalog alias (vision OCR). */
const POKEMON_JAPANESE_NAME_ALIASES: Record<string, string> = {
  コータス: "Torkoal",
};

/** True when text is mostly non-Latin (e.g. Japanese kana/kanji). */
export function isNonLatinPokemonName(name?: string): boolean {
  const trimmed = name?.trim();
  if (!trimmed) return false;
  const latin = trimmed.replace(/[\s\-'.]/g, "");
  if (!latin) return false;
  const latinChars = latin.replace(/[^\u0000-\u024F\u1E00-\u1EFF]/g, "");
  return latinChars.length / latin.length < 0.5;
}

/** Resolve English display/catalog name from a Japanese OCR name when known. */
export function pokemonJapaneseNameToEnglish(name?: string): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  if (POKEMON_JAPANESE_NAME_ALIASES[trimmed]) {
    return POKEMON_JAPANESE_NAME_ALIASES[trimmed];
  }
  const lower = trimmed.toLowerCase();
  for (const [jp, en] of Object.entries(POKEMON_JAPANESE_NAME_ALIASES)) {
    if (jp.toLowerCase() === lower) return en;
  }
  return undefined;
}

/** Alternate spellings for Pokémon TCG API name search (vision vs catalog indexing). */
export function pokemonCatalogNameVariants(cardName?: string): string[] {
  const raw = cardName?.trim();
  if (!raw) return [];

  const variants = new Set<string>([raw]);
  const english = pokemonJapaneseNameToEnglish(raw);
  if (english) variants.add(english);

  const withHyphenEx = raw.replace(/\s+EX\b/gi, "-EX");
  if (withHyphenEx !== raw) variants.add(withHyphenEx);

  const withSpaceEx = raw.replace(/-EX\b/gi, " EX");
  if (withSpaceEx !== raw) variants.add(withSpaceEx);

  const mega = raw.match(/^M\s+(.+)$/i);
  if (mega?.[1]) {
    const withoutMega = mega[1].trim();
    variants.add(withoutMega);
    variants.add(withoutMega.replace(/\s+EX\b/gi, "-EX"));
  }

  return [...variants];
}

export function pokemonCatalogNamesMatch(
  visionName: string | undefined,
  apiName: string,
): boolean {
  if (!visionName?.trim() || !apiName.trim()) return false;
  const api = apiName.trim().toLowerCase();
  return pokemonCatalogNameVariants(visionName).some(
    (variant) => variant.toLowerCase() === api,
  );
}

/** Known set sizes — vision often misreads the denominator (e.g. 216/197 vs 216/167). */
const POKEMON_SET_PRINTED_TOTALS: Record<string, number> = {
  "twilight masquerade": 167,
  sv06: 167,
  "temporal forces": 162,
  sv05: 162,
  "paldean fates": 91,
  sv4pt5: 91,
  "paradox rift": 182,
  sv04: 182,
  "151": 165,
  "obsidian flames": 197,
  sv03: 197,
  "paldea evolved": 193,
  sv02: 193,
  "scarlet & violet": 198,
  sv01: 198,
  "crown zenith": 159,
  swsh12pt5: 159,
  "lost origin": 196,
  swsh11: 196,
  "astral radiance": 189,
  swsh10: 189,
  "brilliant stars": 172,
  swsh09: 172,
  "fusion strike": 264,
  swsh08: 264,
  "evolving skies": 203,
  swsh07: 203,
  "battle region": 67,
  s9a: 67,
  "crimson haze": 66,
  sv5a: 66,
  flashfire: 106,
  xy2: 106,
};

function lookupKnownSetPrintedTotal(setName?: string): number | null {
  if (!setName?.trim()) return null;
  const lower = setName.trim().toLowerCase();
  if (POKEMON_SET_PRINTED_TOTALS[lower] != null) {
    return POKEMON_SET_PRINTED_TOTALS[lower]!;
  }
  for (const [key, total] of Object.entries(POKEMON_SET_PRINTED_TOTALS)) {
    if (lower.includes(key) || key.includes(lower)) return total;
  }
  return null;
}

/**
 * Fix misread collector numbers using catalog or known set size.
 * Secret rares exceed set size (216/167) — only the denominator gets corrected.
 */
export function reconcilePokemonCardNumber(
  vision: VisionResult,
  catalog?: Record<string, unknown>,
): string | undefined {
  const current = normalizeCollectorNumber(vision.cardNumber, "pokemon");
  if (!current) return undefined;

  const set = catalog?.set as { printedTotal?: number; name?: string } | undefined;
  let printedTotal = set?.printedTotal ?? null;
  if (!printedTotal) {
    printedTotal = lookupKnownSetPrintedTotal(set?.name ?? vision.setName);
  }

  const catalogNum =
    catalog?.number != null ? String(catalog.number).trim() : undefined;
  const catalogCollector = catalogNum
    ? pokemonCollectorQuery(catalogNum) ?? catalogNum.split("/")[0]
    : null;

  if (catalogCollector && printedTotal) {
    return `${catalogCollector}/${printedTotal}`;
  }

  const slash = current.match(/^(\d+)\/(\d+)$/);
  if (slash && printedTotal) {
    const collector = slash[1]!;
    const denom = parseInt(slash[2]!, 10);
    if (denom !== printedTotal) {
      return `${collector}/${printedTotal}`;
    }
    return current;
  }

  const collector = pokemonCollectorQuery(current);
  if (collector && printedTotal) {
    return `${collector}/${printedTotal}`;
  }

  return current;
}

export function normalizeVisionCardNumber(
  vision: VisionResult,
  catalog?: Record<string, unknown>,
): VisionResult {
  if (vision.category !== "pokemon") return vision;
  const cardNumber = reconcilePokemonCardNumber(vision, catalog);
  if (!cardNumber || cardNumber === vision.cardNumber) return vision;
  return { ...vision, cardNumber };
}

/** Pokémon TCG API set.id values keyed by set printed total (denominator). */
export const POKEMON_SET_IDS_BY_PRINTED_TOTAL: Record<number, string[]> = {
  264: ["swsh8"], // Fusion Strike
  203: ["swsh7"], // Evolving Skies
  198: ["swsh6", "sv01"], // Chilling Reign, Scarlet & Violet base
  196: ["swsh11"], // Lost Origin
  189: ["swsh5", "swsh10"], // Battle Styles, Astral Radiance
  185: ["swsh45"], // Shining Fates (subset)
  172: ["swsh4", "swsh09"], // Vivid Voltage, Brilliant Stars
  202: ["swsh3"], // Darkness Ablaze
  209: ["swsh2"], // Rebel Clash
  216: ["swsh1"], // Sword & Shield
  197: ["sv03"], // Obsidian Flames
  193: ["sv02"], // Paldea Evolved
  182: ["sv04"], // Paradox Rift
  167: ["sv06"], // Twilight Masquerade
  162: ["sv05"], // Temporal Forces
  165: ["sv3pt5"], // 151
  159: ["swsh12pt5"], // Crown Zenith
  181: ["sm9"], // Team Up
  168: ["sm8"], // Lost Thunder
  147: ["sm7"], // Celestial Storm
  146: ["sm6"], // Forbidden Light
  156: ["sm5"], // Ultra Prism
  173: ["sm4"], // Crimson Invasion
  169: ["sm35"], // Shining Legends
  149: ["sm3"], // Burning Shadows
  145: ["sm2"], // Guardians Rising
  163: ["sm1"], // Sun & Moon base
  66: ["sv5a"], // Crimson Haze (Japanese SV5a)
  106: ["xy2"], // Flashfire (English base)
  108: ["xy2"], // Flashfire — vision often misreads denominator as 108
};

/** Catalog search names — English alias first when vision read Japanese. */
export function pokemonCatalogSearchNames(cardName?: string): string[] {
  const variants = pokemonCatalogNameVariants(cardName);
  const english = pokemonJapaneseNameToEnglish(cardName);
  const out = new Set<string>();
  if (english) out.add(english);
  for (const v of variants) out.add(v);
  return [...out];
}

/** Normalize set code tokens (SV5a → sv5a). */
export function normalizePokemonSetCode(setCode?: string): string | undefined {
  const trimmed = setCode?.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase();
}

/** Resolve Pokémon TCG API set.id values from set code, name, and/or printed total. */
export function pokemonSetIdsFromVision(vision: VisionResult): string[] {
  const ids = new Set<string>();
  const code = normalizePokemonSetCode(vision.setCode);
  if (code) ids.add(code);

  const printedTotal = pokemonPrintedTotal(vision.cardNumber);
  if (printedTotal != null) {
    for (const id of pokemonSetIdsForPrintedTotal(printedTotal)) {
      ids.add(id.toLowerCase());
    }
  }

  // When set_code is observed, do not infer conflicting English set IDs from set_name
  // (e.g. sv5a + misread "Chilling Reign" must not also query swsh6).
  if (!code) {
    const setName = vision.setName?.trim().toLowerCase();
    if (setName) {
      if (POKEMON_SET_PRINTED_TOTALS[setName] != null) {
        const total = POKEMON_SET_PRINTED_TOTALS[setName]!;
        for (const id of pokemonSetIdsForPrintedTotal(total)) {
          ids.add(id.toLowerCase());
        }
      }
      for (const [key, total] of Object.entries(POKEMON_SET_PRINTED_TOTALS)) {
        if (setName.includes(key) || key.includes(setName)) {
          for (const id of pokemonSetIdsForPrintedTotal(total)) {
            ids.add(id.toLowerCase());
          }
        }
      }
    }
  }

  return [...ids];
}

export function isJapanesePokemonVision(vision: VisionResult): boolean {
  const lang = (vision.language ?? "").trim().toLowerCase();
  return lang === "jp" || lang === "ja" || lang.includes("japanese");
}

/** Resolve set.id list for a collector denominator using manual + known set size table. */
export function pokemonSetIdsForPrintedTotal(printedTotal: number): string[] {
  const manual = POKEMON_SET_IDS_BY_PRINTED_TOTAL[printedTotal] ?? [];
  const derived = Object.entries(POKEMON_SET_PRINTED_TOTALS)
    .filter(([, total]) => total === printedTotal)
    .map(([key]) => key)
    .filter((key) => /^[a-z0-9]+$/i.test(key));
  return [...new Set([...manual, ...derived])];
}

export function scorePokemonCatalogCard(
  card: Record<string, unknown>,
  vision: VisionResult,
): number {
  const collector = pokemonCollectorQuery(vision.cardNumber);
  const setNorm = normalizePokemonSetName(vision.setName);
  const variantLower = vision.variant?.trim().toLowerCase();
  const printedTotal = pokemonPrintedTotal(vision.cardNumber);

  let score = 0;
  const num = String(card.number ?? "");
  const setName = String(
    (card.set as { name?: string; printedTotal?: number } | undefined)?.name ??
      "",
  );
  const setPrintedTotal = (
    card.set as { printedTotal?: number } | undefined
  )?.printedTotal;
  const rarity = String(card.rarity ?? "").toLowerCase();
  const name = String(card.name ?? "").toLowerCase();

  if (collector && pokemonNumbersMatch(vision.cardNumber, num)) {
    score += 60;
  } else if (
    collector &&
    num.startsWith(`${collector}/`) &&
    (!printedTotal || !setPrintedTotal || printedTotal === setPrintedTotal)
  ) {
    score += 50;
  }

  if (
    printedTotal != null &&
    setPrintedTotal != null &&
    printedTotal !== setPrintedTotal &&
    collector &&
    (num.startsWith(`${collector}/`) || pokemonNumbersMatch(vision.cardNumber, num))
  ) {
    score -= 45;
  }
  if (setNorm && pokemonSetMatches(setNorm, setName)) score += 40;
  if (
    printedTotal &&
    setPrintedTotal &&
    printedTotal === setPrintedTotal
  ) {
    score += 35;
  }
  if (
    printedTotal &&
    setPrintedTotal === printedTotal &&
    vision.cardName &&
    pokemonCatalogNamesMatch(vision.cardName, String(card.name ?? ""))
  ) {
    // Vision often misreads set symbol or collector #; denominator + name is reliable.
    score += 55;
  }
  if (
    variantLower &&
    (rarity.includes(variantLower) ||
      rarity.includes("secret") ||
      rarity.includes("rainbow"))
  ) {
    score += 15;
  }
  if (vision.cardName && pokemonCatalogNamesMatch(vision.cardName, String(card.name ?? ""))) {
    score += 10;
  }

  if (
    collector &&
    !pokemonNumbersMatch(vision.cardNumber, num) &&
    !num.startsWith(`${collector}/`)
  ) {
    score -= 25;
  }

  return score;
}

/** Pokémon TCG API set.id for promo codes by prefix (SWSH260 → swshp). */
export const POKEMON_PROMO_SET_IDS: Record<string, string> = {
  SWSH: "swshp",
  SVP: "svp",
  SM: "smp",
  XY: "xyp",
  BW: "bwp",
  DP: "dpp",
  HGSS: "hsp",
  NP: "np",
  WOTC: "basep",
};

export function pokemonPromoSetId(cardNumber?: string): string | null {
  const code = pokemonCollectorQuery(cardNumber);
  if (!code || !/^[A-Z]+\d+$/.test(code)) return null;
  const prefix = code.match(/^([A-Z]+)/)?.[1];
  if (!prefix) return null;
  return POKEMON_PROMO_SET_IDS[prefix] ?? null;
}

/** True when cardNumber is a promo code (e.g. DP45) rather than 143/147. */
export function isPokemonPromoNumber(cardNumber?: string): boolean {
  const q = pokemonCollectorQuery(cardNumber);
  return q != null && /^[A-Z]{1,4}\d+$/.test(q);
}

export function pokemonNumbersMatch(
  visionNumber: string | undefined,
  apiNumber: string,
): boolean {
  if (!visionNumber?.trim() || !apiNumber.trim()) return false;
  const v = normalizeCollectorNumber(visionNumber, "pokemon")?.toUpperCase();
  const a = apiNumber.trim().toUpperCase();
  if (!v) return false;
  if (v === a) return true;
  if (a.startsWith(`${v}/`)) return true;
  const vSlash = v.match(/^0*(\d{1,3})\/0*(\d+)/);
  const aSlash = a.match(/^0*(\d{1,3})\/0*(\d+)/);
  if (vSlash && aSlash) {
    return vSlash[1] === aSlash[1] && vSlash[2] === aSlash[2];
  }
  // Numerator-only fallback only when the catalog side has no denominator.
  if (vSlash && !a.includes("/")) {
    return a === vSlash[1] || a.replace(/^0+/, "") === vSlash[1];
  }
  return false;
}

/** Normalize vision set names toward Pokémon TCG API set.name values. */
export function normalizePokemonSetName(setName?: string): string | undefined {
  if (!setName?.trim()) return undefined;
  const s = setName.trim();
  const lower = s.toLowerCase();

  const aliases: Record<string, string> = {
    swsh: "Sword & Shield",
    "sword and shield": "Sword & Shield",
    "sword & shield": "Sword & Shield",
    sv: "Scarlet & Violet",
    "scarlet and violet": "Scarlet & Violet",
    "scarlet & violet": "Scarlet & Violet",
    vv: "Vivid Voltage",
    "vivid voltage": "Vivid Voltage",
    evs: "Evolving Skies",
    "evolving skies": "Evolving Skies",
    cel: "Celebrations",
    celebrations: "Celebrations",
    "supreme victors": "Supreme Victors",
    "diamond and pearl promos": "Diamond & Pearl Promos",
    "diamond & pearl promos": "Diamond & Pearl Promos",
    "dp promos": "Diamond & Pearl Promos",
    "swsh promos": "SWSH Black Star Promos",
    "swsh black star promos": "SWSH Black Star Promos",
    "sword & shield promos": "SWSH Black Star Promos",
    "sword and shield promos": "SWSH Black Star Promos",
    "black star promos": "SWSH Black Star Promos",
    "shining fates shiny vault": "Shining Fates Shiny Vault",
    "astral radiance": "Astral Radiance",
    "twilight masquerade": "Twilight Masquerade",
    "lost origin": "Lost Origin",
    "crown zenith": "Crown Zenith",
    "crown zenith galarian gallery": "Crown Zenith Galarian Gallery",
    "crimson haze": "Crimson Haze",
    sv5a: "Crimson Haze",
  };

  if (aliases[lower]) return aliases[lower];

  for (const [key, value] of Object.entries(aliases)) {
    if (lower.includes(key)) return value;
  }

  return s;
}

/** Expand JP set code/name tokens for PriceCharting / TCGplayer console matching. */
export function japanesePokemonSetMatchHints(
  setName?: string,
  setCode?: string,
): string[] {
  const hints = new Set<string>();
  for (const raw of [setName, setCode]) {
    if (!raw?.trim()) continue;
    const trimmed = raw.trim().toLowerCase();
    hints.add(trimmed);
    const normalized = normalizePokemonSetName(raw);
    if (normalized) hints.add(normalized.toLowerCase());
    const code = normalizePokemonSetCode(raw);
    if (code) hints.add(code);
  }
  return [...hints];
}

export function textMatchesPokemonSetHints(
  texts: string[],
  hints: string[],
): boolean {
  if (!hints.length) return false;
  const lowered = texts.map((text) => text.trim().toLowerCase()).filter(Boolean);
  return hints.some((hint) =>
    lowered.some((text) => text.includes(hint) || hint.includes(text)),
  );
}

export function pokemonSetMatches(
  visionSet: string | undefined,
  apiSetName: string,
): boolean {
  if (!visionSet?.trim()) return false;
  const a = normalizePokemonSetName(visionSet)?.toLowerCase() ?? "";
  const b = apiSetName.toLowerCase();
  return a === b || a.includes(b) || b.includes(a);
}

type PriceTier = { market?: number; mid?: number; low?: number };

export function tcgPlayerMarketForRarity(
  prices: Record<string, PriceTier> | undefined,
  rarity: string,
  variant?: string,
  condition?: ConditionEstimate,
): number {
  if (!prices) return 0;

  const pick = (tier?: PriceTier) => {
    if (!tier) return 0;
    if (condition === "DMG" || condition === "HP") {
      return tier.low ?? tier.mid ?? tier.market ?? 0;
    }
    if (condition === "MP") {
      return tier.mid ?? tier.low ?? tier.market ?? 0;
    }
    if (condition === "LP") {
      return tier.mid ?? tier.market ?? tier.low ?? 0;
    }
    return tier.market ?? tier.mid ?? tier.low ?? 0;
  };

  const r = rarity.toLowerCase();
  const v = (variant ?? "").toLowerCase();
  const isSpecialIllustration =
    r.includes("special illustration") ||
    r.includes("illustration rare") ||
    v.includes("special illustration") ||
    v.includes("illustration rare");
  const isReverse =
    v.includes("reverse") ||
    r.includes("reverse") ||
    Boolean(prices?.reverseHolofoil && !v.includes("normal"));
  if (isReverse) {
    const reverse = pick(prices.reverseHolofoil);
    if (reverse > 0) return reverse;
  }

  const isRainbow =
    r.includes("rainbow") ||
    r.includes("secret") ||
    r.includes("hyper rare") ||
    v.includes("rainbow") ||
    v.includes("secret");
  const isHolo =
    isRainbow ||
    isSpecialIllustration ||
    r.includes("holo") ||
    r.includes("ultra") ||
    r.includes("rare") ||
    r.includes("illustration") ||
    r.includes("special art");

  if (isRainbow || isHolo) {
    const holo = pick(prices.holofoil);
    if (holo > 0) return holo;
  }

  const normal = pick(prices.normal);
  if (normal > 0 && !isHolo) return normal;

  const reverse = pick(prices.reverseHolofoil);
  if (reverse > 0) return reverse;

  if (isHolo) return pick(prices.holofoil);

  // Last resort: prefer holofoil for rare+ cards, else normal
  return pick(prices.holofoil) || pick(prices.normal) || pick(prices.reverseHolofoil);
}

/** Best available USD price from any TCGPlayer tier (market → mid → low). */
export function tcgPlayerAnyPrice(
  prices: Record<string, PriceTier> | undefined,
): number {
  if (!prices) return 0;
  let best = 0;
  for (const tier of Object.values(prices)) {
    if (!tier) continue;
    const v = tier.market ?? tier.mid ?? tier.low ?? 0;
    if (v > best) best = v;
  }
  return best;
}

export function enrichVisionFromPokemonCard(
  vision: VisionResult,
  card: Record<string, unknown>,
): VisionResult {
  const set = card.set as
    | { name?: string; releaseDate?: string; printedTotal?: number }
    | undefined;
  const releaseYear = set?.releaseDate?.slice(0, 4);
  const rarity = String(card.rarity ?? "");
  const rarityLower = rarity.toLowerCase();

  const base: VisionResult = {
    ...vision,
    cardName: vision.cardName ?? (card.name != null ? String(card.name) : undefined),
    setName: set?.name ?? vision.setName,
    year: vision.year ?? releaseYear,
    variant:
      vision.variant ??
      (rarityLower.includes("rainbow")
        ? "Rainbow Rare"
        : rarityLower.includes("special illustration")
          ? "Special Illustration Rare"
          : undefined),
  };

  const cardNumber =
    reconcilePokemonCardNumber(base, card) ??
    (card.number != null ? String(card.number) : undefined) ??
    base.cardNumber;

  return { ...base, cardNumber };
}

export function pokemonIdentificationComplete(vision: VisionResult): boolean {
  if (vision.category !== "pokemon") return true;
  const hasNumber =
    pokemonCollectorQuery(vision.cardNumber) ||
    vision.cardNumber?.includes("/") ||
    isPokemonPromoNumber(vision.cardNumber);
  return Boolean(vision.cardName?.trim() && vision.setName?.trim() && hasNumber);
}
