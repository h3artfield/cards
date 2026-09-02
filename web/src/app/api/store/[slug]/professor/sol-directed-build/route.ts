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
import { assertProfessorSolDirectedP0Truth } from "@/lib/deck-synthesis/professor-sol-directed-p0-truth-v1-1-1";
import {
  createSolDirectedBuildJobV111,
  getSolDirectedBuildJobV111,
  appendSolDirectedBuildActivityV111,
} from "@/lib/deck-synthesis/professor-sol-directed-build-job-store-v1-1-1";
import { runSolDirectedCommanderBuild } from "@/lib/deck-synthesis/professor-sol-directed-commander-build-service-v1-1-1";
import {
  normalizeSolDirectedBuildUserInputsV111,
  type SolDirectedBuildJobRecordV111,
  type SolDirectedBuildJobViewV111,
} from "@/lib/deck-synthesis/professor-sol-directed-build-types-v1-1-1";
import type { DeckResolutionCatalog } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";

export const maxDuration = 900;

const runningBuilds = new Set<string>();
const STALE_BUILD_MS = 2 * 60 * 1000;
const P0_SELFTEST_CACHE_MS = 10 * 60 * 1000;
let p0SelftestCache: { pass: boolean; at: number } | null = null;

function isInProgressBuildStatus(status: SolDirectedBuildJobRecordV111["status"]): boolean {
  return status !== "COMPLETE" && status !== "FAILED";
}

function isStaleInProgressJob(job: SolDirectedBuildJobRecordV111): boolean {
  if (!isInProgressBuildStatus(job.status)) return false;
  return Date.now() - new Date(job.updatedAt).getTime() > STALE_BUILD_MS;
}

function runArgsFromJob(job: SolDirectedBuildJobRecordV111, catalog: DeckResolutionCatalog) {
  return {
    commanderOracleId: job.commanderOracleId,
    commanderName: job.commanderName,
    bracket: job.bracket,
    playstyle: job.playstyle,
    deckTheme: job.deckTheme,
    winPreference: job.winPreference,
    commanderStyle: job.commanderStyle,
    deckPreferences: job.userInputs.deckPreferences,
    userSemanticPreferences: job.userInputs.userSemanticPreferences,
    budgetConstraints: job.userInputs.budgetConstraints,
    inventoryConstraints: job.userInputs.inventoryConstraints,
    mode: job.userInputs.mode,
    importedCards: job.userInputs.importedCards,
    storeId: job.storeId,
    storeSlug: job.storeSlug,
    userId: job.userId,
    existingJob: job,
    catalog,
  };
}

function kickSolDirectedBuildWorker(buildId: string, runArgs: ReturnType<typeof runArgsFromJob>): void {
  if (runningBuilds.has(buildId)) return;
  runningBuilds.add(buildId);
  void (async () => {
    const p0Pass = runP0Selftest(runArgs.catalog);
    await runSolDirectedCommanderBuild({ ...runArgs, p0TruthPass: p0Pass });
  })().finally(() => {
    runningBuilds.delete(buildId);
  });
}

function runP0Selftest(catalog: DeckResolutionCatalog): boolean {
  if (process.env.PROFESSOR_SOL_DIRECTED_SKIP_P0_SELFTEST === "1") return true;
  if (p0SelftestCache && Date.now() - p0SelftestCache.at < P0_SELFTEST_CACHE_MS) {
    return p0SelftestCache.pass;
  }
  try {
    assertProfessorSolDirectedP0Truth(catalog);
    p0SelftestCache = { pass: true, at: Date.now() };
    return true;
  } catch (err) {
    console.error("[professor-sol-directed] P0 truth selftest failed:", err);
    p0SelftestCache = { pass: false, at: Date.now() };
    return false;
  }
}

function publicJobView(view: SolDirectedBuildJobViewV111) {
  return {
    solDirected: true as const,
    job: view.job,
    result: view.result
      ? {
          buildId: view.result.buildId,
          status: view.result.status,
          commander: {
            name: view.result.commander.name,
            oracleId: view.result.commander.oracleId,
            colorIdentity: view.result.commander.colorIdentity,
          },
          userInputs: view.result.userInputs,
          architectPlan: view.result.architectPlan,
          retrievalSummary: view.result.retrievalSummary,
          constructedDeck: view.result.constructedDeck,
          validation: view.result.validation
            ? {
                pass: view.result.validation.pass,
                violations: view.result.validation.violations,
                architectRequirementRealization: view.result.validation.architectRequirementRealization,
                legacyHeuristicAudit: view.result.validation.legacyHeuristicAudit,
              }
            : null,
          critic: view.result.critic,
          headProfessor: view.result.headProfessor,
          telemetry: view.result.telemetry,
          failureCode: view.result.failureCode,
          failureMessage: view.result.failureMessage,
          professorRepairApplied: view.result.professorRepairApplied,
          deckEnrichment: view.result.deckEnrichment ?? null,
        }
      : undefined,
  };
}

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

    if (isStaleInProgressJob(view.job)) {
      const catalog = await getDeckResolutionCatalogRuntime();
      await appendSolDirectedBuildActivityV111({
        buildId,
        status: view.job.status,
        message: "Build looked stalled — resuming…",
      });
      kickSolDirectedBuildWorker(buildId, runArgsFromJob(view.job, catalog));
      const refreshed = await getSolDirectedBuildJobV111(buildId);
      if (refreshed) return jsonOk(publicJobView(refreshed));
    }

    return jsonOk(publicJobView(view));
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
      if (isInProgressBuildStatus(view.job.status)) {
        await appendSolDirectedBuildActivityV111({
          buildId: view.job.buildId,
          status: view.job.status,
          message: "Resuming build worker…",
        });
        kickSolDirectedBuildWorker(view.job.buildId, runArgsFromJob(view.job, catalog));
      }
      const refreshed = await getSolDirectedBuildJobV111(view.job.buildId);
      return jsonOk(publicJobView(refreshed!));
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
      mode: body.start.mode,
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

    const runArgs = runArgsFromJob(job, catalog);

    if (body.awaitCompletion) {
      const p0Pass = runP0Selftest(catalog);
      const result = await runSolDirectedCommanderBuild({ ...runArgs, p0TruthPass: p0Pass });
      const view = await getSolDirectedBuildJobV111(result.buildId);
      if (!view) return jsonError("Build state lost", 500);
      return jsonOk(publicJobView(view));
    }

    if (!runningBuilds.has(job.buildId)) {
      kickSolDirectedBuildWorker(job.buildId, runArgs);
    }

    const view = await getSolDirectedBuildJobV111(job.buildId);
    return jsonOk(publicJobView(view!));
  } catch (err) {
    return handleRouteError(err);
  }
}
