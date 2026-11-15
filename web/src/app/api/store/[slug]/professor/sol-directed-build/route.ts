import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getCustomerSession, loadCustomer } from "@/lib/auth/customer-auth";
import {
  boundStoreName,
  customerCanActAtStore,
  storeMismatchResponse,
} from "@/lib/auth/customer-store-binding";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import { resolveCommanderBlueprintFromCatalogV417 } from "@/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import { getDeckResolutionCatalogRuntime } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";
import { parseProfessorBrewBracket } from "@/lib/deck-synthesis/professor-brew-bracket-v4-v1";
import { isProfessorSolDirectedGuiEnabled } from "@/lib/deck-synthesis/professor-sol-directed-gui-flag-v1-1-1";
import {
  createSolDirectedBuildJobV111,
  getSolDirectedBuildJobV111,
  appendSolDirectedBuildActivityV111,
} from "@/lib/deck-synthesis/professor-sol-directed-build-job-store-v1-1-1";
import { runSolDirectedCommanderBuild } from "@/lib/deck-synthesis/professor-sol-directed-commander-build-service-v1-1-1";
import { normalizeSolDirectedBuildUserInputsV111 } from "@/lib/deck-synthesis/professor-sol-directed-build-types-v1-1-1";
import {
  isInProgressBuildStatusV111,
  isSolDirectedBuildRunningV111,
  isStaleInProgressJobV111,
  kickSolDirectedBuildWorkerV111,
  publicSolDirectedJobViewV111,
  runArgsFromJobV111,
  runP0SelftestV111,
} from "@/lib/deck-synthesis/professor-sol-directed-build-worker-v1-1-1";

export const maxDuration = 900;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    if (!isProfessorSolDirectedGuiEnabled()) {
      return jsonError("Sol-directed Professor builds are not enabled", 404);
    }
    const { slug } = await params;
    const buildId = req.nextUrl.searchParams.get("buildId");
    if (!buildId) return jsonError("buildId required", 400);

    const view = await getSolDirectedBuildJobV111(buildId);
    if (!view) return jsonError("Build not found", 404);
    if (view.job.storeSlug !== slug) return jsonError("Build not found", 404);

    if (isStaleInProgressJobV111(view.job)) {
      const catalog = await getDeckResolutionCatalogRuntime();
      await appendSolDirectedBuildActivityV111({
        buildId,
        status: view.job.status,
        message: "Build looked stalled — resuming…",
      });
      kickSolDirectedBuildWorkerV111(buildId, runArgsFromJobV111(view.job, catalog));
      const refreshed = await getSolDirectedBuildJobV111(buildId);
      if (refreshed) return jsonOk(publicSolDirectedJobViewV111(refreshed));
    }

    return jsonOk(publicSolDirectedJobViewV111(view));
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    if (!isProfessorSolDirectedGuiEnabled()) {
      return jsonError("Sol-directed Professor builds are not enabled", 404);
    }

    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const body = (await req.json()) as {
      start?: {
        commanderOracleId: string;
        commanderName: string;
        bracket?: number;
        playstyle: string;
        deckTheme?: string;
        winPreference?: string;
        commanderStyle?: string;
        deckPreferences?: string;
        userSemanticPreferences?: { prefer?: string[]; avoid?: string[] };
        budgetConstraints?: string[];
        inventoryConstraints?: string[];
        mode?: "build" | "optimize";
        importedCards?: Array<{ name: string; copies: number }>;
        userId?: string;
      };
      resume?: { buildId: string };
      awaitCompletion?: boolean;
    };

    const catalog = await getDeckResolutionCatalogRuntime();

    if (body.resume?.buildId) {
      const view = await getSolDirectedBuildJobV111(body.resume.buildId);
      if (!view) return jsonError("Build not found", 404);
      if (view.job.storeSlug !== slug) return jsonError("Build not found", 404);
      if (isInProgressBuildStatusV111(view.job.status)) {
        await appendSolDirectedBuildActivityV111({
          buildId: view.job.buildId,
          status: view.job.status,
          message: "Resuming build worker…",
        });
        kickSolDirectedBuildWorkerV111(view.job.buildId, runArgsFromJobV111(view.job, catalog));
      }
      const refreshed = await getSolDirectedBuildJobV111(view.job.buildId);
      return jsonOk(publicSolDirectedJobViewV111(refreshed!));
    }

    if (!body.start) return jsonError("start or resume payload required", 400);

    const session = getCustomerSession(req);
    if (!session) {
      return jsonError("Sign in to build a deck", 401);
    }

    const customer = await loadCustomer(session.customerId);
    if (customer && !customerCanActAtStore(customer, store.id)) {
      return storeMismatchResponse(await boundStoreName(customer));
    }

    const bracket = parseProfessorBrewBracket(body.start.bracket);

    const commanderBlueprint = resolveCommanderBlueprintFromCatalogV417({
      catalog,
      commanderName: body.start.commanderName,
    });

    const userInputs = normalizeSolDirectedBuildUserInputsV111({
      commanderOracleId: commanderBlueprint.oracleId,
      bracket,
      playstyle: body.start.playstyle,
      deckTheme: body.start.deckTheme ?? "",
      winPreference: body.start.winPreference ?? "",
      commanderStyle: body.start.commanderStyle ?? "lean into what makes this commander unique",
      deckPreferences: body.start.deckPreferences,
      userSemanticPreferences: body.start.userSemanticPreferences,
      budgetConstraints: body.start.budgetConstraints,
      inventoryConstraints: body.start.inventoryConstraints,
      // Reviews are started from a deck through the deck-review route, never here.
      mode: body.start.mode === "optimize" ? "optimize" : "build",
      importedCards: body.start.importedCards,
    });

    const job = createSolDirectedBuildJobV111({
      storeId: store.id,
      storeSlug: slug,
      userId: session.customerId,
      commanderOracleId: commanderBlueprint.oracleId,
      commanderName: body.start.commanderName,
      userInputs,
    });

    await appendSolDirectedBuildActivityV111({
      buildId: job.buildId,
      status: "CREATED",
      message:
        body.start.mode === "optimize"
          ? `Optimization queued for ${body.start.commanderName}.`
          : `Build queued for ${body.start.commanderName}.`,
    });

    const runArgs = runArgsFromJobV111(job, catalog);

    if (body.awaitCompletion) {
      const p0Pass = runP0SelftestV111(catalog);
      const result = await runSolDirectedCommanderBuild({ ...runArgs, p0TruthPass: p0Pass, scoreDeck: true });
      const view = await getSolDirectedBuildJobV111(result.buildId);
      if (!view) return jsonError("Build state lost", 500);
      return jsonOk(publicSolDirectedJobViewV111(view));
    }

    if (!isSolDirectedBuildRunningV111(job.buildId)) {
      kickSolDirectedBuildWorkerV111(job.buildId, runArgs);
    }

    const view = await getSolDirectedBuildJobV111(job.buildId);
    return jsonOk(publicSolDirectedJobViewV111(view!));
  } catch (err) {
    return handleRouteError(err);
  }
}
