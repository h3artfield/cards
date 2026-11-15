import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonOk } from "@/lib/api-utils";
import { adminTokenAssetUrlV1 } from "@/lib/token-creator/assets-v1";
import { listTokenGalleryV1 } from "@/lib/token-creator/store-v1";

/** Every gallery entry at the store, waiting ones first, for staff to review. */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;
    const entries = await listTokenGalleryV1(scope.storeId);
    const rank = { pending: 0, approved: 1, hidden: 2 } as const;
    return jsonOk({
      entries: entries
        .sort((a, b) => rank[a.status] - rank[b.status])
        .map((e) => ({
          entryId: e.entryId,
          title: e.title,
          authorName: e.authorName,
          prompt: e.prompt,
          status: e.status,
          copies: e.copies,
          createdAt: e.createdAt,
          reviewedBy: e.reviewedBy,
          previewUrl: adminTokenAssetUrlV1(e.previewPath),
        })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
