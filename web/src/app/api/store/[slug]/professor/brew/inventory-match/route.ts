import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { matchProfessorDeckCardsInStoreInventory } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const body = (await req.json()) as { cardNames?: string[] };
    const cardNames = Array.isArray(body.cardNames) ? body.cardNames : [];
    if (cardNames.length === 0) {
      return jsonOk({ inStockNames: [], imageUrls: {}, inventoryByName: {} });
    }

    const result = await matchProfessorDeckCardsInStoreInventory({
      storeSlug: slug,
      cardNames,
    });

    return jsonOk(result);
  } catch (err) {
    return handleRouteError(err);
  }
}
