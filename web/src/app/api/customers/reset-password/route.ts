import { NextRequest } from "next/server";
import {
  hashCustomerPassword,
  validateCustomerPassword,
} from "@/lib/auth/customer-password";
import { normalizeCustomer } from "@/lib/auth/normalize-customer";
import { verifyTokenHash } from "@/lib/auth/customer-tokens";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";

const RESET_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body.token ?? "").trim();
    const password = String(body.password ?? "");

    const passwordError = validateCustomerPassword(password);
    if (passwordError) {
      return jsonError(passwordError);
    }

    if (!token) {
      return jsonError("Reset token is required");
    }

    const customers = await dataStore.getCustomers();
    const match = customers.find((c) =>
      verifyTokenHash(token, c.passwordResetTokenHash),
    );

    if (!match?.passwordResetSentAt) {
      return jsonError("Invalid or expired reset link", 400);
    }

    const sentAt = Date.parse(match.passwordResetSentAt);
    if (Number.isNaN(sentAt) || Date.now() - sentAt > RESET_WINDOW_MS) {
      return jsonError("Invalid or expired reset link", 400);
    }

    const now = new Date().toISOString();
    const passwordHash = await hashCustomerPassword(password);
    const updated = normalizeCustomer({
      ...match,
      passwordHash,
      passwordResetTokenHash: undefined,
      passwordResetSentAt: undefined,
      updatedAt: now,
    });

    await dataStore.upsertCustomer(updated);
    return jsonOk({ reset: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
