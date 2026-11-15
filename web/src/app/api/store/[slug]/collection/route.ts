import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import {
  addCatalogPrintingToCollection,
  addPrintingToCollection,
  addScanToCollection,
  CollectionPrintingNotFoundError,
} from "@/lib/collection/collection-intake";
import { parseCollectionCatalogAdd } from "@/lib/collection/collection-catalog";
import { withBinderDeckHint, withBinderDeckHints } from "@/lib/collection/collection-binder-hints";
import { dataStore } from "@/lib/storage/data-store";
import type { ItemType } from "@/lib/types";

const ITEM_TYPES: ItemType[] = ["raw", "graded", "unknown"];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const cards = await dataStore.getCollectionCards(
      context.store.id,
      context.customer.id,
    );
    return jsonOk({ cards: await withBinderDeckHints(cards) });
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
    const context = await requireCustomerAtStore(req, slug);
    if (context instanceof NextResponse) return context;

    const body = (await req.json()) as Record<string, unknown>;
    const catalogAdd = parseCollectionCatalogAdd(body);
    if (catalogAdd) {
      try {
        const card = await addCatalogPrintingToCollection({
          storeId: context.store.id,
          customerId: context.customer.id,
          input: catalogAdd,
        });
        return jsonOk({ card: await withBinderDeckHint(card) }, 201);
      } catch (err) {
        if (err instanceof CollectionPrintingNotFoundError) {
          return jsonError(err.message, 404);
        }
        throw err;
      }
    }

    const scryfallId =
      typeof body.scryfallId === "string" ? body.scryfallId.trim() : "";
    if (scryfallId) {
      try {
        const card = await addPrintingToCollection({
          storeId: context.store.id,
          customerId: context.customer.id,
          scryfallId,
          finish:
            body.finish === "foil" || body.finish === "etched"
              ? body.finish
              : "nonfoil",
        });
        return jsonOk({ card: await withBinderDeckHint(card) }, 201);
      } catch (err) {
        if (err instanceof CollectionPrintingNotFoundError) {
          return jsonError(err.message, 404);
        }
        throw err;
      }
    }

    const frontImageUrl =
      typeof body.frontImageUrl === "string" ? body.frontImageUrl.trim() : "";
    if (!frontImageUrl) {
      return jsonError("A front photo or a card printing is required");
    }
    const backImageUrl =
      typeof body.backImageUrl === "string"
        ? body.backImageUrl.trim() || undefined
        : undefined;
    const itemType = ITEM_TYPES.includes(body.itemType as ItemType)
      ? (body.itemType as ItemType)
      : "unknown";

    const card = await addScanToCollection({
      storeId: context.store.id,
      customerId: context.customer.id,
      frontImageUrl,
      backImageUrl,
      itemType,
    });

    return jsonOk({ card: await withBinderDeckHint(card) }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
