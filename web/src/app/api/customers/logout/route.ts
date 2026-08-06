import { clearCustomerSessionCookieHeader } from "@/lib/auth/customer-session";
import { jsonOk } from "@/lib/api-utils";

export async function POST() {
  const response = jsonOk({ ok: true });
  response.headers.set("Set-Cookie", clearCustomerSessionCookieHeader());
  return response;
}
