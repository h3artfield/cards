/**
 * Background runner for Sol-directed build jobs, shared by the build route and
 * the deck-review route. Jobs run fire-and-forget inside the request's
 * instance; a stalled job is re-kicked by the next poll.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { runSolDirectedCommanderBuild } from "./professor-sol-directed-commander-build-service-v1-1-1";
import { assertProfessorSolDirectedP0Truth } from "./professor-sol-directed-p0-truth-v1-1-1";
import type {
  SolDirectedBuildJobRecordV111,
  SolDirectedBuildJobViewV111,
} from "./professor-sol-directed-build-types-v1-1-1";

const runningBuilds = new Set<string>();
const STALE_BUILD_MS = 2 * 60 * 1000;
const P0_SELFTEST_CACHE_MS = 10 * 60 * 1000;
let p0SelftestCache: { pass: boolean; at: number } | null = null;

export function isInProgressBuildStatusV111(status: SolDirectedBuildJobRecordV111["status"]): boolean {
  return status !== "COMPLETE" && status !== "FAILED";
}

export function isStaleInProgressJobV111(job: SolDirectedBuildJobRecordV111): boolean {
  if (!isInProgressBuildStatusV111(job.status)) return false;
  return Date.now() - new Date(job.updatedAt).getTime() > STALE_BUILD_MS;
}

export function isSolDirectedBuildRunningV111(buildId: string): boolean {
  return runningBuilds.has(buildId);
}

export function runArgsFromJobV111(job: SolDirectedBuildJobRecordV111, catalog: DeckResolutionCatalog) {
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
    sourceDeckId: job.userInputs.sourceDeckId,
    storeId: job.storeId,
    storeSlug: job.storeSlug,
    userId: job.userId,
    existingJob: job,
    catalog,
  };
}

export function runP0SelftestV111(catalog: DeckResolutionCatalog): boolean {
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

export function kickSolDirectedBuildWorkerV111(
  buildId: string,
  runArgs: ReturnType<typeof runArgsFromJobV111>,
): void {
  if (runningBuilds.has(buildId)) return;
  runningBuilds.add(buildId);
  void (async () => {
    const p0Pass = runP0SelftestV111(runArgs.catalog);
    await runSolDirectedCommanderBuild({ ...runArgs, p0TruthPass: p0Pass, scoreDeck: true });
  })().finally(() => {
    runningBuilds.delete(buildId);
  });
}

export function publicSolDirectedJobViewV111(view: SolDirectedBuildJobViewV111) {
  return {
    solDirected: true as const,
    job: view.job,
    result: view.result
      ? {
          buildId: view.result.buildId,
          status: view.result.status,
          commander: {
            name: view.result.commander?.name ?? view.job.commanderName,
            oracleId: view.result.commander?.oracleId ?? view.job.commanderOracleId,
            colorIdentity: [...(view.result.commander?.colorIdentity ?? [])],
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
          deckScore: view.result.deckScore ?? null,
          deckEnrichment: view.result.deckEnrichment ?? null,
          suggestedSwaps: view.result.suggestedSwaps ?? null,
        }
      : undefined,
  };
}
