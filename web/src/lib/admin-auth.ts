import { NextRequest, NextResponse } from "next/server";
import { readAdminSessionFromRequest } from "@/lib/auth/admin-session";
import type { AdminSession } from "@/lib/types";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";

export function getAdminSession(req: NextRequest): AdminSession | null {
  return readAdminSessionFromRequest(req);
}

/** Store context for the current admin request. */
export function resolveAdminStoreId(
  session: AdminSession,
  req: NextRequest,
): string | null {
  if (session.role === "store") {
    return session.storeId ?? null;
  }
  const fromQuery = req.nextUrl.searchParams.get("storeId")?.trim();
  if (fromQuery) return fromQuery;
  return session.activeStoreId ?? null;
}

export function requireAdminSession(
  req: NextRequest,
): AdminSession | NextResponse {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

export function requirePlatformAdmin(
  session: AdminSession,
): NextResponse | null {
  if (session.role !== "platform") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export function requireStoreScope(
  session: AdminSession,
  req: NextRequest,
): { storeId: string } | NextResponse {
  const storeId = resolveAdminStoreId(session, req);
  if (!storeId) {
    return NextResponse.json(
      { error: "Select a store first", code: "STORE_REQUIRED" },
      { status: 400 },
    );
  }
  if (session.role === "store" && session.storeId !== storeId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { storeId };
}

export function defaultStoreId(): string {
  return DEFAULT_STORE_ID;
}

export function sanitizeAdminSession(session: AdminSession) {
  return {
    userId: session.userId,
    email: session.email,
    role: session.role,
    storeId: session.storeId,
    activeStoreId: session.activeStoreId,
  };
}
