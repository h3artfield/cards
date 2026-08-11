import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  getSemanticMapCardDetail,
  isSemanticMapReady,
} from "@/lib/semantic-visualization/semantic-map-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; oracleId: string }> },
) {
  try {
    await params;
    if (!isSemanticMapReady()) {
      return jsonError("Semantic map not ready", 503);
    }

    const neighborOracleId = req.nextUrl.searchParams.get("neighborOracleId") ?? undefined;
    const { oracleId } = await params;
    const detail = await getSemanticMapCardDetail(oracleId, neighborOracleId);
    if (!detail) return jsonError("Card not found in semantic map", 404);
    return jsonOk(detail);
  } catch (err) {
    return handleRouteError(err);
  }
}
