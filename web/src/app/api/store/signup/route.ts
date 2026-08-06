import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  attachSessionCookie,
  createStoreOwnerSession,
  createStoreSignupCheckout,
} from "@/lib/stripe/store-signup";
import { dataStore } from "@/lib/storage/data-store";
import { ensureSeedData } from "@/lib/storage/ensure-seed";

export async function POST(req: NextRequest) {
  try {
    await ensureSeedData();
    const body = await req.json();

    const result = await createStoreSignupCheckout({
      storeName: String(body.storeName ?? ""),
      ownerName: String(body.ownerName ?? ""),
      email: String(body.email ?? ""),
      phone: String(body.phone ?? ""),
      address: String(body.address ?? ""),
      website: body.website != null ? String(body.website) : undefined,
      password: String(body.password ?? ""),
      storeSlug: body.storeSlug != null ? String(body.storeSlug) : undefined,
    });

    const adminUser = await dataStore.getAdminUserByEmail(
      String(body.email ?? "")
        .trim()
        .toLowerCase(),
    );
    if (!adminUser) {
      return jsonError("Account was created but login could not be established", 500);
    }

    const token = createStoreOwnerSession(result.storeId, adminUser.id, adminUser.email);
    const response = jsonOk(result);
    return attachSessionCookie(response, token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed";
    if (message.includes("already")) return jsonError(message, 409);
    return handleRouteError(err);
  }
}
