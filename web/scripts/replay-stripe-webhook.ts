import { readFileSync } from "fs";
import { resolve } from "path";
import Stripe from "stripe";

const STAGING = "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";

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
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  const eventId = process.argv[2] ?? "evt_1TqQTeGUwM6gQzgjf0zfXmvE";

  const event = await stripe.events.retrieve(eventId);
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
  });

  const res = await fetch(`${STAGING}/api/stripe/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });

  console.log(JSON.stringify({ status: res.status, body: await res.text() }, null, 2));
}

main().catch(console.error);
