import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  buildDeckBuilderInventory,
  getOrSyncEdhrecMeta,
  resolveStoreBySlug,
} from "@/lib/deck-builder/deck-builder-service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const commanderSlug = req.nextUrl.searchParams.get("commanderSlug") ?? "";
    const themeSlug = req.nextUrl.searchParams.get("themeSlug") ?? undefined;
    const query = req.nextUrl.searchParams.get("q") ?? undefined;

    if (!commanderSlug) {
      return jsonError("commanderSlug is required", 400);
    }

    const meta = await getOrSyncEdhrecMeta({ commanderSlug, themeSlug });
    const identity = meta?.colorIdentity ?? [];

    const inventory = await buildDeckBuilderInventory({
      storeId: store.id,
      commanderColorIdentity: identity,
      edhrecMeta: meta,
      query,
      limit: 200,
    });

    return jsonOk({ inventory, commander: meta });
  } catch (err) {
    return handleRouteError(err);
  }
}
