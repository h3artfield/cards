import { NextResponse } from "next/server";
import { loadCosV1Runtime } from "@/lib/commander-optimization-score/v1/load-artifacts";
import { getDeckResolutionCatalogRuntime } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 240;

/**
 * Cloud Run's startup probe. The instance gets no traffic until this answers,
 * so the ~25s catalog and deck-scoring load happens before any customer is
 * routed to it rather than inside their first request.
 *
 * Always 200: a failed preload must not stop the instance from serving, since
 * every route still loads on demand.
 */
export async function GET() {
  const started = Date.now();
  try {
    await getDeckResolutionCatalogRuntime();
    await loadCosV1Runtime();
    console.log(`[warmup] Professor caches ready in ${Date.now() - started}ms`);
    return NextResponse.json({ warm: true, ms: Date.now() - started });
  } catch (err) {
    console.warn("[warmup] Professor cache preload failed; requests will load on demand:", err);
    return NextResponse.json({ warm: false, ms: Date.now() - started });
  }
}
