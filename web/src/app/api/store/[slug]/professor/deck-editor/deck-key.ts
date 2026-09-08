/**
 * The two ways a request names a deck.
 *
 * A deck the Professor built is reached by its build id, which maps to exactly
 * one editable deck per customer. A deck started by hand has no build, so it
 * carries its own id instead. Every deck-editor sub-route accepts both, and
 * putting that convention in one place keeps them from drifting apart — the
 * synergy endpoint quietly accepting only build ids is how a hand-built deck
 * ends up with no synergy highlighting for no visible reason.
 *
 * This returns an id, never a deck. The caller still has to load the record and
 * check `customerId` against the session, because a deck id arrives from the
 * client and proves nothing about who owns it.
 */
import type { NextRequest } from "next/server";
import { editableDeckIdV1 } from "@/lib/professor-deck-editor/from-build-v1";

export function deckIdFromRequestV1(req: NextRequest, customerId: string): string | null {
  const deckId = req.nextUrl.searchParams.get("deckId")?.trim();
  if (deckId) return deckId;

  const buildId = req.nextUrl.searchParams.get("buildId")?.trim();
  return buildId ? editableDeckIdV1({ customerId, buildId }) : null;
}
