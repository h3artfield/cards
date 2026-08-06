import { normalizeCustomer } from "./normalize-customer";
import type { Customer } from "../types";

export type GoogleOAuthProfile = {
  sub: string;
  email: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
};

export type GoogleOAuthCustomerResult =
  | { ok: true; customer: Customer }
  | { ok: false; error: "account_conflict" };

export function mergeGoogleOAuthCustomer(
  profile: GoogleOAuthProfile,
  byGoogle: Customer | null | undefined,
  byEmail: Customer | null | undefined,
  options: {
    storeId?: string;
    now: string;
    newCustomerId: () => string;
  },
): GoogleOAuthCustomerResult {
  if (byGoogle && byEmail && byGoogle.id !== byEmail.id) {
    return { ok: false, error: "account_conflict" };
  }

  const email = profile.email.trim().toLowerCase();
  const { now, storeId, newCustomerId } = options;

  if (byGoogle) {
    return {
      ok: true,
      customer: normalizeCustomer({
        ...byGoogle,
        email,
        firstName:
          byGoogle.firstName ||
          profile.given_name ||
          profile.name?.split(" ")[0] ||
          "",
        lastName:
          byGoogle.lastName ||
          profile.family_name ||
          profile.name?.split(" ").slice(1).join(" ") ||
          "",
        emailVerified: profile.email_verified === true || byGoogle.emailVerified,
        emailVerifiedAt:
          profile.email_verified === true && !byGoogle.emailVerifiedAt
            ? now
            : byGoogle.emailVerifiedAt,
        authProviders: Array.from(
          new Set([...byGoogle.authProviders.filter((p) => p !== "guest"), "google"]),
        ),
        googleProviderId: profile.sub,
        isGuest: false,
        storeId: storeId ?? byGoogle.storeId,
        updatedAt: now,
      }),
    };
  }

  if (byEmail) {
    return {
      ok: true,
      customer: normalizeCustomer({
        ...byEmail,
        googleProviderId: profile.sub,
        emailVerified: profile.email_verified === true || byEmail.emailVerified,
        emailVerifiedAt:
          profile.email_verified === true && !byEmail.emailVerifiedAt
            ? now
            : byEmail.emailVerifiedAt,
        authProviders: Array.from(
          new Set([...byEmail.authProviders.filter((p) => p !== "guest"), "google"]),
        ),
        isGuest: false,
        firstName: byEmail.firstName || profile.given_name || "",
        lastName: byEmail.lastName || profile.family_name || "",
        storeId: storeId ?? byEmail.storeId,
        updatedAt: now,
      }),
    };
  }

  return {
    ok: true,
    customer: {
      id: newCustomerId(),
      role: "customer",
      firstName: profile.given_name || profile.name?.split(" ")[0] || "",
      lastName: profile.family_name || profile.name?.split(" ").slice(1).join(" ") || "",
      email,
      phone: "",
      storeId,
      emailVerified: profile.email_verified === true,
      emailVerifiedAt: profile.email_verified === true ? now : undefined,
      authProviders: ["google"],
      googleProviderId: profile.sub,
      createdAt: now,
      updatedAt: now,
    },
  };
}
