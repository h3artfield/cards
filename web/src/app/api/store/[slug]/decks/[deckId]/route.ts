import { NextRequest } from "next/server";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { deleteCustomerDeckV1 } from "@/lib/professor-deck-editor/delete-deck-v1";
import type { CustomerDeckOriginV1 } from "@/lib/professor-deck-editor/deck-list-v1";
import { authorizeDeckEditorV1 } from "../../professor/deck-editor/authorize";

/**
 * Remove a deck from the customer's shelf at this store.
 *
 * Hand-built decks live only in editable storage. Professor builds may have a
 * saved record, an editable copy, or both — delete clears every piece that
 * belongs to this customer.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; deckId: string }> },
) {
  try {
    const { slug, deckId } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const body = (await req.json().catch(() => ({}))) as {
      origin?: CustomerDeckOriginV1;
      listKey?: string;
    };
    if (body.origin !== "hand" && body.origin !== "professor") {
      return jsonError("origin must be hand or professor", 400);
    }
    const listKey = body.listKey?.trim() || deckId;

    const result = await deleteCustomerDeckV1({
      customerId: auth.customerId!,
      deckId,
      origin: body.origin,
      listKey,
    });
    if (!result.ok) return jsonError(result.message, 404);
    return jsonOk({ deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
