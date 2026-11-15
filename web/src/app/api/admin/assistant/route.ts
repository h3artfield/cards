import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { answerStaffQuestion } from "@/lib/staff-assistant/answer";

export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json().catch(() => null)) as { query?: unknown } | null;
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (query.length < 8 || query.length > 400) {
      return jsonError("Ask a full question", 400);
    }

    const result = await answerStaffQuestion(query);
    return jsonOk(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
