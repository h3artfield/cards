import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { searchPriceChartingProducts } from "@/lib/processing/pricing/pricecharting-pricing";
import { centsToUsd } from "@/lib/processing/pricing/pricecharting-utils";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import type { CardCategory, VisionResult } from "@/lib/types";

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) return jsonError("q is required");

    const category = (req.nextUrl.searchParams.get("category") ??
      "sports") as CardCategory;
    const vision: VisionResult = {
      category,
      confidence: 1,
      itemType: "raw",
      conditionEstimate: "NM",
      cardName: q,
      playerName: q,
    };

    const hits = await searchPriceChartingProducts(q, vision, 15);
    if (!hits.length && !process.env.PRICECHARTING_API_KEY?.trim()) {
      return jsonError("PriceCharting API key is not configured", 503);
    }

    return jsonOk({
      results: hits.map((h) => ({
        id: h.product.id,
        name: h.product["product-name"],
        set: h.product["console-name"],
        loosePrice: centsToUsd(h.product["loose-price"]),
        gradedPrice: centsToUsd(h.product["graded-price"]),
        sourceUrl: h.sourceUrl,
        score: h.score,
        raw: h.product,
      })),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
