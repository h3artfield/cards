import type { VisionResult } from "../../types";

function clean(value?: string): string {
  return value?.trim() ?? "";
}

/** Player label without duplicating cardName when they are the same person. */
export function sportsPlayerName(vision: VisionResult): string {
  const player = clean(vision.playerName);
  const cardName = clean(vision.cardName);
  if (player) return player;
  return cardName;
}

/** Manufacturer only — strip leading year from setName like "1987 Sportflics". */
export function sportsBrand(vision: VisionResult): string {
  const brand = clean(vision.brand);
  if (brand) return brand;

  const setName = clean(vision.setName);
  const year = clean(vision.year);
  if (!setName) return "";

  if (year && setName.toLowerCase().startsWith(year)) {
    return setName.slice(year.length).trim();
  }
  const yearPrefix = setName.match(/^(\d{4})\s+(.+)$/);
  if (yearPrefix) return yearPrefix[2].trim();
  return setName;
}

/** Fill year/brand from setName when agent only wrote "1987 Sportflics". */
export function normalizeSportsVisionFields(vision: VisionResult): VisionResult {
  if (vision.category !== "sports") return vision;

  let year = clean(vision.year);
  const setName = clean(vision.setName);
  if (!year && setName) {
    const m = setName.match(/^(\d{4})\b/);
    if (m) year = m[1];
  }

  const brand = sportsBrand({ ...vision, year: year || vision.year });

  return {
    ...vision,
    year: year || vision.year,
    brand: brand || vision.brand,
  };
}

function brandQueryVariants(brand: string): string[] {
  if (!brand) return [];
  const lower = brand.toLowerCase();
  const variants = [brand];
  if (lower.includes("sportflics") || lower.includes("sport flics")) {
    variants.push("Sportflics", "Sport Flix", "sportflics");
  }
  return [...new Set(variants)];
}

function saneAgentQuery(q: string, player: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  if (player) {
    const dup = `${player} ${player}`.toLowerCase();
    if (trimmed.toLowerCase().includes(dup)) return false;
  }
  return true;
}

/** Deduped marketplace queries for sports cards (PriceCharting, eBay, admin lookup). */
export function buildSportsSearchQueries(vision: VisionResult): string[] {
  const v = normalizeSportsVisionFields(vision);
  const player = sportsPlayerName(v);
  const year = clean(v.year);
  const brand = sportsBrand(v);
  const number = clean(v.cardNumber);
  const team = clean(v.team);
  const parallel = clean(v.parallel);

  const queries: string[] = [];

  for (const b of brandQueryVariants(brand)) {
    if (year && b && player && number) {
      queries.push(`${year} ${b} ${player} ${number}`);
      queries.push(`${year} ${b} #${number} ${player}`);
      queries.push(`${year} ${b} ${number} ${player}`);
    }
    if (year && b && player) {
      queries.push(`${year} ${b} ${player}`);
    }
    if (b && player && number) {
      queries.push(`${b} ${player} ${number}`);
      queries.push(`${b} #${number} ${player}`);
    }
    if (b && player) queries.push(`${b} ${player}`);
  }

  if (year && player && number) queries.push(`${year} ${player} ${number}`);
  if (year && player) queries.push(`${year} ${player}`);
  if (player && number) queries.push(`${player} ${number}`);
  if (player && team) queries.push(`${player} ${team}`);
  if (player) queries.push(player);
  if (parallel && player) queries.push(`${player} ${parallel}`);

  if (v.agentSearchQueries?.length) {
    for (const q of v.agentSearchQueries) {
      if (saneAgentQuery(String(q), player)) queries.push(String(q));
    }
  }

  return [...new Set(queries.filter(Boolean))];
}

export function primarySportsSearchQuery(vision: VisionResult): string {
  const v = normalizeSportsVisionFields(vision);
  const player = sportsPlayerName(v);
  const year = clean(v.year);
  const brand = sportsBrand(v);
  const number = clean(v.cardNumber);

  if (year && brand && player && number) {
    return `${year} ${brand} ${player} ${number}`;
  }
  return buildSportsSearchQueries(v)[0] ?? "";
}

/** Whether an eBay/Google listing title plausibly matches this sports card. */
export function sportsListingTitleMatches(
  vision: VisionResult,
  title: string,
): boolean {
  const t = title.toLowerCase();
  const player = sportsPlayerName(vision).toLowerCase();
  if (!player) return true;

  const parts = player.split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1]!;
  if (!t.includes(last)) return false;

  if (parts.length >= 2) {
    const first = parts[0]!;
    const full = parts.join(" ");
    if (t.includes(full)) {
      // exact player name
    } else if (!t.includes(first) && t.includes(last)) {
      // last name only in title — OK for vintage
    } else if (!t.includes(last)) {
      return false;
    }
  }

  const year = clean(vision.year);
  const brand = sportsBrand(vision).toLowerCase();
  const number = clean(vision.cardNumber).replace(/^#/, "");

  let matchSignals = 0;
  if (year && t.includes(year)) matchSignals++;
  if (brand) {
    const brandTerms = brandQueryVariants(brand).map((b) => b.toLowerCase());
    if (brandTerms.some((b) => t.includes(b.replace(/\s+/g, "")) || t.includes(b))) {
      matchSignals++;
    }
  }
  if (number && new RegExp(`\\b#?${number}\\b`).test(t)) matchSignals++;

  if (year || brand || number) return matchSignals >= 1;
  return true;
}

export function sportsMarketplaceSearchUrls(vision: VisionResult): {
  ebaySold: string;
  ebayActive: string;
  google: string;
} {
  const q = primarySportsSearchQuery(vision) || sportsPlayerName(vision);
  const encoded = encodeURIComponent(q);
  return {
    ebaySold: `https://www.ebay.com/sch/i.html?_nkw=${encoded}&LH_Sold=1&LH_Complete=1`,
    ebayActive: `https://www.ebay.com/sch/i.html?_nkw=${encoded}`,
    google: `https://www.google.com/search?q=${encodeURIComponent(`${q} price`)}`,
  };
}
