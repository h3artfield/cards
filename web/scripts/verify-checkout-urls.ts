import { readFileSync } from "fs";
import { resolve } from "path";
import Stripe from "stripe";

const CUSTOM = "https://cardscanner9000.com";

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
  const slug = `domain-url-${Date.now()}`;
  const signup = await fetch(`${CUSTOM}/api/store/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeName: "URL Check",
      ownerName: "URL Check",
      email: `${slug}@example.com`,
      phone: "5555555555",
      address: "123 Test St",
      password: "TestPass123!",
      storeSlug: slug,
    }),
  });
  const json = (await signup.json()) as { checkoutUrl?: string; storeId?: string };
  const m = json.checkoutUrl?.match(/(cs_test_[a-zA-Z0-9]+)/);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const session = m ? await stripe.checkout.sessions.retrieve(m[1]) : null;

  console.log(
    JSON.stringify(
      {
        signupStatus: signup.status,
        storeId: json.storeId,
        successUrl: session?.success_url ?? null,
        cancelUrl: session?.cancel_url ?? null,
        successOnCustomDomain: session?.success_url?.includes("cardscanner9000.com") ?? false,
        cancelOnCustomDomain: session?.cancel_url?.includes("cardscanner9000.com") ?? false,
        usesRunApp: session?.success_url?.includes("run.app") ?? false,
      },
      null,
      2,
    ),
  );
}

main().catch(console.error);
