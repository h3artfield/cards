import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getDeckResolutionCatalogRuntime } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";
import { previewProfessorImportedDeckV111 } from "@/lib/deck-synthesis/professor-imported-deck-hydrate-v1-1-1";
import type { ProfessorImportedDeckPreviewV111 } from "@/lib/deck-synthesis/professor-imported-decklist-v1-1-1";
import { getSolDirectedBuildJobV111 } from "@/lib/deck-synthesis/professor-sol-directed-build-job-store-v1-1-1";
import { matchProfessorDeckCardsInStoreInventory } from "@/lib/deck-synthesis/professor-brew-inventory-match-v4-3-v1";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import { dataStore } from "@/lib/storage/data-store";
import {
  markerFacetsV1,
  withDerivedMarkersV1,
} from "@/lib/professor-deck-editor/derived-markers-v1";
import type { DerivedMarkerFactsV1 } from "@/lib/professor-deck-editor/derived-markers-v1";
import { normalizeDeckCardNameV1 } from "@/lib/professor-deck-editor/types-v1";
import {
  createCatalogDisplayFactsLookupV1,
  withDisplayFactsV1,
} from "@/lib/professor-deck-editor/display-facts-v1";
import { withSemanticFactsV1 } from "@/lib/professor-deck-editor/semantic-facts-v1";
import {
  createCatalogCardFactsLookupV1,
  createLandOracleIdResolverV1,
} from "@/lib/professor-deck-editor/catalog-lookup-v1";
import { createEditableDeckFromBuildV1, editableDeckIdV1 } from "@/lib/professor-deck-editor/from-build-v1";
import {
  createEditableDeckFromScratchV1,
  handDeckIdV1,
} from "@/lib/professor-deck-editor/from-scratch-v1";
import { resolveHandDeckCommanderV1 } from "@/lib/professor-deck-editor/hand-deck-commander-v1";
import { handDeckImportOpsV1 } from "@/lib/professor-deck-editor/import-ops-v1";
import {
  getCommanderSearchCatalogRuntime,
  isPaperEligibleCommanderNameFast,
} from "@/lib/deck-synthesis/professor-commander-search-catalog-v1";
import { applyDeckEditOpsV1 } from "@/lib/professor-deck-editor/ops-v1";
import type { DeckEditRejectionV1 } from "@/lib/professor-deck-editor/ops-v1";
import { checkEditableDeckLegalityV1 } from "@/lib/professor-deck-editor/legality-v1";
import {
  createEditableDeckIfAbsentV1,
  getEditableDeckV1,
  mutateEditableDeckV1,
} from "@/lib/professor-deck-editor/store-v1";
import { parseDeckEditOpsV1 } from "@/lib/professor-deck-editor/parse-ops-v1";
import type { EditableDeckCommanderV1, EditableDeckV1 } from "@/lib/professor-deck-editor/types-v1";
import { commanderPairProblemV1 } from "@/lib/professor-deck-editor/commander-pair-v1";
import {
  combinedGoldenOracleText,
  lookupGoldenByName,
} from "../../../../../../../scripts/lib/load-golden-catalog-index";
import type { DeckResolutionCatalog } from "../../../../../../../scripts/lib/load-deck-resolution-catalog";
import { getCardTokenMapV1, getCardTokenSetsV1 } from "@/lib/deck-tokens/card-token-map-v1";
import { computeDeckTokensV1, type DeckTokensV1 } from "@/lib/deck-tokens/deck-tokens-v1";
import { deleteCustomerDeckV1 } from "@/lib/professor-deck-editor/delete-deck-v1";
import { authorizeDeckEditorV1 } from "./authorize";
import { deckIdFromRequestV1 } from "./deck-key";

/**
 * The editable-deck surface: GET to open a deck, PATCH to change it.
 *
 * GET is deliberately allowed to create. A customer who has never opened the
 * editor has no stored deck, only a sealed build, and making them click a
 * "start editing" button first would be a step that exists purely to satisfy
 * the data model.
 */

/**
 * The derived markers, recomputed on every response.
 *
 * Each source is allowed to fail on its own. A store whose inventory cache is
 * cold should cost the customer an "in stock" badge, not their decklist, so a
 * rejected lookup contributes no facts rather than failing the request.
 */
async function derivedMarkerFacts(deck: EditableDeckV1): Promise<DerivedMarkerFactsV1> {
  const cardNames = deck.cards.map((card) => card.name);

  const [gameChangers, inventory, collection] = await Promise.allSettled([
    Promise.resolve().then(() => gameChangerOracleIdSet(loadCommanderGameChangerSnapshot())),
    matchProfessorDeckCardsInStoreInventory({ storeSlug: deck.storeSlug, cardNames }),
    dataStore.getCollectionCards(deck.storeId, deck.customerId),
  ]);

  const facts: DerivedMarkerFactsV1 = {};

  if (gameChangers.status === "fulfilled") {
    facts.gameChangerOracleIds = gameChangers.value;
  } else {
    console.warn("[deck-editor] Game Changer snapshot unavailable:", gameChangers.reason);
  }

  if (inventory.status === "fulfilled") {
    facts.inStockNames = new Set(
      inventory.value.inStockNames.map((name) => normalizeDeckCardNameV1(name)),
    );
    const qtyByName = new Map<string, number>();
    for (const [name, entry] of Object.entries(inventory.value.inventoryByName)) {
      qtyByName.set(normalizeDeckCardNameV1(name), entry.quantity);
    }
    facts.inStockQtyByName = qtyByName;
  } else {
    console.warn("[deck-editor] store inventory unavailable:", inventory.reason);
  }

  if (collection.status === "fulfilled") {
    const owned = collection.value.filter(
      (card) => card.status === "owned" && !card.needsReview,
    );
    const qtyByOracleId = new Map<string, number>();
    const qtyByName = new Map<string, number>();
    for (const card of owned) {
      const qty = Math.max(1, Math.floor(card.quantity ?? 1) || 1);
      if (card.oracleId) {
        qtyByOracleId.set(card.oracleId, (qtyByOracleId.get(card.oracleId) ?? 0) + qty);
      }
      const name = normalizeDeckCardNameV1(card.displayName);
      if (name) qtyByName.set(name, (qtyByName.get(name) ?? 0) + qty);
    }
    facts.ownedQtyByOracleId = qtyByOracleId;
    facts.ownedQtyByName = qtyByName;
    facts.ownedOracleIds = new Set(qtyByOracleId.keys());
    facts.ownedNames = new Set(qtyByName.keys());
  } else {
    console.warn("[deck-editor] customer collection unavailable:", collection.reason);
  }

  return facts;
}

function commanderPairProblemFromCatalog(deck: EditableDeckV1, catalog: DeckResolutionCatalog): string | null {
  if (!deck.partner) return null;
  const [a, b] = [deck.commander, deck.partner].map((commander) => catalog.byOracleId.get(commander.oracleId));
  // Without both cards' text the pair can't be judged, and calling it illegal
  // would be a claim the data doesn't support.
  if (!a || !b) return null;
  return commanderPairProblemV1(
    { name: a.canonicalName, typeLine: a.typeLine ?? "", oracleText: combinedGoldenOracleText(a) },
    { name: b.canonicalName, typeLine: b.typeLine ?? "", oracleText: combinedGoldenOracleText(b) },
  );
}

async function deckWithLegality(deck: EditableDeckV1) {
  const [catalog, facts, commanderCatalog] = await Promise.all([
    getDeckResolutionCatalogRuntime(),
    derivedMarkerFacts(deck),
    getCommanderSearchCatalogRuntime().catch((err) => {
      console.warn("[deck-editor] commander catalog unavailable:", err);
      return null;
    }),
  ]);

  let cards = withDerivedMarkersV1(deck, facts);
  try {
    cards = withDisplayFactsV1(cards, createCatalogDisplayFactsLookupV1(catalog));
  } catch (err) {
    console.warn("[deck-editor] display facts unavailable:", err);
  }
  try {
    cards = withSemanticFactsV1(cards);
  } catch (err) {
    console.warn("[deck-editor] semantic facts unavailable:", err);
  }

  let tokens: DeckTokensV1 | null = null;
  try {
    tokens = computeDeckTokensV1({
      commander: deck.commander,
      mainboard: [
        ...(deck.partner ? [deck.partner] : []),
        ...deck.cards.filter((card) => card.board === "mainboard"),
      ],
      map: getCardTokenMapV1(),
      cardSets: getCardTokenSetsV1(),
    });
  } catch (err) {
    console.warn("[deck-editor] token map unavailable:", err);
  }

  // Commander eligibility is read-time, same as display facts: the grab tray
  // and row actions only offer "promote to commander" for cards that can lead.
  if (commanderCatalog) {
    cards = cards.map((card) => ({
      ...card,
      canBeCommander: isPaperEligibleCommanderNameFast(commanderCatalog, card.name),
    }));
  }

  return {
    deck: {
      ...deck,
      // Semantic facts ride along on the same response as the display facts:
      // both are read-time lookups into caches this process already holds, and
      // grouping the deck by what its cards actually do should not cost a
      // second round trip. Synergy is the expensive relative of this and lives
      // on its own endpoint, fetched only once a player asks for it.
      cards,
    },
    legality: checkEditableDeckLegalityV1({
      deck,
      lookup: createCatalogCardFactsLookupV1(catalog),
      pairProblem: deck.partner ? commanderPairProblemFromCatalog(deck, catalog) : null,
    }),
    markerFacets: markerFacetsV1(deck, facts),
    tokens,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    // A deck started by hand has no build behind it, so it is opened by its own
    // id. Ownership comes from the stored record rather than the id, which is
    // client-supplied and therefore proves nothing.
    const deckIdParam = req.nextUrl.searchParams.get("deckId")?.trim();
    if (deckIdParam) {
      const deck = await getEditableDeckV1(deckIdParam);
      if (!deck || deck.customerId !== auth.customerId || deck.storeSlug !== slug) {
        return jsonError("Deck not found", 404);
      }
      return jsonOk(await deckWithLegality(deck));
    }

    const buildId = req.nextUrl.searchParams.get("buildId");
    if (!buildId) return jsonError("buildId or deckId required", 400);

    const deckId = editableDeckIdV1({ customerId: auth.customerId!, buildId });
    const existing = await getEditableDeckV1(deckId);
    if (existing) {
      if (existing.customerId !== auth.customerId) return jsonError("Deck not found", 404);
      return jsonOk(await deckWithLegality(existing));
    }

    // No stored deck yet, so hand the sealed build over. Rehydration from
    // Storage happens inside the job store, which is why a build from an
    // instance that has since been recycled still opens.
    const view = await getSolDirectedBuildJobV111(buildId);
    if (!view || view.job.storeSlug !== slug) return jsonError("Build not found", 404);
    if (view.job.userId !== auth.customerId) return jsonError("Build not found", 404);
    if (!view.result) return jsonError("That build has no decklist to edit", 409);

    const catalog = await getDeckResolutionCatalogRuntime();
    const created = createEditableDeckFromBuildV1({
      job: view.job,
      result: view.result,
      resolveLandOracleId: createLandOracleIdResolverV1(catalog),
      now: new Date().toISOString(),
    });
    if (!created.ok) return jsonError(created.message, 409);

    const stored = await createEditableDeckIfAbsentV1(created.deck);
    return jsonOk(await deckWithLegality(stored));
  } catch (err) {
    return handleRouteError(err);
  }
}

/**
 * Starts a deck by hand.
 *
 * Takes a commander (required) and optionally a decklist to seed it with. The
 * commander must be chosen explicitly — pasting a list alone is not enough —
 * so colour identity never depends on inferring a name from the paste.
 *
 * The seeded cards go through the ordinary edit reducer rather than being
 * written straight into the record, so an import cannot put a deck into a state
 * that adding cards one at a time could not.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const body = (await req.json().catch(() => ({}))) as {
      commanderName?: string;
      deckName?: string;
      decklist?: string;
    };

    const commanderName = body.commanderName?.trim() || "";
    if (!commanderName) {
      return jsonError("Pick a commander to start the deck", 400);
    }

    const resolved = await resolveHandDeckCommanderV1(commanderName);
    if (!resolved.ok) {
      return jsonError(resolved.message, 400);
    }

    let preview: ProfessorImportedDeckPreviewV111 | null = null;
    const decklist = body.decklist?.trim();
    if (decklist) {
      preview = previewProfessorImportedDeckV111({
        decklist,
        selectedCommanderName: commanderName,
        catalog: await getDeckResolutionCatalogRuntime(),
      });
    }

    // Looked up directly rather than through the commander picker's check: a
    // Background or a Doctor's companion is not a commander on its own, and
    // whether the pair is legal is the legality report's call to make.
    let partner: EditableDeckCommanderV1 | null = null;
    if (preview?.partnerName) {
      const card = lookupGoldenByName(await getDeckResolutionCatalogRuntime(), preview.partnerName);
      if (card) {
        partner = {
          oracleId: card.oracleId,
          name: card.canonicalName,
          colorIdentity: [...(card.colorIdentity ?? [])],
        };
      }
    }

    const now = new Date().toISOString();
    let deck = createEditableDeckFromScratchV1({
      deckId: handDeckIdV1({ customerId: auth.customerId!, handle: randomUUID() }),
      customerId: auth.customerId!,
      storeId: auth.storeId!,
      storeSlug: slug,
      commander: resolved.commander,
      partner,
      deckName: body.deckName,
      now,
    });

    let rejected: DeckEditRejectionV1[] = [];
    if (preview) {
      const ops = handDeckImportOpsV1({ cards: preview.cards });
      if (ops.length > 0) {
        const outcome = applyDeckEditOpsV1({ deck, ops, now });
        deck = outcome.deck;
        rejected = outcome.rejected;
      }
    }

    const stored = await createEditableDeckIfAbsentV1(deck);
    return jsonOk({ ...(await deckWithLegality(stored)), rejected });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const body = (await req.json()) as {
      buildId?: string;
      deckId?: string;
      expectedRevision?: number;
      ops?: unknown;
    };

    const deckId =
      body.deckId?.trim() ||
      (body.buildId?.trim()
        ? editableDeckIdV1({ customerId: auth.customerId!, buildId: body.buildId.trim() })
        : null);
    if (!deckId) return jsonError("buildId or deckId required", 400);

    const parsed = parseDeckEditOpsV1(body.ops);
    if (!parsed.ok) return jsonError(parsed.message, 400);

    // Commander swaps must resolve against the commander catalog — a client can
    // invent colour identity, but it cannot invent eligibility.
    const ops: typeof parsed.ops = [];
    for (const op of parsed.ops) {
      if (op.op !== "setCommander") {
        ops.push(op);
        continue;
      }
      const resolved = await resolveHandDeckCommanderV1(op.name);
      if (!resolved.ok) return jsonError(resolved.message, 422);
      ops.push({
        op: "setCommander",
        oracleId: resolved.commander.oracleId,
        name: resolved.commander.name,
        colorIdentity: resolved.commander.colorIdentity,
      });
    }

    const result = await mutateEditableDeckV1({
      deckId,
      customerId: auth.customerId!,
      ops,
      expectedRevision: body.expectedRevision,
    });

    if (!result.ok) {
      switch (result.failure) {
        case "NOT_FOUND":
          return jsonError(result.message, 404);
        case "FORBIDDEN":
          return jsonError(result.message, 404);
        case "REVISION_CONFLICT":
          // 409 with the current deck attached, so the client can reconcile
          // without a follow-up GET.
          return jsonOk(
            { conflict: true, message: result.message, ...(await deckWithLegality(result.deck)) },
            409,
          );
        case "ALL_REJECTED":
          return jsonError(result.message, 422, { rejected: result.rejected });
      }
    }

    return jsonOk({
      ...(await deckWithLegality(result.deck)),
      applied: result.applied,
      rejected: result.rejected,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Deletes the deck, and for a Professor build its saved record too. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const auth = await authorizeDeckEditorV1(req, slug);
    if (auth.error) return auth.error;

    const deckId = deckIdFromRequestV1(req, auth.customerId!);
    if (!deckId) return jsonError("buildId or deckId required", 400);
    const deck = await getEditableDeckV1(deckId);
    if (!deck || deck.customerId !== auth.customerId || deck.storeSlug !== slug) {
      return jsonError("Deck not found", 404);
    }

    const result = await deleteCustomerDeckV1({
      customerId: auth.customerId!,
      deckId,
      origin: deck.buildId ? "professor" : "hand",
      listKey: deckId,
    });
    if (!result.ok) return jsonError(result.message, 404);
    return jsonOk({ deleted: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
