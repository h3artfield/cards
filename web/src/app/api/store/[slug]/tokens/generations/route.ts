import { NextRequest } from "next/server";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { startTokenGenerationV1 } from "@/lib/token-creator/generate-v1";
import { getTokenDesignV1, saveTokenDesignV1 } from "@/lib/token-creator/store-v1";
import { normalizeTokenBlendWeightV1, tokenStyleByIdV1 } from "@/lib/token-creator/styles-v1";
import { generationViewV1 } from "@/lib/token-creator/views-v1";
import { authorizeTokenCreatorV1 } from "../authorize";

export const maxDuration = 300;

/**
 * Starts four images for a saved design and returns at once; the client polls
 * the generation. `requestId` makes a double-click or a retried request land
 * on the same generation instead of paying for a second one.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const body = (await req.json()) as {
      designId?: unknown;
      requestId?: unknown;
      prompt?: unknown;
      styleId?: unknown;
      blendStyleId?: unknown;
      blendWeight?: unknown;
      styleMode?: unknown;
      batchStyleIds?: unknown;
      hq?: unknown;
    };
    if (typeof body.designId !== "string" || typeof body.requestId !== "string" || !/^[a-zA-Z0-9-]{8,64}$/.test(body.requestId)) {
      return jsonError("designId and requestId are required");
    }
    const design = await getTokenDesignV1(body.designId);
    if (!design || design.customerId !== auth.customer.id || design.storeId !== auth.store.id) {
      return jsonError("Design not found", 404);
    }
    const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 1500) : design.prompt;
    const validStyle = (v: unknown) => (typeof v === "string" && tokenStyleByIdV1(v) ? v : null);
    const styleId = validStyle(body.styleId);
    const blendStyleId = validStyle(body.blendStyleId);
    const blendWeight = normalizeTokenBlendWeightV1(body.blendWeight);
    const styleMode = body.styleMode === "mixed" ? "mixed" : "single";
    const batchStyleIds =
      styleMode === "mixed" && Array.isArray(body.batchStyleIds) ? body.batchStyleIds.slice(0, 4).map(validStyle) : null;
    if (styleMode === "mixed" && (!batchStyleIds || batchStyleIds.length !== 4)) {
      return jsonError("Pick a style for each of the four images.");
    }

    const result = await startTokenGenerationV1({
      design: { ...design, prompt, styleId },
      requestId: body.requestId,
      prompt,
      styleId,
      blendStyleId,
      blendWeight,
      slotStyleIds: batchStyleIds,
      hq: body.hq === true,
    });
    if (!result.ok) return jsonError(result.message, result.status);

    if (!design.generationIds.includes(result.generation.generationId)) {
      await saveTokenDesignV1({
        ...design,
        prompt,
        styleId,
        blendStyleId,
        blendWeight,
        styleMode,
        batchStyleIds,
        latestGenerationId: result.generation.generationId,
        generationIds: [...design.generationIds, result.generation.generationId],
        updatedAt: new Date().toISOString(),
      });
    }
    return jsonOk({ generation: generationViewV1(result.generation), remainingToday: result.remainingToday });
  } catch (err) {
    return handleRouteError(err);
  }
}
