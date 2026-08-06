import { createHmac, timingSafeEqual } from "node:crypto";
import type { CustomerSession } from "../types";

const COOKIE_NAME = "customer_session";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function signingKey(): string {
  return (
    process.env.CUSTOMER_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SECRET?.trim() ||
    "dev-customer-session-change-me"
  );
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function createCustomerSessionToken(session: CustomerSession): string {
  const payload = Buffer.from(
    JSON.stringify({
      ...session,
      exp: Date.now() + MAX_AGE_MS,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseCustomerSessionToken(token: string): CustomerSession | null {
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
    ) as CustomerSession & { exp?: number };
    if (!parsed.customerId || !parsed.email || parsed.role !== "customer") {
      return null;
    }
    if (parsed.exp && Date.now() > parsed.exp) return null;
    return {
      customerId: parsed.customerId,
      email: parsed.email,
      role: "customer",
    };
  } catch {
    return null;
  }
}

export function customerSessionCookieHeader(token: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}${secure}`;
}

export function clearCustomerSessionCookieHeader(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCustomerSessionFromRequest(req: Request): CustomerSession | null {
  const cookie = req.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  if (!match?.[1]) return null;
  return parseCustomerSessionToken(decodeURIComponent(match[1]));
}

export { COOKIE_NAME };
