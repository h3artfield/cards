import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { handDeckIdV1 } from "@/lib/professor-deck-editor/from-scratch-v1";
import { createEditableDeckIfAbsentV1, getEditableDeckV1 } from "@/lib/professor-deck-editor/store-v1";
import type { EditableDeckV1 } from "@/lib/professor-deck-editor/types-v1";
import { authorizeDeckEditorV1 } from "../authorize";
import { deckIdFromRequestV1 } from "../deck-key";

/**
 * Copy a deck under a new name. Body: `{ deckName }`.
 *
 * The copy is the customer's own deck from the start: no build behind it, so
 * no baseline to restore to, and no review or measured bracket, both of which
 * describe the original rather than whatever the copy becomes.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const sourceId = deckIdFromRequestV1(req, auth.customerId);
    if (!sourceId) return jsonError("buildId or deckId required", 400);
    const source = await getEditableDeckV1(sourceId);
    if (!source || source.customerId !== auth.customerId || source.storeSlug !== slug) {
      return jsonError("Deck not found", 404);
    }

    const body = (await req.json().catch(() => ({}))) as { deckName?: string };
    const deckName = body.deckName?.trim().slice(0, 120);
    if (!deckName) return jsonError("Give the copy a name", 400);

    const now = new Date().toISOString();
    const { measuredBracket: _measured, professorReview: _review, ...rest } = source;
    const copy: EditableDeckV1 = {
      ...rest,
      deckId: handDeckIdV1({ customerId: auth.customerId, handle: randomUUID() }),
      buildId: null,
      deckName,
      baselineCards: [],
      editedByUser: false,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };

    const stored = await createEditableDeckIfAbsentV1(copy);
    return jsonOk({ deckId: stored.deckId });
  } catch (err) {
    return handleRouteError(err);
  }
}
