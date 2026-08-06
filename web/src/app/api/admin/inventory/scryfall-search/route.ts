import { NextRequest } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  lookupScryfallPrintingById,
  searchScryfallPrintings,
} from "@/lib/deck-builder/scryfall-printing-search";

/** Scryfall printing search for admin manual catalog match. */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;

    const params = req.nextUrl.searchParams;
    const q = params.get("q")?.trim();
    if (!q) return jsonError("q is required");

    const limit = Math.min(24, Math.max(1, Number(params.get("limit") ?? 12)));

    const uuidLike =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
    if (uuidLike) {
      const hit = await lookupScryfallPrintingById(q);
      return jsonOk({ results: hit ? [hit] : [] });
    }

    const results = await searchScryfallPrintings({ query: q, limit });
    return jsonOk({ results });
  } catch (err) {
    return handleRouteError(err);
  }
}
