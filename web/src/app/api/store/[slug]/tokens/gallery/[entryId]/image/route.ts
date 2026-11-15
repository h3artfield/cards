import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/api-utils";
import { readTokenAssetV1 } from "@/lib/token-creator/assets-v1";
import { canSeeGalleryEntryV1 } from "@/lib/token-creator/gallery-v1";
import { getTokenGalleryEntryV1 } from "@/lib/token-creator/store-v1";
import { authorizeTokenCreatorV1 } from "../../../authorize";

/** A gallery entry's preview picture, for customers allowed to see the entry. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; entryId: string }> }) {
  try {
    const { slug, entryId } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const entry = await getTokenGalleryEntryV1(entryId);
    if (!entry || !canSeeGalleryEntryV1(entry, auth.store.id, auth.customer.id)) return jsonError("Not found", 404);
    const asset = await readTokenAssetV1(entry.previewPath);
    if (!asset) return jsonError("Not found", 404);
    return new NextResponse(new Uint8Array(asset.bytes), {
      headers: { "Content-Type": asset.contentType, "Cache-Control": "private, max-age=600" },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
