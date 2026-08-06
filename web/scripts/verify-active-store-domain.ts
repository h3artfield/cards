const CUSTOM = "https://cardscanner9000.com";
const STAGING = "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";

async function login(email: string, password: string) {
  const res = await fetch(`${CUSTOM}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, expectedRole: "store" }),
  });
  const cookies = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  return { ok: res.ok, cookie: cookies };
}

async function main() {
  const active = await login("e2e-e2e-1783397946722@example.com", "TestPass123!");
  const me = await fetch(`${CUSTOM}/api/admin/me`, { headers: { Cookie: active.cookie } });
  const meJson = await me.json();
  const admin = await fetch(`${CUSTOM}/admin`, { headers: { Cookie: active.cookie }, redirect: "manual" });
  const portal = await fetch(`${CUSTOM}/api/billing/portal`, {
    method: "POST",
    headers: { Cookie: active.cookie },
  });
  const portalJson = (await portal.json()) as { portalUrl?: string };
  const webhook = await fetch(`${STAGING}/api/stripe/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  console.log(
    JSON.stringify(
      {
        activeStore: {
          loginOk: active.ok,
          subscriptionActive: meJson.subscriptionActive,
          adminStatus: admin.status,
        },
        billingPortal: {
          ok: portal.ok,
          host: portalJson.portalUrl ? new URL(portalJson.portalUrl).host : null,
        },
        webhookStaging: { status: webhook.status },
        www: await fetch("https://www.cardscanner9000.com/", { redirect: "manual" }).then((r) => ({
          status: r.status,
          location: r.headers.get("location"),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch(console.error);
