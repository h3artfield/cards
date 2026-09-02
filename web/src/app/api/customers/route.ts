import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { dataStore } from "@/lib/storage/data-store";
import {
  hashCustomerPassword,
  validateCustomerPassword,
} from "@/lib/auth/customer-password";
import {
  customerSessionResponse,
  resolveStoreForSlug,
  touchCustomerLogin,
} from "@/lib/auth/customer-auth";
import {
  boundStoreName,
  customerCanActAtStore,
} from "@/lib/auth/customer-store-binding";
import { normalizeCustomer } from "@/lib/auth/normalize-customer";
import { generateSecureToken, hashToken } from "@/lib/auth/customer-tokens";
import { sanitizeCustomer } from "@/lib/auth/sanitize-customer";
import {
  isCustomerEmailVerificationEnabled,
} from "@/lib/customer-auth-config";
import { sendCustomerVerificationEmail } from "@/lib/customer-email";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import type { Customer } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const phone = String(body.phone ?? "").trim();
    const password = String(body.password ?? "");
    const storeSlug = body.storeSlug != null ? String(body.storeSlug).trim() : undefined;

    if (!firstName || !lastName || !email || !phone) {
      return jsonError("All fields are required");
    }

    const store = await resolveStoreForSlug(storeSlug ?? "");
    if (!store) {
      return jsonError(
        "Start from your store's page — accounts are created at one store.",
        400,
      );
    }
    const storeId = store.id;

    const passwordError = validateCustomerPassword(password);
    if (passwordError) {
      return jsonError(passwordError);
    }

    const now = new Date().toISOString();
    const existingRaw = await dataStore.getCustomerByEmail(email);
    const existing = existingRaw ? normalizeCustomer(existingRaw) : null;

    if (existing?.passwordHash && existing.authProviders.includes("email")) {
      return jsonError(
        "An account with this email already exists. Sign in instead.",
        409,
      );
    }

    if (
      existing &&
      !existing.passwordHash &&
      (existing.googleProviderId || existing.appleProviderId)
    ) {
      return jsonError(
        "An account with this email already exists. Sign in with Google or Apple first, then link email.",
        409,
      );
    }

    if (existing && !customerCanActAtStore(existing, storeId)) {
      const otherStore = await boundStoreName(existing);
      return jsonError(
        `This email is already registered at another store${
          otherStore ? ` (${otherStore})` : ""
        }. Use a different email to join ${store.storeName}.`,
        409,
      );
    }

    const passwordHash = await hashCustomerPassword(password);
    let verificationToken: string | undefined;
    let emailVerificationTokenHash: string | undefined;

    const sendVerification = isCustomerEmailVerificationEnabled();
    if (sendVerification) {
      verificationToken = generateSecureToken();
      emailVerificationTokenHash = hashToken(verificationToken);
    }

    const customer: Customer = existing
      ? {
          ...existing,
          firstName,
          lastName,
          phone,
          passwordHash,
          storeId,
          emailVerified: false,
          authProviders: Array.from(
            new Set<Customer["authProviders"][number]>([
              ...existing.authProviders.filter((p) => p !== "guest"),
              "email",
            ]),
          ),
          isGuest: false,
          guestId: undefined,
          emailVerificationTokenHash,
          emailVerificationSentAt: sendVerification ? now : undefined,
          updatedAt: now,
        }
      : {
          id: uuidv4(),
          role: "customer",
          firstName,
          lastName,
          email,
          phone,
          storeId,
          emailVerified: false,
          authProviders: ["email"],
          passwordHash,
          emailVerificationTokenHash,
          emailVerificationSentAt: sendVerification ? now : undefined,
          createdAt: now,
          updatedAt: now,
        };

    await dataStore.upsertCustomer(customer);
    const saved = normalizeCustomer(customer);

    if (verificationToken) {
      await sendCustomerVerificationEmail(
        saved.email,
        saved.firstName,
        verificationToken,
        store?.storeName,
      );
      return jsonOk({
        customer: sanitizeCustomer(saved),
        emailVerificationSent: true,
        requiresVerification: true,
      });
    }

    const loggedIn = await touchCustomerLogin(saved);
    return customerSessionResponse(loggedIn);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function GET(req: NextRequest) {
  try {
    return jsonError("Use GET /api/customers/me for the signed-in customer", 400);
  } catch (err) {
    return handleRouteError(err);
  }
}
