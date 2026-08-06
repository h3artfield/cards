import type { VisionResult } from "../../types";
import { buildCompSearchQuery, isLikelyLotListing } from "./build-search-query";
import type { CompCandidate } from "./comp-stats";
import {
  buildSportsSearchQueries,
  primarySportsSearchQuery,
  sportsListingTitleMatches,
} from "./sports-search-queries";
import { isVisionGradedSlab, mergeVisionSlabFields, slabSearchTag } from "../slab-pricing";
import { pokemonCollectorQuery } from "../pokemon-utils";

const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_SEARCH = "https://api.ebay.com/buy/browse/v1/item_summary/search";
const EBAY_INSIGHTS_SEARCH =
  "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search";

let cachedToken: { value: string; expiresAt: number } | null = null;

interface EbayItemSummary {
  title?: string;
  price?: { value?: string; currency?: string };
  itemEndDate?: string;
}

interface EbaySoldItem {
  title?: string;
  lastSoldPrice?: { value?: string; currency?: string };
  lastSoldDate?: string;
}

const EBAY_TOKEN_SCOPE = "https://api.ebay.com/oauth/api_scope";

async function mintEbayTokenDiagnostic(): Promise<{
  token: string | null;
  scopesGranted?: string;
}> {
  const clientId = process.env.EBAY_CLIENT_ID?.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return { token: null };

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  try {
    const res = await fetch(EBAY_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=client_credentials&scope=${encodeURIComponent(EBAY_TOKEN_SCOPE)}`,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return { token: null };
    const data = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!data.access_token) return { token: null, scopesGranted: data.scope };
    cachedToken = {
      value: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 7200) * 1000,
    };
    return { token: data.access_token, scopesGranted: data.scope };
  } catch {
    return { token: null };
  }
}

async function getEbayAccessToken(): Promise<string | null> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const minted = await mintEbayTokenDiagnostic();
  return minted.token;
}

function parseUsd(value?: string): number | undefined {
  if (!value) return undefined;
  const n = parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function filterSportsCandidates(
  vision: VisionResult,
  candidates: CompCandidate[],
): CompCandidate[] {
  if (vision.category !== "sports") return candidates;
  return candidates.filter(
    (c) => c.title && sportsListingTitleMatches(vision, c.title),
  );
}

function filterPokemonCandidates(
  vision: VisionResult,
  candidates: CompCandidate[],
): CompCandidate[] {
  if (vision.category !== "pokemon") return candidates;
  const collector = pokemonCollectorQuery(vision.cardNumber);
  if (!collector) return candidates;

  const filtered = candidates.filter((c) => {
    const title = c.title ?? "";
    if (isLikelyLotListing(title)) return false;
    if (new RegExp(`\\b#?0*${collector}\\b`, "i").test(title)) return true;
    if (title.includes(`${collector}/`)) return true;
    return false;
  });

  return filtered.length >= 2 ? filtered : candidates;
}

function filterListingCandidates(
  vision: VisionResult,
  candidates: CompCandidate[],
): CompCandidate[] {
  return filterPokemonCandidates(
    vision,
    filterSportsCandidates(vision, candidates),
  );
}

function queryPriority(
  q: string,
  narrow: string,
  sold: boolean,
  candidateCount: number,
): number {
  let score = candidateCount;
  if (sold) score += 1000;
  if (q === narrow) score += 500;
  return score;
}

function itemToCandidate(
  title: string | undefined,
  price: number | undefined,
  date: string | undefined,
  source: string,
): CompCandidate | null {
  if (!price || !title) return null;
  if (isLikelyLotListing(title)) return null;
  return { price, title, date, source };
}

export interface EbayFetchHealthResult {
  candidates: CompCandidate[];
  httpStatus?: number;
  rawCount: number;
  normalizedCount: number;
  errorBody?: string;
  fatalError?: string;
}

async function fetchMarketplaceInsightsSoldWithHealth(
  token: string,
  query: string,
  limit: number,
): Promise<EbayFetchHealthResult> {
  try {
    const url = new URL(EBAY_INSIGHTS_SEARCH);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
      signal: AbortSignal.timeout(20_000),
    });

    const data = (await res.json()) as {
      itemSales?: EbaySoldItem[];
      errors?: Array<{ message?: string }>;
    };

    if (!res.ok) {
      const errorBody =
        data.errors?.[0]?.message ?? JSON.stringify(data).slice(0, 200);
      return {
        candidates: [],
        httpStatus: res.status,
        rawCount: 0,
        normalizedCount: 0,
        errorBody,
        fatalError:
          res.status === 403
            ? "authorization_or_scope_failure"
            : `http_${res.status}`,
      };
    }

    const candidates: CompCandidate[] = [];
    const rawCount = data.itemSales?.length ?? 0;

    for (const sale of data.itemSales ?? []) {
      const price = parseUsd(sale.lastSoldPrice?.value);
      const candidate = itemToCandidate(
        sale.title,
        price,
        sale.lastSoldDate,
        "ebay_sold",
      );
      if (candidate) candidates.push(candidate);
    }

    return {
      candidates,
      httpStatus: res.status,
      rawCount,
      normalizedCount: candidates.length,
    };
  } catch (err) {
    return {
      candidates: [],
      rawCount: 0,
      normalizedCount: 0,
      fatalError: err instanceof Error ? err.message : "fetch_failed",
    };
  }
}

async function fetchMarketplaceInsightsSold(
  token: string,
  query: string,
  limit: number,
): Promise<CompCandidate[]> {
  const result = await fetchMarketplaceInsightsSoldWithHealth(token, query, limit);
  return result.candidates;
}

async function fetchBrowseListingsWithHealth(
  token: string,
  query: string,
  limit: number,
): Promise<EbayFetchHealthResult> {
  try {
    const url = new URL(EBAY_BROWSE_SEARCH);
    url.searchParams.set("q", query);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("filter", "buyingOptions:{FIXED_PRICE|AUCTION}");

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      },
      signal: AbortSignal.timeout(20_000),
    });

    const data = (await res.json()) as {
      itemSummaries?: EbayItemSummary[];
      errors?: Array<{ message?: string }>;
    };

    if (!res.ok) {
      return {
        candidates: [],
        httpStatus: res.status,
        rawCount: 0,
        normalizedCount: 0,
        errorBody: data.errors?.[0]?.message,
        fatalError:
          res.status === 403
            ? "authorization_or_scope_failure"
            : `http_${res.status}`,
      };
    }

    const candidates: CompCandidate[] = [];
    const rawCount = data.itemSummaries?.length ?? 0;

    for (const item of data.itemSummaries ?? []) {
      const price = parseUsd(item.price?.value);
      const candidate = itemToCandidate(
        item.title,
        price,
        item.itemEndDate,
        "ebay_listed",
      );
      if (candidate) candidates.push(candidate);
    }

    return {
      candidates,
      httpStatus: res.status,
      rawCount,
      normalizedCount: candidates.length,
    };
  } catch (err) {
    return {
      candidates: [],
      rawCount: 0,
      normalizedCount: 0,
      fatalError: err instanceof Error ? err.message : "fetch_failed",
    };
  }
}

/** Active listings — used only when sold API unavailable; marked as lower confidence. */
async function fetchBrowseListings(
  token: string,
  query: string,
  limit: number,
): Promise<CompCandidate[]> {
  const result = await fetchBrowseListingsWithHealth(token, query, limit);
  return result.candidates;
}

export interface EbayCompResult {
  candidates: CompCandidate[];
  sold: boolean;
  searchUrl: string;
}

export async function fetchEbayComps(vision: VisionResult): Promise<EbayCompResult | null> {
  const token = await getEbayAccessToken();
  if (!token) return null;

  const v = mergeVisionSlabFields(vision);
  const { narrow, primary, graded } = buildCompSearchQuery(v);
  const sportsQueries =
    v.category === "sports" ? buildSportsSearchQueries(v) : [];
  const isSlab = isVisionGradedSlab(v);

  const query =
    isSlab && graded
      ? graded
      : v.category === "sports"
        ? primarySportsSearchQuery(v) || sportsQueries[0] || narrow || primary
        : sportsQueries[0] ?? graded ?? narrow ?? primary;
  const searchUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;

  const queries = (
    isSlab && graded
      ? [graded, `${v.cardName ?? ""} ${slabSearchTag(v) ?? ""}`.trim()]
      : v.category === "pokemon"
        ? [narrow, primary, graded].filter(Boolean)
        : [...sportsQueries, graded, narrow, primary]
  ).filter(Boolean);
  const uniqueQueries = [...new Set(queries)] as string[];
  let best: EbayCompResult | null = null;
  let bestScore = -1;

  for (const q of uniqueQueries) {
    let candidates = await fetchMarketplaceInsightsSold(token, q, 20);
    let sold = candidates.length > 0;

    if (candidates.length < 3) {
      const listed = await fetchBrowseListings(token, q, 25);
      if (listed.length > candidates.length) {
        candidates = listed;
        sold = false;
      }
    }

    candidates = filterListingCandidates(v, candidates);
    if (!candidates.length) continue;

    const score = queryPriority(q, narrow, sold, candidates.length);
    const result: EbayCompResult = { candidates, sold, searchUrl };
    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
    if (sold && q === narrow && candidates.length >= 2) break;
  }

  return best;
}

/** V2 market: fetch sold comps with per-query health metadata. */
export async function fetchEbaySoldByQueriesWithHealth(
  queries: string[],
  limit = 20,
): Promise<
  Array<{
    query: string;
    candidates: CompCandidate[];
    httpStatus?: number;
    rawCount: number;
    normalizedCount: number;
    fatalError?: string;
    errorBody?: string;
  }>
> {
  const clientId = process.env.EBAY_CLIENT_ID?.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return queries.map((query) => ({
      query,
      candidates: [],
      rawCount: 0,
      normalizedCount: 0,
      fatalError: "credentials_missing",
    }));
  }

  const token = await getEbayAccessToken();
  if (!token) {
    return queries.map((query) => ({
      query,
      candidates: [],
      rawCount: 0,
      normalizedCount: 0,
      fatalError: "token_mint_failed",
    }));
  }

  const unique = [...new Set(queries.filter(Boolean))];
  const results: Array<{
    query: string;
    candidates: CompCandidate[];
    httpStatus?: number;
    rawCount: number;
    normalizedCount: number;
    fatalError?: string;
    errorBody?: string;
  }> = [];

  for (const query of unique) {
    const health = await fetchMarketplaceInsightsSoldWithHealth(token, query, limit);
    results.push({
      query,
      candidates: health.candidates,
      httpStatus: health.httpStatus,
      rawCount: health.rawCount,
      normalizedCount: health.normalizedCount,
      fatalError: health.fatalError,
      errorBody: health.errorBody,
    });
  }
  return results;
}

/** V2 market: fetch sold comps for explicit search queries (no vision inference). */
export async function fetchEbaySoldByQueries(
  queries: string[],
  limit = 20,
): Promise<Array<{ query: string; candidates: CompCandidate[] }>> {
  const withHealth = await fetchEbaySoldByQueriesWithHealth(queries, limit);
  return withHealth
    .filter((r) => r.candidates.length > 0)
    .map((r) => ({ query: r.query, candidates: r.candidates }));
}

/** V2 market: active listings with health metadata. */
export async function fetchEbayActiveByQueryWithHealth(
  query: string,
  limit = 15,
): Promise<EbayFetchHealthResult & { query: string }> {
  const token = await getEbayAccessToken();
  if (!token || !query.trim()) {
    return {
      query,
      candidates: [],
      rawCount: 0,
      normalizedCount: 0,
      fatalError: !query.trim() ? "empty_query" : "token_mint_failed",
    };
  }
  const health = await fetchBrowseListingsWithHealth(token, query, limit);
  return { query, ...health };
}

/** V2 market: active listings sanity check only — not sold value. */
export async function fetchEbayActiveByQuery(
  query: string,
  limit = 15,
): Promise<CompCandidate[]> {
  const result = await fetchEbayActiveByQueryWithHealth(query, limit);
  return result.candidates;
}

export async function runEbayApiDiagnostic(): Promise<
  import("../../card-flow-v2/market/source-health-types").EbayApiDiagnostic
> {
  const hasClientId = Boolean(process.env.EBAY_CLIENT_ID?.trim());
  const hasClientSecret = Boolean(process.env.EBAY_CLIENT_SECRET?.trim());
  const notes: string[] = [];

  if (!hasClientId || !hasClientSecret) {
    return {
      configured: false,
      hasClientId,
      hasClientSecret,
      tokenMintOk: false,
      tokenScopeRequested: EBAY_TOKEN_SCOPE,
      soldApiPath: EBAY_INSIGHTS_SEARCH,
      activeApiPath: EBAY_BROWSE_SEARCH,
      browseWorks: false,
      insightsWorks: false,
      insightsConclusion: "C",
      notes: ["EBAY_CLIENT_ID or EBAY_CLIENT_SECRET missing"],
    };
  }

  const minted = await mintEbayTokenDiagnostic();
  const token = minted.token;
  const tokenMintOk = Boolean(token);
  if (!tokenMintOk) notes.push("OAuth token mint failed");

  let browseStatus: number | undefined;
  let insightsStatus: number | undefined;
  let insightsErrorBody: string | undefined;
  let browseWorks = false;
  let insightsWorks = false;

  if (token) {
    const browse = await fetchBrowseListingsWithHealth(token, "Pokemon Morgan 178", 3);
    browseStatus = browse.httpStatus;
    browseWorks = browse.httpStatus === 200 && browse.normalizedCount >= 0;

    const insights = await fetchMarketplaceInsightsSoldWithHealth(
      token,
      "Pokemon Morgan 178",
      3,
    );
    insightsStatus = insights.httpStatus;
    insightsErrorBody = insights.errorBody;
    insightsWorks = insights.httpStatus === 200;
    if (insights.fatalError === "authorization_or_scope_failure") {
      notes.push(
        "Marketplace Insights returned 403 — sold comps unavailable; use eBay active + TCGplayer/PriceCharting pricing signals",
      );
    }
  }

  let insightsConclusion: import("../../card-flow-v2/market/source-health-types").EbayApiDiagnostic["insightsConclusion"];
  if (!tokenMintOk) {
    insightsConclusion = "C";
    notes.push("Conclusion C: credentials present but token mint failed.");
  } else if (insightsWorks) {
    insightsConclusion = "A";
    notes.push("Conclusion A: Marketplace Insights works in this environment.");
  } else if (insightsStatus === 403) {
    insightsConclusion = "E";
    notes.push(
      "Conclusion E: Marketplace Insights returns 403 — API likely restricted/unauthorized for this app (not missing data).",
    );
  } else if (!browseWorks) {
    insightsConclusion = "C";
  } else {
    insightsConclusion = "B";
    notes.push("Conclusion B: Browse works but Marketplace Insights unavailable.");
  }

  return {
    configured: true,
    hasClientId,
    hasClientSecret,
    tokenMintOk,
    tokenScopeRequested: EBAY_TOKEN_SCOPE,
    tokenScopesGranted: minted.scopesGranted,
    soldApiPath: EBAY_INSIGHTS_SEARCH,
    activeApiPath: EBAY_BROWSE_SEARCH,
    browseWorks,
    browseStatus,
    insightsWorks,
    insightsStatus,
    insightsErrorBody,
    insightsConclusion,
    notes,
  };
}
