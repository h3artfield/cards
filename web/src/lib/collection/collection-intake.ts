import { v4 as uuidv4 } from "uuid";
import { v2CategoryToLegacy } from "../card-flow-v2/evidence-utils";
import type { CardCandidateBundle } from "../card-flow-v2/types";
import { deckBuilderStore } from "../deck-builder/deck-builder-store";
import {
  lookupScryfallPrintingById,
  searchScryfallPrintings,
} from "../deck-builder/scryfall-printing-search";
import { analyzeCollectionFront } from "../processing/vision";
import { dataStore } from "../storage/data-store";
import type { CollectionCard, ItemType, VisionResult } from "../types";
import {
  catalogAddMatchKey,
  fetchPokemonCatalogCard,
  fetchYugiohCatalogCard,
  findOwnedCatalogPrinting,
  incrementOwnedPrinting,
  type CollectionCatalogAddInput,
} from "./collection-catalog";
import {
  finishesFromUnknown,
  parseCollectionFinish,
  pickAvailableFinish,
} from "./collection-finish";

export const UNIDENTIFIED_COLLECTION_CARD_NAME = "Unidentified card";

/** Identity fields a collection row keeps — no pricing, no offers. */
export type CollectionScanIdentity = Pick<
  CollectionCard,
  | "displayName"
  | "category"
  | "setName"
  | "cardNumber"
  | "catalogSource"
  | "catalogId"
  | "conditionEstimate"
  | "identityConfidence"
  | "identityLocked"
  | "itemType"
  | "needsReview"
  | "visionJson"
  | "typeLine"
  | "finish"
>;

function cleaned(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function identityFromV2Bundle(
  bundle: CardCandidateBundle,
  declaredItemType: ItemType,
): CollectionScanIdentity {
  const locked = bundle.lockedIdentity;
  const displayName =
    cleaned(locked.canonicalName) ?? cleaned(locked.marketProductName);

  return {
    displayName: displayName ?? UNIDENTIFIED_COLLECTION_CARD_NAME,
    category: v2CategoryToLegacy(bundle.category),
    setName: cleaned(locked.setName),
    cardNumber: cleaned(locked.collectorNumber) ?? cleaned(locked.cardNumber),
    catalogSource: locked.catalogSource,
    catalogId: cleaned(locked.catalogId),
    identityConfidence: locked.confidence,
    identityLocked: locked.locked,
    itemType: declaredItemType,
    needsReview: !displayName,
  };
}

export function identityFromVision(
  vision: VisionResult,
  declaredItemType: ItemType,
): CollectionScanIdentity {
  const displayName = cleaned(vision.cardName) ?? cleaned(vision.playerName);

  return {
    displayName: displayName ?? UNIDENTIFIED_COLLECTION_CARD_NAME,
    category: vision.category,
    setName: cleaned(vision.setName),
    cardNumber: cleaned(vision.cardNumber),
    conditionEstimate: vision.conditionEstimate,
    itemType: vision.itemType ?? declaredItemType,
    needsReview: !displayName,
    visionJson: vision as unknown as Record<string, unknown>,
  };
}

/** A scan that could not be identified still belongs in the binder. */
export function unidentifiedIdentity(
  declaredItemType: ItemType,
): CollectionScanIdentity {
  return {
    displayName: UNIDENTIFIED_COLLECTION_CARD_NAME,
    itemType: declaredItemType,
    needsReview: true,
  };
}

export async function identifyCollectionScan(args: {
  frontImageUrl: string;
  itemType: ItemType;
}): Promise<CollectionScanIdentity> {
  try {
    const vision = await analyzeCollectionFront(args.frontImageUrl);
    return identityFromVision(vision, args.itemType);
  } catch (err) {
    console.warn("[collection] vision identification failed:", err);
    return unidentifiedIdentity(args.itemType);
  }
}

/**
 * Magic printing + oracle ids, so the deck builder can use the card. Uses the
 * locked catalog id when identification produced one, else an exact name match.
 */
export function collectionScryfallQuery(
  identity: Pick<CollectionScanIdentity, "displayName" | "setName" | "cardNumber">,
): string {
  const name = identity.displayName.trim();
  if (!name || name === UNIDENTIFIED_COLLECTION_CARD_NAME) return "";
  const parts = [`!"${name.replace(/"/g, "")}"`];
  const set = identity.setName?.trim();
  if (set) parts.push(`set:"${set.replace(/"/g, "")}"`);
  const number = identity.cardNumber?.replace(/^#/, "").trim();
  if (number) parts.push(`cn:${number}`);
  parts.push("game:paper unique:prints");
  return parts.join(" ");
}

export async function resolveMagicCatalogLink(
  identity: CollectionScanIdentity,
): Promise<{ scryfallId?: string; oracleId?: string; typeLine?: string }> {
  if (identity.category && identity.category !== "magic") return {};

  if (identity.catalogSource === "scryfall" && identity.catalogId) {
    const printing = await deckBuilderStore.getCatalogCard(identity.catalogId);
    return {
      scryfallId: identity.catalogId,
      oracleId: printing?.oracleId,
      typeLine: printing?.typeLine,
    };
  }

  if (identity.displayName === UNIDENTIFIED_COLLECTION_CARD_NAME) return {};

  const query = collectionScryfallQuery(identity);
  if (query) {
    const hits = await searchScryfallPrintings({ query, limit: 8 });
    const numbered = identity.cardNumber
      ? hits.filter(
          (hit) =>
            hit.collectorNumber.replace(/^0+/, "") ===
            identity.cardNumber!.replace(/^#/, "").replace(/^0+/, ""),
        )
      : [];
    const hit = numbered.length === 1 ? numbered[0] : hits.length === 1 ? hits[0] : undefined;
    if (hit) {
      const catalog = await deckBuilderStore.getCatalogCard(hit.scryfallId);
      return {
        scryfallId: hit.scryfallId,
        oracleId: catalog?.oracleId,
        typeLine: hit.typeLine ?? catalog?.typeLine,
      };
    }
  }

  const printing = await deckBuilderStore.findCatalogPrintingByExactName(
    identity.displayName,
  );
  if (!printing) return {};
  return {
    scryfallId: printing.id,
    oracleId: printing.oracleId,
    typeLine: printing.typeLine,
  };
}

export function buildCollectionCard(args: {
  storeId: string;
  customerId: string;
  frontImageUrl: string;
  backImageUrl?: string;
  identity: CollectionScanIdentity;
  magic?: { scryfallId?: string; oracleId?: string; typeLine?: string };
  now?: string;
  id?: string;
}): CollectionCard {
  const now = args.now ?? new Date().toISOString();
  return {
    id: args.id ?? uuidv4(),
    storeId: args.storeId,
    customerId: args.customerId,
    frontImageUrl: args.frontImageUrl,
    backImageUrl: args.backImageUrl,
    status: "owned",
    ...args.identity,
    ...(args.magic?.scryfallId ? { scryfallId: args.magic.scryfallId } : {}),
    ...(args.magic?.oracleId ? { oracleId: args.magic.oracleId } : {}),
    ...(args.magic?.typeLine || args.identity.typeLine
      ? { typeLine: args.magic?.typeLine ?? args.identity.typeLine }
      : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export async function addPrintingToCollection(args: {
  storeId: string;
  customerId: string;
  scryfallId: string;
  quantity?: number;
  finish?: CollectionCard["finish"];
}): Promise<CollectionCard> {
  const printing = await lookupScryfallPrintingById(args.scryfallId);
  if (!printing) {
    throw new CollectionPrintingNotFoundError();
  }

  const catalog = await deckBuilderStore.getCatalogCard(printing.scryfallId);
  const frontImageUrl = printing.imageNormal;
  if (!frontImageUrl) {
    throw new CollectionPrintingNotFoundError();
  }

  const identity: CollectionScanIdentity = {
    displayName: printing.name,
    category: "magic",
    setName: printing.setName ?? printing.setCode.toUpperCase(),
    cardNumber: printing.collectorNumber,
    catalogSource: "scryfall",
    catalogId: printing.scryfallId,
    identityConfidence: 1,
    identityLocked: true,
    itemType: "raw",
    needsReview: false,
    typeLine: printing.typeLine,
    finish: pickAvailableFinish(
      parseCollectionFinish(args.finish),
      finishesFromUnknown(printing.finishes),
    ),
  };

  const quantity = Math.max(1, Math.floor(args.quantity ?? 1) || 1);
  const existing = findOwnedCatalogPrinting(
    await dataStore.getCollectionCards(args.storeId, args.customerId),
    catalogAddMatchKey({
      category: "magic",
      catalogSource: "scryfall",
      catalogId: printing.scryfallId,
      displayName: printing.name,
      quantity,
      finish: identity.finish,
    }),
  );
  if (existing) return incrementOwnedPrinting(existing, quantity);

  const card = buildCollectionCard({
    storeId: args.storeId,
    customerId: args.customerId,
    frontImageUrl,
    identity,
    magic: {
      scryfallId: printing.scryfallId,
      oracleId: catalog?.oracleId,
    },
  });
  return dataStore.saveCollectionCard(quantity > 1 ? { ...card, quantity } : card);
}

export class CollectionPrintingNotFoundError extends Error {
  constructor() {
    super("That printing could not be found");
    this.name = "CollectionPrintingNotFoundError";
  }
}

export async function addCatalogPrintingToCollection(args: {
  storeId: string;
  customerId: string;
  input: CollectionCatalogAddInput;
}): Promise<CollectionCard> {
  const quantity = args.input.quantity ?? 1;

  if (args.input.category === "magic") {
    return addPrintingToCollection({
      storeId: args.storeId,
      customerId: args.customerId,
      scryfallId: args.input.catalogId,
      quantity,
    });
  }

  const existing = findOwnedCatalogPrinting(
    await dataStore.getCollectionCards(args.storeId, args.customerId),
    catalogAddMatchKey(args.input),
  );
  if (existing) return incrementOwnedPrinting(existing, quantity);

  const resolved =
    args.input.category === "pokemon"
      ? await fetchPokemonCatalogCard(args.input.catalogId)
      : await fetchYugiohCatalogCard(args.input.catalogId);

  const displayName = resolved?.displayName ?? args.input.displayName.trim();
  const frontImageUrl = resolved?.frontImageUrl;
  if (!displayName || !frontImageUrl) {
    throw new CollectionPrintingNotFoundError();
  }

  const card = buildCollectionCard({
    storeId: args.storeId,
    customerId: args.customerId,
    frontImageUrl,
    identity: {
      displayName,
      category: resolved?.category ?? args.input.category,
      setName: resolved?.setName ?? args.input.setName,
      cardNumber: resolved?.cardNumber ?? args.input.cardNumber,
      catalogSource: resolved?.catalogSource ?? args.input.catalogSource,
      catalogId: resolved?.catalogId ?? args.input.catalogId,
      identityConfidence: 1,
      identityLocked: true,
      itemType: "raw",
      needsReview: false,
    },
  });

  return dataStore.saveCollectionCard(quantity > 1 ? { ...card, quantity } : card);
}

export async function addScanToCollection(args: {
  storeId: string;
  customerId: string;
  frontImageUrl: string;
  backImageUrl?: string;
  itemType?: ItemType;
}): Promise<CollectionCard> {
  const itemType: ItemType = args.itemType ?? "unknown";

  const identity = await identifyCollectionScan({
    frontImageUrl: args.frontImageUrl,
    itemType,
  });
  const magic = await resolveMagicCatalogLink(identity);

  return dataStore.saveCollectionCard(
    buildCollectionCard({
      storeId: args.storeId,
      customerId: args.customerId,
      frontImageUrl: args.frontImageUrl,
      backImageUrl: args.backImageUrl,
      identity,
      magic,
    }),
  );
}
