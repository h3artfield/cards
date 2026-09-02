import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import {
  processOrderCards,
  resolveOrderStatus,
} from "@/lib/processing/process-order";
import {
  requireAdminSession,
  requireStoreScope,
} from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";
import { notifyOfferReady } from "@/lib/processing/notifications";
import { sendBuybackCompletionReceipt } from "@/lib/receipts/send-receipts";
import { analyzeCardResale } from "@/lib/processing/resale-analysis";
import { runFullCardAnalysis } from "@/lib/processing/full-analysis";
import { isCardIncludedInClerkOffer } from "@/lib/processing/card-buy-decision";
import { refreshCardMarketData } from "@/lib/processing/refresh-pricing";
import { applyStaffOfferEditToCard } from "@/lib/card-flow-v2/apply-staff-offer-edit";
import {
  cancelBuybackSale,
  completeBuybackPurchase,
  reopenBuybackOrder,
  type CompleteBuybackResult,
} from "@/lib/processing/complete-buyback";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdminSession(req);
  if (auth instanceof Response) return auth;
  const scope = requireStoreScope(auth, req);
  if (scope instanceof Response) return scope;

  const { id } = await params;
  const order = await dataStore.getOrder(id);
  if (!order) return jsonError("Order not found", 404);
  if ((order.storeId?.trim() || DEFAULT_STORE_ID) !== scope.storeId) {
    return jsonError("Forbidden", 403);
  }

  const body = await req.json();
  const { action, cardUpdates, cardDeleteIds, adminNotes, sendNotification } = body;

  if (cardDeleteIds?.length) {
    for (const cardId of cardDeleteIds as string[]) {
      const card = await dataStore.getCard(cardId);
      if (!card || card.orderId !== id) continue;
      await dataStore.deleteCard(cardId);
      await dataStore.logAdminAction({
        action: "delete_card",
        orderId: id,
        cardId,
      });
    }
  }

  if (cardUpdates?.length) {
    const [rules, settings] = await Promise.all([
      dataStore.getActiveRules(scope.storeId),
      dataStore.getSettings(scope.storeId),
    ]);

    for (const update of cardUpdates) {
      const card = await dataStore.getCard(update.id);
      if (!card) continue;

      let merged = { ...card, ...update, id: card.id };
      merged = await applyStaffOfferEditToCard({
        card,
        update,
        settings,
        rules,
      });

      await dataStore.saveCard(merged);
      await dataStore.logAdminAction({
        action: "edit_card",
        orderId: id,
        cardId: card.id,
        changes: update,
      });
    }
  }

  if (cardDeleteIds?.length || cardUpdates?.length) {
    const cards = await dataStore.getCardsByOrder(id);
    const rules = await dataStore.getActiveRules(scope.storeId);
    const eligible = cards.filter((c) =>
      isCardIncludedInClerkOffer(c, rules),
    );
    order.totalMarketEstimate = eligible.reduce(
      (s, c) => s + (c.marketPrice ?? 0),
      0,
    );
    order.totalCashOffer = eligible.reduce((s, c) => s + (c.cashOffer ?? 0), 0);
    order.totalTradeOffer = eligible.reduce(
      (s, c) => s + (c.tradeOffer ?? 0),
      0,
    );
    order.manualReviewCount = cards.filter(
      (c) => c.status === "manual_review" || c.status === "do_not_buy",
    ).length;
  }

  if (action === "reprocess") {
    const cards = (await dataStore.getCardsByOrder(id)).map((c) => ({
      ...c,
      staffDecision: undefined,
      status: "processing" as const,
    }));
    const settings = await dataStore.getSettings(scope.storeId);
    const rules = await dataStore.getActiveRules(scope.storeId);
    const { cards: processed, orderTotals } = await processOrderCards(
      cards,
      settings,
      rules,
    );
    for (const card of processed) {
      await dataStore.saveCard(card);
    }
    Object.assign(order, orderTotals);
    order.status = resolveOrderStatus(
      orderTotals.manualReviewCount ?? 0,
      processed.length,
    );
    order.reviewedAt = new Date().toISOString();
  } else if (action === "analyze_resale") {
    const cards = await dataStore.getCardsByOrder(id);
    const cardIds: string[] = body.cardIds ?? cards.map((c) => c.id);
    const [rules, settings] = await Promise.all([
      dataStore.getActiveRules(scope.storeId),
      dataStore.getSettings(scope.storeId),
    ]);
    for (const cardId of cardIds) {
      const card = cards.find((c) => c.id === cardId);
      if (!card) continue;
      try {
        if (body.full === true) {
          const result = await runFullCardAnalysis(card, {
            rules,
            settings,
          });
          await dataStore.saveCard(result.card);
        } else {
          const refreshed = await refreshCardMarketData(card, { rules, settings });
          const analysis = await analyzeCardResale(refreshed);
          await dataStore.saveCard({ ...refreshed, resaleAnalysis: analysis });
        }
      } catch (err) {
        console.error(`[analyze_resale] card ${cardId}:`, err);
      }
    }
  } else if (action === "complete_purchase") {
    if (body.offerType !== "cash" && body.offerType !== "trade") {
      return jsonError("offerType must be cash or trade");
    }
    const cards = await dataStore.getCardsByOrder(id);
    let completed: CompleteBuybackResult;
    try {
      completed = await completeBuybackPurchase(
        order,
        cards,
        body.offerType,
        scope.storeId,
      );
      Object.assign(order, completed.order);
      await dataStore.logAdminAction({
        action: "complete_purchase",
        orderId: id,
        offerType: body.offerType,
        amount: completed.transaction.amount,
        cardCount: completed.transaction.cardCount,
      });
    } catch (err) {
      return jsonError(
        err instanceof Error ? err.message : "Could not complete purchase",
        400,
      );
    }

    // The payout already happened; a receipt problem must not report failure.
    const settings = await dataStore.getSettings(scope.storeId);
    await sendBuybackCompletionReceipt({
      storeId: scope.storeId,
      storeName: settings.storeName,
      customerId: order.customerId,
      orderId: id,
      orderNumber: order.orderNumber,
      offerType: body.offerType,
      amount: completed.transaction.amount,
      cardCount: completed.transaction.cardCount,
    });
  } else if (action === "cancel_sale") {
    try {
      const result = await cancelBuybackSale(order, scope.storeId);
      Object.assign(order, result.order);
      await dataStore.logAdminAction({ action: "cancel_sale", orderId: id });
    } catch (err) {
      return jsonError(
        err instanceof Error ? err.message : "Could not cancel sale",
        400,
      );
    }
  } else if (action === "reopen_order") {
    const employeeName =
      typeof body.employeeName === "string" ? body.employeeName.trim() : "";
    if (!employeeName) {
      return jsonError("Employee name is required to reopen an order", 400);
    }
    const cards = await dataStore.getCardsByOrder(id);
    try {
      const reopened = await reopenBuybackOrder(
        order,
        cards,
        employeeName,
        scope.storeId,
      );
      Object.assign(order, reopened);
    } catch (err) {
      return jsonError(
        err instanceof Error ? err.message : "Could not reopen order",
        400,
      );
    }
  } else if (action === "offer_ready") {
    order.status = "offer_ready";
    order.reviewedAt = new Date().toISOString();
    if (body.offerType === "cash" || body.offerType === "trade") {
      order.offerType = body.offerType;
    }
  } else if (action === "approve") {
    order.status = "offer_ready";
    order.reviewedAt = new Date().toISOString();
  } else if (body.status) {
    order.status = body.status;
  }

  if (adminNotes != null) order.adminNotes = adminNotes;

  await dataStore.saveOrder(order);
  await dataStore.logAdminAction({ action: action ?? "update_order", orderId: id, body });

  if (sendNotification || action === "offer_ready" || action === "approve") {
    const customer = await dataStore.getCustomer(order.customerId);
    const settings = await dataStore.getSettings(scope.storeId);
    if (customer && settings.emailNotificationsEnabled) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      await notifyOfferReady(customer, order, settings.storeName, appUrl);
    }
  }

  const cards = await dataStore.getCardsByOrder(id);
  const customer = await dataStore.getCustomer(order.customerId);
  return jsonOk({ order, cards, customer });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireAdminSession(req);
  if (auth instanceof Response) return auth;
  const scope = requireStoreScope(auth, req);
  if (scope instanceof Response) return scope;

  const { id } = await params;
  const order = await dataStore.getOrder(id);
  if (order && (order.storeId?.trim() || DEFAULT_STORE_ID) !== scope.storeId) {
    return jsonError("Forbidden", 403);
  }

  const body = await req.json();

  if (body.seedDemo) {
    return jsonOk({ message: "Use customer flow to create orders" });
  }

  return jsonError("Unknown action");
}
