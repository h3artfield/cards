import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import {
  getSemanticMapPayload,
  isSemanticMapReady,
} from "@/lib/semantic-visualization/semantic-map-service";

export const maxDuration = 120;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    if (!isSemanticMapReady()) {
      return jsonError(
        "Semantic map artifacts not built. Run: cd web && npx tsx scripts/build-catalog-semantic-visualization-v1.ts",
        503,
      );
    }

    const payload = await getSemanticMapPayload(store.id, slug);
    return jsonOk(payload);
  } catch (err) {
    return handleRouteError(err);
  }
}
