import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { pngDimensionsV1, saveTokenAssetV1 } from "@/lib/token-creator/assets-v1";
import { sanitizeTokenCardV1 } from "@/lib/token-creator/design-v1";
import {
  canSeeGalleryEntryV1,
  galleryCardV1,
  galleryViewV1,
  TOKEN_GALLERY_MAX_PER_CUSTOMER_V1,
  TOKEN_GALLERY_PREVIEW_MAX_BYTES_V1,
  TOKEN_GALLERY_PREVIEW_MAX_PX_V1,
} from "@/lib/token-creator/gallery-v1";
import {
  createTokenGalleryEntryV1,
  getTokenDesignV1,
  getTokenVersionV1,
  listTokenGalleryV1,
} from "@/lib/token-creator/store-v1";
import { normalizeTokenBlendWeightV1 } from "@/lib/token-creator/styles-v1";
import type { TokenGalleryEntryV1 } from "@/lib/token-creator/types-v1";
import { authorizeTokenCreatorV1 } from "../authorize";

/** The store's approved gallery, plus the caller's own entries whatever their review state. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const entries = (await listTokenGalleryV1(auth.store.id))
      .filter((e) => canSeeGalleryEntryV1(e, auth.store.id, auth.customer.id))
      .slice(0, 150);
    return jsonOk({ entries: entries.map((e) => galleryViewV1(e, slug, auth.customer.id)) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Shares one of the caller's finished cards. The browser sends the card front
 * as it looks on screen; staff approve the entry before anyone else sees it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const form = await req.formData();

    const versionId = String(form.get("versionId") ?? "");
    const version = await getTokenVersionV1(versionId);
    if (!version || version.customerId !== auth.customer.id || version.storeId !== auth.store.id) {
      return jsonError("Card not found", 404);
    }
    const design = await getTokenDesignV1(version.designId);
    if (!design) return jsonError("Design not found", 404);

    const mine = (await listTokenGalleryV1(auth.store.id)).filter((e) => e.customerId === auth.customer.id);
    if (mine.length >= TOKEN_GALLERY_MAX_PER_CUSTOMER_V1) {
      return jsonError(`You can share up to ${TOKEN_GALLERY_MAX_PER_CUSTOMER_V1} designs. Remove one to share another.`, 409);
    }

    const file = form.get("preview");
    if (!(file instanceof Blob) || file.size === 0 || file.size > TOKEN_GALLERY_PREVIEW_MAX_BYTES_V1) {
      return jsonError("The preview picture is missing or too large");
    }
    const preview = Buffer.from(await file.arrayBuffer());
    const dims = pngDimensionsV1(preview);
    if (!dims || dims.width > TOKEN_GALLERY_PREVIEW_MAX_PX_V1.width || dims.height > TOKEN_GALLERY_PREVIEW_MAX_PX_V1.height) {
      return jsonError("The preview must be a PNG of the card front");
    }

    let cardRaw: unknown = null;
    try {
      cardRaw = JSON.parse(String(form.get("card") ?? "null"));
    } catch {
      return jsonError("Card design is not valid");
    }
    const card = galleryCardV1(sanitizeTokenCardV1(cardRaw, version.card ?? design.card));
    const title = String(form.get("title") ?? "").trim().slice(0, 60) || card.name || "Custom token";

    const entryId = randomUUID();
    const previewPath = `tokenCreator/${auth.store.id}/gallery/${entryId}.png`;
    await saveTokenAssetV1(previewPath, preview, "image/png");

    const entry: TokenGalleryEntryV1 = {
      entryId,
      storeId: auth.store.id,
      customerId: auth.customer.id,
      authorName: auth.customer.firstName?.trim().slice(0, 30) || "A customer",
      title,
      card,
      prompt: (version.prompt || design.prompt).slice(0, 1500),
      styleId: version.styleId ?? design.styleId,
      blendStyleId: version.blendStyleId ?? design.blendStyleId ?? null,
      blendWeight: normalizeTokenBlendWeightV1(version.blendWeight ?? design.blendWeight),
      previewPath,
      status: "pending",
      copies: 0,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
    };
    await createTokenGalleryEntryV1(JSON.parse(JSON.stringify(entry)) as TokenGalleryEntryV1);
    return jsonOk({ entry: galleryViewV1(entry, slug, auth.customer.id) });
  } catch (err) {
    return handleRouteError(err);
  }
}
