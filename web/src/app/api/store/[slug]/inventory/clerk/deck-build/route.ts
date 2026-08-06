import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import { runDeckBuildStep } from "@/lib/store-inventory/commander-deck-build-service";
import type { CommanderDeckBuildSession } from "@/lib/store-inventory/clerk-tools/commander-deck-build-state";

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
      budget?: number;
      conversationSummary?: string;
      session?: CommanderDeckBuildSession;
    };

    if (!body.session && !body.message?.trim()) {
      return jsonError("message or session is required", 400);
    }

    const result = await runDeckBuildStep({
      storeId: store.id,
      storeSlug: slug,
      message: body.message?.trim(),
      conversationSummary: body.conversationSummary,
      budget: body.budget,
      session: body.session,
    });

    return jsonOk({
      reply: result.reply,
      deckList: result.deckList,
      session: result.session,
      stageIndex: result.stageIndex,
      stageLabel: result.stageLabel,
      totalStages: result.totalStages,
      complete: result.complete,
      highlightItemIds: result.deckList.lines
        .map((l) => l.inventoryItemId)
        .filter(Boolean),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
