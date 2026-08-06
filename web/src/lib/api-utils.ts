import { NextRequest, NextResponse } from "next/server";
import { FirestoreUnavailableError } from "@/lib/firebase/admin";
import { readAdminSessionFromRequest } from "@/lib/auth/admin-session";

function isStorageBucketMissingError(err: unknown): boolean {
  const message =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  return (
    message.includes("The specified bucket does not exist") ||
    message.includes("Firebase Storage bucket not found") ||
    message.includes('"reason":"notFound"') ||
    message.includes("bucket does not exist") ||
    message.includes("exceeds the maximum allowed size")
  );
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function friendlyErrorMessage(err: unknown): string {
  if (err instanceof FirestoreUnavailableError) {
    return err.message;
  }
  if (isStorageBucketMissingError(err)) {
    return "Firebase Storage is not set up yet. Enable Storage in the Firebase Console (Build → Storage → Get started), then try again.";
  }
  if (err instanceof Error) {
    if (
      err.message.includes("exceeds the maximum allowed size") ||
      err.message.includes("Photos are too large")
    ) {
      return "Photos are too large to save. Tap Take Photo again — the app will compress them automatically.";
    }
    if (err.message.startsWith("{")) {
      try {
        const parsed = JSON.parse(err.message) as { message?: string };
        if (parsed.message?.includes("bucket does not exist")) {
          return "Firebase Storage is not set up yet. Enable Storage in the Firebase Console (Build → Storage → Get started), then try again.";
        }
      } catch {
        // Fall through to raw message.
      }
    }
    return err.message;
  }
  return "Internal server error";
}

export function handleRouteError(err: unknown): NextResponse {
  if (err instanceof FirestoreUnavailableError) {
    console.warn("[api]", err.message);
    return jsonError(err.message, 503);
  }
  const message = friendlyErrorMessage(err);
  console.error("[api]", message);
  return jsonError(message, 500);
}

/** @deprecated Legacy header auth — prefer admin session cookie */
export function requireAdmin(req: NextRequest): boolean {
  if (readAdminSessionFromRequest(req)) return true;
  const expected = process.env.ADMIN_SECRET;
  if (!expected) return true;
  return req.headers.get("x-admin-key") === expected;
}

export function unauthorized() {
  return jsonError("Unauthorized", 401);
}
