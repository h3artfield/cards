import { NextRequest } from "next/server";
import { jsonError, handleRouteError } from "@/lib/api-utils";

export async function POST(_req: NextRequest) {
  try {
    return jsonError("Guest checkout is disabled. Create an account to scan cards.", 403);
  } catch (err) {
    return handleRouteError(err);
  }
}
