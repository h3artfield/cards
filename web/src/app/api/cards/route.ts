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
    const {
      orderId,
      itemType,
      frontImageUrl,
      backImageUrl,
      category,
      detectedName,
      setName,
      setCode,
      cardNumber,
      catalogSource,
      catalogId,
      scanMatchDistance,
      allowDuplicate,
    } = body as {
      orderId: string;
      itemType: ItemType;
      frontImageUrl: string;
      backImageUrl?: string;
      category?: ScannedCard["category"];
      detectedName?: string;
      setName?: string;
      setCode?: string;
      cardNumber?: string;
      catalogSource?: ScannedCard["catalogSource"];
      catalogId?: string;
      scanMatchDistance?: number;
      allowDuplicate?: boolean;
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
    if (!allowDuplicate) {
      const existing = await dataStore.getCardsByOrder(orderId);
      const duplicate = existing.find(
        (c) => c.frontImageUrl === front && (c.backImageUrl ?? "") === back,
      );
      if (duplicate) {
        return jsonOk({ card: duplicate, duplicate: true });
      }
    }

    const card: ScannedCard = {
      id: uuidv4(),
      orderId,
      frontImageUrl,
      backImageUrl: backImageUrl?.trim() ?? "",
      itemType,
      ...(category ? { category } : {}),
      ...(detectedName?.trim() ? { detectedName: detectedName.trim() } : {}),
      ...(setName?.trim() ? { setName: setName.trim() } : {}),
      ...(setCode?.trim() ? { setCode: setCode.trim() } : {}),
      ...(cardNumber?.trim() ? { cardNumber: cardNumber.trim() } : {}),
      ...(catalogSource ? { catalogSource } : {}),
      ...(catalogId?.trim() ? { catalogId: catalogId.trim() } : {}),
      ...(typeof scanMatchDistance === "number" ? { scanMatchDistance } : {}),
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
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return jsonError("Card id required");

    const card = await dataStore.getCard(id);
    if (!card) return jsonError("Card not found", 404);

    const order = await dataStore.getOrder(card.orderId);
    if (!order) return jsonError("Order not found", 404);

    // Allow the customer who owns the order to switch the card printing while scanning
    const customerSession = requireCustomerSession(req);
    if (!(customerSession instanceof NextResponse) && customerOwnsOrder(customerSession, order)) {
      if (isOrderLockedForScanning(order.status)) {
        return jsonError("This order has already been submitted", 409);
      }
      const allowedCustomerUpdates: Partial<ScannedCard> = {
        ...(typeof updates.detectedName === "string" ? { detectedName: updates.detectedName.trim() } : {}),
        ...(typeof updates.setName === "string" ? { setName: updates.setName.trim() } : {}),
        ...(typeof updates.setCode === "string" ? { setCode: updates.setCode.trim() } : {}),
        ...(typeof updates.cardNumber === "string" ? { cardNumber: updates.cardNumber.trim() } : {}),
        ...(typeof updates.catalogId === "string" ? { catalogId: updates.catalogId.trim() } : {}),
        ...(updates.catalogSource ? { catalogSource: updates.catalogSource } : {}),
        ...(updates.category ? { category: updates.category } : {}),
      };
      const updatedCustomerCard = { ...card, ...allowedCustomerUpdates, id: card.id };
      await dataStore.saveCard(updatedCustomerCard);
      return jsonOk({ card: updatedCustomerCard });
    }

    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

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

export async function DELETE(req: NextRequest) {
  try {
    const session = requireCustomerSession(req);
    if (session instanceof NextResponse) return session;

    const id = req.nextUrl.searchParams.get("id")?.trim();
    if (!id) return jsonError("Card id required");

    const card = await dataStore.getCard(id);
    if (!card) return jsonError("Card not found", 404);

    const order = await dataStore.getOrder(card.orderId);
    if (!order) return jsonError("Order not found", 404);
    if (!customerOwnsOrder(session, order)) {
      return jsonError("Forbidden", 403);
    }
    if (isOrderLockedForScanning(order.status)) {
      return jsonError("This order has already been submitted", 409);
    }

    await dataStore.deleteCard(id);
    return jsonOk({ deleted: id });
  } catch (err) {
    return handleRouteError(err);
  }
}

