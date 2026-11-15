import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import {
  customerTokenAssetUrlV1,
  saveTokenAssetV1,
  sniffTokenUploadTypeV1,
  tokenUploadPrefixV1,
} from "@/lib/token-creator/assets-v1";
import { authorizeTokenCreatorV1 } from "../authorize";

const MAX_BYTES = 10 * 1024 * 1024;

/** Stores a picture the customer wants the artwork made from. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof Blob) || file.size === 0) return jsonError("Choose an image to upload.");
    if (file.size > MAX_BYTES) return jsonError("That image is over 10 MB. Try a smaller one.", 413);
    const bytes = Buffer.from(await file.arrayBuffer());
    const kind = sniffTokenUploadTypeV1(bytes);
    if (!kind) return jsonError("Upload a PNG, JPEG or WebP image.", 415);

    const path = `${tokenUploadPrefixV1(auth.store.id, auth.customer.id)}${randomUUID()}.${kind.ext}`;
    await saveTokenAssetV1(path, bytes, kind.type);
    return jsonOk({ path, url: customerTokenAssetUrlV1(slug, path) });
  } catch (err) {
    return handleRouteError(err);
  }
}
