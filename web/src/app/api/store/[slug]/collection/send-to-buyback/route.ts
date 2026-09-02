import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { customerCanSubmit } from "@/lib/auth/customer-auth";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import { sendCollectionCardsToBuyback } from "@/lib/collection/send-to-buyback";
import { resolveStoreCustomerSettings } from "@/lib/customer-auth-config";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const settings = resolveStoreCustomerSettings(context.store);
    if (!customerCanSubmit(context.customer, settings.emailVerificationMode)) {
      return jsonError(
        "Verify your email before sending cards to the store",
        403,
      );
    }

    const body = (await req.json()) as { cardIds?: unknown };
    const cardIds = Array.isArray(body.cardIds)
      ? body.cardIds.filter((id): id is string => typeof id === "string")
      : [];
    if (!cardIds.length) {
      return jsonError("Select at least one card");
    }

    const result = await sendCollectionCardsToBuyback({
      store: context.store,
      customer: context.customer,
      cardIds,
    });

    return jsonOk(
      {
        order: result.order,
        cardCount: result.cards.length,
        skipped: result.skipped,
      },
      201,
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
