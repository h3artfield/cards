/**
 * Staging API smoke — v2-price-history alias checks against deployed web service.
 * Run: npx tsx scripts/staging-v2-price-history-api-smoke.ts [--staging-url URL]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { COOKIE_NAME } from "../src/lib/auth/admin-session";

function loadEnvLocal() {
  for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
  }
}

const DEFAULT_STAGING =
  "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";

const CARDS = {
  grusha: "a9913433-d799-4bd8-867d-a7866e080668",
  ravenousMar: "579ba1f4-6106-4716-9c94-a0130be39ea3",
};

type HistoryPayload = {
  requestedIdentityKey?: string;
  lookupKeys?: string[];
  matchedKeys?: string[];
  currentEstimate?: number;
  series?: Array<{ points: Array<{ value: number }> }>;
  emptyReason?: string;
};

async function loginPlatformAdmin(baseUrl: string): Promise<string> {
  const email = process.env.STAGING_ADMIN_EMAIL?.trim() ?? "h3artfield@gmail.com";
  const password = process.env.STAGING_ADMIN_PASSWORD?.trim() ?? "Password1";
  const res = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, expectedRole: "platform" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Login failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match?.[1]) throw new Error("Login succeeded but no admin_session cookie returned");
  return match[1];
}

async function fetchHistory(baseUrl: string, cookie: string, cardId: string) {
  const res = await fetch(`${baseUrl}/api/admin/cards/${cardId}/v2-price-history`, {
    headers: { Cookie: `${COOKIE_NAME}=${cookie}` },
  });
  const body = (await res.json()) as { data?: HistoryPayload; error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body.data ?? (body as unknown as HistoryPayload);
}

async function main() {
  loadEnvLocal();
  const argv = process.argv;
  const urlArg = argv.find((a, i) => argv[i - 1] === "--staging-url");
  const baseUrl = (urlArg ?? DEFAULT_STAGING).replace(/\/$/, "");
  const cookie = await loginPlatformAdmin(baseUrl);

  console.log(`=== Staging v2-price-history API smoke ===\n${baseUrl}\n`);

  let failed = 0;

  const grusha = await fetchHistory(baseUrl, cookie, CARDS.grusha);
  const grushaPass =
    grusha.requestedIdentityKey === "pokemon|sv2|184|reverse_holo|en" &&
    (grusha.matchedKeys?.includes("pokemon|paldea-evolved|184|reverse_holo|en") ?? false) &&
    grusha.currentEstimate === 0.12;
  console.log(
    `${grushaPass ? "PASS" : "FAIL"} Grusha: requested=${grusha.requestedIdentityKey} matched=${grusha.matchedKeys?.join(",")} value=$${grusha.currentEstimate ?? "?"}`,
  );
  if (!grushaPass) failed++;

  const mar = await fetchHistory(baseUrl, cookie, CARDS.ravenousMar);
  const marPoints = mar.series?.[0]?.points.length ?? 0;
  const marPass =
    mar.requestedIdentityKey === "mtg|MAR|93|nonfoil|normal|en" &&
    marPoints === 0 &&
    !(mar.matchedKeys ?? []).some((k) => k.includes("REX"));
  console.log(
    `${marPass ? "PASS" : "FAIL"} Ravenous MAR #93: points=${marPoints} matched=${mar.matchedKeys?.join(",") || "none"} emptyReason=${mar.emptyReason ?? "n/a"}`,
  );
  if (!marPass) failed++;

  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
