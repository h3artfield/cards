/**
 * Stripe bootstrap for Directive 009 — product, price, webhook, .env.local updates.
 * Run: cd web && npx tsx scripts/setup-stripe-store-plan.ts
 *
 * Requires STRIPE_SECRET_KEY in web/.env.local (save the file before running).
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import Stripe from "stripe";
import {
  STRIPE_BILLING_CONTACT_EMAIL,
  STRIPE_STORE_PLAN_NAME,
} from "../src/lib/stripe/config";

const ENV_PATH = resolve(__dirname, "../.env.local");
const STAGING_WEBHOOK_URL =
  "https://buyback-web-staging-rrogeqxyea-uc.a.run.app/api/stripe/webhook";

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
];

function loadEnvLocal() {
  if (!existsSync(ENV_PATH)) return;
  const raw = readFileSync(ENV_PATH, "utf8").replace(/^\uFEFF/, "");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]?.trim()) process.env[k] = v;
  }
}

function upsertEnvLocal(updates: Record<string, string>) {
  if (!existsSync(ENV_PATH)) throw new Error("web/.env.local not found");
  let content = readFileSync(ENV_PATH, "utf8").replace(/^\uFEFF/, "");
  for (const [k, v] of Object.entries(updates)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    const line = `${k}=${v}`;
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      if (!content.includes("# Stripe")) {
        content = `${content.trimEnd()}\n\n# Stripe — Directive 009 (billing@cardscanner9000.com)\n`;
      }
      content = `${content.trimEnd()}\n${line}\n`;
    }
  }
  writeFileSync(ENV_PATH, content, "utf8");
}

async function main() {
  loadEnvLocal();
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    console.error(
      "STRIPE_SECRET_KEY not found in web/.env.local — save the file (Ctrl+S) and retry.",
    );
    process.exit(1);
  }

  const stripe = new Stripe(key);
  console.log("Stripe key prefix:", `${key.slice(0, 12)}...`);
  console.log("Stripe account email (Dashboard):", STRIPE_BILLING_CONTACT_EMAIL);

  const products = await stripe.products.list({ active: true, limit: 100 });
  let product = products.data.find((p) => p.name === STRIPE_STORE_PLAN_NAME);
  if (!product) {
    product = await stripe.products.create({
      name: STRIPE_STORE_PLAN_NAME,
      description:
        "Card Scanner 9000 store dashboard, customer scan flow, AI-assisted identification, staff review tools, and pricing support.",
      metadata: { plan: "store_monthly" },
    });
    console.log("Created product:", product.id);
  } else {
    console.log("Using existing product:", product.id);
  }

  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 20 });
  let price = prices.data.find(
    (p) =>
      p.recurring?.interval === "month" &&
      p.unit_amount === 10_000 &&
      p.currency === "usd",
  );
  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: 10_000,
      recurring: { interval: "month" },
      nickname: "Store Plan monthly",
    });
    console.log("Created price:", price.id);
  } else {
    console.log("Using existing price:", price.id);
  }

  const envUpdates: Record<string, string> = {
    STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY: price.id,
  };

  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  let endpoint = endpoints.data.find((e) => e.url === STAGING_WEBHOOK_URL && e.status !== "disabled");
  let webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!endpoint) {
    endpoint = await stripe.webhookEndpoints.create({
      url: STAGING_WEBHOOK_URL,
      enabled_events: WEBHOOK_EVENTS,
      description: "Card Scanner 9000 staging (Directive 009)",
    });
    webhookSecret = endpoint.secret ?? undefined;
    console.log("Created webhook endpoint:", endpoint.id);
    if (webhookSecret) {
      console.log("Webhook signing secret captured (written to .env.local)");
    }
  } else {
    console.log("Using existing webhook endpoint:", endpoint.id);
    if (!webhookSecret) {
      console.log(
        "STRIPE_WEBHOOK_SECRET not in .env.local — copy signing secret from Stripe Dashboard → Webhooks",
      );
    }
  }

  if (webhookSecret) {
    envUpdates.STRIPE_WEBHOOK_SECRET = webhookSecret;
  }

  upsertEnvLocal(envUpdates);
  console.log("\nUpdated web/.env.local:");
  console.log(`  STRIPE_PRICE_ID_CARD_SCANNER_STORE_MONTHLY=${price.id}`);
  if (webhookSecret) console.log("  STRIPE_WEBHOOK_SECRET=(set)");
  console.log("\nNext:");
  console.log("  powershell -ExecutionPolicy Bypass -File scripts/sync-stripe-secrets.ps1");
  console.log("  powershell -ExecutionPolicy Bypass -File scripts/deploy-web-staging-cloudbuild.ps1");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
