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
  const event = await stripe.events.retrieve("evt_1TqQmGGUwM6gQzgjZ21eTljw");
  console.log(JSON.stringify({ pendingWebhooks: event.pending_webhooks, type: event.type }, null, 2));
}

main();
