import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import {
  customerOwnsOrder,
  requireCustomerSession,
} from "@/lib/auth/customer-auth";
import { isOrderLockedForScanning } from "@/lib/customer-order-display";
import { dataStore } from "@/lib/storage/data-store";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import type { ItemType, ScannedCard } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const session = requireCustomerSession(req);
    if (session instanceof NextResponse) return session;

    const body = await req.json();
    const { orderId, itemType, frontImageUrl, backImageUrl } = body as {
      orderId: string;
      itemType: ItemType;
      frontImageUrl: string;
      backImageUrl?: string;
    };

    if (!orderId || !itemType || !frontImageUrl) {
      return jsonError("Missing required card fields");
    }

    const order = await dataStore.getOrder(orderId);
    if (!order) return jsonError("Order not found", 404);
    if (!customerOwnsOrder(session, order)) {
      return jsonError("Forbidden", 403);
    }
    if (isOrderLockedForScanning(order.status)) {
      return jsonError("This order is no longer accepting cards", 409);
    }

    const front = frontImageUrl.trim();
    const back = backImageUrl?.trim() ?? "";
    const existing = await dataStore.getCardsByOrder(orderId);
    const duplicate = existing.find(
      (c) => c.frontImageUrl === front && (c.backImageUrl ?? "") === back,
    );
    if (duplicate) {
      return jsonOk({ card: duplicate, duplicate: true });
    }

    const card: ScannedCard = {
      id: uuidv4(),
      orderId,
      frontImageUrl,
      backImageUrl: backImageUrl?.trim() ?? "",
      itemType,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const saved = await dataStore.saveCard(card);

    if (order.status === "draft") {
      await dataStore.saveOrder({ ...order, status: "scanning" });
    }

    return jsonOk({ card: saved });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return jsonError("Card id required");

    const card = await dataStore.getCard(id);
    if (!card) return jsonError("Card not found", 404);

    const order = await dataStore.getOrder(card.orderId);
    if (!order) return jsonError("Order not found", 404);
    if ((order.storeId?.trim() || scope.storeId) !== scope.storeId) {
      return jsonError("Card belongs to another store", 403);
    }

    const updated = { ...card, ...updates, id: card.id };
    await dataStore.saveCard(updated);
    return jsonOk({ card: updated });
  } catch (err) {
    return handleRouteError(err);
  }
}
