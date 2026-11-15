import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getDeckResolutionCatalogRuntime } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";
import { parseProfessorBrewBracket } from "@/lib/deck-synthesis/professor-brew-bracket-v4-v1";
import { resolveCommanderBlueprintFromCatalogV417 } from "@/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import { previewProfessorImportedDeckV111 } from "@/lib/deck-synthesis/professor-imported-deck-hydrate-v1-1-1";
import { DEFAULT_PROFESSOR_PLAYSTYLE_V111 } from "@/lib/deck-synthesis/professor-playstyle-choices-v1-1-1";
import {
  appendSolDirectedBuildActivityV111,
  createSolDirectedBuildJobV111,
  getSolDirectedBuildJobV111,
} from "@/lib/deck-synthesis/professor-sol-directed-build-job-store-v1-1-1";
import { normalizeSolDirectedBuildUserInputsV111 } from "@/lib/deck-synthesis/professor-sol-directed-build-types-v1-1-1";
import {
  isStaleInProgressJobV111,
  kickSolDirectedBuildWorkerV111,
  publicSolDirectedJobViewV111,
  runArgsFromJobV111,
} from "@/lib/deck-synthesis/professor-sol-directed-build-worker-v1-1-1";
import { isProfessorSolDirectedGuiEnabled } from "@/lib/deck-synthesis/professor-sol-directed-gui-flag-v1-1-1";
import { getEditableDeckV1, recordProfessorReviewV1 } from "@/lib/professor-deck-editor/store-v1";
import type { EditableDeckV1 } from "@/lib/professor-deck-editor/types-v1";
import { authorizeDeckEditorV1 } from "../deck-editor/authorize";

export const maxDuration = 900;

/**
 * Professor review of a hand-built or imported deck: the same grade, report and
 * Critic swaps a Professor build gets, attached to the deck itself. The swaps
 * are suggestions; the deck only changes when its owner applies one.
 */

async function loadOwnedDeck(req: NextRequest, slug: string, deckId: string | undefined) {
  const auth = await authorizeDeckEditorV1(req, slug);
  if (auth.error) return { error: auth.error };
  if (!deckId) return { error: jsonError("deckId required", 400) };
  const deck = await getEditableDeckV1(deckId);
  if (!deck || deck.customerId !== auth.customerId || deck.storeSlug !== slug) {
    return { error: jsonError("Deck not found", 404) };
  }
  return { deck, auth };
}

function mainboardOf(deck: EditableDeckV1) {
  return deck.cards.filter((card) => card.board === "mainboard");
}

async function reviewState(deck: EditableDeckV1) {
  const review = deck.professorReview ?? null;
  let view = review ? await getSolDirectedBuildJobV111(review.buildId) : null;
  if (view && review?.status === "running" && isStaleInProgressJobV111(view.job)) {
    const catalog = await getDeckResolutionCatalogRuntime();
    await appendSolDirectedBuildActivityV111({
      buildId: view.job.buildId,
      status: view.job.status,
      message: "Review looked stalled — resuming…",
    });
    kickSolDirectedBuildWorkerV111(view.job.buildId, runArgsFromJobV111(view.job, catalog));
    view = (await getSolDirectedBuildJobV111(view.job.buildId)) ?? view;
  }
  return {
    review,
    revision: deck.revision,
    stale: review != null && review.atRevision !== deck.revision,
    mainboardNames: mainboardOf(deck).map((card) => card.name),
    view: view ? publicSolDirectedJobViewV111(view) : null,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const loaded = await loadOwnedDeck(req, slug, req.nextUrl.searchParams.get("deckId")?.trim());
    if (loaded.error) return loaded.error;
    return jsonOk(await reviewState(loaded.deck));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    if (!isProfessorSolDirectedGuiEnabled()) {
      return jsonError("Professor reviews are not enabled on this store yet", 404);
    }
    const { slug } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      deckId?: string;
      bracket?: number;
      playstyle?: string;
      deckTheme?: string;
      winPreference?: string;
      commanderStyle?: string;
      deckPreferences?: string;
    };
    const loaded = await loadOwnedDeck(req, slug, body.deckId?.trim());
    if (loaded.error) return loaded.error;
    const { deck, auth } = loaded;

    const current = deck.professorReview;
    if (current?.status === "running") {
      const running = await getSolDirectedBuildJobV111(current.buildId);
      if (running && !isStaleInProgressJobV111(running.job) && running.job.status !== "FAILED") {
        return jsonOk(await reviewState(deck));
      }
    }

    if (deck.partner) {
      const message = "The Professor can't review decks with two commanders yet. The editor's legality and bracket checks still cover this deck.";
      return jsonError(message, 422, { blockers: [message] });
    }

    const catalog = await getDeckResolutionCatalogRuntime();
    const importedCards = mainboardOf(deck).map((card) => ({ name: card.name, copies: card.copies }));
    const preview = previewProfessorImportedDeckV111({
      importedCards,
      selectedCommanderName: deck.commander.name,
      catalog,
    });
    if (!preview.canOptimize) {
      return jsonError(
        `The Professor can't review this deck yet: ${preview.blockers.join(" ")}`,
        422,
        { blockers: preview.blockers },
      );
    }

    const commander = resolveCommanderBlueprintFromCatalogV417({ catalog, commanderName: deck.commander.name });
    const bracket = parseProfessorBrewBracket(
      body.bracket ?? deck.measuredBracket?.bracket ?? deck.bracket ?? undefined,
    );
    const userInputs = normalizeSolDirectedBuildUserInputsV111({
      commanderOracleId: commander.oracleId,
      bracket,
      playstyle: body.playstyle?.trim() || DEFAULT_PROFESSOR_PLAYSTYLE_V111.userIntentPatch,
      deckTheme: body.deckTheme ?? "",
      winPreference: body.winPreference ?? "",
      commanderStyle:
        body.commanderStyle?.trim() ||
        "Let Professor decide commander dependence based on this commander's mechanics and bracket",
      deckPreferences: body.deckPreferences,
      mode: "review",
      importedCards,
      sourceDeckId: deck.deckId,
    });

    const job = createSolDirectedBuildJobV111({
      storeId: auth.storeId,
      storeSlug: slug,
      userId: auth.customerId,
      commanderOracleId: commander.oracleId,
      commanderName: commander.name,
      userInputs,
    });
    await appendSolDirectedBuildActivityV111({
      buildId: job.buildId,
      status: "CREATED",
      message: `Review queued for ${deck.deckName || commander.name}.`,
    });

    const stamped = await recordProfessorReviewV1({
      deckId: deck.deckId,
      review: {
        buildId: job.buildId,
        status: "running",
        atRevision: deck.revision,
        requestedAt: new Date().toISOString(),
      },
    });

    kickSolDirectedBuildWorkerV111(job.buildId, runArgsFromJobV111(job, catalog));
    return jsonOk(await reviewState(stamped ?? deck));
  } catch (err) {
    return handleRouteError(err);
  }
}
