import { NextRequest } from "next/server";
import { verifyCustomerPassword } from "@/lib/auth/customer-password";
import {
  adminSessionCookieHeader,
  createAdminSessionToken,
} from "@/lib/auth/admin-session";
import { sanitizeAdminSession } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";
import { ensureSeedData } from "@/lib/storage/ensure-seed";
import type { AdminSession } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    await ensureSeedData();

    const body = await req.json();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const password = String(body.password ?? "");
    const expectedRole = body.expectedRole as AdminSession["role"] | undefined;

    if (!email || !password) {
      return jsonError("Email and password are required");
    }

    const user = await dataStore.getAdminUserByEmail(email);
    if (!user || !(await verifyCustomerPassword(password, user.passwordHash))) {
      return jsonError("Invalid email or password", 401);
    }

    if (expectedRole === "store" && user.role !== "store") {
      return jsonError(
        "That account is not a store login. Use the platform admin sign-in page.",
        403,
      );
    }
    if (expectedRole === "platform" && user.role !== "platform") {
      return jsonError(
        "That account is a store owner login. Use the store sign-in page at /store/login.",
        403,
      );
    }

    const session: AdminSession = {
      userId: user.id,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
      activeStoreId:
        user.role === "store" ? user.storeId : undefined,
    };

    const token = createAdminSessionToken(session);
    const response = jsonOk({
      session: sanitizeAdminSession(session),
      token,
    });
    response.headers.set("Set-Cookie", adminSessionCookieHeader(token));
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}
