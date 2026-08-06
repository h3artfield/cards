import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";
import {
  applyManualStaffPrintingEntry,
  applyStaffSuspectSelection,
  getStaffSelectedSuspect,
  type ManualPrintingEntry,
} from "@/lib/card-flow-v2/staff-suspect-selection";
import { markStaffConfirmationCleared } from "@/lib/card-flow-v2/staff-confirmation-preservation";
import { applyStaffConfirmedVariantResolution } from "@/lib/card-flow-v2/variant-uncertainty";
import { isCardFlowV2StaffConfirmationEnabled } from "@/lib/card-flow-v2/feature-flag";
import { clearStaffConfirmedMarket } from "@/lib/card-flow-v2/market/promote-staff-confirmed-market";
import { applyStaffConfirmPricingRefresh } from "@/lib/card-flow-v2/staff-confirm-pricing";
import { stampCardFlowV2Bundles } from "@/lib/card-flow-v2/version-metadata";

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
    const body = (await req.json()) as {
      suspectId?: string | null;
      notes?: string;
      refreshMarket?: boolean;
      manualEntry?: ManualPrintingEntry;
    };

    const card = await dataStore.getCard(cardId);
    if (!card) return jsonError("Card not found", 404);
    if (!card.cardFlowV2Identity) {
      return jsonError("No V2 identity bundle on this card", 400);
    }

    const [settings, rules] = await Promise.all([
      dataStore.getSettings(storeId),
      dataStore.getRules(storeId),
    ]);

    let cardFlowV2Identity = card.cardFlowV2Identity;
    let cardFlowV2Market = card.cardFlowV2Market;
    const clearing = body.suspectId == null || body.suspectId === "";

    if (clearing) {
      if (!isCardFlowV2StaffConfirmationEnabled()) {
        return jsonError("Staff confirmation is disabled", 403);
      }
      cardFlowV2Identity = markStaffConfirmationCleared(
        cardFlowV2Identity,
        "cleared_by_staff",
        "Staff cleared suspect confirmation via admin UI.",
      );
      if (cardFlowV2Market) {
        cardFlowV2Market = clearStaffConfirmedMarket(cardFlowV2Market);
      }
    } else {
      if (!isCardFlowV2StaffConfirmationEnabled()) {
        return jsonError("Staff confirmation is disabled", 403);
      }
      if (body.manualEntry) {
        cardFlowV2Identity = applyManualStaffPrintingEntry(cardFlowV2Identity, {
          ...body.manualEntry,
          notes: body.notes ?? body.manualEntry.notes,
          confirmedBy: auth.email,
          imageRefs: {
            frontImageUrl: card.frontImageUrl,
            backImageUrl: card.backImageUrl,
          },
        });
      } else {
        cardFlowV2Identity = applyStaffSuspectSelection(cardFlowV2Identity, {
          suspectId: body.suspectId!,
          confirmedBy: auth.email,
          notes: body.notes,
          imageRefs: {
            frontImageUrl: card.frontImageUrl,
            backImageUrl: card.backImageUrl,
          },
        });
      }
      cardFlowV2Identity = applyStaffConfirmedVariantResolution(
        cardFlowV2Identity,
        card.cardFlowV2Evidence,
      );
    }

    const pricing = await applyStaffConfirmPricingRefresh({
      card,
      identity: cardFlowV2Identity,
      market: cardFlowV2Market,
      evidence: card.cardFlowV2Evidence,
      settings,
      rules,
      confirmedBy: auth.email,
      manualRefresh: body.refreshMarket === true,
      clearConfirmation: clearing,
    });

    cardFlowV2Identity = pricing.cardFlowV2Identity;
    cardFlowV2Market = pricing.cardFlowV2Market;

    const stamped = stampCardFlowV2Bundles(
      {
        evidence: card.cardFlowV2Evidence,
        identity: cardFlowV2Identity,
        market: cardFlowV2Market,
        audit: pricing.cardFlowV2Audit,
        offerPreview: pricing.cardFlowV2OfferPreview,
      },
      cardFlowV2Identity.category ?? card.category,
    );

    const updated = pricing.cardWithProduction ?? {
      ...card,
      cardFlowV2VersionMetadata: stamped.cardFlowV2VersionMetadata,
      cardFlowV2Identity: stamped.identity!,
      cardFlowV2Market: stamped.market,
      cardFlowV2Audit: stamped.audit,
      cardFlowV2OfferPreview: stamped.offerPreview,
    };
    await dataStore.saveCard(updated);

    await dataStore.logAdminAction({
      action: "card_v2_suspect_selection",
      cardId,
      orderId: card.orderId,
      storeId,
      submittedBy: auth.email,
      suspectId: body.suspectId ?? null,
    });

    const suspect = getStaffSelectedSuspect(cardFlowV2Identity);

    return jsonOk({
      card: updated,
      cardFlowV2Identity,
      cardFlowV2Market,
      cardFlowV2Audit: pricing.cardFlowV2Audit,
      cardFlowV2OfferPreview: pricing.cardFlowV2OfferPreview,
      staffMarketPromotion: pricing.staffMarketPromotion,
      productionUnchanged: pricing.productionUnchanged,
      productionFields: pricing.productionFields,
      v2InfluenceApplied: pricing.v2InfluenceApplied,
      v2InfluenceReason: pricing.v2InfluenceReason,
      confirmedSuspect: suspect
        ? { suspectId: suspect.suspectId, label: suspect.label }
        : null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
