import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { hashCustomerPassword, validateCustomerPassword } from "@/lib/auth/customer-password";
import { normalizeCustomer } from "@/lib/auth/normalize-customer";
import { resolveStoreForSlug } from "@/lib/auth/customer-auth";
import { generateSecureToken, hashToken } from "@/lib/auth/customer-tokens";
import { sanitizeCustomer } from "@/lib/auth/sanitize-customer";
import { isCustomerEmailVerificationEnabled } from "@/lib/customer-auth-config";
import { sendCustomerVerificationEmail } from "@/lib/customer-email";
import { validateDisplayName } from "@/lib/challenger/display-name";
import { challengerDisplayNameTaken } from "@/lib/challenger/display-name-store";
import { dataStore } from "@/lib/storage/data-store";
import type { Customer } from "@/lib/types";

const STORE_SLUG = "the-game-lodge";

function consentError(body: { consent?: unknown; age13?: unknown }): string | null {
  if (body.age13 !== true) return "Confirm you are 13 or older.";
  if (body.consent !== true) {
    return "Confirm your display name may be shown on the stream and the Hall of Champions.";
  }
  return null;
}

/** Player account: email, password, display name. No phone. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      email?: unknown;
      password?: unknown;
      displayName?: unknown;
      consent?: unknown;
      age13?: unknown;
    };

    const consent = consentError(body);
    if (consent) return jsonError(consent);

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!email || !email.includes("@")) return jsonError("Enter an email address.");

    const passwordError = validateCustomerPassword(password);
    if (passwordError) return jsonError(passwordError);

    const display = validateDisplayName(body.displayName);
    if (!display.ok) return jsonError(display.error);

    const store = await resolveStoreForSlug(STORE_SLUG);
    if (!store) return jsonError("The store account is not available.", 503);

    const existingRaw = await dataStore.getCustomerByEmail(email);
    if (existingRaw) {
      return jsonError("An account with this email already exists. Sign in instead.", 409);
    }
    if (await challengerDisplayNameTaken(display.key)) {
      return jsonError("That display name is already taken.");
    }

    const now = new Date().toISOString();
    const sendVerification = isCustomerEmailVerificationEnabled();
    const verificationToken = sendVerification ? generateSecureToken() : undefined;
    const passwordHash = await hashCustomerPassword(password);
    const nameFields = {
      challengerDisplayName: display.name,
      challengerDisplayNameKey: display.key,
      challengerConsentAt: now,
      challengerAgeConfirmedAt: now,
    };

    const customer: Customer = {
      id: uuidv4(),
      role: "customer",
      firstName: "",
      lastName: "",
      email,
      phone: "",
      storeId: store.id,
      emailVerified: false,
      authProviders: ["email"],
      passwordHash,
      emailVerificationTokenHash: verificationToken ? hashToken(verificationToken) : undefined,
      emailVerificationSentAt: sendVerification ? now : undefined,
      createdAt: now,
      updatedAt: now,
      ...nameFields,
    };

    await dataStore.upsertCustomer(customer);
    const saved = normalizeCustomer(customer);
    if (verificationToken) {
      await sendCustomerVerificationEmail(
        saved.email,
        saved.challengerDisplayName ?? "",
        verificationToken,
        store.storeName,
      );
    }

    return jsonOk({
      customer: sanitizeCustomer(saved),
      emailVerificationSent: Boolean(verificationToken),
      requiresVerification: Boolean(verificationToken),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
