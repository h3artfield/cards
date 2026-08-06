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
  const sessionId = "cs_test_b1pYTKJmCQSqFxXSIzPPnbkcDmpHFoQv6QvhFWKmpBPtkgoCBYVOFsH37z";
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const customer =
    typeof session.customer === "string"
      ? await stripe.customers.retrieve(session.customer)
      : session.customer;
  console.log(JSON.stringify({ email: customer && "email" in customer ? customer.email : null, metadata: session.metadata }));
}

main();
