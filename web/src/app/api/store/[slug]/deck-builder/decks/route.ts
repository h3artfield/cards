import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  getCustomerSession,
  loadCustomer,
  requireCustomerSession,
} from "@/lib/auth/customer-auth";
import {
  boundStoreName,
  customerCanActAtStore,
  storeMismatchResponse,
} from "@/lib/auth/customer-store-binding";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import { deckToMoxfieldExport } from "@/lib/deck-builder/commander-validation";
import type { StoreDeck } from "@/lib/deck-builder/types";

function randomShareToken(): string {
  return uuidv4().replace(/-/g, "").slice(0, 16);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const session = requireCustomerSession(req);
    if (session instanceof Response) return session;

    const decks = await deckBuilderStore.listStoreDecksForCustomer(
      store.id,
      session.customerId,
    );
    return jsonOk({ decks });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const body = (await req.json()) as Partial<StoreDeck> & {
      anonymous?: boolean;
    };

    if (!body.commanderScryfallId || !body.cards?.length) {
      return jsonError("commanderScryfallId and cards are required", 400);
    }

    const session = getCustomerSession(req);
    if (session) {
      const customer = await loadCustomer(session.customerId);
      if (customer && !customerCanActAtStore(customer, store.id)) {
        return storeMismatchResponse(await boundStoreName(customer));
      }
    }

    const now = new Date().toISOString();
    const ids = [
      body.commanderScryfallId,
      ...body.cards.map((c) => c.scryfallId),
    ];
    const catalogCards = await deckBuilderStore.getCatalogCards(ids);
    const catalogById = new Map(catalogCards.map((c) => [c.id, c]));

    const deck: StoreDeck = {
      id: body.id ?? uuidv4(),
      storeId: store.id,
      customerId: session?.customerId,
      shareToken: body.shareToken ?? randomShareToken(),
      name: body.name ?? "My Commander Deck",
      game: "magic",
      format: "commander",
      commanderScryfallId: body.commanderScryfallId,
      commanderSlug: body.commanderSlug,
      commanderName: body.commanderName,
      themeSlug: body.themeSlug,
      targetBracket: body.targetBracket,
      cards: body.cards,
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    };

    await deckBuilderStore.saveStoreDeck(deck);

    const exportText = deckToMoxfieldExport({
      commanderName:
        deck.commanderName ??
        catalogById.get(deck.commanderScryfallId)?.name ??
        "Commander",
      cards: deck.cards,
      catalogById,
    });

    return jsonOk({
      deck,
      shareUrl: `/s/${slug}/deck-builder/d/${deck.shareToken}`,
      exportText,
      requiresAccount: !session?.customerId && !body.anonymous,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
