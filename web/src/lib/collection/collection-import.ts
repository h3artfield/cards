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
import {
  collectionGameToCategory,
  parseCollectionGame,
  type CollectionGame,
} from "./collection-game";
import type { CollectionImportLine } from "./collection-import-parse";
import {
  finishesFromUnknown,
  pickAvailableFinish,
  type CollectionFinish,
} from "./collection-finish";

const NAME_ONLY_IMAGE =
  "https://cards.scryfall.io/normal/front/0/0/00000000-0000-0000-0000-000000000000.jpg";

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

function lockOrReview(
  hits: ScryfallPrintingSearchHit[],
  finish?: CollectionFinish,
): {
  status: "locked" | "needs_review" | "unmatched";
  hit?: ScryfallPrintingSearchHit;
  finish?: CollectionFinish;
  candidates?: ScryfallPrintingSearchHit[];
} {
  if (hits.length === 0) return { status: "unmatched" };
  if (hits.length === 1) {
    const hit = hits[0]!;
    const available = finishesFromUnknown(hit.finishes);
    if (finish || available.length <= 1) {
      return {
        status: "locked",
        hit,
        finish: pickAvailableFinish(finish, available),
      };
    }
    return { status: "needs_review", candidates: hits };
  }
  return { status: "needs_review", candidates: hits };
}

export async function resolveCollectionImportLine(line: CollectionImportLine): Promise<{
  status: "locked" | "needs_review" | "unmatched";
  hit?: ScryfallPrintingSearchHit;
  finish?: CollectionFinish;
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
    if (hits.length) return lockOrReview(hits, line.finish);
  }

  const exactPrints = await searchScryfallPrintings({
    query: `!"${line.name}"`,
    limit: IMPORT_PRINTING_LIMIT,
  });
  if (exactPrints.length) return lockOrReview(exactPrints, line.finish);

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
  finish?: CollectionFinish;
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
    typeLine: printing.typeLine,
    finish: pickAvailableFinish(
      args.finish,
      finishesFromUnknown(printing.finishes),
    ),
    frontImageUrl: printing.imageNormal,
    visionJson: Object.keys(vision).length ? vision : undefined,
    updatedAt: new Date().toISOString(),
  });
}

async function importNamedLines(args: {
  storeId: string;
  customerId: string;
  game: CollectionGame;
  lines: CollectionImportLine[];
}): Promise<CollectionImportSummary> {
  const category = collectionGameToCategory(args.game);
  const cards: CollectionCard[] = [];
  for (const line of args.lines) {
    const row = buildCollectionCard({
      storeId: args.storeId,
      customerId: args.customerId,
      frontImageUrl: NAME_ONLY_IMAGE,
      identity: {
        displayName: line.name,
        category,
        setName: line.setCode?.toUpperCase(),
        cardNumber: line.collectorNumber,
        itemType: "raw",
        needsReview: false,
        identityLocked: true,
      },
    });
    cards.push(
      await dataStore.saveCollectionCard({
        ...row,
        quantity: line.quantity,
      }),
    );
  }
  return { locked: cards.length, needsReview: 0, unmatched: [], cards };
}

export async function importCollectionText(args: {
  storeId: string;
  customerId: string;
  text: string;
  game?: CollectionGame;
}): Promise<CollectionImportSummary> {
  const game = parseCollectionGame(args.game);
  const lines = parseCollectionImportText(args.text);
  if (game !== "magic") {
    return importNamedLines({
      storeId: args.storeId,
      customerId: args.customerId,
      game,
      lines,
    });
  }

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
          finish: resolved.finish ?? line.finish,
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
