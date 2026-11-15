import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { searchScryfallPrintings } from "@/lib/deck-builder/scryfall-printing-search";
import { fetchPokemonCards } from "@/lib/processing/catalog-pricing";
import type { ScanIndexCard } from "@/lib/scan-index/types";

export type PrintingSearchOption = Omit<ScanIndexCard, "hash" | "vHash" | "dinoHash">;

/**
 * Search printings across Magic (Scryfall) and Pokémon TCG so customers or staff
 * can switch a scanned card to the exact set / collector number / artwork.
 */
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const game = req.nextUrl.searchParams.get("game")?.trim().toLowerCase() ?? "all";
    const exactName = req.nextUrl.searchParams.get("exact") === "1";

    if (!q) {
      return jsonError("Search query q is required", 400);
    }

    const printings: PrintingSearchOption[] = [];

    if (game === "all" || game === "magic") {
      const scryfallQuery = exactName
        ? `!"${q.replace(/"/g, "")}"`
        : q;
      const hits = await searchScryfallPrintings({
        query: scryfallQuery,
        limit: 36,
      });
      // If exact name returned nothing, fall back to general query
      const finalHits =
        hits.length > 0
          ? hits
          : exactName
            ? await searchScryfallPrintings({ query: q, limit: 36 })
            : [];

      for (const hit of finalHits) {
        printings.push({
          catalogId: hit.scryfallId,
          catalogSource: "scryfall",
          name: hit.name,
          setCode: hit.setCode,
          setName: hit.setName ?? hit.setCode.toUpperCase(),
          cardNumber: hit.collectorNumber,
          imageUrl: hit.imageNormal,
        });
      }
    }

    if (game === "all" || game === "pokemon") {
      const clean = q.replace(/"/g, "").trim();
      const pokeQuery = exactName ? `name:"${clean}"` : `name:"*${clean}*"`;
      let pokeCards = await fetchPokemonCards(pokeQuery);
      if (pokeCards.length === 0 && !exactName) {
        pokeCards = await fetchPokemonCards(`name:"${clean}"`);
      }

      for (const raw of pokeCards.slice(0, 30)) {
        const id = String(raw.id ?? "").trim();
        const name = String(raw.name ?? "").trim();
        const setObj = raw.set as { id?: string; name?: string } | undefined;
        const images = raw.images as { large?: string; small?: string } | undefined;
        const imageUrl = images?.small ?? images?.large;
        if (!id || !name) continue;
        printings.push({
          catalogId: id,
          catalogSource: "pokemon_tcg",
          name,
          setCode: setObj?.id,
          setName: setObj?.name,
          cardNumber: String(raw.number ?? "").trim() || undefined,
          imageUrl,
        });
      }
    }

    return jsonOk({ printings });
  } catch (err) {
    return handleRouteError(err);
  }
}
