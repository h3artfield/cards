import { jsonOk } from "@/lib/api-utils";
import { listCalculatedDecks } from "@/lib/deck-rating/v1/calculated-deck-board-v1";

export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk({ decks: listCalculatedDecks() });
}
