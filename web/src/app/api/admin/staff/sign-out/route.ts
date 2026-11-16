import { clearStaffSessionCookieHeader } from "@/lib/auth/staff-session";
import { jsonOk } from "@/lib/api-utils";

/** "Switch user" / idle lock: the store stays signed in, the clerk does not. */
export async function POST() {
  const response = jsonOk({ ok: true });
  response.headers.set("Set-Cookie", clearStaffSessionCookieHeader());
  return response;
}
