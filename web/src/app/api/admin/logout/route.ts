import { clearAdminSessionCookieHeader } from "@/lib/auth/admin-session";
import { jsonOk } from "@/lib/api-utils";

export async function POST() {
  const response = jsonOk({ ok: true });
  response.headers.set("Set-Cookie", clearAdminSessionCookieHeader());
  return response;
}
