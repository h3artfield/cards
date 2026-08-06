import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  getEdhrecRecommendationsEnriched,
  getOrSyncEdhrecMeta,
  resolveStoreBySlug,
} from "@/lib/deck-builder/deck-builder-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const commanderSlug = req.nextUrl.searchParams.get("commanderSlug") ?? "";
    const themeSlug = req.nextUrl.searchParams.get("themeSlug") ?? undefined;
    const category = req.nextUrl.searchParams.get("category") ?? undefined;
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);

    if (!commanderSlug) {
      return jsonError("commanderSlug is required", 400);
    }

    const meta = await getOrSyncEdhrecMeta({ commanderSlug, themeSlug });
    if (!meta) {
      return jsonError("Commander data not available — try again shortly", 404);
    }

    const recommendations = await getEdhrecRecommendationsEnriched({
      storeId: store.id,
      edhrecMeta: meta,
      category,
      limit: Math.min(200, Math.max(1, limit)),
    });

    return jsonOk({
      commander: {
        slug: meta.commanderSlug,
        name: meta.commanderName,
        themes: meta.themes,
        colorIdentity: meta.colorIdentity,
        rank: meta.rank,
        bracketCounts: meta.bracketCounts,
        manaCurve: meta.manaCurve,
      },
      recommendations,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
