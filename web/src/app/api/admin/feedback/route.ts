import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import {
  requireAdminSession,
  requirePlatformAdmin,
} from "@/lib/admin-auth";
import { jsonOk, handleRouteError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  const auth = requireAdminSession(req);
  if (auth instanceof Response) return auth;

  const forbidden = requirePlatformAdmin(auth);
  if (forbidden) return forbidden;

  try {
    const storeId = req.nextUrl.searchParams.get("storeId")?.trim();
    const items = await dataStore.listFeedback(storeId || undefined);
    return jsonOk({ feedback: items });
  } catch (err) {
    return handleRouteError(err);
  }
}
