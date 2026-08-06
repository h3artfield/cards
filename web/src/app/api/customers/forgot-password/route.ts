import { NextRequest } from "next/server";
import { normalizeCustomer } from "@/lib/auth/normalize-customer";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { generateSecureToken, hashToken } from "@/lib/auth/customer-tokens";
import { sendCustomerPasswordResetEmail } from "@/lib/customer-email";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";

const RESET_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();

    if (!email) {
      return jsonOk({
        message:
          "If an account exists, we sent password reset instructions.",
      });
    }

    if (!checkRateLimit(`forgot:${email}`, 3, 15 * 60 * 1000)) {
      return jsonOk({
        message:
          "If an account exists, we sent password reset instructions.",
      });
    }

    const raw = await dataStore.getCustomerByEmail(email);
    if (raw?.passwordHash) {
      const token = generateSecureToken();
      const now = new Date().toISOString();
      const updated = normalizeCustomer({
        ...raw,
        passwordResetTokenHash: hashToken(token),
        passwordResetSentAt: now,
        updatedAt: now,
      });
      await dataStore.upsertCustomer(updated);
      await sendCustomerPasswordResetEmail(email, token);
    }

    return jsonOk({
      message: "If an account exists, we sent password reset instructions.",
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export { RESET_WINDOW_MS };
