import { NextRequest, NextResponse } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { requireCustomerAtStore } from "@/lib/auth/customer-store-binding";
import { addScanToCollection } from "@/lib/collection/collection-intake";
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
    return jsonOk({ cards });
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

    const body = (await req.json()) as {
      frontImageUrl?: string;
      backImageUrl?: string;
      itemType?: string;
    };

    const frontImageUrl = body.frontImageUrl?.trim();
    if (!frontImageUrl) {
      return jsonError("A front photo is required");
    }
    const backImageUrl = body.backImageUrl?.trim() || undefined;
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

    return jsonOk({ card }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}
