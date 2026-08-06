import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { dataStore } from "@/lib/storage/data-store";
import { buildCardFeedbackSnapshot } from "@/lib/processing/card-feedback-snapshot";
import { cardDisplayName } from "@/lib/processing/card-display-name";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";
import type { CardFeedback } from "@/lib/types";

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

  try {
    const body = (await req.json()) as { message?: string };
    const message = body.message?.trim();
    if (!message) return jsonError("Feedback message is required");

    const card = await dataStore.getCard(cardId);
    if (!card) return jsonError("Card not found", 404);

    const order = await dataStore.getOrder(card.orderId);
    if (!order) return jsonError("Order not found", 404);

    const settings = await dataStore.getSettings(storeId);

    const feedback: CardFeedback = {
      id: uuidv4(),
      storeId,
      storeName: settings?.storeName,
      orderId: order.id,
      orderNumber: order.orderNumber,
      cardId: card.id,
      cardDisplayName: cardDisplayName(card),
      message,
      submittedByEmail: auth.email,
      submittedByRole: auth.role,
      createdAt: new Date().toISOString(),
      status: "new",
      cardSnapshot: buildCardFeedbackSnapshot(card),
    };

    await dataStore.saveFeedback(feedback);
    await dataStore.logAdminAction({
      action: "card_feedback",
      feedbackId: feedback.id,
      cardId,
      orderId: order.id,
      storeId,
      submittedBy: auth.email,
    });

    return jsonOk({ feedback });
  } catch (err) {
    return handleRouteError(err);
  }
}
