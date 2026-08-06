import { NextRequest } from "next/server";
import { dataStore } from "@/lib/storage/data-store";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { DEFAULT_STORE_ID } from "@/lib/firebase/collections";
import {
  createManualMarketComp,
  type ManualMarketComp,
  type ManualMarketCompSource,
} from "@/lib/card-flow-v2/market/manual-market-comp";
import { refreshCardAfterManualComps } from "@/lib/card-flow-v2/market/refresh-card-after-manual-comps";

const VALID_SOURCES: ManualMarketCompSource[] = [
  "ebay_sold_manual",
  "tcgplayer_manual",
  "pricecharting_manual",
  "other",
];

async function cardStoreId(cardId: string): Promise<string | null> {
  const card = await dataStore.getCard(cardId);
  if (!card) return null;
  const order = await dataStore.getOrder(card.orderId);
  if (!order) return null;
  return order.storeId?.trim() || DEFAULT_STORE_ID;
}

export async function GET(
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

  const card = await dataStore.getCard(cardId);
  if (!card) return jsonError("Card not found", 404);

  return jsonOk({ manualComps: card.cardFlowV2ManualComps ?? [] });
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

  try {
    const body = (await req.json()) as {
      source?: ManualMarketCompSource;
      url?: string;
      title?: string;
      soldPrice?: number;
      shipping?: number;
      soldDate?: string;
      condition?: string;
      gradeCompany?: string;
      grade?: string;
      accepted?: boolean;
      rejectionReason?: string;
      notes?: string;
      suspectId?: string;
    };

    if (!body.title?.trim()) return jsonError("title is required");
    if (body.soldPrice == null || Number.isNaN(body.soldPrice)) {
      return jsonError("soldPrice is required");
    }
    if (!body.source || !VALID_SOURCES.includes(body.source)) {
      return jsonError("Valid source is required");
    }

    const card = await dataStore.getCard(cardId);
    if (!card) return jsonError("Card not found", 404);

    const comp = createManualMarketComp({
      source: body.source,
      url: body.url?.trim(),
      title: body.title.trim(),
      soldPrice: body.soldPrice,
      shipping: body.shipping,
      soldDate: body.soldDate,
      condition: body.condition,
      gradeCompany: body.gradeCompany,
      grade: body.grade,
      accepted: body.accepted !== false,
      rejectionReason: body.rejectionReason,
      notes: body.notes,
      suspectId: body.suspectId,
      reviewedBy: auth.email,
    });

    const manualComps = [...(card.cardFlowV2ManualComps ?? []), comp];

    const [settings, rules] = await Promise.all([
      dataStore.getSettings(storeId),
      dataStore.getActiveRules(storeId),
    ]);

    const updated = refreshCardAfterManualComps({
      card: { ...card, cardFlowV2ManualComps: manualComps },
      settings,
      rules,
    });

    await dataStore.saveCard(updated);

    await dataStore.logAdminAction({
      action: "card_manual_comp_added",
      cardId,
      orderId: card.orderId,
      storeId,
      submittedBy: auth.email,
      manualCompId: comp.id,
      accepted: comp.accepted,
    });

    return jsonOk({ card: updated, comp });
  } catch (err) {
    return handleRouteError(err);
  }
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

  try {
    const body = (await req.json()) as {
      compId?: string;
      accepted?: boolean;
      rejectionReason?: string;
      notes?: string;
    };

    if (!body.compId) return jsonError("compId is required");

    const card = await dataStore.getCard(cardId);
    if (!card) return jsonError("Card not found", 404);

    const existing = card.cardFlowV2ManualComps ?? [];
    const idx = existing.findIndex((c) => c.id === body.compId);
    if (idx < 0) return jsonError("Manual comp not found", 404);

    const prev = existing[idx]!;
    const updatedComp: ManualMarketComp = {
      ...prev,
      accepted: body.accepted ?? prev.accepted,
      rejectionReason:
        body.accepted === false
          ? body.rejectionReason ?? prev.rejectionReason ?? "Rejected by staff"
          : body.rejectionReason,
      notes: body.notes ?? prev.notes,
      reviewedBy: auth.email,
      reviewedAt: new Date().toISOString(),
    };

    const manualComps = [...existing];
    manualComps[idx] = updatedComp;

    const [settings, rules] = await Promise.all([
      dataStore.getSettings(storeId),
      dataStore.getActiveRules(storeId),
    ]);

    const updated = refreshCardAfterManualComps({
      card: { ...card, cardFlowV2ManualComps: manualComps },
      settings,
      rules,
    });

    await dataStore.saveCard(updated);

    return jsonOk({ card: updated, comp: updatedComp });
  } catch (err) {
    return handleRouteError(err);
  }
}
