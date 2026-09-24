import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import { withBinderDeckHints } from "@/lib/collection/collection-binder-hints";
import { parseCollectionGame, type CollectionGame } from "@/lib/collection/collection-game";
import { importCollectionText } from "@/lib/collection/collection-import";

async function readImportPayload(req: NextRequest): Promise<{
  text: string;
  game: CollectionGame;
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const text = file instanceof File ? await file.text() : form.get("text");
    return {
      text: typeof text === "string" ? text : "",
      game: parseCollectionGame(form.get("game")),
    };
  }
  const body = (await req.json().catch(() => ({}))) as { text?: string; game?: string };
  return { text: body.text ?? "", game: parseCollectionGame(body.game) };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const payload = await readImportPayload(req);
    const text = payload.text.trim();
    if (!text) return jsonError("Paste a list or upload a collection file");

    const summary = await importCollectionText({
      storeId: context.store.id,
      customerId: context.customer.id,
      text,
      game: payload.game,
    });

    return jsonOk({
      locked: summary.locked,
      needsReview: summary.needsReview,
      unmatched: summary.unmatched,
      cards: await withBinderDeckHints(summary.cards),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
