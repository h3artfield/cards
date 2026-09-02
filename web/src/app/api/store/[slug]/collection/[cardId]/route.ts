import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import { dataStore } from "@/lib/storage/data-store";

export async function DELETE(
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
    if (card.status !== "owned") {
      return jsonError(
        "This card is already on a buyback order and can't be removed",
        409,
      );
    }

    await dataStore.deleteCollectionCard(cardId);
    return jsonOk({ removed: cardId });
  } catch (err) {
    return handleRouteError(err);
  }
}
