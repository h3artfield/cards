import { NextRequest } from "next/server";
import {
  customerSessionResponse,
  touchCustomerLogin,
} from "@/lib/auth/customer-auth";
import { normalizeCustomer } from "@/lib/auth/normalize-customer";
import { verifyTokenHash } from "@/lib/auth/customer-tokens";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body.token ?? "").trim();
    if (!token) {
      return jsonError("Verification token is required");
    }

    const customers = await dataStore.getCustomers();
    const match = customers.find((c) =>
      verifyTokenHash(token, c.emailVerificationTokenHash),
    );

    if (!match) {
      return jsonError("Invalid or expired verification link", 400);
    }

    const now = new Date().toISOString();
    const updated = normalizeCustomer({
      ...match,
      emailVerified: true,
      emailVerifiedAt: now,
      emailVerificationTokenHash: undefined,
      emailVerificationSentAt: undefined,
      updatedAt: now,
    });

    await dataStore.upsertCustomer(updated);
    const loggedIn = await touchCustomerLogin(updated);

    let storeSlug: string | undefined;
    if (updated.storeId) {
      const store = await dataStore.getStore(updated.storeId);
      storeSlug = store?.storeSlug;
    }

    return customerSessionResponse(loggedIn, {
      verified: true,
      storeSlug,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
