const APEX = "https://cardscanner9000.com";
const STAGING = "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";

async function checkUrl(url: string, opts: RequestInit = {}) {
  try {
    const res = await fetch(url, { redirect: "manual", ...opts });
    return {
      url,
      status: res.status,
      location: res.headers.get("location"),
      ok: res.ok || res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308,
    };
  } catch (err) {
    return { url, error: err instanceof Error ? err.message : String(err), ok: false };
  }
}

async function main() {
  const pages = ["/", "/pricing", "/signup", "/login"];
  const pageResults = [];
  for (const path of pages) {
    pageResults.push(await checkUrl(`${APEX}${path}`));
  }
  pageResults.push(await checkUrl("https://www.cardscanner9000.com/"));

  const signup = await fetch(`${APEX}/api/store/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeName: "Domain Verify Store",
      ownerName: "Domain Verify",
      email: `domain-verify-${Date.now()}@example.com`,
      phone: "5555555555",
      address: "123 Test St",
      password: "TestPass123!",
      storeSlug: `domain-verify-${Date.now()}`,
    }),
  });
  const signupJson = (await signup.json()) as {
    checkoutUrl?: string;
    storeId?: string;
    error?: string;
  };

  const webhookProbe = await fetch(`${STAGING}/api/stripe/webhook`, { method: "POST", body: "{}" });

  console.log(
    JSON.stringify(
      {
        pages: pageResults,
        signup: {
          status: signup.status,
          hasCheckoutUrl: Boolean(signupJson.checkoutUrl?.includes("checkout.stripe.com")),
          checkoutHost: signupJson.checkoutUrl ? new URL(signupJson.checkoutUrl).host : null,
          successUrlHost: signupJson.checkoutUrl?.includes("cardscanner9000.com")
            ? "cardscanner9000.com"
            : signupJson.checkoutUrl?.includes("run.app")
              ? "run.app"
              : null,
          storeId: signupJson.storeId ?? null,
          error: signupJson.error ?? null,
        },
        webhookStaging: {
          status: webhookProbe.status,
          reachable: webhookProbe.status !== 404,
        },
      },
      null,
      2,
    ),
  );
}

main().catch(console.error);
