import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import { runStoreClerk } from "@/lib/store-inventory/store-clerk-agent";

export const maxDuration = 300;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const body = (await req.json()) as {
      message?: string;
      history?: Array<{ role: "user" | "assistant"; text: string }>;
      filters?: {
        game?: string;
        color?: string;
        cardType?: string;
        q?: string;
      };
    };

    if (!body.message?.trim()) {
      return jsonError("message is required", 400);
    }

    const response = await runStoreClerk({
      storeId: store.id,
      storeSlug: slug,
      storeName: store.storeName,
      message: body.message.trim(),
      history: body.history,
      currentFilters: body.filters as Parameters<
        typeof runStoreClerk
      >[0]["currentFilters"],
    });

    return jsonOk(response);
  } catch (err) {
    return handleRouteError(err);
  }
}
