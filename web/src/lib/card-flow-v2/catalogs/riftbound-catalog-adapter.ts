import type { CardSuspect } from "../types";
import type { RiftboundIdentityFields } from "../knowledge/riftbound";
import {
  buildRiftboundMarketProductName,
  parseRiftboundCollectorNumber,
} from "../knowledge/riftbound";

export type RiftboundCatalogSearchInput = {
  name?: string;
  subtitle?: string;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  finish?: string;
  rarity?: string;
  signatureType?: string;
  language?: string;
};

export type RiftboundCatalogCard = {
  source:
    | "official_gallery"
    | "tcgplayer"
    | "pricecharting"
    | "piltover_archive"
    | "local_fixture";
  sourceId: string;
  identity: RiftboundIdentityFields;
  imageUrl?: string;
  productUrl?: string;
  variantTags: string[];
  tcgplayerProductId?: string;
  priceChartingProductId?: string;
  rawData?: unknown;
};

export interface RiftboundCatalogAdapter {
  search(input: RiftboundCatalogSearchInput): Promise<RiftboundCatalogCard[]>;
  toSuspects(cards: RiftboundCatalogCard[]): CardSuspect[];
}

function finishToSuspectFinish(finish?: string): string | undefined {
  if (!finish || finish === "unknown") return undefined;
  if (finish === "foil_default") return "foil";
  return finish;
}

export function riftboundCatalogCardToSuspect(card: RiftboundCatalogCard): CardSuspect {
  const id = card.identity;
  const collectorNumber = id.collectorNumber;
  const parsed =
    id.parsedCollectorNumber ??
    (collectorNumber
      ? parseRiftboundCollectorNumber(collectorNumber, id.setCode)
      : undefined);

  const finish = finishToSuspectFinish(id.finish);
  const variantTags = [...new Set([...card.variantTags, ...(finish ? [finish] : [])])];

  const label = buildRiftboundMarketProductName({
    ...id,
    parsedCollectorNumber: parsed,
  });

  return {
    suspectId: `riftbound:${card.source}:${card.sourceId}`,
    category: "riftbound",
    label,
    canonicalName: id.name,
    catalogSource: card.source === "local_fixture" ? "riftbound_official" : "local_catalog",
    catalogId: card.sourceId,
    setName: id.setName,
    setCode: id.setCode,
    collectorNumber,
    cardNumber: collectorNumber,
    language: id.language ?? "English",
    rarity: id.rarity,
    finish,
    variantTags,
    expectedEvidence: [],
    referenceImageUrls: card.imageUrl ? [card.imageUrl] : undefined,
    rawCatalogData: {
      subtitle: id.subtitle,
      signatureType: id.signatureType,
      cardType: id.cardType,
      domain: id.domain,
      productUrl: card.productUrl,
      tcgplayerProductId: card.tcgplayerProductId,
      priceChartingProductId: card.priceChartingProductId,
      parsedCollectorNumber: parsed,
      source: card.source,
      ...((card.rawData as object) ?? {}),
    },
  };
}

import {
  searchRiftboundLocalFixtures,
} from "./riftbound-fixtures";

class LocalRiftboundCatalogAdapter implements RiftboundCatalogAdapter {
  async search(input: RiftboundCatalogSearchInput) {
    return searchRiftboundLocalFixtures(input);
  }

  toSuspects(cards: RiftboundCatalogCard[]) {
    return riftboundCardsToSuspects(cards);
  }
}

export const defaultRiftboundCatalogAdapter = new LocalRiftboundCatalogAdapter();

export function riftboundCardsToSuspects(cards: RiftboundCatalogCard[]): CardSuspect[] {
  return cards.map(riftboundCatalogCardToSuspect);
}
