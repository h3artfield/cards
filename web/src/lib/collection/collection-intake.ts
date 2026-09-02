import { v4 as uuidv4 } from "uuid";
import {
  isCardFlowV2EvidenceEnabled,
  isCardFlowV2IdentityEnabled,
} from "../card-flow-v2/feature-flag";
import { v2CategoryToLegacy } from "../card-flow-v2/evidence-utils";
import { runCardEvidenceV2 } from "../card-flow-v2/run-card-evidence-v2";
import { runCardIdentityV2 } from "../card-flow-v2/run-card-identity-v2";
import type { CardCandidateBundle } from "../card-flow-v2/types";
import { deckBuilderStore } from "../deck-builder/deck-builder-store";
import { analyzeCardImages } from "../processing/vision";
import { dataStore } from "../storage/data-store";
import type {
  CollectionCard,
  ItemType,
  StoreRule,
  VisionResult,
} from "../types";

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
  backImageUrl?: string;
  itemType: ItemType;
  rules: StoreRule[];
}): Promise<CollectionScanIdentity> {
  const input = {
    frontImageUrl: args.frontImageUrl,
    backImageUrl: args.backImageUrl,
    declaredItemType: args.itemType,
  };

  if (isCardFlowV2EvidenceEnabled() && isCardFlowV2IdentityEnabled()) {
    try {
      const evidence = await runCardEvidenceV2(input);
      const bundle = await runCardIdentityV2({ ...input, evidence });
      return identityFromV2Bundle(bundle, args.itemType);
    } catch (err) {
      console.warn("[collection] V2 identity failed, falling back:", err);
    }
  }

  try {
    const vision = await analyzeCardImages(
      args.frontImageUrl,
      args.backImageUrl,
      args.itemType,
      args.rules,
    );
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
export async function resolveMagicCatalogLink(
  identity: CollectionScanIdentity,
): Promise<{ scryfallId?: string; oracleId?: string }> {
  if (identity.category && identity.category !== "magic") return {};

  if (identity.catalogSource === "scryfall" && identity.catalogId) {
    const printing = await deckBuilderStore.getCatalogCard(identity.catalogId);
    return {
      scryfallId: identity.catalogId,
      oracleId: printing?.oracleId,
    };
  }

  if (identity.displayName === UNIDENTIFIED_COLLECTION_CARD_NAME) return {};

  const printing = await deckBuilderStore.findCatalogPrintingByExactName(
    identity.displayName,
  );
  if (!printing) return {};
  return { scryfallId: printing.id, oracleId: printing.oracleId };
}

export function buildCollectionCard(args: {
  storeId: string;
  customerId: string;
  frontImageUrl: string;
  backImageUrl?: string;
  identity: CollectionScanIdentity;
  magic?: { scryfallId?: string; oracleId?: string };
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
    createdAt: now,
    updatedAt: now,
  };
}

export async function addScanToCollection(args: {
  storeId: string;
  customerId: string;
  frontImageUrl: string;
  backImageUrl?: string;
  itemType?: ItemType;
}): Promise<CollectionCard> {
  const itemType: ItemType = args.itemType ?? "unknown";
  const rules = await dataStore.getActiveRules(args.storeId);

  const identity = await identifyCollectionScan({
    frontImageUrl: args.frontImageUrl,
    backImageUrl: args.backImageUrl,
    itemType,
    rules,
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
