import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import {
  customerTokenAssetUrlV1,
  pngDimensionsV1,
  restrictTokenCardAssetsV1,
  saveTokenAssetV1,
  tokenAssetPrefixV1,
} from "@/lib/token-creator/assets-v1";
import { CARD_BLEED, CARD_H, CARD_W, sanitizeTokenCardV1 } from "@/lib/token-creator/design-v1";
import { PRINT_SCALE_V1 } from "@/lib/token-creator/render-v1";
import { createTokenSnapshotV1, getTokenDesignV1, getTokenVersionV1 } from "@/lib/token-creator/store-v1";
import { tokenStyleLabelV1 } from "@/lib/token-creator/styles-v1";
import type { TokenPrintSnapshotV1 } from "@/lib/token-creator/types-v1";
import { authorizeTokenCreatorV1 } from "../../../authorize";

type Params = { params: Promise<{ slug: string; versionId: string }> };

const MAX_BYTES = 25 * 1024 * 1024;
const EXPECTED_W = Math.round((CARD_W + CARD_BLEED * 2) * PRINT_SCALE_V1);
const EXPECTED_H = Math.round((CARD_H + CARD_BLEED * 2) * PRINT_SCALE_V1);

async function readPng(form: FormData, field: string): Promise<Buffer | null> {
  const file = form.get(field);
  if (!(file instanceof Blob) || file.size === 0 || file.size > MAX_BYTES) return null;
  return Buffer.from(await file.arrayBuffer());
}

/**
 * Freezes a card for printing. The browser renders the front and back at
 * 300 DPI with bleed from the same design it shows on screen and uploads both
 * here, with the design they were drawn from. The snapshot never changes, so
 * edits after this point cannot alter what an order prints.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { slug, versionId } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const version = await getTokenVersionV1(versionId);
    if (!version || version.customerId !== auth.customer.id || version.storeId !== auth.store.id) {
      return jsonError("Card not found", 404);
    }
    const design = await getTokenDesignV1(version.designId);
    if (!design) return jsonError("Design not found", 404);

    const form = await req.formData();
    const [front, back] = await Promise.all([readPng(form, "front"), readPng(form, "back")]);
    if (!front || !back) return jsonError("Print files are missing");
    const frontDims = pngDimensionsV1(front);
    const backDims = pngDimensionsV1(back);
    const sizeOk = (d: { width: number; height: number } | null) =>
      d && Math.abs(d.width - EXPECTED_W) <= 2 && Math.abs(d.height - EXPECTED_H) <= 2;
    if (!sizeOk(frontDims) || !sizeOk(backDims)) {
      return jsonError(`Print files must be ${EXPECTED_W}×${EXPECTED_H} PNGs (63×88 mm with 3 mm bleed at 300 DPI).`);
    }

    let cardRaw: unknown = null;
    try {
      cardRaw = JSON.parse(String(form.get("card") ?? "null"));
    } catch {
      return jsonError("Card design is not valid");
    }
    const card = restrictTokenCardAssetsV1(sanitizeTokenCardV1(cardRaw, version.card ?? design.card), auth.store.id, auth.customer.id);

    const snapshotId = randomUUID();
    const prefix = `${tokenAssetPrefixV1(auth.store.id, auth.customer.id)}snapshots/${snapshotId}`;
    const frontPath = `${prefix}-front.png`;
    const backPath = `${prefix}-back.png`;
    await Promise.all([saveTokenAssetV1(frontPath, front, "image/png"), saveTokenAssetV1(backPath, back, "image/png")]);

    const snapshot: TokenPrintSnapshotV1 = {
      snapshotId,
      versionId,
      designId: version.designId,
      customerId: auth.customer.id,
      storeId: auth.store.id,
      card,
      artworkPath: version.artworkPath,
      frontPath,
      backPath,
      frontWidth: frontDims!.width,
      frontHeight: frontDims!.height,
      dpi: 300,
      bleedMm: 3,
      styleName: tokenStyleLabelV1(version.styleId, version.blendStyleId),
      createdAt: new Date().toISOString(),
    };
    await createTokenSnapshotV1(JSON.parse(JSON.stringify(snapshot)));
    return jsonOk({
      snapshotId,
      previewUrl: customerTokenAssetUrlV1(slug, frontPath),
      name: card.name || "Custom token",
      styleName: snapshot.styleName,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
