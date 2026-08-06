import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";
import { applyStaffCorrection, runCardAuditV2 } from "@/lib/card-flow-v2/audit/run-card-audit-v2";
import type { V2StaffCorrection, V2StaffReviewStatus } from "@/lib/card-flow-v2/audit/types";

const VALID_STATUSES: V2StaffReviewStatus[] = [
  "not_reviewed",
  "staff_confirmed_v2",
  "staff_confirmed_current",
  "staff_corrected_identity",
  "staff_corrected_value",
  "staff_requested_rescan",
  "staff_manual_price",
];

async function cardStoreId(cardId: string): Promise<string | null> {
  const card = await dataStore.getCard(cardId);
  if (!card) return null;
  const order = await dataStore.getOrder(card.orderId);
  if (!order) return null;
  return order.storeId?.trim() || DEFAULT_STORE_ID;
}

export async function PATCH(
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
    const body = (await req.json()) as { staffCorrection?: Partial<V2StaffCorrection> };
    const incoming = body.staffCorrection;
    if (!incoming?.status || !VALID_STATUSES.includes(incoming.status)) {
      return jsonError("Valid staffCorrection.status is required");
    }

    const card = await dataStore.getCard(cardId);
    if (!card) return jsonError("Card not found", 404);

    const baseAudit =
      card.cardFlowV2Audit ??
      runCardAuditV2({ card });

    const staffCorrection: V2StaffCorrection = {
      status: incoming.status,
      correctedCategory: incoming.correctedCategory,
      correctedName: incoming.correctedName,
      correctedSetName: incoming.correctedSetName,
      correctedSetCode: incoming.correctedSetCode,
      correctedCardNumber: incoming.correctedCardNumber,
      correctedVariant: incoming.correctedVariant,
      correctedGradeContext: incoming.correctedGradeContext,
      correctedMarketValue: incoming.correctedMarketValue,
      notes: incoming.notes,
      reviewedAt: new Date().toISOString(),
      reviewedBy: auth.email,
    };

    const cardFlowV2Audit = applyStaffCorrection(baseAudit, staffCorrection);
    const updated = { ...card, cardFlowV2Audit };
    await dataStore.saveCard(updated);

    await dataStore.logAdminAction({
      action: "card_v2_audit_review",
      cardId,
      orderId: card.orderId,
      storeId,
      submittedBy: auth.email,
      status: incoming.status,
    });

    return jsonOk({ card: updated, cardFlowV2Audit });
  } catch (err) {
    return handleRouteError(err);
  }
}
