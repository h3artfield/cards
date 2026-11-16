import { NextResponse } from "next/server";
import { readStaffSessionFromRequest, type StaffSession } from "../auth/staff-session";
import type { AdminSession } from "../types";
import { activeOwnerCount, getStaffMember, listStaffMembers } from "./staff-members";

/** Settings a clerk may save; any other field in the PATCH needs the owner. */
const CLERK_SETTINGS_FIELDS = new Set(["conditionMultipliers", "calendarSettings"]);

export function settingsPatchNeedsOwner(body: Record<string, unknown>): boolean {
  return Object.keys(body).some((key) => !CLERK_SETTINGS_FIELDS.has(key));
}

export type StaffContext = {
  /** The store has no owner profile yet, so nobody can sign in with a PIN. */
  setupNeeded: boolean;
  staff: StaffSession | null;
};

/** The signed-in clerk for this store, if their cookie matches a still-active profile. */
export async function getStaffContext(req: Request, storeId: string): Promise<StaffContext> {
  const cookie = readStaffSessionFromRequest(req);
  if (cookie && cookie.storeId === storeId) {
    const member = await getStaffMember(storeId, cookie.staffId);
    if (member?.active) {
      return { setupNeeded: false, staff: { ...cookie, name: member.name, role: member.role } };
    }
  }
  const members = await listStaffMembers(storeId);
  return { setupNeeded: activeOwnerCount(members) === 0, staff: null };
}

export function ownerAccessAllowed(input: {
  role: AdminSession["role"];
  setupNeeded: boolean;
  staffRole?: StaffSession["role"];
}): boolean {
  if (input.role === "platform") return true;
  // Before the owner creates their profile the store login is the owner, as it was before PINs.
  if (input.setupNeeded) return true;
  return input.staffRole === "owner";
}

/** `null` when allowed, otherwise the 403 to return. */
export async function requireStoreOwner(
  req: Request,
  session: AdminSession,
  storeId: string,
): Promise<NextResponse | null> {
  if (session.role === "platform") return null;
  const ctx = await getStaffContext(req, storeId);
  if (ownerAccessAllowed({ role: session.role, setupNeeded: ctx.setupNeeded, staffRole: ctx.staff?.role })) {
    return null;
  }
  return NextResponse.json(
    { error: "Only the owner can change this. Ask the owner to sign in with their PIN.", code: "OWNER_REQUIRED" },
    { status: 403 },
  );
}
