import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createStaffSessionToken, staffSessionCookieHeader } from "@/lib/auth/staff-session";
import { getStaffMember, saveStaffMember, toPublicStaff, verifyStaffPin } from "@/lib/staff/staff-members";

/** `{ staffId, pin }` → sets the staff cookie for this device. */
export async function POST(req: NextRequest) {
  const session = requireAdminSession(req);
  if (session instanceof Response) return session;
  const scope = requireStoreScope(session, req);
  if (scope instanceof Response) return scope;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const staffId = String(body.staffId ?? "");
    const pin = String(body.pin ?? "");
    if (!staffId || !pin) return jsonError("Pick your name and enter your PIN");

    if (!checkRateLimit(`staff-pin:${scope.storeId}:${staffId}`, 5, 5 * 60_000)) {
      return jsonError("Too many wrong PINs. Wait 5 minutes or ask the owner to reset it.", 429);
    }
    const member = await getStaffMember(scope.storeId, staffId);
    if (!member?.active || !(await verifyStaffPin(pin, member))) {
      return jsonError("Wrong PIN", 401);
    }

    member.lastSignedInAt = new Date().toISOString();
    await saveStaffMember(member);
    const response = jsonOk({ staff: toPublicStaff(member) });
    response.headers.set(
      "Set-Cookie",
      staffSessionCookieHeader(
        createStaffSessionToken({ storeId: scope.storeId, staffId: member.id, name: member.name, role: member.role }),
      ),
    );
    return response;
  } catch (err) {
    return handleRouteError(err);
  }
}
