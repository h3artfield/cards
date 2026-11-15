import { NextRequest, NextResponse } from "next/server";
import { handleRouteError } from "@/lib/api-utils";
import { searchTokensV1 } from "@/lib/token-creator/token-search-v1";

/** Real Magic tokens matching a query. Public Scryfall data, so no sign-in and cacheable. */
export async function GET(req: NextRequest) {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80);
    const limit = Math.min(30, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 12));
    return NextResponse.json(
      { tokens: searchTokensV1(q, limit) },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
    );
  } catch (err) {
    return handleRouteError(err);
  }
}
