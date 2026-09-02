import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getDeckResolutionCatalogRuntime } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";
import { previewProfessorImportedDeckV111 } from "@/lib/deck-synthesis/professor-imported-deck-hydrate-v1-1-1";
import { isProfessorSolDirectedGuiEnabled } from "@/lib/deck-synthesis/professor-sol-directed-gui-flag-v1-1-1";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    if (!isProfessorSolDirectedGuiEnabled()) {
      return jsonError("Sol-directed Professor builds are not enabled", 404);
    }
    await params;
    const body = (await req.json()) as {
      decklist?: string;
      selectedCommanderName?: string;
    };
    const decklist = body.decklist?.trim() ?? "";
    if (!decklist) return jsonError("Paste a deck list first", 400);

    const catalog = await getDeckResolutionCatalogRuntime();
    const preview = previewProfessorImportedDeckV111({
      decklist,
      selectedCommanderName: body.selectedCommanderName,
      catalog,
    });
    return jsonOk({ preview });
  } catch (err) {
    return handleRouteError(err);
  }
}
