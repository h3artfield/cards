/**
 * Directive 013 — customer auth helpers
 * Run: npm run test:directive-013-customer-auth
 */
import {
  createCustomerSessionToken,
  parseCustomerSessionToken,
} from "../src/lib/auth/customer-session";
import { hashToken, verifyTokenHash } from "../src/lib/auth/customer-tokens";
import { normalizeCustomer } from "../src/lib/auth/normalize-customer";
import {
  customerCanSubmit,
  customerCanViewOrderHistory,
  customerOwnsOrder,
} from "../src/lib/auth/customer-auth";
import type { Customer } from "../src/lib/types";
import { getPublicRequestOriginFromParts } from "../src/lib/app-url";
import { mergeGoogleOAuthCustomer } from "../src/lib/auth/google-oauth-customer";
import { originFromGoogleRedirectUri } from "../src/lib/customer-auth-config";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function runSession() {
  console.log("\n1. Customer session cookie");
  const token = createCustomerSessionToken({
    customerId: "cust-1",
    email: "a@example.com",
    role: "customer",
  });
  const parsed = parseCustomerSessionToken(token);
  assert(parsed?.customerId === "cust-1", "round-trip session");
  assert(parseCustomerSessionToken("bad.token") === null, "rejects bad token");
}

function runNormalize() {
  console.log("\n2. Legacy customer normalization");
  const legacy = normalizeCustomer({
    id: "c1",
    email: "legacy@example.com",
    firstName: "Pat",
    lastName: "Lee",
    phone: "555",
    passwordHash: "salt:abc",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  assert(legacy.role === "customer", "role is customer");
  assert(legacy.emailVerified === true, "grandfather password users verified");
  assert(legacy.authProviders.includes("email"), "email provider inferred");
}

function runVerificationModes() {
  console.log("\n3. Verification modes");
  const unverified: Customer = {
    id: "c2",
    role: "customer",
    firstName: "A",
    lastName: "B",
    email: "x@example.com",
    phone: "",
    emailVerified: false,
    authProviders: ["email"],
    createdAt: "",
    updatedAt: "",
  };
  assert(
    customerCanSubmit(unverified, "required_before_order_history"),
    "can submit before history gate",
  );
  assert(
    !customerCanViewOrderHistory(unverified, "required_before_order_history"),
    "cannot view history when unverified",
  );
  assert(
    !customerCanSubmit(unverified, "required_before_submit"),
    "blocked submit when required_before_submit",
  );
}

function runOrderAccess() {
  console.log("\n4. Order ownership");
  const session = { customerId: "cust-1", email: "a@example.com", role: "customer" as const };
  assert(
    customerOwnsOrder(session, { customerId: "cust-1" }),
    "owns by customerId",
  );
  assert(
    !customerOwnsOrder(session, { customerId: "other" }),
    "denies other customer",
  );
}

function runTokens() {
  console.log("\n5. Token hashing");
  const raw = "test-token-value";
  const hash = hashToken(raw);
  assert(verifyTokenHash(raw, hash), "verify token hash");
  assert(!verifyTokenHash("wrong", hash), "reject wrong token");
}

function runGoogleRedirect() {
  console.log("\n6. Google OAuth redirect host");
  const prevRedirect = process.env.GOOGLE_REDIRECT_URI;
  const prevAppUrl = process.env.APP_URL;
  process.env.GOOGLE_REDIRECT_URI =
    "https://cardscanner9000.com/api/auth/google/callback";
  process.env.APP_URL = "https://buyback-web-staging-rrogeqxyea-uc.a.run.app";

  const custom = getPublicRequestOriginFromParts({
    url: "https://0.0.0.0:8080/api/auth/google?store=the-game-lodge",
    forwardedHost: "cardscanner9000.com",
    forwardedProto: "https",
    host: "0.0.0.0:8080",
  });
  assert(
    custom === "https://cardscanner9000.com",
    "uses forwarded host instead of internal 0.0.0.0 bind address",
  );

  const staging = getPublicRequestOriginFromParts({
    url: "https://0.0.0.0:8080/api/auth/google?store=the-game-lodge",
    forwardedHost: "buyback-web-staging-rrogeqxyea-uc.a.run.app",
    forwardedProto: "https",
    host: "0.0.0.0:8080",
  });
  assert(
    staging === "https://buyback-web-staging-rrogeqxyea-uc.a.run.app",
    "uses forwarded host on Cloud Run staging",
  );

  const fallback = getPublicRequestOriginFromParts({
    url: "https://0.0.0.0:8080/api/auth/google?store=the-game-lodge",
    host: "0.0.0.0:8080",
  });
  assert(
    fallback === "https://cardscanner9000.com",
    "falls back to configured Google redirect origin when host is unusable",
  );

  assert(
    originFromGoogleRedirectUri(
      "https://buyback-web-staging-rrogeqxyea-uc.a.run.app/api/auth/google/callback",
    ) === "https://buyback-web-staging-rrogeqxyea-uc.a.run.app",
    "derives post-auth origin from redirect URI",
  );

  if (prevRedirect === undefined) delete process.env.GOOGLE_REDIRECT_URI;
  else process.env.GOOGLE_REDIRECT_URI = prevRedirect;
  if (prevAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = prevAppUrl;
}

function runGoogleOAuthMerge() {
  console.log("\n7. Google OAuth account linking");
  const now = "2026-07-08T20:00:00.000Z";
  const profile = {
    sub: "google-sub-123",
    email: "pat@gmail.com",
    email_verified: true,
    given_name: "Pat",
    family_name: "Lee",
  };

  const emailAccount = normalizeCustomer({
    id: "cust-email-1",
    email: "pat@gmail.com",
    firstName: "Pat",
    lastName: "Lee",
    phone: "555",
    passwordHash: "salt:hash",
    role: "customer",
    emailVerified: true,
    authProviders: ["email"],
    createdAt: now,
    updatedAt: now,
  });

  const linked = mergeGoogleOAuthCustomer(profile, null, emailAccount, {
    now,
    newCustomerId: () => "new-id",
  });
  assert(linked.ok, "links Google to existing email/password account");
  if (linked.ok) {
    assert(
      linked.customer.googleProviderId === "google-sub-123",
      "stores google provider id on linked account",
    );
    assert(
      linked.customer.passwordHash === "salt:hash",
      "keeps existing password after Google link",
    );
    assert(
      linked.customer.authProviders.includes("google") &&
        linked.customer.authProviders.includes("email"),
      "account supports both email and google sign-in",
    );
  }

  const conflict = mergeGoogleOAuthCustomer(
    profile,
    normalizeCustomer({
      id: "cust-google-2",
      email: "other@gmail.com",
      firstName: "Other",
      lastName: "User",
      phone: "",
      role: "customer",
      emailVerified: true,
      authProviders: ["google"],
      googleProviderId: "google-sub-123",
      createdAt: now,
      updatedAt: now,
    }),
    emailAccount,
    { now, newCustomerId: () => "new-id" },
  );
  assert(!conflict.ok, "rejects conflicting google and email records");
}

runSession();
runNormalize();
runVerificationModes();
runOrderAccess();
runTokens();
runGoogleRedirect();
runGoogleOAuthMerge();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
