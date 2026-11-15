/**
 * Mint Playwright storageState for h3artfield@gmail.com using CUSTOMER_SESSION_SECRET.
 * Prefer interactive Google login (npm run e2e:ux:auth) when possible.
 *
 *   gcloud secrets versions access latest --secret=CUSTOMER_SESSION_SECRET --project=trading-card-buyback-dev
 *   set CUSTOMER_SESSION_SECRET=...
 *   npx tsx e2e/scripts/mint-customer-storage.ts
 */
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const CUSTOMER_ID = process.env.UX_CUSTOMER_ID ?? "58b0be62-e574-4c61-9547-2110f928a50e";
const EMAIL = process.env.UX_CUSTOMER_EMAIL ?? "h3artfield@gmail.com";
const DOMAIN = process.env.UX_COOKIE_DOMAIN ?? "cardscanner9000.com";

function signingKey(): string {
  const key = process.env.CUSTOMER_SESSION_SECRET?.trim();
  if (!key) throw new Error("CUSTOMER_SESSION_SECRET required");
  return key;
}

function createToken(): string {
  const payload = Buffer.from(
    JSON.stringify({
      customerId: CUSTOMER_ID,
      email: EMAIL,
      role: "customer",
      exp: Date.now() + 30 * 24 * 60 * 60 * 1000,
    }),
  ).toString("base64url");
  const sig = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

const authDir = path.join(__dirname, "..", ".auth");
fs.mkdirSync(authDir, { recursive: true });
const out = path.join(authDir, "customer.json");
const token = createToken();
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      cookies: [
        {
          name: "customer_session",
          value: token,
          domain: DOMAIN,
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
    null,
    2,
  ),
);
console.log(`Wrote ${out} for ${EMAIL}`);
