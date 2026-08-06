/**
 * Directive 009 — verify Stripe env configuration (no live API calls).
 * Run: npx tsx scripts/test-directive-009-stripe-config.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { stripeConfigured, getStripeStorePriceId } from "../src/lib/stripe/config";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (process.env[k] == null) process.env[k] = t.slice(eq + 1).trim();
  }
}

loadEnvLocal();

console.log("Stripe configured:", stripeConfigured());
console.log("Price ID set:", Boolean(getStripeStorePriceId()));
console.log("Webhook secret set:", Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim()));

if (!stripeConfigured()) {
  console.log("\nSet STRIPE_SECRET_KEY and STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY in .env.local");
  process.exit(1);
}

console.log("\nOK — Stripe env ready for checkout tests");
