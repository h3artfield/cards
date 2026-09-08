/**
 * Remember what a deck measured.
 *
 * The bracket endpoint itself is stateless and works on any list, which is why
 * it can grade a deck nobody owns. That leaves nowhere for the answer to live,
 * so a customer's own deck could be graded a dozen times and still not know its
 * own bracket — which is what anything selecting "decks with a bracket" needs
 * to read.
 */
import type { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { recordMeasuredBracketV1 } from "@/lib/professor-deck-editor/store-v1";
import { authorizeDeckEditorV1 } from "../authorize";
import { deckIdFromRequestV1 } from "../deck-key";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const deckId = deckIdFromRequestV1(req, auth.customerId!);
    if (!deckId) return jsonError("buildId or deckId required", 400);

    const body = (await req.json().catch(() => null)) as {
      bracket?: number;
      atRevision?: number;
    } | null;

    const bracket = Number(body?.bracket);
    const atRevision = Number(body?.atRevision);
    if (!Number.isInteger(bracket) || bracket < 1 || bracket > 5) {
      return jsonError("bracket must be a whole number from 1 to 5", 400);
    }
    if (!Number.isInteger(atRevision) || atRevision < 0) {
      return jsonError("atRevision required", 400);
    }

    const deck = await recordMeasuredBracketV1({
      deckId,
      customerId: auth.customerId!,
      bracket,
      atRevision,
    });
    if (!deck) return jsonError("Deck not found", 404);

    return jsonOk({
      measuredBracket: deck.measuredBracket ?? null,
      revision: deck.revision,
    });
  } catch (error) {
    console.error("[deck-editor/measured-bracket] failed:", error);
    return handleRouteError(error);
  }
}
