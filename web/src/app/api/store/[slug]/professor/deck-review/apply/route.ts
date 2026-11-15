import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getDeckResolutionCatalogRuntime } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";
import { resolveEditorCardFromCatalogV1 } from "@/lib/professor-deck-editor/catalog-lookup-v1";
import { applyDeckEditOpsV1, type DeckEditOpV1 } from "@/lib/professor-deck-editor/ops-v1";
import { getEditableDeckV1, mutateEditableDeckV1 } from "@/lib/professor-deck-editor/store-v1";
import { normalizeDeckCardNameV1 } from "@/lib/professor-deck-editor/types-v1";
import { authorizeDeckEditorV1 } from "../../deck-editor/authorize";

/** Applies one suggested swap: the cut card goes to the Cut board, the add joins the mainboard. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const body = (await req.json().catch(() => ({}))) as { deckId?: string; cut?: string; add?: string };
    const deckId = body.deckId?.trim();
    const cutName = body.cut?.trim();
    const addName = body.add?.trim();
    if (!deckId || !cutName || !addName) return jsonError("deckId, cut and add required", 400);

    const deck = await getEditableDeckV1(deckId);
    if (!deck || deck.customerId !== auth.customerId || deck.storeSlug !== slug) {
      return jsonError("Deck not found", 404);
    }

    const sameName = (a: string, b: string) => {
      const x = normalizeDeckCardNameV1(a);
      const y = normalizeDeckCardNameV1(b);
      return x === y || x.split(" // ")[0] === y || y.split(" // ")[0] === x;
    };
    const cutCard = deck.cards.find((card) => card.board === "mainboard" && sameName(card.name, cutName));
    if (!cutCard) return jsonError(`${cutName} is no longer in the main deck`, 409);

    const catalog = await getDeckResolutionCatalogRuntime();
    const addFacts = resolveEditorCardFromCatalogV1({ catalog, name: addName });
    if (!addFacts) return jsonError(`Could not find ${addName} in the card catalog`, 422);

    const existing = deck.cards.find(
      (card) => (addFacts.oracleId && card.oracleId === addFacts.oracleId) || sameName(card.name, addFacts.name),
    );
    if (existing?.board === "mainboard") return jsonError(`${addFacts.name} is already in the main deck`, 409);

    const ops: DeckEditOpV1[] = [
      { op: "moveCard", cardKey: cutCard.cardKey, board: "cut" },
      existing
        ? { op: "moveCard", cardKey: existing.cardKey, board: "mainboard" }
        : {
            op: "addCard",
            oracleId: addFacts.oracleId,
            name: addFacts.name,
            board: "mainboard",
            isLand: addFacts.isLand,
          },
    ];

    // Half a swap is worse than none, so the pair is checked before anything is saved.
    const dryRun = applyDeckEditOpsV1({ deck, ops, now: new Date().toISOString() });
    if (dryRun.rejected.length > 0) {
      return jsonError("That swap can't be applied to this deck", 409, { rejected: dryRun.rejected });
    }

    const result = await mutateEditableDeckV1({
      deckId,
      customerId: auth.customerId,
      ops,
      expectedRevision: deck.revision,
    });
    if (!result.ok) return jsonError(result.message, result.failure === "NOT_FOUND" ? 404 : 409);
    return jsonOk({ revision: result.deck.revision });
  } catch (err) {
    return handleRouteError(err);
  }
}
