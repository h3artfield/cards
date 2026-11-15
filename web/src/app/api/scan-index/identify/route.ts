import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { analyzeCollectionFront } from "@/lib/processing/vision";
import { findCatalogCard, findCatalogCandidates } from "@/lib/processing/pricing";
import { catalogCardFromScryfall } from "@/lib/deck-builder/scryfall-catalog";
import {
  fetchScryfallBySetAndNumber,
  searchScryfallCards,
} from "@/lib/processing/scryfall-client";
import type { ScanIndexCard } from "@/lib/scan-index/types";

type IdentifiedCardOption = Omit<ScanIndexCard, "hash" | "vHash" | "dinoHash">;

function rawScryfallToOption(raw: Record<string, unknown>): IdentifiedCardOption | null {
  const parsed = catalogCardFromScryfall(raw);
  if (!parsed) return null;
  return {
    catalogId: parsed.id,
    catalogSource: "scryfall",
    name: parsed.name,
    setCode: parsed.set,
    setName: parsed.setName,
    cardNumber: parsed.collectorNumber,
    imageUrl: parsed.imageNormal ?? parsed.imageArtCrop,
  };
}

function rawPokemonToOption(
  raw: Record<string, unknown>,
  fallbackName?: string,
  fallbackSet?: string,
  fallbackNumber?: string,
): IdentifiedCardOption | null {
  const catalogId = String(raw.id ?? "").trim();
  if (!catalogId) return null;
  const setObj = raw.set as { id?: string; name?: string } | undefined;
  const images = raw.images as { large?: string; small?: string } | undefined;
  return {
    catalogId,
    catalogSource: "pokemon_tcg",
    name: String(raw.name ?? fallbackName ?? "Unknown"),
    setCode: setObj?.id,
    setName: setObj?.name ?? fallbackSet,
    cardNumber: String(raw.number ?? fallbackNumber ?? "").trim() || undefined,
    imageUrl: images?.large ?? images?.small,
  };
}

/**
 * Fast live-scanner identification endpoint when a card is held steady in the
 * camera frame and isn't in the local hash pack (or needs exact printing verification).
 * Returns both the primary matched printing (`card`) and alternate printings (`cluster`).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      frontImageUrl?: string;
      gameHint?: string;
    };
    const frontImageUrl = body.frontImageUrl?.trim() ?? "";
    if (!frontImageUrl) {
      return jsonError("frontImageUrl is required", 400);
    }

    const vision = await analyzeCollectionFront(frontImageUrl);
    if (
      !vision.cardName ||
      vision.cardName === "Unknown Card" ||
      vision.confidence < 0.45
    ) {
      return jsonOk({ matched: false, vision });
    }

    // Resolve exact printing + alternate printings against Scryfall or Pokémon TCG catalog
    if (vision.category === "magic") {
      const setCode = vision.setCode?.trim().toLowerCase();
      const cn = vision.cardNumber?.replace(/^#/, "").trim();
      const cleanName = vision.cardName.replace(/"/g, "").trim();

      let primaryRaw: Record<string, unknown> | null = null;
      if (setCode && cn) {
        primaryRaw = await fetchScryfallBySetAndNumber(setCode, cn);
      }

      const queries: string[] = [];
      if (cn && vision.setName) {
        queries.push(`!"${cleanName}" cn:${cn}`);
      }
      if (vision.setName) {
        queries.push(`!"${cleanName}" set:"${vision.setName.replace(/"/g, "")}"`);
      }
      queries.push(`!"${cleanName}" game:paper unique:prints`);

      const clusterMap = new Map<string, IdentifiedCardOption>();
      if (primaryRaw) {
        const opt = rawScryfallToOption(primaryRaw);
        if (opt) clusterMap.set(opt.catalogId, opt);
      }

      for (const q of queries) {
        const hits = await searchScryfallCards(q);
        for (const h of hits.slice(0, 20)) {
          const opt = rawScryfallToOption(h);
          if (opt && !clusterMap.has(opt.catalogId)) {
            clusterMap.set(opt.catalogId, opt);
          }
        }
        if (clusterMap.size >= 8) break;
      }

      const cluster = [...clusterMap.values()];
      if (cluster.length > 0) {
        return jsonOk({
          matched: true,
          card: cluster[0],
          cluster,
          category: "magic",
          vision,
        });
      }
    }

    if (vision.category === "pokemon") {
      const [primaryMatch, candidates] = await Promise.all([
        findCatalogCard(vision),
        findCatalogCandidates(vision, 16).catch(() => []),
      ]);

      const clusterMap = new Map<string, IdentifiedCardOption>();
      if (primaryMatch?.raw) {
        const opt = rawPokemonToOption(
          primaryMatch.raw,
          vision.cardName,
          vision.setName,
          vision.cardNumber,
        );
        if (opt) clusterMap.set(opt.catalogId, opt);
      }
      for (const cand of candidates) {
        const opt = rawPokemonToOption(
          cand.raw,
          vision.cardName,
          vision.setName,
          vision.cardNumber,
        );
        if (opt && !clusterMap.has(opt.catalogId)) {
          clusterMap.set(opt.catalogId, opt);
        }
      }

      const cluster = [...clusterMap.values()];
      if (cluster.length > 0) {
        return jsonOk({
          matched: true,
          card: cluster[0],
          cluster,
          category: "pokemon",
          vision,
        });
      }
    }

    // Fallback synthetic card when catalog API didn't find an exact printing ID
    const fallbackCard: IdentifiedCardOption = {
      catalogId: `vision:${vision.category}:${vision.cardName}:${vision.cardNumber ?? ""}`,
      catalogSource:
        vision.category === "pokemon" ? "pokemon_tcg" : "scryfall",
      name: vision.cardName,
      setName: vision.setName,
      setCode: vision.setCode,
      cardNumber: vision.cardNumber,
    };
    return jsonOk({
      matched: true,
      category: vision.category,
      vision,
      card: fallbackCard,
      cluster: [fallbackCard],
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
