/**
 * E2E Stripe sandbox checkout test (Directive 009).
 * Run: cd web && npx tsx scripts/e2e-stripe-checkout-sandbox.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import Stripe from "stripe";
import { chromium } from "playwright";
import { dataStore } from "../src/lib/storage/data-store";
import { ensureSeedData } from "../src/lib/storage/ensure-seed";

const STAGING = "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (!process.env[k]?.trim()) process.env[k] = t.slice(eq + 1).trim();
  }
}

function extractSessionId(url: string): string | null {
  const m = url.match(/(cs_test_[a-zA-Z0-9]+)/);
  return m?.[1] ?? null;
}

async function completeStripeCheckout(checkoutUrl: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(checkoutUrl, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForTimeout(4000);

    await page.getByRole("checkbox", { name: /save my information/i }).uncheck().catch(() => {});
    await page.locator('[data-testid="card-accordion-item"]').click();
    await page.waitForTimeout(2000);

    await page.getByRole("textbox", { name: /card number/i }).fill("4242424242424242");
    await page.getByRole("textbox", { name: /expiration/i }).fill("1234");
    await page.getByRole("textbox", { name: /cvc/i }).fill("123");
    await page.getByPlaceholder("Full name on card").fill("E2E Test Owner");
    await page.getByPlaceholder("ZIP").fill("12345");

    await page.getByRole("button", { name: /^subscribe$/i }).click({ timeout: 30_000 });

    await page.waitForURL(/checkout\/success|buyback-web-staging|\/admin/, {
      timeout: 180_000,
    });
    return page.url();
  } catch (err) {
    await page.screenshot({ path: resolve(__dirname, "../.stripe-checkout-e2e-fail.png") }).catch(
      () => {},
    );
    throw err;
  } finally {
    await browser.close();
  }
}

async function main() {
  loadEnvLocal();
  process.env.REQUIRE_FIRESTORE = "true";
  await ensureSeedData();

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY missing");

  const stripe = new Stripe(stripeKey);
  const slug = `e2e-${Date.now()}`;
  const email = `e2e-${slug}@example.com`;
  const password = "TestPass123!";
  const signupBody = {
    storeName: `E2E Test ${slug}`,
    ownerName: "E2E Test Owner",
    email,
    phone: "5555555555",
    address: "123 Test St",
    password,
    storeSlug: slug,
  };

  console.log("==> 1. Signup API");
  const signupRes = await fetch(`${STAGING}/api/store/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signupBody),
  });
  const signupJson = (await signupRes.json()) as {
    checkoutUrl?: string;
    storeId?: string;
    error?: string;
  };
  if (!signupRes.ok || !signupJson.checkoutUrl || !signupJson.storeId) {
    throw new Error(signupJson.error ?? "Signup failed");
  }

  const storeId = signupJson.storeId;
  const checkoutUrl = signupJson.checkoutUrl;
  const sessionId = extractSessionId(checkoutUrl);
  if (!sessionId) throw new Error("Could not parse checkout session ID from URL");

  const storeBefore = await dataStore.getStore(storeId);
  const adminBefore = await dataStore.getAdminUserByEmail(email);

  console.log("==> 2. Stripe Checkout (4242...)");
  const finalUrl = await completeStripeCheckout(checkoutUrl);
  console.log("    Final URL:", finalUrl);

  console.log("==> 3. Wait for webhook + Firestore");
  let store = await dataStore.getStore(storeId);
  for (let i = 0; i < 20; i++) {
    if (store?.subscription?.status === "active" || store?.subscription?.status === "trialing") {
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
    store = await dataStore.getStore(storeId);
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription", "customer"],
  });
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  const events = await stripe.events.list({
    type: "checkout.session.completed",
    limit: 20,
  });
  const webhookEvents = events.data.filter((e) => {
    const s = e.data.object as Stripe.Checkout.Session;
    return s.id === sessionId;
  });

  console.log("==> 4. Login + dashboard");
  const loginRes = await fetch(`${STAGING}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, expectedRole: "store" }),
  });
  const loginJson = await loginRes.json();
  const setCookie = loginRes.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0] ?? "";

  const meRes = await fetch(`${STAGING}/api/admin/me`, {
    headers: { Cookie: cookie },
  });
  const meJson = (await meRes.json()) as {
    subscriptionActive?: boolean;
    subscription?: { status?: string };
    session?: { role?: string };
  };

  const adminPageRes = await fetch(`${STAGING}/admin`, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });

  console.log("==> 5. Billing portal");
  const portalRes = await fetch(`${STAGING}/api/billing/portal`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  const portalJson = (await portalRes.json()) as { portalUrl?: string; error?: string };

  console.log("==> 6. Inactive gate (incomplete store)");
  const inactiveSlug = `e2e-inactive-${Date.now()}`;
  const inactiveEmail = `e2e-inactive-${inactiveSlug}@example.com`;
  const inactiveSignup = await fetch(`${STAGING}/api/store/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...signupBody,
      email: inactiveEmail,
      storeSlug: inactiveSlug,
      storeName: `E2E Inactive ${inactiveSlug}`,
    }),
  });
  const inactiveJson = (await inactiveSignup.json()) as { storeId?: string };
  const inactiveLogin = await fetch(`${STAGING}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: inactiveEmail,
      password,
      expectedRole: "store",
    }),
  });
  const inactiveCookie = (inactiveLogin.headers.get("set-cookie") ?? "").split(";")[0];
  const inactiveMe = await fetch(`${STAGING}/api/admin/me`, {
    headers: { Cookie: inactiveCookie },
  });
  const inactiveMeJson = (await inactiveMe.json()) as { subscriptionActive?: boolean };
  const inactiveAdminRes = await fetch(`${STAGING}/admin`, {
    headers: { Cookie: inactiveCookie },
    redirect: "manual",
  });

  const adminAfter = await dataStore.getAdminUserByEmail(email);
  const allAdminsForEmail = (await dataStore.listAdminUsers?.())?.filter(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  const duplicateAdmin = adminBefore?.id === adminAfter?.id;

  const storesBySlug = await dataStore.getStoreBySlug(slug);
  const duplicateStore = storesBySlug?.id === storeId;

  console.log("\n========== E2E RESULT ==========");
  console.log(JSON.stringify(
    {
      testStoreId: storeId,
      checkoutSessionId: sessionId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      checkoutPaymentStatus: session.payment_status,
      subscriptionStatusStripe:
        typeof session.subscription === "object" && session.subscription
          ? session.subscription.status
          : null,
      webhookDelivery: webhookEvents.length
        ? {
            eventCount: webhookEvents.length,
            duplicateWebhookProcessing: webhookEvents.length > 1,
            latest: {
              eventId: webhookEvents[0].id,
              type: webhookEvents[0].type,
              livemode: webhookEvents[0].livemode,
            },
          }
        : { found: false },
      firestoreSubscription: store?.subscription ?? null,
      dashboardAccess: {
        loginOk: loginRes.ok,
        subscriptionActive: meJson.subscriptionActive,
        role: meJson.session?.role,
        adminPageStatus: adminPageRes.status,
        adminAccessible: adminPageRes.status >= 200 && adminPageRes.status < 400,
      },
      billingPortal: {
        ok: portalRes.ok,
        hasPortalUrl: Boolean(portalJson.portalUrl?.includes("billing.stripe.com")),
        portalUrlHost: portalJson.portalUrl ? new URL(portalJson.portalUrl).host : null,
      },
      inactiveStoreGate: {
        storeId: inactiveJson.storeId,
        subscriptionActive: inactiveMeJson.subscriptionActive,
        gatedCorrectly: inactiveMeJson.subscriptionActive === false,
        adminPageStatus: inactiveAdminRes.status,
      },
      duplicates: {
        singleAdminUser: duplicateAdmin,
        adminUserId: adminAfter?.id,
        singleStoreForSlug: duplicateStore,
        adminUsersWithSameEmail: allAdminsForEmail?.length ?? 1,
      },
      finalRedirectUrl: finalUrl,
    },
    null,
    2,
  ));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
