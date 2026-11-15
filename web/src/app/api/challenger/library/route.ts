import { NextRequest } from "next/server";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { loadCustomer } from "@/lib/auth/customer-auth";
import { challengerApiAuth } from "@/lib/challenger/api-auth";
import { listCustomerSavedDecks } from "@/lib/customer-saved-decks/customer-saved-deck-store";
import { mergeCustomerDeckListV1 } from "@/lib/professor-deck-editor/deck-list-v1";
import { listEditableDecksV1 } from "@/lib/professor-deck-editor/store-v1";

const STORE = "the-game-lodge";

/**
 * The names and brackets of one player's decks. The lobby fills its dropdown
 * from this. Card lists stay on the approved-deck pull.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = challengerApiAuth(req);
    if (auth === "unconfigured") return jsonError("Challenger API is not configured", 503);
    if (auth !== "ok") return jsonError("Unauthorized", 401);

    const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
    if (!userId || userId.length > 80) return jsonError("userId is required", 400);

    const customer = await loadCustomer(userId);
    if (!customer) return jsonOk([]);

    const [editable, saved] = await Promise.all([
      listEditableDecksV1({ customerId: userId, storeSlug: STORE, limit: 80 }),
      listCustomerSavedDecks({ customerId: userId, storeSlug: STORE, limit: 80 }),
    ]);
    const merged = mergeCustomerDeckListV1({ editableDecks: editable, savedDecks: saved });
    const seen = new Set<string>();
    const rows = [];
    for (const deck of merged) {
      if (seen.has(deck.deckId)) continue;
      seen.add(deck.deckId);
      const bracket = deck.registrationBracket ?? deck.measuredBracket ?? deck.requestedBracket;
      const commander = deck.commanderName.trim();
      const name = deck.deckName.trim();
      const title =
        commander && name && name.length <= 42 && name.toLowerCase() !== commander.toLowerCase()
          ? `${commander} — ${name}`
          : commander || name || "Deck";
      rows.push({
        deckId: deck.deckId,
        commander: commander || title,
        name: title,
        bracket: bracket != null && bracket >= 1 && bracket <= 5 ? bracket : null,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return jsonOk(rows);
  } catch (err) {
    return handleRouteError(err);
  }
}
