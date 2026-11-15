import { NextRequest, NextResponse } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import { loadCollectionValue } from "@/lib/collection/collection-card-price";
import { parseCollectionGame } from "@/lib/collection/collection-game";
import { dataStore } from "@/lib/storage/data-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const cards = await dataStore.getCollectionCards(
      context.store.id,
      context.customer.id,
    );
    return jsonOk(
      await loadCollectionValue({
        cards,
        game: parseCollectionGame(req.nextUrl.searchParams.get("game")),
      }),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
