#!/usr/bin/env node
/** Smoke test: eBay client credentials + Browse API */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const envPath = resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2].trim();
    }
  }
}

const clientId = process.env.EBAY_CLIENT_ID?.trim();
const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();
if (!clientId || !clientSecret) {
  console.error("Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET in .env.local");
  process.exit(1);
}

const scopes = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/buy.marketplace.insights",
  "https://api.ebay.com/oauth/api_scope/buy.browse",
];

async function tryToken(scope?: string) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = scope
    ? `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`
    : "grant_type=client_credentials";

  const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  return { ok: res.ok, scope: scope ?? "(none)", data };
}

async function tryBrowse(token: string) {
  const url =
    "https://api.ebay.com/buy/browse/v1/item_summary/search?q=Morgan+178+Pokemon+Team+Up&limit=3";
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  console.log("Testing eBay client credentials...\n");

  for (const scope of [undefined, ...scopes]) {
    const result = await tryToken(scope);
    const label = result.scope;
    if (!result.ok) {
      console.log(`FAIL ${label}: ${result.data.error} — ${result.data.error_description}`);
      continue;
    }
    console.log(`OK   ${label}: token expires in ${result.data.expires_in}s`);

    const browse = await tryBrowse(result.data.access_token!);
    if (browse.ok) {
      const items = (browse.data as { itemSummaries?: { title?: string; price?: { value?: string } }[] })
        .itemSummaries ?? [];
      console.log(`     Browse: ${items.length} results`);
      for (const item of items.slice(0, 2)) {
        console.log(`       - ${item.title} ($${item.price?.value})`);
      }
      process.exit(0);
    }
    console.log(`     Browse ${browse.status}: insufficient permission or error`);
  }

  console.error("\nNo working token/scope combination. Check:");
  console.error("- App ID -> EBAY_CLIENT_ID, Cert ID -> EBAY_CLIENT_SECRET (not swapped)");
  console.error("- Production keyset is enabled (exemption approved)");
  console.error("- OAuth scopes on keyset include Browse / Marketplace Insights");
  process.exit(1);
}

void main();
