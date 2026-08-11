import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getSemanticMapManifest, isSemanticMapReady } from "@/lib/semantic-visualization/semantic-map-service";

export async function GET() {
  try {
    if (!isSemanticMapReady()) {
      return jsonError(
        "Semantic map artifacts not built. Run: cd web && npx tsx scripts/build-catalog-semantic-visualization-v1.ts",
        503,
      );
    }
    return jsonOk(getSemanticMapManifest());
  } catch (err) {
    return handleRouteError(err);
  }
}
