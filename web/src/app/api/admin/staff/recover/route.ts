import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { verifyCustomerPassword } from "@/lib/auth/customer-password";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createStaffSessionToken, staffSessionCookieHeader } from "@/lib/auth/staff-session";
import {
  getStaffMember,
  hashStaffPin,
  saveStaffMember,
  toPublicStaff,
  validateStaffPin,
} from "@/lib/staff/staff-members";
import { dataStore } from "@/lib/storage/data-store";

/** Forgot owner PIN: `{ staffId, storePassword, pin }`. Only owner profiles; clerks ask the owner. */
export async function POST(req: NextRequest) {
  const session = requireAdminSession(req);
  if (session instanceof Response) return session;
  const scope = requireStoreScope(session, req);
  if (scope instanceof Response) return scope;
  if (session.role !== "store") return jsonError("Store login required", 403);
  try {
    if (!checkRateLimit(`staff-recover:${scope.storeId}`, 5, 15 * 60_000)) {
      return jsonError("Too many tries. Wait 15 minutes.", 429);
    }
    const body = (await req.json()) as Record<string, unknown>;
    const pin = String(body.pin ?? "");
    const pinError = validateStaffPin(pin);
    if (pinError) return jsonError(pinError);
    const member = await getStaffMember(scope.storeId, String(body.staffId ?? ""));
    if (!member?.active || member.role !== "owner") {
      return jsonError("Only an owner's PIN can be reset this way. Clerks: ask the owner.", 403);
    }
    const user = await dataStore.getAdminUserById(session.userId);
    const ok = user && (await verifyCustomerPassword(String(body.storePassword ?? ""), user.passwordHash));
    if (!ok) return jsonError("Store password is incorrect", 401);

    const now = new Date().toISOString();
    const next = { ...member, pinHash: await hashStaffPin(pin), updatedAt: now, lastSignedInAt: now };
    await saveStaffMember(next);
    await dataStore.logAdminAction({ action: "staff_owner_pin_reset", storeId: scope.storeId, staffId: next.id });
    const response = jsonOk({ staff: toPublicStaff(next) });
    response.headers.set(
      "Set-Cookie",
      staffSessionCookieHeader(
        createStaffSessionToken({ storeId: scope.storeId, staffId: next.id, name: next.name, role: "owner" }),
      ),
    );
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}
