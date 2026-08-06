import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { buildCardPatchFromCatalog } from "@/lib/processing/identity-recovery";
import { applyMarketPricing } from "@/lib/processing/apply-market-pricing";
import { runFullCardAnalysis } from "@/lib/processing/full-analysis";
import { priceChartingProductUrl } from "@/lib/processing/pricing/pricecharting-utils";
import type { PriceChartingProduct } from "@/lib/processing/pricing/pricecharting-pricing";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";

async function cardStoreId(cardId: string): Promise<string | null> {
  const card = await dataStore.getCard(cardId);
  if (!card) return null;
  const order = await dataStore.getOrder(card.orderId);
  if (!order) return null;
  return order.storeId?.trim() || DEFAULT_STORE_ID;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdminSession(req);
  if (auth instanceof Response) return auth;

  const { id } = await params;
  const storeId = await cardStoreId(id);
  if (!storeId) return jsonError("Card not found", 404);
  if (auth.role === "store" && auth.storeId !== storeId) {
    return jsonError("Forbidden", 403);
  }
  if (
    auth.role === "platform" &&
    auth.activeStoreId &&
    auth.activeStoreId !== storeId
  ) {
    return jsonError("Forbidden", 403);
  }

  const card = await dataStore.getCard(id);
  if (!card) return jsonError("Card not found", 404);

  try {
    const body = await req.json();
    const raw = body.raw as PriceChartingProduct | undefined;
    if (!raw?.["product-name"]) {
      return jsonError("raw product is required");
    }

    const sourceUrl =
      body.sourceUrl?.trim() ||
      priceChartingProductUrl(raw) ||
      undefined;

    const [rules, settings] = await Promise.all([
      dataStore.getActiveRules(storeId),
      dataStore.getSettings(storeId),
    ]);

    const patch = await buildCardPatchFromCatalog(card, {
      raw: raw as unknown as Record<string, unknown>,
      source: "pricecharting",
      sourceUrl,
    });

    let updated = { ...card, ...patch };
    updated = applyMarketPricing(updated, settings, rules);
    await dataStore.saveCard(updated);

    const result = await runFullCardAnalysis(updated, { rules, settings });
    const saved = await dataStore.saveCard(result.card);
    await dataStore.logAdminAction({
      action: "apply_catalog",
      cardId: id,
      orderId: card.orderId,
      productName: raw["product-name"],
    });

    return jsonOk({ ...result, card: saved });
  } catch (err) {
    return handleRouteError(err);
  }
}
