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
  const eventId = "evt_1TqQTeGUwM6gQzgjf0zfXmvE";
  const event = await stripe.events.retrieve(eventId);
  const session = event.data.object as Stripe.Checkout.Session;

  console.log(
    JSON.stringify(
      {
        type: event.type,
        pendingWebhooks: event.pending_webhooks,
        requestId: event.request?.id ?? null,
        sessionId: session.id,
        paymentStatus: session.payment_status,
        metadata: session.metadata,
        subscriptionId:
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id,
      },
      null,
      2,
    ),
  );

  const sub = await stripe.subscriptions.retrieve("sub_1TqQTaGUwM6gQzgjL09Qkgv8");
  console.log("subscription status", sub.status, "metadata", sub.metadata);
}

main().catch(console.error);
