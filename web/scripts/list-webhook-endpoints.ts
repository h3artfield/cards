import { readFileSync } from "fs";
import { resolve } from "path";
import Stripe from "stripe";

function loadEnv() {
  for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]) process.env[k] = t.slice(eq + 1).trim();
  }
}

async function main() {
  loadEnv();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const endpoints = await stripe.webhookEndpoints.list({ limit: 10 });
  for (const ep of endpoints.data) {
    console.log(
      JSON.stringify({
        id: ep.id,
        url: ep.url,
        status: ep.status,
        enabledEvents: ep.enabled_events,
      }),
    );
  }
}

main().catch(console.error);
