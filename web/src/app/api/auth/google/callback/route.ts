import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  createCustomerSessionToken,
  customerSessionCookieHeader,
} from "@/lib/auth/customer-session";
import {
  resolveStoreForSlug,
  touchCustomerLogin,
} from "@/lib/auth/customer-auth";
import { customerCanActAtStore } from "@/lib/auth/customer-store-binding";
import { mergeGoogleOAuthCustomer } from "@/lib/auth/google-oauth-customer";
import { normalizeCustomer } from "@/lib/auth/normalize-customer";
import {
  googleRedirectUri,
  googleRedirectUriForRequest,
  originFromGoogleRedirectUri,
  publicRequestOrigin,
  isGoogleAuthEnabled,
} from "@/lib/customer-auth-config";
import { dataStore } from "@/lib/storage/data-store";
import type { CustomerSession } from "@/lib/types";

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
}

interface GoogleUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
}

function parseState(state: string | null): {
  storeSlug: string;
  redirectUri?: string;
  afterLoginPath?: string;
} {
  if (!state) return { storeSlug: "" };
  try {
    const parsed = JSON.parse(
      Buffer.from(state, "base64url").toString("utf8"),
    ) as { storeSlug?: string; redirectUri?: string; afterLoginPath?: string };
    return {
      storeSlug: parsed.storeSlug?.trim() ?? "",
      redirectUri: parsed.redirectUri?.trim(),
      afterLoginPath: parsed.afterLoginPath?.trim(),
    };
  } catch {
    return { storeSlug: "" };
  }
}

function safeAfterLoginPath(path: string | undefined, origin: string): string | null {
  if (!path?.startsWith("/")) return null;
  if (path.includes("://")) return null;
  try {
    return new URL(path, origin).toString();
  } catch {
    return null;
  }
}

function redirectToStore(
  origin: string,
  storeSlug: string,
  query?: Record<string, string>,
): string {
  const path = storeSlug ? `/s/${encodeURIComponent(storeSlug)}` : "/";
  const url = new URL(path, origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

export async function GET(req: NextRequest) {
  if (!isGoogleAuthEnabled()) {
    return NextResponse.json({ error: "Google sign-in is not enabled" }, { status: 404 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  const { storeSlug, redirectUri: stateRedirectUri, afterLoginPath } = parseState(
    req.nextUrl.searchParams.get("state"),
  );
  const redirectUri =
    stateRedirectUri ||
    googleRedirectUriForRequest(req) ||
    googleRedirectUri();
  const postAuthOrigin = stateRedirectUri
    ? originFromGoogleRedirectUri(redirectUri)
    : publicRequestOrigin(req);

  if (error || !code) {
    return NextResponse.redirect(
      redirectToStore(postAuthOrigin, storeSlug, { auth_error: "google_cancelled" }),
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET!.trim();

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenRes.json()) as GoogleTokenResponse;
  if (!tokenRes.ok || !tokenData.access_token) {
    return NextResponse.redirect(
      redirectToStore(postAuthOrigin, storeSlug, { auth_error: "google_failed" }),
    );
  }

  const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = (await userRes.json()) as GoogleUserInfo;

  if (!userRes.ok || !profile.sub || !profile.email) {
    return NextResponse.redirect(
      redirectToStore(postAuthOrigin, storeSlug, { auth_error: "google_profile" }),
    );
  }

  const email = profile.email.trim().toLowerCase();
  const store = await resolveStoreForSlug(storeSlug);
  if (!store) {
    return NextResponse.redirect(
      redirectToStore(postAuthOrigin, storeSlug, { auth_error: "store_required" }),
    );
  }
  const now = new Date().toISOString();

  const byGoogle = (await dataStore.getCustomers()).find(
    (c) => c.googleProviderId === profile.sub,
  );
  const byEmailRaw = await dataStore.getCustomerByEmail(email);
  const byEmail = byEmailRaw ? normalizeCustomer(byEmailRaw) : null;

  const existingAccount = byGoogle ?? byEmail;
  if (existingAccount && !customerCanActAtStore(existingAccount, store.id)) {
    return NextResponse.redirect(
      redirectToStore(postAuthOrigin, storeSlug, { auth_error: "wrong_store" }),
    );
  }

  const merged = mergeGoogleOAuthCustomer(
    {
      sub: profile.sub,
      email: profile.email,
      email_verified: profile.email_verified,
      given_name: profile.given_name,
      family_name: profile.family_name,
      name: profile.name,
    },
    byGoogle,
    byEmail,
    {
      storeId: store.id,
      now,
      newCustomerId: () => uuidv4(),
    },
  );

  if (!merged.ok) {
    return NextResponse.redirect(
      redirectToStore(postAuthOrigin, storeSlug, {
        auth_error: "account_conflict",
      }),
    );
  }

  const customer = merged.customer;

  await dataStore.upsertCustomer(customer);
  const loggedIn = await touchCustomerLogin(customer);

  const session: CustomerSession = {
    customerId: loggedIn.id,
    email: loggedIn.email,
    role: "customer",
  };
  const token = createCustomerSessionToken(session);
  const postLoginTarget =
    safeAfterLoginPath(afterLoginPath, postAuthOrigin) ??
    redirectToStore(postAuthOrigin, storeSlug, { signed_in: "google" });
  return NextResponse.redirect(postLoginTarget, {
    headers: {
      "Set-Cookie": customerSessionCookieHeader(token),
    },
  });
}
