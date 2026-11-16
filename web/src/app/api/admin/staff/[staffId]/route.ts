import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { requireStoreOwner } from "@/lib/staff/owner-access";
import {
  activeOwnerCount,
  getStaffMember,
  hashStaffPin,
  listStaffMembers,
  normalizeStaffName,
  parseStaffRole,
  saveStaffMember,
  staffNameTaken,
  toPublicStaff,
  validateStaffPin,
} from "@/lib/staff/staff-members";
import { dataStore } from "@/lib/storage/data-store";

/** Owner only: `{ name?, role?, pin?, active? }`. The last active owner can't be removed or demoted. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ staffId: string }> }) {
  const session = requireAdminSession(req);
  if (session instanceof Response) return session;
  const scope = requireStoreScope(session, req);
  if (scope instanceof Response) return scope;
  try {
    const forbidden = await requireStoreOwner(req, session, scope.storeId);
    if (forbidden) return forbidden;

    const { staffId } = await ctx.params;
    const member = await getStaffMember(scope.storeId, staffId);
    if (!member) return jsonError("Staff member not found", 404);
    const body = (await req.json()) as Record<string, unknown>;
    const members = await listStaffMembers(scope.storeId);
    const next = { ...member };

    if (body.name != null) {
      const name = normalizeStaffName(body.name);
      if (!name) return jsonError("Enter a name (up to 40 characters)");
      if (staffNameTaken(members, name, member.id)) return jsonError("Someone already has that name", 409);
      next.name = name;
    }
    if (body.role != null) {
      const role = parseStaffRole(body.role);
      if (!role) return jsonError("Role must be owner or clerk");
      next.role = role;
    }
    if (body.active != null) next.active = Boolean(body.active);
    if (body.pin != null) {
      const pin = String(body.pin);
      const pinError = validateStaffPin(pin);
      if (pinError) return jsonError(pinError);
      next.pinHash = await hashStaffPin(pin);
    }

    const after = members.map((m) => (m.id === next.id ? next : m));
    if (activeOwnerCount(after) === 0) return jsonError("The store needs at least one active owner", 409);

    next.updatedAt = new Date().toISOString();
    await saveStaffMember(next);
    await dataStore.logAdminAction({
      action: "staff_updated",
      storeId: scope.storeId,
      staffId: next.id,
      fields: Object.keys(body).filter((k) => k !== "pin").concat(body.pin != null ? ["pin"] : []),
    });
    return jsonOk({ member: toPublicStaff(next) });
  } catch (err) {
    return handleRouteError(err);
  }
}
