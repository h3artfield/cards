import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import {
  customerTokenAssetUrlV1,
  restrictTokenCardAssetsV1,
  sanitizeTokenReferenceV1,
} from "@/lib/token-creator/assets-v1";
import { sanitizeTokenCardV1 } from "@/lib/token-creator/design-v1";
import {
  getTokenDesignV1,
  getTokenGenerationV1,
  getTokenVersionsV1,
  listTokenDesignsV1,
  saveTokenDesignV1,
  tokenImagesRemainingTodayV1,
} from "@/lib/token-creator/store-v1";
import { normalizeTokenBlendWeightV1, tokenStyleByIdV1 } from "@/lib/token-creator/styles-v1";
import { defaultTokenCardV1 } from "@/lib/token-creator/templates-v1";
import type { TokenDesignV1 } from "@/lib/token-creator/types-v1";
import { designViewV1 } from "@/lib/token-creator/views-v1";
import { authorizeTokenCreatorV1 } from "../authorize";

/** The customer's saved designs at this store, newest first, with a thumbnail each. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const designs = (await listTokenDesignsV1(auth.customer.id, auth.store.id)).slice(0, 60);

    const generations = await Promise.all(
      designs.map((d) => (d.latestGenerationId ? getTokenGenerationV1(d.latestGenerationId) : Promise.resolve(null))),
    );
    const thumbIds = generations.map((g) => g?.slots.find((s) => s.versionId)?.versionId ?? null);
    const versions = await getTokenVersionsV1(thumbIds.filter((id): id is string => Boolean(id)));
    const pathById = new Map(versions.map((v) => [v.versionId, v.artworkPath]));

    return jsonOk({
      designs: designs.map((d, i) => {
        const path = thumbIds[i] ? pathById.get(thumbIds[i]!) : undefined;
        return { ...designViewV1(d), thumbUrl: path ? customerTokenAssetUrlV1(slug, path) : null };
      }),
      remainingToday: await tokenImagesRemainingTodayV1(auth.customer.id),
      storeName: auth.store.storeName,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Creates a design, or saves an existing one the caller owns. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeTokenCreatorV1(req, slug);
    if (auth.error) return auth.error;
    const body = (await req.json()) as {
      designId?: unknown;
      card?: unknown;
      prompt?: unknown;
      styleId?: unknown;
      blendStyleId?: unknown;
      blendWeight?: unknown;
      styleMode?: unknown;
      batchStyleIds?: unknown;
      source?: { deckId?: unknown; tokenName?: unknown } | null;
      reference?: unknown;
    };

    const now = new Date().toISOString();
    let existing: TokenDesignV1 | null = null;
    if (typeof body.designId === "string" && body.designId) {
      existing = await getTokenDesignV1(body.designId);
      if (!existing || existing.customerId !== auth.customer.id || existing.storeId !== auth.store.id) {
        return jsonError("Design not found", 404);
      }
    }
    const fallback = existing?.card ?? defaultTokenCardV1("creature");
    const card = restrictTokenCardAssetsV1(sanitizeTokenCardV1(body.card, fallback), auth.store.id, auth.customer.id);
    const validStyle = (v: unknown) => (typeof v === "string" && tokenStyleByIdV1(v) ? v : null);
    const styleId = validStyle(body.styleId);
    const styleFields = {
      styleId,
      blendStyleId: validStyle(body.blendStyleId),
      blendWeight: normalizeTokenBlendWeightV1(body.blendWeight),
      styleMode: body.styleMode === "mixed" ? ("mixed" as const) : ("single" as const),
      batchStyleIds: Array.isArray(body.batchStyleIds) ? body.batchStyleIds.slice(0, 4).map(validStyle) : null,
    };
    const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 1500) : existing?.prompt ?? "";
    const reference =
      body.reference === undefined
        ? existing?.reference ?? null
        : sanitizeTokenReferenceV1(body.reference, auth.store.id, auth.customer.id);

    const design: TokenDesignV1 = existing
      ? { ...existing, card, name: card.name || existing.name, prompt, reference, ...styleFields, updatedAt: now }
      : {
          designId: randomUUID(),
          customerId: auth.customer.id,
          storeId: auth.store.id,
          name: card.name || "Untitled token",
          card,
          prompt,
          reference,
          ...styleFields,
          source:
            body.source && typeof body.source === "object"
              ? {
                  deckId: typeof body.source.deckId === "string" ? body.source.deckId.slice(0, 200) : undefined,
                  tokenName: typeof body.source.tokenName === "string" ? body.source.tokenName.slice(0, 80) : undefined,
                }
              : null,
          latestGenerationId: null,
          generationIds: [],
          createdAt: now,
          updatedAt: now,
        };
    await saveTokenDesignV1(JSON.parse(JSON.stringify(design)) as TokenDesignV1);
    return jsonOk({ design: designViewV1(design) });
  } catch (err) {
    return handleRouteError(err);
  }
}
