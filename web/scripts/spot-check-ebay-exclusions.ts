/**
 * Spot check: V2 search-plan minus exclusions vs Marketplace Insights sold search.
 * Run: npx tsx scripts/spot-check-ebay-exclusions.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { buildSuspectSearchPlan } from "../src/lib/card-flow-v2/market/search-plan-builder";
import type { CardSuspect } from "../src/lib/card-flow-v2/types";

function loadEnv() {
  const p = resolve(__dirname, "../.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

function suspect(overrides: Partial<CardSuspect>): CardSuspect {
  return {
    suspectId: "spot:1",
    category: "pokemon",
    label: "Spot check",
    catalogSource: "pokemon_tcg",
    variantTags: [],
    expectedEvidence: [],
    ...overrides,
  };
}

const JUNK = /\b(psa|cgc|bgs|sgc|slab|graded|lot of|\blot\b|bundle|proxy)\b/i;

async function getToken(): Promise<string | null> {
  const clientId = process.env.EBAY_CLIENT_ID?.trim();
  const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function browseSearch(token: string, q: string, limit = 15) {
  const url = new URL("https://api.ebay.com/buy/browse/v1/item_summary/search");
  url.searchParams.set("q", q);
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
    itemSummaries?: Array<{ title?: string; price?: { value?: string } }>;
    errors?: Array<{ message?: string }>;
  };

  return {
    ok: res.ok,
    status: res.status,
    count: data.itemSummaries?.length ?? 0,
    titles: (data.itemSummaries ?? []).map((s) => s.title ?? ""),
    error: data.errors?.[0]?.message,
  };
}

async function soldSearch(token: string, q: string, limit = 15) {
  const insights = await soldSearchInsights(token, q, limit);
  if (insights.ok) return { ...insights, source: "marketplace_insights" as const };
  const browse = await browseSearch(token, q, limit);
  return { ...browse, source: "browse" as const, insightsStatus: insights.status };
}

async function soldSearchInsights(token: string, q: string, limit = 15) {
  const url = new URL(
    "https://api.ebay.com/buy/marketplace_insights/v1_beta/item_sales/search",
  );
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await res.json()) as {
    itemSales?: Array<{ title?: string; lastSoldPrice?: { value?: string } }>;
    errors?: Array<{ message?: string }>;
  };

  return {
    ok: res.ok,
    status: res.status,
    count: data.itemSales?.length ?? 0,
    titles: (data.itemSales ?? []).map((s) => s.title ?? ""),
    error: data.errors?.[0]?.message,
  };
}

function stripExclusions(query: string): string {
  return query.replace(/\s+-[^\s"]+/g, "").trim();
}

async function compareCase(
  token: string,
  label: string,
  planQuery: string,
) {
  const withExclusions = planQuery;
  const withoutExclusions = stripExclusions(planQuery);

  const [withRes, withoutRes] = await Promise.all([
    soldSearch(token, withExclusions),
    soldSearch(token, withoutExclusions),
  ]);

  const junkWith = withRes.titles.filter((t) => JUNK.test(t)).length;
  const junkWithout = withoutRes.titles.filter((t) => JUNK.test(t)).length;

  console.log(`\n=== ${label} ===`);
  console.log(`Query (${withExclusions.length} chars): ${withExclusions}`);
  console.log(
    `With exclusions:    HTTP ${withRes.status} via ${withRes.source} | ${withRes.count} listings | ${junkWith} junk titles`,
  );
  console.log(
    `Without exclusions: HTTP ${withoutRes.status} via ${withoutRes.source} | ${withoutRes.count} listings | ${junkWithout} junk titles`,
  );
  if ("insightsStatus" in withRes && withRes.insightsStatus === 403) {
    console.log("  (Marketplace Insights 403 — fell back to Browse API for spot check)");
  }
  if (withRes.error) console.log(`  API note: ${withRes.error}`);
  if (withRes.titles[0]) console.log(`  Sample: ${withRes.titles[0].slice(0, 80)}`);

  return {
    label,
    queryLen: withExclusions.length,
    withCount: withRes.count,
    withoutCount: withoutRes.count,
    junkWith,
    junkWithout,
    withOk: withRes.ok,
    withoutOk: withoutRes.ok,
  };
}

async function main() {
  loadEnv();
  const token = await getToken();
  if (!token) {
    console.error("Missing eBay credentials in .env.local");
    process.exit(1);
  }

  const cases = [
    {
      label: "Pokémon raw Morgan",
      query:
        buildSuspectSearchPlan(
          suspect({
            canonicalName: "Morgan",
            setName: "Team Up",
            collectorNumber: "178/167",
            finish: "normal",
            label: "Morgan 178 normal",
          }),
        ).exactQueries.find((q) => q.purpose === "exact")?.query ?? "",
    },
    {
      label: "Pokémon reverse holo Grusha",
      query:
        buildSuspectSearchPlan(
          suspect({
            canonicalName: "Grusha",
            setName: "Paldea Evolved",
            collectorNumber: "184",
            finish: "reverse_holo",
            label: "Grusha 184 reverse holo",
          }),
        ).exactQueries[0]?.query ?? "",
    },
    {
      label: "Sports raw Silver Prizm",
      query:
        buildSuspectSearchPlan(
          suspect({
            category: "sports",
            canonicalName: "CJ Stroud",
            setName: "2023 Panini Prizm",
            cardNumber: "339",
            finish: "Silver Prizm",
            label: "CJ Stroud Silver Prizm",
          }),
        ).exactQueries[0]?.query ?? "",
    },
  ];

  console.log("eBay minus exclusion spot check (Insights → Browse fallback)\n");

  const results = [];
  for (const c of cases) {
    if (!c.query) {
      console.log(`\nSKIP ${c.label}: no query built`);
      continue;
    }
    results.push(await compareCase(token, c.label, c.query));
  }

  const allOk = results.every((r) => r.withOk);
  const improved = results.filter((r) => r.junkWithout > r.junkWith).length;

  console.log("\n--- Summary ---");
  console.log(`Cases run: ${results.length}`);
  console.log(`All queries accepted by API: ${allOk ? "yes" : "no"}`);
  console.log(`Cases with fewer junk titles when excluded: ${improved}/${results.length}`);

  if (!allOk) process.exit(1);
}

void main();
