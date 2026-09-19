import {
  addPrintingToCollection,
  buildCollectionCard,
  CollectionPrintingNotFoundError,
} from "./collection-intake";
import {
  COLLECTION_IMPORT_CANDIDATES_KEY,
  parseCollectionImportText,
} from "./collection-import-parse";
import { deckBuilderStore } from "../deck-builder/deck-builder-store";
import {
  lookupScryfallPrintingById,
  searchScryfallPrintings,
  type ScryfallPrintingSearchHit,
} from "../deck-builder/scryfall-printing-search";
import { dataStore } from "../storage/data-store";
import type { CollectionCard } from "../types";
import type { CollectionImportLine } from "./collection-import-parse";

const IMPORT_PRINTING_LIMIT = 48;

export {
  COLLECTION_IMPORT_CANDIDATES_KEY,
  MAX_COLLECTION_IMPORT_LINES,
  importCandidatesFromCard,
  parseCollectionImportText,
} from "./collection-import-parse";
export type {
  CollectionImportCandidate,
  CollectionImportLine,
} from "./collection-import-parse";

export type CollectionImportSummary = {
  locked: number;
  needsReview: number;
  unmatched: string[];
  cards: CollectionCard[];
};

function lockOrReview(hits: ScryfallPrintingSearchHit[]): {
  status: "locked" | "needs_review" | "unmatched";
  hit?: ScryfallPrintingSearchHit;
  candidates?: ScryfallPrintingSearchHit[];
} {
  if (hits.length === 0) return { status: "unmatched" };
  if (hits.length === 1) return { status: "locked", hit: hits[0] };
  return { status: "needs_review", candidates: hits };
}

export async function resolveCollectionImportLine(line: CollectionImportLine): Promise<{
  status: "locked" | "needs_review" | "unmatched";
  hit?: ScryfallPrintingSearchHit;
  candidates?: ScryfallPrintingSearchHit[];
}> {
  if (line.setCode) {
    const q = [
      `!"${line.name}"`,
      `set:${line.setCode}`,
      line.collectorNumber ? `cn:${line.collectorNumber}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const hits = await searchScryfallPrintings({ query: q, limit: IMPORT_PRINTING_LIMIT });
    if (hits.length) return lockOrReview(hits);
  }

  const exactPrints = await searchScryfallPrintings({
    query: `!"${line.name}"`,
    limit: IMPORT_PRINTING_LIMIT,
  });
  if (exactPrints.length) return lockOrReview(exactPrints);

  const fuzzy = await searchScryfallPrintings({
    query: line.name,
    limit: 16,
  });
  if (!fuzzy.length) return { status: "unmatched" };
  return { status: "needs_review", candidates: fuzzy };
}

function reviewPlaceholderImage(candidates: ScryfallPrintingSearchHit[]): string {
  return (
    candidates.find((c) => c.imageNormal)?.imageNormal ??
    "https://cards.scryfall.io/normal/front/0/0/00000000-0000-0000-0000-000000000000.jpg"
  );
}

export async function applyPrintingToCollectionCard(args: {
  card: CollectionCard;
  scryfallId: string;
}): Promise<CollectionCard> {
  const printing = await lookupScryfallPrintingById(args.scryfallId);
  if (!printing?.imageNormal) {
    throw new CollectionPrintingNotFoundError();
  }
  const catalog = await deckBuilderStore.getCatalogCard(printing.scryfallId);
  const vision = { ...(args.card.visionJson ?? {}) };
  delete vision[COLLECTION_IMPORT_CANDIDATES_KEY];

  return dataStore.saveCollectionCard({
    ...args.card,
    displayName: printing.name,
    category: "magic",
    setName: printing.setName ?? printing.setCode.toUpperCase(),
    cardNumber: printing.collectorNumber,
    catalogSource: "scryfall",
    catalogId: printing.scryfallId,
    identityConfidence: 1,
    identityLocked: true,
    needsReview: false,
    scryfallId: printing.scryfallId,
    oracleId: catalog?.oracleId,
    frontImageUrl: printing.imageNormal,
    visionJson: Object.keys(vision).length ? vision : undefined,
    updatedAt: new Date().toISOString(),
  });
}

export async function importCollectionText(args: {
  storeId: string;
  customerId: string;
  text: string;
}): Promise<CollectionImportSummary> {
  const lines = parseCollectionImportText(args.text);
  const unmatched: string[] = [];
  const cards: CollectionCard[] = [];
  let locked = 0;
  let needsReview = 0;

  for (const line of lines) {
    const resolved = await resolveCollectionImportLine(line);
    if (resolved.status === "unmatched" || (resolved.status === "locked" && !resolved.hit)) {
      unmatched.push(line.name);
      continue;
    }

    if (resolved.status === "locked" && resolved.hit) {
      cards.push(
        await addPrintingToCollection({
          storeId: args.storeId,
          customerId: args.customerId,
          scryfallId: resolved.hit.scryfallId,
          quantity: line.quantity,
        }),
      );
      locked += 1;
      continue;
    }

    const candidates = resolved.candidates ?? [];
    const review = buildCollectionCard({
      storeId: args.storeId,
      customerId: args.customerId,
      frontImageUrl: reviewPlaceholderImage(candidates),
      identity: {
        displayName: line.name,
        category: "magic",
        itemType: "raw",
        needsReview: true,
        identityLocked: false,
        visionJson: {
          [COLLECTION_IMPORT_CANDIDATES_KEY]: candidates,
        },
      },
    });
    cards.push(
      await dataStore.saveCollectionCard({
        ...review,
        quantity: line.quantity,
      }),
    );
    needsReview += 1;
  }

  return { locked, needsReview, unmatched, cards };
}
