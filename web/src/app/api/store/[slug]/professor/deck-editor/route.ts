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
import { applyDeckEditOpsV1 } from "@/lib/professor-deck-editor/ops-v1";
import type { DeckEditRejectionV1 } from "@/lib/professor-deck-editor/ops-v1";
import { checkEditableDeckLegalityV1 } from "@/lib/professor-deck-editor/legality-v1";
import {
  createEditableDeckIfAbsentV1,
  getEditableDeckV1,
  mutateEditableDeckV1,
} from "@/lib/professor-deck-editor/store-v1";
import { parseDeckEditOpsV1 } from "@/lib/professor-deck-editor/parse-ops-v1";
import type { EditableDeckV1 } from "@/lib/professor-deck-editor/types-v1";
import { authorizeDeckEditorV1 } from "./authorize";

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

async function deckWithLegality(deck: EditableDeckV1) {
  const [catalog, facts] = await Promise.all([
    getDeckResolutionCatalogRuntime(),
    derivedMarkerFacts(deck),
  ]);

  return {
    deck: {
      ...deck,
      // Semantic facts ride along on the same response as the display facts:
      // both are read-time lookups into caches this process already holds, and
      // grouping the deck by what its cards actually do should not cost a
      // second round trip. Synergy is the expensive relative of this and lives
      // on its own endpoint, fetched only once a player asks for it.
      cards: withSemanticFactsV1(
        withDisplayFactsV1(
          withDerivedMarkersV1(deck, facts),
          createCatalogDisplayFactsLookupV1(catalog),
        ),
      ),
    },
    legality: checkEditableDeckLegalityV1({
      deck,
      lookup: createCatalogCardFactsLookupV1(catalog),
    }),
    markerFacets: markerFacetsV1(deck, facts),
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
 * Takes a commander, and optionally a decklist to seed it with. When only a
 * list is supplied the commander is inferred from it, because a customer
 * pasting an export from Moxfield has already said who leads the deck and
 * asking again would be a step that exists purely to satisfy the data model.
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

    const decklist = body.decklist?.trim();
    let preview: ProfessorImportedDeckPreviewV111 | null = null;

    if (decklist) {
      preview = previewProfessorImportedDeckV111({
        decklist,
        selectedCommanderName: body.commanderName?.trim() || undefined,
        catalog: await getDeckResolutionCatalogRuntime(),
      });
    }

    const commanderName = body.commanderName?.trim() || preview?.commanderName || "";
    const resolved = await resolveHandDeckCommanderV1(commanderName);
    if (!resolved.ok) {
      return jsonError(
        commanderName ? resolved.message : "Pick a commander, or paste a list that names one",
        400,
      );
    }

    const now = new Date().toISOString();
    let deck = createEditableDeckFromScratchV1({
      deckId: handDeckIdV1({ customerId: auth.customerId!, handle: randomUUID() }),
      customerId: auth.customerId!,
      storeId: auth.storeId!,
      storeSlug: slug,
      commander: resolved.commander,
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

    const result = await mutateEditableDeckV1({
      deckId,
      customerId: auth.customerId!,
      ops: parsed.ops,
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
