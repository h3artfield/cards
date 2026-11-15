import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, jsonError } from "@/lib/api-utils";
import { readTokenAssetV1, tokenAssetPrefixV1 } from "@/lib/token-creator/assets-v1";
import { authorizeTokenCreatorV1 } from "../authorize";

/**
 * Streams one of the caller's own token images. Same-origin on purpose: the
 * card renderer draws these onto a canvas, which a cross-origin image would
 * taint and make impossible to export for printing.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const path = req.nextUrl.searchParams.get("path") ?? "";
    if (!path.startsWith(tokenAssetPrefixV1(auth.store.id, auth.customer.id)) || path.includes("..")) {
      return jsonError("Not found", 404);
    }
    const asset = await readTokenAssetV1(path);
    if (!asset) return jsonError("Not found", 404);
    return new NextResponse(new Uint8Array(asset.bytes), {
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
