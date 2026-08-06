import { createHmac, timingSafeEqual } from "node:crypto";
import type { AdminSession } from "../types";

const COOKIE_NAME = "admin_session";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function signingKey(): string {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SECRET?.trim() ||
    "dev-admin-session-change-me"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function createAdminSessionToken(session: AdminSession): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...session,
      exp: Date.now() + MAX_AGE_MS,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseAdminSessionToken(token: string): AdminSession | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AdminSession & { exp?: number };
    if (!parsed.userId || !parsed.email || !parsed.role) return null;
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return {
      userId: parsed.userId,
      email: parsed.email,
      role: parsed.role,
      storeId: parsed.storeId,
      activeStoreId: parsed.activeStoreId,
    };
  } catch {
    return null;
  }
}

export function adminSessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}${secure}`;
}

export function clearAdminSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readAdminSessionFromRequest(req: Request): AdminSession | null {
  const authorization = req.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    const session = parseAdminSessionToken(authorization.slice(7).trim());
    if (session) return session;
  }

  const displayToken = req.headers.get("x-display-token")?.trim();
  if (displayToken) {
    const session = parseAdminSessionToken(displayToken);
    if (session) return session;
  }

  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  if (!match?.[1]) return null;
  return parseAdminSessionToken(decodeURIComponent(match[1]));
}

export { COOKIE_NAME };
