import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { matchDecklistToStoreInventory } from "@/lib/inventory/inventory-decklist-match";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = (await req.json()) as { decklistText?: string };
    const decklistText = body.decklistText?.trim() ?? "";
    if (!decklistText) {
      return jsonError("decklistText required", 400);
    }
    const result = await matchDecklistToStoreInventory({ storeSlug: slug, decklistText });
    return jsonOk(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
