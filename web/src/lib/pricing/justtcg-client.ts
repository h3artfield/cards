/**
 * JustTCG pricing API (https://justtcg.com/docs). Batch lookups take up to
 * 100 cards per request on the Starter and Pro plans; each card comes back
 * with every condition × printing variant we ask for, each with its own
 * price and history.
 */
const BASE = "https://api.justtcg.com/v1";
export const JUSTTCG_BATCH_LIMIT = 100;

export type JustTcgPointV1 = { p: number; t: number };

export type JustTcgVariantV1 = {
  id: string;
  uuid?: string;
  tcgplayerSkuId?: string | number | null;
  condition: string;
  printing: string;
  language?: string;
  price: number | null;
  priceStatus?: "current" | "expired" | "unpriced";
  lastKnownPrice?: number | null;
  lastUpdated?: number | null;
  priceChange24hr?: number | null;
  priceChange30d?: number | null;
  minPrice1y?: number | null;
  maxPrice1y?: number | null;
  priceHistory?: JustTcgPointV1[] | null;
};

export type JustTcgCardV1 = {
  id: string;
  name: string;
  game: string;
  set_name?: string;
  number?: string | null;
  tcgplayerId?: string | null;
  scryfallId?: string | null;
  variants: JustTcgVariantV1[];
};

export type JustTcgLookupV1 = {
  tcgplayerId?: string;
  /** TCGplayer's per-condition id, the "TCGplayer Id" column of a seller export. */
  tcgplayerSkuId?: string;
  scryfallId?: string;
  condition?: string;
  printing?: string;
};

export class JustTcgErrorV1 extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function justTcgConfiguredV1(): boolean {
  return Boolean(process.env.JUSTTCG_API_KEY?.trim());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, init: RequestInit): Promise<{ body: T; remaining: number | null }> {
  const key = process.env.JUSTTCG_API_KEY?.trim();
  if (!key) throw new JustTcgErrorV1("JUSTTCG_API_KEY is not configured", 503);
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "x-api-key": key, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(60_000),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(30_000, 1000 * 2 ** attempt);
      await sleep(wait + Math.random() * 400);
      continue;
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    if (!res.ok) {
      const msg = (body as { error?: string; message?: string } | null)?.error ?? (body as { message?: string } | null)?.message ?? text.slice(0, 200);
      throw new JustTcgErrorV1(`JustTCG ${res.status}: ${msg}`, res.status);
    }
    const remaining = (body as { _metadata?: { apiRequestsRemaining?: number } })._metadata?.apiRequestsRemaining;
    return { body: body as T, remaining: typeof remaining === "number" ? remaining : null };
  }
}

/** One request for up to 100 lookups; a year of daily history per variant when asked. */
export async function justTcgBatchV1(
  lookups: JustTcgLookupV1[],
  opts: { history?: "7d" | "30d" | "90d" | "180d" | "1y" } = {},
): Promise<{ cards: JustTcgCardV1[]; remaining: number | null }> {
  if (lookups.length > JUSTTCG_BATCH_LIMIT) throw new Error(`At most ${JUSTTCG_BATCH_LIMIT} cards per JustTCG request`);
  const q = new URLSearchParams({
    include_price_history: opts.history ? "true" : "false",
    include_statistics: "30d,1y",
    ...(opts.history ? { priceHistoryDuration: opts.history } : {}),
  });
  const { body, remaining } = await call<{ data?: JustTcgCardV1[] }>(`/cards?${q}`, {
    method: "POST",
    body: JSON.stringify(lookups),
  });
  return { cards: body.data ?? [], remaining };
}

/** Free-text search, for shelf cards outside Magic that came without a TCGplayer id. */
export async function justTcgSearchV1(input: { q: string; game?: string; number?: string; limit?: number }): Promise<JustTcgCardV1[]> {
  const q = new URLSearchParams({
    q: input.q,
    include_price_history: "false",
    limit: String(input.limit ?? 10),
    ...(input.game ? { game: input.game } : {}),
    ...(input.number ? { number: input.number } : {}),
  });
  const { body } = await call<{ data?: JustTcgCardV1[] }>(`/cards?${q}`, { method: "GET" });
  return body.data ?? [];
}

const BASE_CONDITIONS: Array<[RegExp, string]> = [
  [/^near mint/i, "Near Mint"],
  [/^lightly played/i, "Lightly Played"],
  [/^moderately played/i, "Moderately Played"],
  [/^heavily played/i, "Heavily Played"],
  [/^damaged/i, "Damaged"],
];

/**
 * TCGplayer folds printing and language into the condition ("Near Mint
 * Foil", "Lightly Played Reverse Holofoil - Japanese"); JustTCG keeps them
 * apart. Splits one into the other's terms.
 */
export function splitTcgplayerConditionV1(condition: string): { condition: string; printing: string; language: string } {
  let rest = condition.trim();
  let language = "English";
  const lang = rest.match(/\s*-\s*([A-Za-z() ]+)$/);
  if (lang) {
    language = lang[1]!.trim();
    rest = rest.slice(0, lang.index).trim();
  }
  const base = BASE_CONDITIONS.find(([re]) => re.test(rest));
  const cond = base?.[1] ?? "Near Mint";
  const printing = base ? rest.replace(base[0], "").trim() : "";
  return { condition: cond, printing: printing || "Normal", language };
}

/** The variant matching a TCGplayer condition string, or null when the card has none. */
export function pickJustTcgVariantV1(card: JustTcgCardV1, tcgplayerCondition: string): JustTcgVariantV1 | null {
  const want = splitTcgplayerConditionV1(tcgplayerCondition);
  const lc = (s: string | undefined) => (s ?? "").toLowerCase();
  const sameLang = card.variants.filter((v) => lc(v.language || "English") === lc(want.language));
  const sameCond = sameLang.filter((v) => lc(v.condition) === lc(want.condition));
  return (
    sameCond.find((v) => lc(v.printing) === lc(want.printing)) ??
    (want.printing === "Normal" && sameCond.length === 1 ? sameCond[0]! : null)
  );
}

const CONDITION_ORDER = ["near mint", "lightly played", "moderately played", "heavily played", "damaged"];

/**
 * The exact variant when JustTCG prices it, else the closest priced one: same
 * printing (any foil for a special foil; the only printing when the card has
 * one), the wanted language or else English, then the nearest condition,
 * leaning to the worse one on a tie.
 */
export function nearestJustTcgVariantV1(card: JustTcgCardV1, tcgplayerCondition: string): JustTcgVariantV1 | null {
  const exact = pickJustTcgVariantV1(card, tcgplayerCondition);
  if (exact && justTcgVariantPriceV1(exact) != null) return exact;
  const want = splitTcgplayerConditionV1(tcgplayerCondition);
  const lc = (s: string | undefined) => (s ?? "").toLowerCase();
  const priced = card.variants.filter((v) => justTcgVariantPriceV1(v) != null);
  const isFoil = (p: string) => /foil|holo/.test(p);
  let pool = priced.filter((v) => lc(v.printing) === lc(want.printing));
  if (!pool.length && isFoil(lc(want.printing))) pool = priced.filter((v) => isFoil(lc(v.printing)));
  if (!pool.length && new Set(priced.map((v) => lc(v.printing))).size === 1) pool = priced;
  if (!pool.length) return null;
  const langOf = (v: JustTcgVariantV1) => lc(v.language || "English");
  for (const lang of [lc(want.language), "english"]) {
    const sameLang = pool.filter((v) => langOf(v) === lang);
    if (sameLang.length) {
      pool = sameLang;
      break;
    }
  }
  const wantRank = CONDITION_ORDER.indexOf(lc(want.condition));
  const rank = (v: JustTcgVariantV1) => {
    const r = CONDITION_ORDER.indexOf(lc(v.condition));
    return r < 0 ? 99 : Math.abs(r - wantRank) * 2 - (r > wantRank ? 1 : 0);
  };
  return [...pool].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

/**
 * "" when the variant is the card as listed with a current price; otherwise
 * what the price really is, e.g. "Estimated: JustTCG English Lightly Played price".
 */
export function justTcgPriceNoteV1(v: JustTcgVariantV1, tcgplayerCondition: string): string {
  const want = splitTcgplayerConditionV1(tcgplayerCondition);
  const lc = (s: string | undefined) => (s ?? "").toLowerCase();
  const lang = v.language || "English";
  const parts: string[] = [];
  if (lc(lang) !== lc(want.language)) parts.push(lang);
  if (lc(v.condition) !== lc(want.condition)) parts.push(v.condition);
  if (lc(v.printing) !== lc(want.printing)) parts.push(v.printing);
  const stale = v.price == null && v.lastKnownPrice != null;
  if (!parts.length) return stale ? "JustTCG's last known price; no recent sales" : "";
  const label = [lc(lang) !== lc(want.language) ? lang : "", v.condition, lc(v.printing) === "normal" ? "" : v.printing]
    .filter(Boolean)
    .join(" ");
  return `Estimated: JustTCG ${label} price${stale ? " (last known)" : ""}`;
}

/**
 * Looks up TCGplayer SKU ids, mapping each to its product id and the exact
 * variant. Returns only the SKUs JustTCG knows.
 */
export async function justTcgBySkuV1(
  skus: string[],
): Promise<{ bySku: Map<string, { productId: string; card: JustTcgCardV1; variant: JustTcgVariantV1 }>; requests: number }> {
  const bySku = new Map<string, { productId: string; card: JustTcgCardV1; variant: JustTcgVariantV1 }>();
  const unique = [...new Set(skus.filter(Boolean))];
  let requests = 0;
  for (let i = 0; i < unique.length; i += JUSTTCG_BATCH_LIMIT) {
    const chunk = unique.slice(i, i + JUSTTCG_BATCH_LIMIT);
    const want = new Set(chunk);
    const { cards } = await justTcgBatchV1(chunk.map((tcgplayerSkuId) => ({ tcgplayerSkuId })));
    requests += 1;
    for (const card of cards) {
      if (!card.tcgplayerId) continue;
      for (const variant of card.variants) {
        const sku = variant.tcgplayerSkuId != null ? String(variant.tcgplayerSkuId) : "";
        if (want.has(sku)) bySku.set(sku, { productId: String(card.tcgplayerId), card, variant });
      }
    }
  }
  return { bySku, requests };
}

/** The price to use: current when reported, else the last one seen before it expired. */
export function justTcgVariantPriceV1(v: JustTcgVariantV1): number | null {
  const p = v.price ?? (v.priceStatus === "expired" ? v.lastKnownPrice ?? null : null);
  return p != null && p > 0 ? p : null;
}
