import { NextRequest } from "next/server";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { customerTokenAssetUrlV1 } from "@/lib/token-creator/assets-v1";
import { generateTokenPanelTextureV1 } from "@/lib/token-creator/generate-v1";
import { normalizeTokenBlendWeightV1, tokenStyleByIdV1 } from "@/lib/token-creator/styles-v1";
import { authorizeTokenCreatorV1 } from "../authorize";

export const maxDuration = 300;

/** Makes one AI surface for the name plate and rules panel and returns its path. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const body = (await req.json()) as {
      description?: unknown;
      styleId?: unknown;
      blendStyleId?: unknown;
      blendWeight?: unknown;
      tone?: unknown;
    };
    const description = typeof body.description === "string" ? body.description.slice(0, 400) : "";
    const validStyle = (v: unknown) => (typeof v === "string" && tokenStyleByIdV1(v) ? v : null);
    const styleId = validStyle(body.styleId);
    if (!description.trim() && !styleId) return jsonError("Describe the panel look or pick an art style first.");

    const result = await generateTokenPanelTextureV1({
      storeId: auth.store.id,
      customerId: auth.customer.id,
      description,
      styleId,
      blendStyleId: validStyle(body.blendStyleId),
      blendWeight: normalizeTokenBlendWeightV1(body.blendWeight),
      tone: body.tone === "dark" ? "dark" : "light",
    });
    if (!result.ok) return jsonError(result.message, result.status);
    return jsonOk({
      path: result.path,
      url: customerTokenAssetUrlV1(slug, result.path),
      remainingToday: result.remainingToday,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
