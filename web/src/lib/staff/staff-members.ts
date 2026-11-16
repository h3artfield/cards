import { randomUUID } from "node:crypto";
import { getAdminFirestore } from "../firebase/admin";
import { hashCustomerPassword, verifyCustomerPassword } from "../auth/customer-password";

export const STAFF_COLLECTION = "storeStaff";

export type StaffRole = "owner" | "clerk";

export type StaffMember = {
  id: string;
  storeId: string;
  name: string;
  role: StaffRole;
  pinHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  lastSignedInAt?: string;
};

export type PublicStaffMember = Pick<StaffMember, "id" | "name" | "role" | "active" | "lastSignedInAt">;

const PIN_PATTERN = /^\d{4,6}$/;
const MAX_NAME_LENGTH = 40;

export function validateStaffPin(pin: unknown): string | null {
  if (typeof pin !== "string" || !PIN_PATTERN.test(pin)) return "PIN must be 4 to 6 digits";
  return null;
}

export function normalizeStaffName(raw: unknown): string | null {
  const name = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

export function parseStaffRole(raw: unknown): StaffRole | null {
  return raw === "owner" || raw === "clerk" ? raw : null;
}

export function toPublicStaff(m: StaffMember): PublicStaffMember {
  return { id: m.id, name: m.name, role: m.role, active: m.active, lastSignedInAt: m.lastSignedInAt };
}

export function activeOwnerCount(members: StaffMember[]): number {
  return members.filter((m) => m.active && m.role === "owner").length;
}

/** Names are compared without case so the picker never shows two "Sam"s. */
export function staffNameTaken(members: StaffMember[], name: string, exceptId?: string): boolean {
  const key = name.toLowerCase();
  return members.some((m) => m.id !== exceptId && m.active && m.name.toLowerCase() === key);
}

export async function hashStaffPin(pin: string): Promise<string> {
  return hashCustomerPassword(pin);
}

export async function verifyStaffPin(pin: string, member: StaffMember): Promise<boolean> {
  return verifyCustomerPassword(pin, member.pinHash);
}

export async function newStaffMember(input: {
  storeId: string;
  name: string;
  role: StaffRole;
  pin: string;
}): Promise<StaffMember> {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    storeId: input.storeId,
    name: input.name,
    role: input.role,
    pinHash: await hashStaffPin(input.pin),
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

// The dev server can load this module once per route bundle; one map for all of them.
const memoryHolder = globalThis as typeof globalThis & { __staffMembersMemory?: Map<string, StaffMember> };
const memory = (memoryHolder.__staffMembersMemory ??= new Map<string, StaffMember>());

export async function listStaffMembers(storeId: string): Promise<StaffMember[]> {
  const db = getAdminFirestore();
  const rows = db
    ? (await db.collection(STAFF_COLLECTION).where("storeId", "==", storeId).get()).docs.map(
        (d) => d.data() as StaffMember,
      )
    : [...memory.values()].filter((m) => m.storeId === storeId);
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getStaffMember(storeId: string, staffId: string): Promise<StaffMember | null> {
  const db = getAdminFirestore();
  const member = db
    ? ((await db.collection(STAFF_COLLECTION).doc(staffId).get()).data() as StaffMember | undefined)
    : memory.get(staffId);
  return member && member.storeId === storeId ? member : null;
}

export async function saveStaffMember(member: StaffMember): Promise<void> {
  const db = getAdminFirestore();
  if (db) await db.collection(STAFF_COLLECTION).doc(member.id).set(member);
  else memory.set(member.id, member);
}
