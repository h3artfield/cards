import { NextRequest } from "next/server";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { getCustomerSession, loadCustomer } from "@/lib/auth/customer-auth";
import { challengerApiAuth } from "@/lib/challenger/api-auth";
import {
  saveApprovedChallengerDeck,
  listApprovedChallengerDecks,
} from "@/lib/challenger/approved-decks";
import { getEditableDeckV1 } from "@/lib/professor-deck-editor/store-v1";
import {
  boardCountsTowardDeckV1,
  measuredBracketIsStaleV1,
} from "@/lib/professor-deck-editor/types-v1";

/**
 * Decks cleared for a queue. The stream PC calls this with the API secret
 * when a player arrives and again when they press Join queue.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = challengerApiAuth(req);
    if (auth === "unconfigured") {
      return jsonError("Challenger API is not configured", 503);
    }
    if (auth !== "ok") return jsonError("Unauthorized", 401);

    const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
    if (!userId || userId.length > 80) {
      return jsonError("userId is required", 400);
    }

    const decks = await listApprovedChallengerDecks(userId);
    return jsonOk(
      decks.map((deck) => ({
        deckId: deck.deckId,
        userId: deck.userId,
        displayName: deck.displayName,
        bracket: deck.bracket,
        commander: deck.commander,
        partner: deck.partner,
        cards: deck.cards,
        legalityReport: deck.legalityReport,
        measuredBracket: deck.measuredBracket,
        approvedAt: deck.approvedAt,
      })),
    );
  } catch (err) {
    return handleRouteError(err);
  }
}

/** The player chooses one deck for the table. The lobby calls this with the API secret. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { deckId?: unknown; userId?: unknown } | null;
    const bearer = (req.headers.get("authorization") ?? "").toLowerCase().startsWith("bearer ");
    let customer;
    if (bearer) {
      const auth = challengerApiAuth(req);
      if (auth === "unconfigured") return jsonError("Challenger API is not configured", 503);
      if (auth !== "ok") return jsonError("Unauthorized", 401);
      const userId = String(body?.userId ?? "").trim();
      if (!userId || userId.length > 80) return jsonError("userId is required", 400);
      customer = await loadCustomer(userId);
      if (!customer) return jsonError("Unknown player.", 404);
    } else {
      const session = getCustomerSession(req);
      if (!session) return jsonError("Sign in first.", 401);
      customer = await loadCustomer(session.customerId);
      if (!customer || customer.email !== session.email) return jsonError("Sign in first.", 401);
    }

    const displayName = customer.challengerDisplayName?.trim();
    if (!displayName) {
      return jsonError("Choose a display name on your account before submitting a deck.", 409);
    }

    const deckId = String(body?.deckId ?? "").trim();
    if (!deckId || deckId.length > 200) return jsonError("Choose a deck.", 400);

    const deck = await getEditableDeckV1(deckId);
    if (!deck || deck.customerId !== customer.id) {
      return jsonError(
        "Open that deck once so the list can be read, then choose it again.",
        404,
      );
    }

    const measured = deck.measuredBracket?.bracket;
    const bracket =
      measured != null && !measuredBracketIsStaleV1(deck) ? measured : deck.bracket;
    if (bracket == null || bracket < 1 || bracket > 5) {
      return jsonError("This deck has no bracket yet. Open it, check the bracket, then choose it.", 400);
    }

    const commander = deck.commander.name.trim();
    const partner = deck.partner?.name?.trim() || null;
    if (!commander) return jsonError("This deck has no commander.", 400);

    const skip = new Set(
      [commander, partner].filter((name): name is string => Boolean(name)).map((name) => name.toLowerCase()),
    );
    const merged = new Map<string, number>();
    for (const card of deck.cards) {
      if (!boardCountsTowardDeckV1(card.board)) continue;
      const name = card.name.trim();
      if (!name || skip.has(name.toLowerCase())) continue;
      const copies = Math.floor(card.copies);
      if (copies < 1) continue;
      merged.set(name, (merged.get(name) ?? 0) + copies);
    }
    const cards = [...merged.entries()].map(([name, copies]) => ({ name, copies }));
    const library = cards.reduce((sum, card) => sum + card.copies, 0);
    const total = library + 1 + (partner ? 1 : 0);
    if (total !== 100) {
      return jsonError(
        `A Commander deck is 100 cards including the commander. This one has ${total}.`,
        400,
      );
    }

    const approvedAt = new Date().toISOString();
    await saveApprovedChallengerDeck({
      deckId: deck.deckId,
      userId: customer.id,
      displayName,
      bracket,
      commander,
      partner,
      cards,
      legalityReport: {
        decision: "approve",
        measuredBracket: bracket,
        offeredBracket: bracket,
      },
      measuredBracket: bracket,
      approvedAt,
    });

    return jsonOk({
      deckId: deck.deckId,
      commander,
      partner,
      bracket,
      approvedAt,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
