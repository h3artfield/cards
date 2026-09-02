import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import {
  searchProfessorCommandersV1,
  warmProfessorCommanderBrowseCacheV1,
} from "@/lib/deck-synthesis/professor-commander-search-service-v1";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const prefetch = req.nextUrl.searchParams.get("prefetch") === "1";

    if (prefetch && !q) {
      void warmProfessorCommanderBrowseCacheV1();
      return jsonOk({ results: [], total: 0, warming: true, paperEligibleOnly: true });
    }

    const { results, total } = await searchProfessorCommandersV1(q);
    return jsonOk({ results, total, paperEligibleOnly: true });
  } catch (err) {
    return handleRouteError(err);
  }
}
