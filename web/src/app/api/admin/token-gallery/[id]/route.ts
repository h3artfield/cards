import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { deleteTokenGalleryEntryV1, getTokenGalleryEntryV1, setTokenGalleryStatusV1 } from "@/lib/token-creator/store-v1";
import type { TokenGalleryStatusV1 } from "@/lib/token-creator/types-v1";

const STATUSES = new Set<TokenGalleryStatusV1>(["pending", "approved", "hidden"]);

async function scoped(req: NextRequest, id: string) {
  const auth = requireAdminSession(req);
  if (auth instanceof Response) return { error: auth };
  const scope = requireStoreScope(auth, req);
  if (scope instanceof Response) return { error: scope };
  const entry = await getTokenGalleryEntryV1(id);
  if (!entry || entry.storeId !== scope.storeId) return { error: jsonError("Entry not found", 404) };
  return { entry, by: (auth as { email?: string }).email ?? "staff" };
}

/** Approve an entry so other customers see it, or hide it again. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const found = await scoped(req, id);
    if (found.error) return found.error;
    const body = (await req.json()) as { status?: unknown };
    const status = body.status as TokenGalleryStatusV1;
    if (!STATUSES.has(status)) return jsonError("Unknown status");
    await setTokenGalleryStatusV1(id, status, found.by);
    return jsonOk({ ok: true, status });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const found = await scoped(req, id);
    if (found.error) return found.error;
    await deleteTokenGalleryEntryV1(id);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
