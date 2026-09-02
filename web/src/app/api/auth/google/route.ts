import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import {
  googleRedirectUriForRequest,
  isGoogleAuthEnabled,
} from "@/lib/customer-auth-config";

function oauthState(
  storeSlug: string,
  redirectUri: string,
  afterLoginPath?: string,
): string {
  const payload = JSON.stringify({
    storeSlug,
    redirectUri,
    afterLoginPath: afterLoginPath?.trim() || undefined,
    nonce: randomBytes(16).toString("base64url"),
  });
  return Buffer.from(payload).toString("base64url");
}

export async function GET(req: NextRequest) {
  if (!isGoogleAuthEnabled()) {
    return NextResponse.json({ error: "Google sign-in is not enabled" }, { status: 404 });
  }

  const storeSlug = req.nextUrl.searchParams.get("store")?.trim() ?? "";
  const afterLoginPath = req.nextUrl.searchParams.get("redirect")?.trim() ?? "";
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const redirectUri = googleRedirectUriForRequest(req);
  const state = oauthState(storeSlug, redirectUri, afterLoginPath || undefined);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
  );
}
