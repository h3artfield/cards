import { readFileSync } from "fs";
import { resolve } from "path";

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

async function login(email: string) {
  const res = await fetch(`${STAGING}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPass123!", expectedRole: "store" }),
  });
  const cookies = res.headers.getSetCookie?.() ?? [];
  const cookie = cookies.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, cookie };
}

async function main() {
  loadEnv();
  const activeEmail = "e2e-e2e-1783397946722@example.com";
  const slug = `e2e-inactive-gate-${Date.now()}`;
  const inactiveEmail = `${slug}@example.com`;

  const signup = await fetch(`${STAGING}/api/store/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeName: "E2E Inactive Gate",
      ownerName: "Inactive Owner",
      email: inactiveEmail,
      phone: "5555555555",
      address: "123 Test St",
      password: "TestPass123!",
      storeSlug: slug,
    }),
  });
  const signupJson = (await signup.json()) as { storeId?: string };

  const active = await login(activeEmail);
  const inactive = await login(inactiveEmail);

  const activeMe = await fetch(`${STAGING}/api/admin/me`, { headers: { Cookie: active.cookie } });
  const inactiveMe = await fetch(`${STAGING}/api/admin/me`, { headers: { Cookie: inactive.cookie } });
  const portal = await fetch(`${STAGING}/api/billing/portal`, {
    method: "POST",
    headers: { Cookie: active.cookie },
  });
  const portalJson = (await portal.json()) as { portalUrl?: string };
  const activeAdmin = await fetch(`${STAGING}/admin`, {
    headers: { Cookie: active.cookie },
    redirect: "manual",
  });
  const inactiveAdmin = await fetch(`${STAGING}/admin`, {
    headers: { Cookie: inactive.cookie },
    redirect: "manual",
  });

  console.log(
    JSON.stringify(
      {
        activeMe: await activeMe.json(),
        inactiveMe: await inactiveMe.json(),
        inactiveStoreId: signupJson.storeId,
        billingPortal: {
          ok: portal.ok,
          host: portalJson.portalUrl ? new URL(portalJson.portalUrl).host : null,
        },
        adminAccess: {
          activeStatus: activeAdmin.status,
          inactiveStatus: inactiveAdmin.status,
        },
      },
      null,
      2,
    ),
  );
}

main().catch(console.error);
