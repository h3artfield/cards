import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  compareSemanticMapCards,
  isSemanticMapReady,
} from "@/lib/semantic-visualization/semantic-map-service";

export async function GET(req: NextRequest) {
  try {
    if (!isSemanticMapReady()) return jsonError("Semantic map not ready", 503);
    const a = req.nextUrl.searchParams.get("a");
    const b = req.nextUrl.searchParams.get("b");
    if (!a || !b) return jsonError("Query params a and b required", 400);
    const result = await compareSemanticMapCards(a, b);
    if (!result) return jsonError("One or both cards not found", 404);
    return jsonOk(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
