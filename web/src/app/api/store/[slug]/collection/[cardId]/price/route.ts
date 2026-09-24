import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import { loadCollectionCardPrice } from "@/lib/collection/collection-card-price";
import { dataStore } from "@/lib/storage/data-store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; cardId: string }> },
) {
  try {
    const { slug, cardId } = await params;
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const card = await dataStore.getCollectionCard(cardId);
    if (
      !card ||
      card.storeId !== context.store.id ||
      card.customerId !== context.customer.id
    ) {
      return jsonError("Card not found", 404);
    }

    return jsonOk(await loadCollectionCardPrice(card));
  } catch (err) {
    return handleRouteError(err);
  }
}
