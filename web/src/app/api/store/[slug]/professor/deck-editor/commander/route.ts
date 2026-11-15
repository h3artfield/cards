import { NextRequest } from "next/server";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { resolveHandDeckCommanderV1 } from "@/lib/professor-deck-editor/hand-deck-commander-v1";
import { getEditableDeckV1, swapEditableDeckCommanderV1 } from "@/lib/professor-deck-editor/store-v1";
import { authorizeDeckEditorV1 } from "../authorize";
import { deckIdFromRequestV1 } from "../deck-key";

/** Swap the deck's commander. Body: `{ commanderName }`. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const deckId = deckIdFromRequestV1(req, auth.customerId);
    if (!deckId) return jsonError("buildId or deckId required", 400);
    const existing = await getEditableDeckV1(deckId);
    if (!existing || existing.customerId !== auth.customerId || existing.storeSlug !== slug) {
      return jsonError("Deck not found", 404);
    }

    const body = (await req.json().catch(() => ({}))) as { commanderName?: string };
    const resolved = await resolveHandDeckCommanderV1(body.commanderName ?? "");
    if (!resolved.ok) return jsonError(resolved.message, 400);

    const deck = await swapEditableDeckCommanderV1({
      deckId,
      customerId: auth.customerId,
      commander: resolved.commander,
    });
    if (!deck) return jsonError("Deck not found", 404);
    return jsonOk({ deckId: deck.deckId, commander: deck.commander });
  } catch (err) {
    return handleRouteError(err);
  }
}
