import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { listCustomerSavedDecks } from "@/lib/customer-saved-decks/customer-saved-deck-store";
import { mergeCustomerDeckListV1 } from "@/lib/professor-deck-editor/deck-list-v1";
import { listEditableDecksV1 } from "@/lib/professor-deck-editor/store-v1";
import { authorizeDeckEditorV1 } from "../professor/deck-editor/authorize";

/**
 * Every deck this customer has at this store, however it was made.
 *
 * Merged server-side rather than in the page, because "which collection is this
 * deck in" is a storage detail and the answer differs per deck.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const [editableDecks, savedDecks] = await Promise.all([
      listEditableDecksV1({ customerId: auth.customerId!, storeSlug: slug }),
      listCustomerSavedDecks({ customerId: auth.customerId!, storeSlug: slug }),
    ]);

    return jsonOk({ decks: mergeCustomerDeckListV1({ editableDecks, savedDecks }) });
  } catch (err) {
    return handleRouteError(err);
  }
}
