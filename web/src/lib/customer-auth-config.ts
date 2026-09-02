import type { NextRequest } from "next/server";
import type { CustomerEmailVerificationMode, StoreSettings } from "./types";
import {
  getPublicRequestOriginFromParts,
} from "./app-url";

export function isGoogleAuthEnabled(): boolean {
  return (
    process.env.AUTH_GOOGLE_ENABLED !== "false" &&
    Boolean(process.env.GOOGLE_CLIENT_ID?.trim()) &&
    Boolean(process.env.GOOGLE_CLIENT_SECRET?.trim())
  );
}

export function isAppleAuthEnabled(): boolean {
  return (
    process.env.AUTH_APPLE_ENABLED === "true" &&
    Boolean(process.env.APPLE_CLIENT_ID?.trim())
  );
}

export function isCustomerEmailVerificationEnabled(): boolean {
  return process.env.CUSTOMER_EMAIL_VERIFICATION_ENABLED !== "false";
}

export function resolveStoreCustomerSettings(store: StoreSettings): {
  guestModeEnabled: boolean;
  emailVerificationMode: CustomerEmailVerificationMode;
} {
  return {
    guestModeEnabled:
      store.customerGuestModeEnabled === true &&
      process.env.CUSTOMER_GUEST_MODE_ENABLED === "true",
    emailVerificationMode:
      store.customerEmailVerificationMode ?? "required_before_submit",
  };
}

export function googleRedirectUri(): string {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;
  const base =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
}

/** OAuth callback must match the host the user started on or the session cookie won't stick. */
export function googleRedirectUriForRequest(req: NextRequest): string {
  const origin = getPublicRequestOriginFromParts({
    url: req.url,
    forwardedHost: req.headers.get("x-forwarded-host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
    host: req.headers.get("host"),
  });
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) {
    const configuredOrigin = new URL(configured).origin;
    if (origin === configuredOrigin) return configured;
  }
  return `${origin.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function publicRequestOrigin(req: NextRequest): string {
  return getPublicRequestOriginFromParts({
    url: req.url,
    forwardedHost: req.headers.get("x-forwarded-host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
    host: req.headers.get("host"),
  });
}

export function originFromGoogleRedirectUri(redirectUri: string): string {
  return new URL(redirectUri).origin;
}

export function googleAuthErrorMessage(code: string): string {
  switch (code) {
    case "google_cancelled":
      return "Google sign-in was cancelled.";
    case "google_failed":
      return "Google sign-in failed. Try again or use email sign-in.";
    case "google_profile":
      return "Could not read your Google profile. Try again.";
    case "account_conflict":
      return "This Google account does not match the email account on file. Contact the store for help.";
    case "wrong_store":
      return "This account is registered at another store. Sign in from that store's page, or use a different email here.";
    case "store_required":
      return "Start from your store's page to sign in.";
    default:
      return "Sign-in failed. Try again.";
  }
}
