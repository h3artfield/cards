import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { analyzeCardResale } from "@/lib/processing/resale-analysis";
import { refreshCardMarketData } from "@/lib/processing/refresh-pricing";
import {
  requireAdminSession,
} from "@/lib/admin-auth";
import {
  jsonOk,
  jsonError,
  handleRouteError,
} from "@/lib/api-utils";
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

  const card = await dataStore.getCard(id);
  if (!card) return jsonError("Card not found", 404);

  try {
    const refreshed = await refreshCardMarketData(card);
    const analysis = await analyzeCardResale(refreshed);
    const updated = await dataStore.saveCard({
      ...refreshed,
      resaleAnalysis: analysis,
    });
    await dataStore.logAdminAction({
      action: "resale_analysis",
      cardId: id,
      orderId: card.orderId,
      recommendation: analysis.recommendation,
      sentiment: analysis.sentiment,
    });
    return jsonOk({ card: updated, analysis });
  } catch (err) {
    return handleRouteError(err);
  }
}
