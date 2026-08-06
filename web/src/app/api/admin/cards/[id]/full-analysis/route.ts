import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { runFullCardAnalysis } from "@/lib/processing/full-analysis";
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
  if (auth.role === "platform" && auth.activeStoreId && auth.activeStoreId !== storeId) {
    return jsonError("Forbidden", 403);
  }

  const card = await dataStore.getCard(id);
  if (!card) return jsonError("Card not found", 404);

  try {
    const [rules, settings] = await Promise.all([
      dataStore.getActiveRules(storeId),
      dataStore.getSettings(storeId),
    ]);
    const result = await runFullCardAnalysis(card, {
      rules,
      settings,
    });
    const updated = await dataStore.saveCard(result.card);
    await dataStore.logAdminAction({
      action: "full_analysis",
      cardId: id,
      orderId: card.orderId,
      identityVerdict: result.identityVerification.verdict,
      estimatedGrade: result.conditionReport.estimatedGrade,
      recommendation: result.resaleAnalysis.recommendation,
    });
    return jsonOk({ ...result, card: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
