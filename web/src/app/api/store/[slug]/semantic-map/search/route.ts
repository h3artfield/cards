import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { isSemanticMapReady, searchCards } from "@/lib/semantic-visualization/semantic-map-service";

export async function GET(req: NextRequest) {
  try {
    if (!isSemanticMapReady()) return jsonError("Semantic map not ready", 503);
    const q = req.nextUrl.searchParams.get("q") ?? "";
    if (q.trim().length < 2) return jsonOk({ results: [] });
    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
    return jsonOk({ results: searchCards(q, limit) });
  } catch (err) {
    return handleRouteError(err);
  }
}
