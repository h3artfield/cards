const SCRYFALL_USER_AGENT =
  process.env.SCRYFALL_USER_AGENT ??
  "CardBuyback/1.0 (+https://buyback-web-staging-rrogeqxyea-uc.a.run.app)";

const SCRYFALL_RETRY_ATTEMPTS = 4;
const SCRYFALL_RETRY_BASE_MS = 500;
/** Scryfall asks for ~50–100 ms between requests; pacing cuts 429s during bulk cache. */
const SCRYFALL_MIN_INTERVAL_MS = 80;

let lastScryfallFetchAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function paceScryfall(): Promise<void> {
  const wait = SCRYFALL_MIN_INTERVAL_MS - (Date.now() - lastScryfallFetchAt);
  if (wait > 0) await sleep(wait);
  lastScryfallFetchAt = Date.now();
}

export function normalizeScryfallCollectorNumber(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.match(/\d+/);
  if (!digits) return raw.trim();
  const n = parseInt(digits[0], 10);
  return Number.isFinite(n) ? String(n) : digits[0];
}

export async function scryfallPost(url: string, body: unknown): Promise<Response> {
  return scryfallRequest(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": SCRYFALL_USER_AGENT,
    },
    body: JSON.stringify(body),
  });
}

export async function scryfallFetch(url: string): Promise<Response> {
  return scryfallRequest(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": SCRYFALL_USER_AGENT,
    },
  });
}

async function scryfallRequest(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < SCRYFALL_RETRY_ATTEMPTS; attempt++) {
    try {
      await paceScryfall();
      const res = await fetch(url, init);
      if (res.ok || res.status === 404) {
        return res;
      }
      if (attempt < SCRYFALL_RETRY_ATTEMPTS - 1 && (res.status === 429 || res.status >= 500)) {
        console.warn(
          `[scryfall] ${res.status} on attempt ${attempt + 1}, retrying: ${url}`,
        );
        await sleep(SCRYFALL_RETRY_BASE_MS * (attempt + 1));
        continue;
      }
      console.warn(`[scryfall] ${res.status} for ${url}`);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < SCRYFALL_RETRY_ATTEMPTS - 1) {
        console.warn(`[scryfall] fetch error attempt ${attempt + 1}, retrying:`, err);
        await sleep(SCRYFALL_RETRY_BASE_MS * (attempt + 1));
        continue;
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Scryfall fetch failed after retries");
}

export async function fetchScryfallBySetAndNumber(
  setCode: string,
  collectorNumber: string,
): Promise<Record<string, unknown> | null> {
  const set = setCode.trim().toLowerCase();
  const cn = normalizeScryfallCollectorNumber(collectorNumber);
  if (!set || !cn) return null;

  const url = `https://api.scryfall.com/cards/${encodeURIComponent(set)}/${encodeURIComponent(cn)}`;
  try {
    const res = await scryfallFetch(url);
    if (res.ok) {
      return (await res.json()) as Record<string, unknown>;
    }
  } catch (err) {
    console.error(`[scryfall] fetch by set/number failed ${set}/${cn}:`, err);
  }
  return null;
}

export async function searchScryfallCards(
  query: string,
): Promise<Record<string, unknown>[]> {
  if (!query.trim()) return [];
  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { data?: Record<string, unknown>[] };
    return data.data ?? [];
  } catch (err) {
    console.error(`[scryfall] search failed for ${query}:`, err);
    return [];
  }
}
