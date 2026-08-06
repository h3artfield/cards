const STAGING = "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";

async function login(email: string) {
  const res = await fetch(`${STAGING}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "TestPass123!", expectedRole: "store" }),
  });
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookie = raw.length
    ? raw.map((c) => c.split(";")[0]).join("; ")
    : (res.headers.get("set-cookie") ?? "").split(";")[0];
  return { status: res.status, body: await res.text(), cookie };
}

async function main() {
  const activeEmail = process.argv[2];
  const inactiveEmail = process.argv[3];
  if (!activeEmail || !inactiveEmail) throw new Error("usage: tsx verify.ts activeEmail inactiveEmail");

  const active = await login(activeEmail);
  const inactive = await login(inactiveEmail);

  const activeMe = await fetch(`${STAGING}/api/admin/me`, { headers: { Cookie: active.cookie } });
  const inactiveMe = await fetch(`${STAGING}/api/admin/me`, { headers: { Cookie: inactive.cookie } });

  const portal = await fetch(`${STAGING}/api/billing/portal`, {
    method: "POST",
    headers: { Cookie: active.cookie },
  });

  console.log(
    JSON.stringify(
      {
        activeLogin: { status: active.status, cookieLen: active.cookie.length },
        inactiveLogin: { status: inactive.status, cookieLen: inactive.cookie.length },
        activeMe: await activeMe.json(),
        inactiveMe: await inactiveMe.json(),
        portal: { status: portal.status, body: await portal.text() },
      },
      null,
      2,
    ),
  );
}

main().catch(console.error);
