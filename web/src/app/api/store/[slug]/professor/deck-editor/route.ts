import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getDeckResolutionCatalogRuntime } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";
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
import {
  createCatalogCardFactsLookupV1,
  createLandOracleIdResolverV1,
} from "@/lib/professor-deck-editor/catalog-lookup-v1";
import { createEditableDeckFromBuildV1, editableDeckIdV1 } from "@/lib/professor-deck-editor/from-build-v1";
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
  } else {
    console.warn("[deck-editor] store inventory unavailable:", inventory.reason);
  }

  if (collection.status === "fulfilled") {
    const owned = collection.value.filter((card) => card.status === "owned");
    facts.ownedOracleIds = new Set(
      owned.map((card) => card.oracleId).filter((id): id is string => Boolean(id)),
    );
    facts.ownedNames = new Set(
      owned.map((card) => normalizeDeckCardNameV1(card.displayName)).filter(Boolean),
    );
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
      cards: withDisplayFactsV1(
        withDerivedMarkersV1(deck, facts),
        createCatalogDisplayFactsLookupV1(catalog),
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

    const buildId = req.nextUrl.searchParams.get("buildId");
    if (!buildId) return jsonError("buildId required", 400);

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
