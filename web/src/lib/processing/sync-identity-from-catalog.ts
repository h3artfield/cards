import type { ScannedCard, VisionResult } from "../types";
import { enrichVisionFromPokemonCard } from "./pokemon-utils";
import { findCatalogCard } from "./pricing";
import {
  catalogIdentityFields,
  resolveReferenceImage,
} from "./reference-image";
import { identityFieldsFromSummary } from "./identity-summary-parse";
import { isGradedSlab } from "./slab-pricing";

function visionFromCard(card: ScannedCard): VisionResult {
  const existing = card.visionJson as VisionResult | undefined;
  if (existing) return existing;
  return {
    category: card.category ?? "pokemon",
    confidence: 0.5,
    itemType: card.itemType ?? "raw",
    conditionEstimate: card.conditionEstimate ?? "NM",
    cardName: card.detectedName ?? "",
    setName: card.setName,
    cardNumber: card.cardNumber,
  };
}

/** Fill detectedName / vision.cardName from catalog when identity is confirmed. */
export async function syncCardIdentityFromCatalog(
  card: ScannedCard,
): Promise<ScannedCard> {
  let vision = visionFromCard(card);

  // Slab label identity is authoritative — catalog must not replace set/number/name.
  if (isGradedSlab(card)) {
    return {
      ...card,
      detectedName: card.detectedName ?? vision.cardName,
      setName: card.setName ?? vision.setName,
      cardNumber: card.cardNumber ?? vision.cardNumber,
      visionJson: vision as unknown as Record<string, unknown>,
    };
  }

  const pricing = card.pricingJson as
    | { raw?: Record<string, unknown>; source?: string }
    | undefined;

  let fields =
    pricing?.raw && pricing.source
      ? catalogIdentityFields(pricing.raw, pricing.source)
      : null;

  if (!fields?.name) {
    const ref = await resolveReferenceImage(card);
    if (ref.catalogRaw && ref.source) {
      fields = catalogIdentityFields(ref.catalogRaw, ref.source);
      if (ref.catalogRaw && vision.category === "pokemon") {
        vision = enrichVisionFromPokemonCard(vision, ref.catalogRaw);
      }
      if (ref.catalogRaw && ref.source === "pricecharting") {
        const { enrichVisionFromPriceCharting } = await import(
          "./pricing/pricecharting-utils"
        );
        vision = enrichVisionFromPriceCharting(
          vision,
          ref.catalogRaw as import("./pricing/pricecharting-pricing").PriceChartingProduct,
        );
      }
    }
  }

  if (!fields?.name) {
    const catalog = await findCatalogCard(vision);
    if (catalog) {
      fields = catalogIdentityFields(catalog.raw, catalog.source);
      if (vision.category === "pokemon") {
        vision = enrichVisionFromPokemonCard(vision, catalog.raw);
      }
      if (catalog.source === "pricecharting") {
        const { enrichVisionFromPriceCharting } = await import(
          "./pricing/pricecharting-utils"
        );
        vision = enrichVisionFromPriceCharting(
          vision,
          catalog.raw as import("./pricing/pricecharting-pricing").PriceChartingProduct,
        );
      }
    }
  }

  if (!fields?.name && card.identityVerification?.summary) {
    const fromSummary = identityFieldsFromSummary(
      card.identityVerification.summary,
    );
    if (fromSummary.name) {
      fields = { ...fields, ...fromSummary };
      vision = {
        ...vision,
        cardName: vision.cardName ?? fromSummary.name,
        setName: vision.setName ?? fromSummary.set,
        cardNumber: vision.cardNumber ?? fromSummary.number,
      };
      const catalog = await findCatalogCard(vision);
      if (catalog) {
        const catalogFields = catalogIdentityFields(catalog.raw, catalog.source);
        fields = { ...fields, ...catalogFields };
        if (vision.category === "pokemon") {
          vision = enrichVisionFromPokemonCard(vision, catalog.raw);
        }
      }
    }
  }

  if (!fields?.name && !vision.cardName) {
    return card;
  }

  const updatedVision: VisionResult = {
    ...vision,
    cardName: vision.cardName ?? fields?.name,
    setName: vision.setName ?? fields?.set,
    cardNumber: vision.cardNumber ?? fields?.number,
  };

  return {
    ...card,
    detectedName: card.detectedName ?? fields?.name ?? updatedVision.cardName,
    setName: card.setName ?? fields?.set ?? updatedVision.setName,
    cardNumber: card.cardNumber ?? fields?.number ?? updatedVision.cardNumber,
    visionJson: updatedVision as unknown as Record<string, unknown>,
  };
}
