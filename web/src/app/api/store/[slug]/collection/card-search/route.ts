import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import {
  lookupScryfallPrintingById,
  searchScryfallPrintings,
} from "@/lib/deck-builder/scryfall-printing-search";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!q) return jsonError("q is required");

    const limit = Math.min(80, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 36)));

    const uuidLike =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
    if (uuidLike) {
      const hit = await lookupScryfallPrintingById(q);
      return jsonOk({ results: hit ? [hit] : [] });
    }

    const results = await searchScryfallPrintings({ query: q, limit });
    return jsonOk({ results });
  } catch (err) {
    return handleRouteError(err);
  }
}
