import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";
import { runAdminV2ShadowReprocess } from "@/lib/card-flow-v2/admin-v2-reprocess";
import { isCardFlowV2EvidenceEnabled } from "@/lib/card-flow-v2/feature-flag";
import { ProductionFieldMutationError } from "@/lib/card-flow-v2/shadow-v2-reprocess";

async function cardStoreId(cardId: string): Promise<string | null> {
  const card = await dataStore.getCard(cardId);
  if (!card) return null;
  const order = await dataStore.getOrder(card.orderId);
  if (!order) return null;
  return order.storeId?.trim() || DEFAULT_STORE_ID;
}

/** Cloud/staging V2 shadow reprocess — never mutates production offer fields. */
export async function POST(
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
  if (
    auth.role === "platform" &&
    auth.activeStoreId &&
    auth.activeStoreId !== storeId
  ) {
    return jsonError("Forbidden", 403);
  }

  if (!isCardFlowV2EvidenceEnabled()) {
    return jsonError(
      "CARD_FLOW_V2_EVIDENCE_ENABLED must be true for V2 shadow reprocess",
      503,
    );
  }

  try {
    const card = await dataStore.getCard(cardId);
    if (!card) return jsonError("Card not found", 404);

    const [settings, rules] = await Promise.all([
      dataStore.getSettings(storeId),
      dataStore.getActiveRules(storeId),
    ]);

    const { card: updated, summary } = await runAdminV2ShadowReprocess({
      card,
      settings,
      rules,
    });

    await dataStore.saveCard(updated);

    await dataStore.logAdminAction({
      action: "card_v2_shadow_reprocess",
      cardId,
      orderId: card.orderId,
      storeId,
      submittedBy: auth.email,
      productionUnchanged: summary.productionUnchanged,
    });

    return jsonOk({ card: updated, summary });
  } catch (err) {
    if (err instanceof ProductionFieldMutationError) {
      return jsonError(err.message, 409);
    }
    return handleRouteError(err);
  }
}
