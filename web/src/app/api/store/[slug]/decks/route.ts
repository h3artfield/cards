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

    /**
     * Settled rather than all: these are two independent collections, and a
     * missing index on one of them used to take down the whole page. A customer
     * losing sight of decks they could see yesterday is far worse than a
     * customer seeing most of them with a note about the rest.
     */
    const [editable, saved] = await Promise.allSettled([
      listEditableDecksV1({ customerId: auth.customerId!, storeSlug: slug }),
      listCustomerSavedDecks({ customerId: auth.customerId!, storeSlug: slug }),
    ]);

    const partial: string[] = [];
    if (editable.status === "rejected") {
      console.error("[decks] editable deck query failed", editable.reason);
      partial.push("decks you started by hand");
    }
    if (saved.status === "rejected") {
      console.error("[decks] saved deck query failed", saved.reason);
      partial.push("decks the Professor built");
    }

    // Both gone means the failure is not partial, and pretending otherwise
    // would show an empty shelf as though the customer owned nothing.
    if (editable.status === "rejected" && saved.status === "rejected") {
      throw editable.reason;
    }

    return jsonOk({
      decks: mergeCustomerDeckListV1({
        editableDecks: editable.status === "fulfilled" ? editable.value : [],
        savedDecks: saved.status === "fulfilled" ? saved.value : [],
      }),
      partialFailure: partial.length ? `Could not load ${partial.join(" or ")}.` : null,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
