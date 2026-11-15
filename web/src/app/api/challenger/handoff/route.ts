import { NextRequest, NextResponse } from "next/server";
import { getCustomerSession, loadCustomer } from "@/lib/auth/customer-auth";
import { createChallengerHandoffToken } from "@/lib/challenger/handoff-token";
import { challengerPlaySiteUrl, playSiteIsReachable } from "@/lib/challenger/play-site";

function page(title: string, body: string, status: number): NextResponse {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="font-family:system-ui,sans-serif;background:#14120e;color:#f4efe4;margin:0">
  <main style="max-width:34rem;margin:4rem auto;padding:0 1.25rem">
    <h1 style="font-size:1.6rem;font-weight:600">${title}</h1>
    <p style="line-height:1.5">${body}</p>
    <p><a href="/challenger" style="color:#e7c56a">Back to signup</a></p>
  </main>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Signed-in player → play site. The stream PC never receives the customer cookie. */
export async function GET(req: NextRequest) {
  const session = getCustomerSession(req);
  if (!session) {
    return page("Sign in first", "Sign in on this site, then come back to join the table.", 401);
  }

  const customer = await loadCustomer(session.customerId);
  if (!customer || customer.email !== session.email || customer.isGuest) {
    return page("Sign in first", "Sign in on this site, then come back to join the table.", 401);
  }
  if (!customer.emailVerified) {
    return page(
      "Verify your email",
      "Open the verification email, then sign in again before joining a game.",
      403,
    );
  }

  const displayName = customer.challengerDisplayName?.trim();
  if (!displayName) {
    return page(
      "Choose a display name",
      "Set the name that will be shown on the stream, then try again.",
      409,
    );
  }

  const playSite = challengerPlaySiteUrl();
  if (!playSite) {
    return page(
      "The table is not open yet",
      "The play site address is not set. Try again once the stream is configured.",
      503,
    );
  }

  const live = await playSiteIsReachable(playSite);
  if (!live) {
    return page(
      "The table is offline",
      "The stream PC is asleep or the league is not running. Try again when the stream is live.",
      503,
    );
  }

  const token = createChallengerHandoffToken({
    uid: customer.id,
    name: displayName,
  });
  if (!token) {
    return page(
      "The table is not open yet",
      "Player hand-off is not configured on this server yet.",
      503,
    );
  }

  const dest = new URL("/auth/handoff", playSite);
  dest.searchParams.set("token", token);
  return NextResponse.redirect(dest, 302);
}
