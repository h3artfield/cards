import { clearAdminSessionCookieHeader } from "@/lib/auth/admin-session";
import { clearStaffSessionCookieHeader } from "@/lib/auth/staff-session";
import { jsonOk } from "@/lib/api-utils";

export async function POST() {
  const response = jsonOk({ ok: true });
  response.headers.append("Set-Cookie", clearAdminSessionCookieHeader());
  response.headers.append("Set-Cookie", clearStaffSessionCookieHeader());
  return response;
}
