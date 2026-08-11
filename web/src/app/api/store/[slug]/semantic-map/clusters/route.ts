import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  getSemanticMapClusters,
  isSemanticMapReady,
} from "@/lib/semantic-visualization/semantic-map-service";

export async function GET() {
  try {
    if (!isSemanticMapReady()) return jsonError("Semantic map not ready", 503);
    return jsonOk({ clusters: getSemanticMapClusters() });
  } catch (err) {
    return handleRouteError(err);
  }
}
