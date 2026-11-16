import type { StaffRole } from "../staff/staff-members";
import { sessionSignatureMatches, signSessionPayload } from "./admin-session";

export const STAFF_COOKIE_NAME = "staff_session";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export type StaffSession = {
  storeId: string;
  staffId: string;
  name: string;
  role: StaffRole;
};

export function createStaffSessionToken(session: StaffSession, now = Date.now()): string {
  const payload = Buffer.from(
    JSON.stringify({ ...session, kind: "staff", exp: now + MAX_AGE_MS }),
  ).toString("base64url");
  return `${payload}.${signSessionPayload(payload)}`;
}

export function parseStaffSessionToken(token: string, now = Date.now()): StaffSession | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  if (!sessionSignatureMatches(payload, token.slice(dot + 1))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StaffSession & {
      kind?: string;
      exp?: number;
    };
    // An admin session token is signed with the same key; `kind` keeps it from passing as a staff one.
    if (parsed.kind !== "staff" || !parsed.exp || now > parsed.exp) return null;
    if (!parsed.storeId || !parsed.staffId || !parsed.name) return null;
    if (parsed.role !== "owner" && parsed.role !== "clerk") return null;
    return { storeId: parsed.storeId, staffId: parsed.staffId, name: parsed.name, role: parsed.role };
  } catch {
    return null;
  }
}

export function staffSessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${STAFF_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}${secure}`;
}

export function clearStaffSessionCookieHeader(): string {
  return `${STAFF_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readStaffSessionFromRequest(req: Request): StaffSession | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${STAFF_COOKIE_NAME}=([^;]+)`));
  if (!match?.[1]) return null;
  return parseStaffSessionToken(decodeURIComponent(match[1]));
}
