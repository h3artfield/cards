import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";
import { priceWarehouseStore } from "@/lib/prices/price-warehouse-store";
import { buildCardPriceHistoryResponse } from "@/lib/prices/price-history";
import { describePriceHistoryEmptyReason } from "@/lib/prices/price-identity-aliases";
import { resolveCardPriceHistoryLookup } from "@/lib/prices/resolve-price-history-lookup";
import { cardDisplayName } from "@/lib/processing/card-display-name";

async function cardStoreId(cardId: string): Promise<string | null> {
  const card = await dataStore.getCard(cardId);
  if (!card) return null;
  const order = await dataStore.getOrder(card.orderId);
  if (!order) return null;
  return order.storeId?.trim() || DEFAULT_STORE_ID;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdminSession(req);
  if (auth instanceof Response) return auth;

  const { id: cardId } = await params;
  const storeId = await cardStoreId(cardId);
  if (!storeId) return jsonError("Card not found", 404);

  if (auth.role === "store" && auth.storeId !== storeId) {
    return jsonError("Forbidden", 403);
  }

  try {
    const card = await dataStore.getCard(cardId);
    if (!card) return jsonError("Card not found", 404);

    const lookup = resolveCardPriceHistoryLookup({
      card,
      identity: card.cardFlowV2Identity,
    });

    if (!lookup.requestedIdentityKey && lookup.lookupKeys.length === 0) {
      return jsonOk({
        identityKey: null,
        requestedIdentityKey: null,
        lookupKeys: [],
        matchedKeys: [],
        cardName: lookup.cardName ?? cardDisplayName(card),
        series: [],
        trend: { sampleCount: 0 },
        sourceNote: "PriceCharting daily snapshots",
        reason: lookup.identityReason ?? "no_identity_bundle",
        emptyReason: "no_identity",
      });
    }

    const snapshots = await priceWarehouseStore.listSnapshotsByIdentityKeys(
      lookup.lookupKeys,
    );
    const matchedKeys = [...new Set(snapshots.map((s) => s.identityKey))];

    const displayKey =
      lookup.requestedIdentityKey ?? lookup.lookupKeys[0] ?? matchedKeys[0] ?? "";

    const emptyReason =
      snapshots.length === 0
        ? describePriceHistoryEmptyReason({
            requestedIdentityKey: lookup.requestedIdentityKey,
            lookupKeys: lookup.lookupKeys,
            matchedKeys,
          })
        : undefined;

    const history = buildCardPriceHistoryResponse({
      identityKey: displayKey,
      requestedIdentityKey: lookup.requestedIdentityKey ?? undefined,
      lookupKeys: lookup.lookupKeys,
      matchedKeys,
      emptyReason,
      cardName: lookup.cardName ?? cardDisplayName(card),
      snapshots,
    });

    return jsonOk(history);
  } catch (err) {
    return handleRouteError(err);
  }
}
