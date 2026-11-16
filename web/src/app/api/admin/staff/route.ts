import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { verifyCustomerPassword } from "@/lib/auth/customer-password";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { createStaffSessionToken, staffSessionCookieHeader } from "@/lib/auth/staff-session";
import { getStaffContext, requireStoreOwner } from "@/lib/staff/owner-access";
import {
  listStaffMembers,
  newStaffMember,
  normalizeStaffName,
  parseStaffRole,
  saveStaffMember,
  staffNameTaken,
  toPublicStaff,
  validateStaffPin,
} from "@/lib/staff/staff-members";
import { dataStore } from "@/lib/storage/data-store";

/** Everyone at the counter sees the names (for the picker); PIN hashes never leave the server. */
export async function GET(req: NextRequest) {
  const session = requireAdminSession(req);
  if (session instanceof Response) return session;
  const scope = requireStoreScope(session, req);
  if (scope instanceof Response) return scope;
  try {
    const [members, ctx] = await Promise.all([
      listStaffMembers(scope.storeId),
      getStaffContext(req, scope.storeId),
    ]);
    return jsonOk({
      members: members.map(toPublicStaff),
      setupNeeded: ctx.setupNeeded,
      current: ctx.staff,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * `{ name, role, pin }` adds a staff member (owner only).
 * `{ setup: true, storePassword, name, pin }` creates the first owner profile; the store
 * login password proves it is the owner and not whoever is at the counter.
 */
export async function POST(req: NextRequest) {
  const session = requireAdminSession(req);
  if (session instanceof Response) return session;
  const scope = requireStoreScope(session, req);
  if (scope instanceof Response) return scope;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = normalizeStaffName(body.name);
    if (!name) return jsonError("Enter a name (up to 40 characters)");
    const pin = String(body.pin ?? "");
    const pinError = validateStaffPin(pin);
    if (pinError) return jsonError(pinError);

    const members = await listStaffMembers(scope.storeId);
    if (staffNameTaken(members, name)) return jsonError("Someone already has that name", 409);

    if (body.setup === true) {
      const ctx = await getStaffContext(req, scope.storeId);
      if (!ctx.setupNeeded) return jsonError("The owner profile is already set up", 409);
      if (session.role === "store") {
        if (!checkRateLimit(`staff-setup:${scope.storeId}`, 5, 15 * 60_000)) {
          return jsonError("Too many tries. Wait 15 minutes.", 429);
        }
        const user = await dataStore.getAdminUserById(session.userId);
        const ok = user && (await verifyCustomerPassword(String(body.storePassword ?? ""), user.passwordHash));
        if (!ok) return jsonError("Store password is incorrect", 401);
      }
      const owner = await newStaffMember({ storeId: scope.storeId, name, role: "owner", pin });
      owner.lastSignedInAt = owner.createdAt;
      await saveStaffMember(owner);
      await dataStore.logAdminAction({ action: "staff_owner_setup", storeId: scope.storeId, staffId: owner.id });
      const response = jsonOk({ member: toPublicStaff(owner) });
      if (session.role === "store") {
        response.headers.set(
          "Set-Cookie",
          staffSessionCookieHeader(
            createStaffSessionToken({ storeId: scope.storeId, staffId: owner.id, name: owner.name, role: "owner" }),
          ),
        );
      }
      return response;
    }

    const forbidden = await requireStoreOwner(req, session, scope.storeId);
    if (forbidden) return forbidden;
    const role = parseStaffRole(body.role ?? "clerk");
    if (!role) return jsonError("Role must be owner or clerk");
    const member = await newStaffMember({ storeId: scope.storeId, name, role, pin });
    await saveStaffMember(member);
    await dataStore.logAdminAction({ action: "staff_added", storeId: scope.storeId, staffId: member.id, role });
    return jsonOk({ member: toPublicStaff(member) });
  } catch (err) {
    return handleRouteError(err);
  }
}
