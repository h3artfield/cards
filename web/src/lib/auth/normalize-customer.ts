import type { Customer, CustomerAuthProvider } from "../types";

/** Apply defaults for legacy customer records missing Directive 013 fields. */
export function normalizeCustomer(
  raw: Partial<Customer> & Pick<Customer, "id" | "email">,
): Customer {
  const email = raw.email.trim().toLowerCase();
  const hasPassword = Boolean(raw.passwordHash);
  const providers: CustomerAuthProvider[] =
    raw.authProviders && raw.authProviders.length > 0
      ? raw.authProviders
      : raw.isGuest
        ? ["guest"]
        : raw.googleProviderId
          ? ["google"]
          : raw.appleProviderId
            ? ["apple"]
            : hasPassword
              ? ["email"]
              : ["email"];

  const grandfatherVerified =
    raw.emailVerified === true ||
    (raw.emailVerified === undefined && hasPassword && !raw.isGuest);

  return {
    id: raw.id,
    role: "customer",
    firstName: raw.firstName?.trim() ?? "",
    lastName: raw.lastName?.trim() ?? "",
    email,
    phone: raw.phone?.trim() ?? "",
    storeId: raw.storeId,
    emailVerified: grandfatherVerified,
    emailVerifiedAt: raw.emailVerifiedAt,
    authProviders: providers,
    googleProviderId: raw.googleProviderId,
    appleProviderId: raw.appleProviderId,
    isGuest: raw.isGuest,
    guestId: raw.guestId,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    lastLoginAt: raw.lastLoginAt,
    passwordHash: raw.passwordHash,
    emailVerificationTokenHash: raw.emailVerificationTokenHash,
    emailVerificationSentAt: raw.emailVerificationSentAt,
    passwordResetTokenHash: raw.passwordResetTokenHash,
    passwordResetSentAt: raw.passwordResetSentAt,
  };
}
