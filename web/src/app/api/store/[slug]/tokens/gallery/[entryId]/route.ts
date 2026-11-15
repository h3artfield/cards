import { NextRequest } from "next/server";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { canSeeGalleryEntryV1, galleryViewV1 } from "@/lib/token-creator/gallery-v1";
import { countTokenGalleryCopyV1, deleteTokenGalleryEntryV1, getTokenGalleryEntryV1 } from "@/lib/token-creator/store-v1";
import { authorizeTokenCreatorV1 } from "../../authorize";

type Params = { params: Promise<{ slug: string; entryId: string }> };

/** Copying an entry: hands back its design to start a new one from, and counts the copy. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { slug, entryId } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const entry = await getTokenGalleryEntryV1(entryId);
    if (!entry || !canSeeGalleryEntryV1(entry, auth.store.id, auth.customer.id)) return jsonError("Not found", 404);
    if (entry.customerId !== auth.customer.id) await countTokenGalleryCopyV1(entryId);
    return jsonOk({ entry: galleryViewV1(entry, slug, auth.customer.id) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Authors can take their own entries down at any time. */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { slug, entryId } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const entry = await getTokenGalleryEntryV1(entryId);
    if (!entry || entry.storeId !== auth.store.id || entry.customerId !== auth.customer.id) return jsonError("Not found", 404);
    await deleteTokenGalleryEntryV1(entryId);
    return jsonOk({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
