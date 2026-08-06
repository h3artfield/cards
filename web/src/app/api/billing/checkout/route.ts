import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { createBillingCheckoutForStore } from "@/lib/stripe/store-signup";
import { stripeConfigured } from "@/lib/stripe/config";
import { ensureSeedData } from "@/lib/storage/ensure-seed";

export async function POST(req: NextRequest) {
  try {
    await ensureSeedData();
    if (!stripeConfigured()) {
      return jsonError("Billing is not configured on this environment", 503);
    }

    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    if (auth.role !== "store" || !auth.storeId) {
      return jsonError("Store account required", 403);
    }

    const checkoutUrl = await createBillingCheckoutForStore(auth.storeId, auth.email);
    return jsonOk({ checkoutUrl });
  } catch (err) {
    return handleRouteError(err);
  }
}
