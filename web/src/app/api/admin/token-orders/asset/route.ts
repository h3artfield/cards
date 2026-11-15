import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError } from "@/lib/api-utils";
import { readTokenAssetV1 } from "@/lib/token-creator/assets-v1";

/** Print files for staff, limited to the admin's own store. `download=1` saves instead of opening. */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const path = req.nextUrl.searchParams.get("path") ?? "";
    if (!path.startsWith(`tokenCreator/${scope.storeId}/`) || path.includes("..")) {
      return jsonError("Not found", 404);
    }
    const asset = await readTokenAssetV1(path);
    if (!asset) return jsonError("Not found", 404);
    const filename = path.split("/").pop() ?? "token.png";
    return new NextResponse(new Uint8Array(asset.bytes), {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": "private, max-age=3600",
        ...(req.nextUrl.searchParams.get("download") === "1"
          ? { "Content-Disposition": `attachment; filename="${filename}"` }
          : {}),
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
