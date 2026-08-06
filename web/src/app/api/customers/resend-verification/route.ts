import { NextRequest } from "next/server";
import {
  getCustomerSession,
  loadCustomer,
} from "@/lib/auth/customer-auth";
import { normalizeCustomer } from "@/lib/auth/normalize-customer";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { generateSecureToken, hashToken } from "@/lib/auth/customer-tokens";
import { isCustomerEmailVerificationEnabled } from "@/lib/customer-auth-config";
import { sendCustomerVerificationEmail } from "@/lib/customer-email";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";

export async function POST(req: NextRequest) {
  try {
    if (!isCustomerEmailVerificationEnabled()) {
      return jsonError("Email verification is disabled", 400);
    }

    const body = await req.json().catch(() => ({}));
    const session = getCustomerSession(req);
    const emailParam =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    let customer = session ? await loadCustomer(session.customerId) : null;
    if (!customer && emailParam) {
      const raw = await dataStore.getCustomerByEmail(emailParam);
      customer = raw ? normalizeCustomer(raw) : null;
    }

    if (!customer) {
      return jsonError("Enter your email to resend verification", 400);
    }

    if (
      !checkRateLimit(`verify-resend:${customer.id}`, 3, 15 * 60 * 1000)
    ) {
      return jsonError("Too many requests. Try again later.", 429);
    }

    if (customer.emailVerified) {
      return jsonOk({ alreadyVerified: true });
    }

    const token = generateSecureToken();
    const now = new Date().toISOString();
    const updated = normalizeCustomer({
      ...customer,
      emailVerificationTokenHash: hashToken(token),
      emailVerificationSentAt: now,
      updatedAt: now,
    });
    await dataStore.upsertCustomer(updated);

    let storeName: string | undefined;
    if (customer.storeId) {
      const store = await dataStore.getStore(customer.storeId);
      storeName = store?.storeName;
    }

    await sendCustomerVerificationEmail(
      customer.email,
      customer.firstName,
      token,
      storeName,
    );

    return jsonOk({ sent: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
