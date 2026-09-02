import { NextRequest } from "next/server";
import { jsonOk, handleRouteError } from "@/lib/api-utils";
import { resolveProfessorBrewCardTcgPriceMap } from "@/lib/deck-synthesis/professor-brew-scryfall-prices-v1";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    await params;
    const body = (await req.json()) as { cardNames?: string[] };
    const cardNames = Array.isArray(body.cardNames)
      ? [...new Set(body.cardNames.map((name) => name.trim()).filter(Boolean))]
      : [];
    if (cardNames.length === 0) return jsonOk({ tcgPricesByName: {} });
    const tcgPricesByName = await resolveProfessorBrewCardTcgPriceMap(cardNames);
    return jsonOk({ tcgPricesByName });
  } catch (err) {
    return handleRouteError(err);
  }
}
