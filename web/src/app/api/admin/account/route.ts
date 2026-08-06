import { NextRequest } from "next/server";
import {
  hashCustomerPassword,
  validateCustomerPassword,
  verifyCustomerPassword,
} from "@/lib/auth/customer-password";
import {
  adminSessionCookieHeader,
  createAdminSessionToken,
} from "@/lib/auth/admin-session";
import { syncStoreOwnerEmail } from "@/lib/auth/sync-store-owner";
import {
  requireAdminSession,
  sanitizeAdminSession,
} from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { dataStore } from "@/lib/storage/data-store";
import type { AdminSession } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const user = await dataStore.getAdminUserById(auth.userId);
    if (!user) return jsonError("Account not found", 404);

    return jsonOk({
      account: {
        email: user.email,
        role: user.role,
        storeId: user.storeId,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const user = await dataStore.getAdminUserById(auth.userId);
    if (!user) return jsonError("Account not found", 404);

    const body = await req.json();
    const currentPassword = String(body.currentPassword ?? "");
    const newEmailRaw = body.newEmail != null ? String(body.newEmail) : undefined;
    const newPassword = body.newPassword != null ? String(body.newPassword) : undefined;

    if (!currentPassword) {
      return jsonError("Current password is required");
    }
    if (!(await verifyCustomerPassword(currentPassword, user.passwordHash))) {
      return jsonError("Current password is incorrect", 401);
    }

    if (!newEmailRaw && !newPassword) {
      return jsonError("Provide a new email and/or new password");
    }

    let email = user.email;
    if (newEmailRaw !== undefined) {
      email = newEmailRaw.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        return jsonError("Enter a valid email address");
      }
      if (email !== user.email) {
        const taken = await dataStore.getAdminUserByEmail(email);
        if (taken && taken.id !== user.id) {
          return jsonError("That email is already in use", 409);
        }
      }
    }

    let passwordHash = user.passwordHash;
    if (newPassword !== undefined) {
      const passwordError = validateCustomerPassword(newPassword);
      if (passwordError) return jsonError(passwordError);
      passwordHash = await hashCustomerPassword(newPassword);
    }

    const updated = {
      ...user,
      email,
      passwordHash,
      updatedAt: new Date().toISOString(),
    };
    await dataStore.saveAdminUser(updated);

    if (user.role === "store" && user.storeId && email !== user.email) {
      await syncStoreOwnerEmail(user.storeId, email);
    }

    const session: AdminSession = {
      userId: updated.id,
      email: updated.email,
      role: updated.role,
      storeId: updated.storeId,
      activeStoreId:
        auth.activeStoreId ??
        (updated.role === "store" ? updated.storeId : undefined),
    };

    const token = createAdminSessionToken(session);
    const response = jsonOk({
      account: { email: updated.email, role: updated.role, storeId: updated.storeId },
      session: sanitizeAdminSession(session),
    });
    response.headers.set("Set-Cookie", adminSessionCookieHeader(token));
    return response;
  } catch (err) {
    if (err instanceof Error && err.message.includes("already used")) {
      return jsonError(err.message, 409);
    }
    return handleRouteError(err);
  }
}
