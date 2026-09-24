import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import {
  parseCatalogSource,
  parseScanCatalogGame,
} from "@/lib/collection/collection-catalog";
import { loadCollectionPricePreview } from "@/lib/collection/collection-card-price";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const displayName = req.nextUrl.searchParams.get("displayName")?.trim();
    if (!displayName) {
      return jsonError("displayName is required");
    }

    const game = parseScanCatalogGame(req.nextUrl.searchParams.get("category"));
    const catalogSource = parseCatalogSource(
      req.nextUrl.searchParams.get("catalogSource"),
    );

    return jsonOk(
      await loadCollectionPricePreview({
        displayName,
        category: game ?? undefined,
        catalogSource: catalogSource ?? undefined,
        catalogId: req.nextUrl.searchParams.get("catalogId")?.trim() || undefined,
        setName: req.nextUrl.searchParams.get("setName")?.trim() || undefined,
        cardNumber: req.nextUrl.searchParams.get("cardNumber")?.trim() || undefined,
        scryfallId: req.nextUrl.searchParams.get("scryfallId")?.trim() || undefined,
      }),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
