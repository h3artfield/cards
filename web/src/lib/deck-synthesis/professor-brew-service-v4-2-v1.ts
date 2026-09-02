/**
 * Professor v4.2 brew service — server-side session store + fixture hydration + v4.3 live mode.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProfessorV41ConversationLoopResultV1 } from "./professor-v4-1-conversation-loop-v1";
import {
  applyBrewSessionActionV42,
  buildSessionViewV42,
  createBrewSessionV42,
  type BrewSessionActionV42,
  type BrewSessionModeV42,
  type BrewSessionV42,
  type BrewSessionViewV42,
} from "./professor-brew-session-v4-2-v1";
import {
  BREW_COMMANDER_FIXTURES_V42,
  type BrewFixtureCaseV42,
} from "./professor-brew-fixtures-v4-2-v1";
import {
  buildLiveLoopResultV43,
  runLiveCreativePass1V43,
  runLiveResearchProfessorLineV43,
} from "./professor-brew-live-v4-3-v1";
import { resolveProfessorBrewCommanderV44 } from "./professor-brew-commander-resolver-v4-4-v1";
import { getDeckResolutionCatalogRuntime } from "./professor-brew-catalog-runtime-v1";
import { buildProspectiveMechanismCatalogEntry } from "./professor-brew-prospective-truth-v4-4-v1";
import { findAdjudicatedMechanismEntry } from "./professor-brew-commander-resolver-v4-4-v1";
import type { ImplementedMechanismCatalogEntry } from "../../../scripts/lib/phase6a1-implemented-mechanism-catalog-v1";
import {
  resolveProfessorBrewCardImageMap,
} from "./professor-brew-card-images-server-v4-3-v1";
import { isScryfallRedirectImageUrl, scryfallNamedImageUrl } from "./professor-brew-scryfall-images-v1";
import { matchProfessorDeckCardsInStoreInventory } from "./professor-brew-inventory-match-v4-3-v1";
import { collectBrewTreeCardNamesV42 } from "./professor-brew-tree-v4-2-v1";
import type { CommanderBracket } from "@/lib/bracket-policy/bracket-policy-v1";
import { withCatalogEntryBracket } from "./professor-catalog-entry-bracket-v4-v1";
import {
  advanceCouncilAssemblyV47,
  deckListFromCouncilStateV47,
  executeStructuralResearchPassV41662,
  recomputeBracketNativeStateV416,
  runInitialAssemblyV47,
  type ProfessorCouncilStateV47,
} from "./professor-council-assembly-v4-7-v1";
import {
  assertStructuralActionExecutedV41662,
  resolveProfessorNextActionFromSessionV41662,
} from "./professor-next-action-dispatch-v4-16-6-2-v1";
import { runProfessorFinalizationPipelineV414 } from "./professor-finalization-pipeline-v4-14-v1";
import { FinalizationPipelineFailedError } from "./professor-finalization-pipeline-v4-8-v1";
import {
  emptyFinalDeckDoctorSessionV48,
  HEAD_PROFESSOR_PRODUCT_NAME,
} from "./professor-final-deck-doctor-v4-8-v1";
import {
  professorBrewCanEnterFinalizationV416,
  professorBrewNeedsBracketResearchV416,
  professorBrewNeedsFinalReviewV48,
  professorBrewNeedsManaBaseV48,
  professorBrewNeedsDeckCompletionV416,
} from "./professor-brew-progress-v4-7-v1";
import {
  markBracketResearchExhaustedV4162,
  runBracketResearchReplacePassV4162,
} from "./professor-bracket-research-replace-v4-16-2-v1";
import { ensureCanonicalFinalDeckV411 } from "./professor-final-deck-canonical-v4-11-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import { resolveStructuralTargetV416 } from "./professor-mana-plan-v4-16-v1";
import { assessDeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import { assertManaBaseAllowedV4165 } from "./professor-structural-search-planner-v4-16-5-v1";

export {
  professorBrewCommittedCardCountV47,
  professorBrewIsDraftReadyV47,
  professorBrewIsFinalReviewRunningV48,
  professorBrewNeedsFinalReviewV48,
  professorBrewNeedsManaBaseV48,
  professorBrewNeedsDeckCompletionV416,
  professorBrewNeedsBracketResearchV416,
  professorBrewCanEnterFinalizationV416,
  professorBrewShouldContinueAutoBuildV47,
} from "./professor-brew-progress-v4-7-v1";

export const PROFESSOR_BREW_SERVICE_V4_2_V1_VERSION = "professor-brew-service-v4-2-v1";

const sessions = new Map<string, BrewSessionV42>();
const finalReviewJobs = new Set<string>();

function milestonesPath(name: string): string {
  const candidates = [
    resolve(process.cwd(), "data/milestones/deck-synthesis", name),
    resolve(process.cwd(), "web/data/milestones/deck-synthesis", name),
    resolve(process.cwd(), "../web/data/milestones/deck-synthesis", name),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

function loadFixtureLoopResult(fixtureCase: BrewFixtureCaseV42): ProfessorV41ConversationLoopResultV1 {
  const file = milestonesPath(`phase6a1-professor-v4-1-conversation-${fixtureCase}-result-v1.json`);
  return JSON.parse(readFileSync(file, "utf8")) as ProfessorV41ConversationLoopResultV1;
}

function cardNamesFromTheory(session: BrewSessionV42): string[] {
  if (session.deckList.length > 0) {
    return session.deckList.map((c) => c.name);
  }
  if (!session.workingDeckTheory) return session.commanderName ? [session.commanderName] : [];
  return collectBrewTreeCardNamesV42(session.workingDeckTheory);
}

async function ensureSessionCardImages(session: BrewSessionV42): Promise<BrewSessionV42> {
  const needed = cardNamesFromTheory(session).filter((name) => {
    const url = session.cardImageUrls[name];
    return !url || isScryfallRedirectImageUrl(url);
  });
  if (needed.length === 0) return session;
  // Resolve a small batch per step — full deck images come from inventory-match on the client.
  const batch = needed.slice(0, 12);
  const resolved = await resolveProfessorBrewCardImageMap(batch);
  return applyBrewSessionActionV42(session, { type: "MERGE_CARD_IMAGES", cardImageUrls: resolved });
}

function commanderImageUrlForHydrate(session: BrewSessionV42): Record<string, string> {
  if (!session.commanderName) return {};
  return { [session.commanderName]: scryfallNamedImageUrl(session.commanderName) };
}

async function ensureSessionInStockNames(session: BrewSessionV42): Promise<BrewSessionV42> {
  if (!session.storeSlug || session.deckList.length === 0) return session;
  try {
    const { inStockNames } = await matchProfessorDeckCardsInStoreInventory({
      storeSlug: session.storeSlug,
      cardNames: session.deckList.map((card) => card.name),
    });
    return applyBrewSessionActionV42(session, { type: "SET_IN_STOCK_NAMES", inStockNames });
  } catch {
    return session;
  }
}

export function createProfessorBrewSessionV42(args: { mode: BrewSessionModeV42 }): BrewSessionViewV42 {
  const sessionId = `brew-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const session = createBrewSessionV42({ sessionId, mode: args.mode });
  sessions.set(sessionId, session);
  return buildSessionViewV42(session);
}

export function getProfessorBrewSessionV42(sessionId: string): BrewSessionViewV42 | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return buildSessionViewV42(session);
}

export async function refreshProfessorBrewSessionStockV42(
  sessionId: string,
  storeSlug: string,
): Promise<BrewSessionViewV42 | null> {
  let session = sessions.get(sessionId);
  if (!session) return null;
  if (!session.storeSlug) {
    session = applyBrewSessionActionV42(session, { type: "SET_STORE_SLUG", storeSlug });
  }
  session = await ensureSessionInStockNames(session);
  sessions.set(sessionId, session);
  return buildSessionViewV42(session);
}

export async function dispatchProfessorBrewActionV42(
  sessionId: string,
  action: BrewSessionActionV42,
): Promise<BrewSessionViewV42 | { error: string }> {
  let session = sessions.get(sessionId);
  if (!session) return { error: "Session not found" };

  if (action.type === "SELECT_COMMANDER") {
    const commanderImageUrl = action.commanderImageUrl ?? scryfallNamedImageUrl(action.commanderName);
    session = applyBrewSessionActionV42(session, { ...action, commanderImageUrl });
    sessions.set(sessionId, session);
    return buildSessionViewV42(session);
  }

  if (action.type === "CHOOSE_RELATIONSHIP") {
    session = applyBrewSessionActionV42(session, action);

    if (session.mode === "live" && session.mechanismTruthCaseId && !session.workingDeckTheory) {
      session = applyBrewSessionActionV42(session, {
        type: "SET_LIVE_STATUS",
        status: "Reading commander and mapping mechanics…",
      });
      sessions.set(sessionId, session);

      try {
        const catalogEntry = await catalogEntryForSessionV44(session);
        session = applyBrewSessionActionV42(session, {
          type: "SET_LIVE_STATUS",
          status: "Creative Professor considering strategies…",
        });
        sessions.set(sessionId, session);

        const { pass1, professorLine, planningContext } = await runLiveCreativePass1V43({
          catalogEntry,
          commanderName: session.commanderName ?? pass1CommanderFallback(session),
          userIntent: session.userIntent,
          relationshipLens: action.lens,
        });
        const loopResult = buildLiveLoopResultV43({
          mechanismTruthCaseId: session.mechanismTruthCaseId,
          creativePass1: pass1,
          userIntent: session.userIntent,
          frozenContext: planningContext,
        });
        const cardImageUrls = commanderImageUrlForHydrate(session);
        session = applyBrewSessionActionV42(session, {
          type: "HYDRATE_LOOP",
          loopResult,
          cardImageUrls,
        });
        session = await syncLiveCouncilAssemblyV47(session, false);
        session = applyBrewSessionActionV42(session, {
          type: "APPEND_PROFESSOR_LINE",
          body: professorLine,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Live creative pass failed";
        session = applyBrewSessionActionV42(session, { type: "SET_LIVE_STATUS", status: null });
        session = applyBrewSessionActionV42(session, {
          type: "APPEND_PROFESSOR_LINE",
          body: `Live brew failed (${message}). Falling back to offline replay.`,
        });
        if (session.fixtureCase) {
          const loopResult = loadFixtureLoopResult(session.fixtureCase);
          const cardImageUrls = commanderImageUrlForHydrate(session);
          session = applyBrewSessionActionV42(session, { type: "HYDRATE_LOOP", loopResult, cardImageUrls });
        }
      }
    } else if (session.fixtureCase && !session.workingDeckTheory) {
      const loopResult = loadFixtureLoopResult(session.fixtureCase);
      const cardImageUrls = commanderImageUrlForHydrate(session);
      session = applyBrewSessionActionV42(session, { type: "HYDRATE_LOOP", loopResult, cardImageUrls });
    }

    session = await ensureSessionCardImages(session);
    session = await ensureSessionInStockNames(session);
    sessions.set(sessionId, session);
    return buildSessionViewV42(session);
  }

  if (action.type === "RUN_MANA_BASE") {
    const slotBudget = assessDeckSlotBudgetV4163({
      manaPlan: session.councilState?.manaPlanV416 ?? null,
      selectedCards: session.councilState?.selectedCards ?? [],
    });
    assertManaBaseAllowedV4165({ structurallyComplete: slotBudget.structurallyComplete, context: "RUN_MANA_BASE" });
    session = await maybeRunManaBaseV48(session);
    session = await ensureSessionCardImages(session);
    session = await ensureSessionInStockNames(session);
    sessions.set(sessionId, session);
    return buildSessionViewV42(session);
  }

  if (action.type === "RUN_FINAL_REVIEW") {
    if (!professorBrewCanEnterFinalizationV416(session) && !session.councilState?.bracketReadinessV416?.carryForwardFlag) {
      throw new Error(
        session.councilState?.bracketReadinessV416?.message ??
          "Bracket readiness gate — cannot enter finalization until research resolves deficits",
      );
    }
    session = startFinalReviewJobV48(sessionId, session);
    sessions.set(sessionId, session);
    return buildSessionViewV42(session);
  }

  if (action.type === "RUN_BRACKET_RESEARCH") {
    session = await maybeRunBracketResearchV4162(session);
    session = await ensureSessionCardImages(session);
    session = await ensureSessionInStockNames(session);
    sessions.set(sessionId, session);
    return buildSessionViewV42(session);
  }

  if (action.type === "ADVANCE_TREE") {
    const prevStep = session.treeRevealStep;
    session = applyBrewSessionActionV42(session, action);

    if (session.mode === "live" && session.workingDeckTheory && session.treeRevealStep > prevStep) {
      if (session.treeRevealStep >= 2 && session.treeRevealStep <= 4) {
        try {
          session = applyBrewSessionActionV42(session, {
            type: "SET_LIVE_STATUS",
            status: "Research Professor verifying…",
          });
          sessions.set(sessionId, session);
          const line = await runLiveResearchProfessorLineV43({
            theory: session.workingDeckTheory,
            treeRevealStep: session.treeRevealStep,
            commanderName: session.commanderName ?? session.workingDeckTheory.commander,
          });
          session = applyBrewSessionActionV42(session, { type: "APPEND_PROFESSOR_LINE", body: line });
        } catch {
          /* offline-style lines already added by reducer */
        }
      }
      session = applyBrewSessionActionV42(session, { type: "SET_LIVE_STATUS", status: "Research Professor searching catalog…" });
      sessions.set(sessionId, session);
      session = await syncLiveCouncilAssemblyV47(session, true);
      session = applyBrewSessionActionV42(session, { type: "SET_LIVE_STATUS", status: null });
    }

    session = await ensureSessionCardImages(session);
    session = await ensureSessionInStockNames(session);
    sessions.set(sessionId, session);
    return buildSessionViewV42(session);
  }

  if (action.type === "HYDRATE_LOOP" && session.mode === "live" && !session.fixtureCase) {
    session = applyBrewSessionActionV42(session, action);
    session = await syncLiveCouncilAssemblyV47(session, false);
    session = await ensureSessionCardImages(session);
    session = await ensureSessionInStockNames(session);
    sessions.set(sessionId, session);
    return buildSessionViewV42(session);
  }

  session = applyBrewSessionActionV42(session, action);
  session = await ensureSessionCardImages(session);
  session = await ensureSessionInStockNames(session);
  sessions.set(sessionId, session);
  return buildSessionViewV42(session);
}

async function syncLiveCouncilAssemblyV47(session: BrewSessionV42, advance = false): Promise<BrewSessionV42> {
  if (session.fixtureCase || !session.councilState || !session.commanderName || !session.commanderOracleId || !session.loopResult || !session.workingDeckTheory) {
    return session;
  }
  const catalog = await getDeckResolutionCatalogRuntime();
  const context = {
    commanderName: session.commanderName,
    bracket: session.bracket,
    userIntent: session.userIntent,
    relationshipLens: session.relationshipLens,
    playStyle: session.userIntent.find((i) => !i.startsWith("Bracket") && !i.includes("SYNERGY")) ?? "Let professors decide",
    commanderRelationship: session.relationshipLens ?? "HARMONY",
    fixtureCase: session.fixtureCase,
  };

  let councilState: ProfessorCouncilStateV47 =
    session.councilState.selectedCards.length === 0 && session.councilState.buildPhase === "CHARTER"
      ? await runInitialAssemblyV47({
          state: session.councilState,
          context,
          loopResult: session.loopResult,
          theory: session.workingDeckTheory,
          catalog,
          commanderOracleId: session.commanderOracleId,
          colorIdentity: session.commanderColorIdentity,
        })
      : session.councilState;

  if (advance) {
    const libraryCount = (councilState as ProfessorCouncilStateV47).selectedCards.length;
    const brewCtx = { ...session, councilState } as BrewSessionV42;
    const nextDecision = resolveProfessorNextActionFromSessionV41662(brewCtx);
    const priorExecCount =
      (councilState as ProfessorCouncilStateV47).structuralBuildTelemetryV4166?.structuralSearchExecutionCount ?? 0;

    if (nextDecision.action === "RUN_STRUCTURAL_RESEARCH") {
      councilState = await executeStructuralResearchPassV41662({
        state: councilState as ProfessorCouncilStateV47,
        catalog,
        pass1: session.loopResult.creativePass1,
        theory: session.workingDeckTheory,
        colorIdentity: session.commanderColorIdentity,
        bracket: session.bracket,
      });
      assertStructuralActionExecutedV41662({
        priorExecutionCount: priorExecCount,
        nextExecutionCount:
          (councilState as ProfessorCouncilStateV47).structuralBuildTelemetryV4166?.structuralSearchExecutionCount ?? 0,
        requestedAction: "RUN_STRUCTURAL_RESEARCH",
      });
    } else if (nextDecision.action === "ADVANCE_TREE") {
      councilState = await advanceCouncilAssemblyV47({
        state: councilState as ProfessorCouncilStateV47,
        catalog,
        pass1: session.loopResult.creativePass1,
        theory: session.workingDeckTheory,
        colorIdentity: session.commanderColorIdentity,
        bracket: session.bracket,
        batchSize: Math.min(5, Math.max(3, Math.ceil(libraryCount / 5) || 3)),
      });
    }
  }

  councilState = recomputeBracketNativeStateV416({
    state: councilState as ProfessorCouncilStateV47,
    catalog,
    bracket: session.bracket,
    theory: session.workingDeckTheory,
    commanderColorIdentity: session.commanderColorIdentity,
    discoveryExhausted: councilState.buildPhase === "NEEDS_ATTENTION",
  });

  const deckList = deckListFromCouncilStateV47({ state: councilState as ProfessorCouncilStateV47, commanderName: session.commanderName }).map((c) => ({
    name: c.name,
    category: c.category,
  }));

  const fullDeck = deckList.length >= COMMANDER_DECK_LIBRARY_SIZE_V47 + 1;
  const revealBump = advance ? (fullDeck ? deckList.length : 4) : deckList.length > 1 ? 1 : 0;

  return applyBrewSessionActionV42(session, {
    type: "SYNC_COUNCIL_ASSEMBLY",
    councilState,
    deckList,
    deckListRevealCount: fullDeck ? deckList.length : Math.min(deckList.length, session.deckListRevealCount + revealBump),
  });
}

async function maybeRunManaBaseV48(session: BrewSessionV42): Promise<BrewSessionV42> {
  if (!professorBrewNeedsManaBaseV48(session) || !session.councilState || !session.commanderName) {
    return session;
  }
  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan: session.councilState.manaPlanV416 ?? null,
    selectedCards: session.councilState.selectedCards,
  });
  assertManaBaseAllowedV4165({ structurallyComplete: slotBudget.structurallyComplete, context: "maybeRunManaBaseV48" });
  const catalog = await getDeckResolutionCatalogRuntime();
  session = applyBrewSessionActionV42(session, {
    type: "SET_LIVE_STATUS",
    status: "Building mana base to 100 cards…",
  });
  const canonical = ensureCanonicalFinalDeckV411({
    state: session.councilState as ProfessorCouncilStateV47,
    catalog,
    colorIdentity: session.commanderColorIdentity,
    commanderName: session.commanderName,
  });
  const councilState = canonical.state;
  const deckList = deckListFromCouncilStateV47({ state: councilState, commanderName: session.commanderName }).map((c) => ({
    name: c.name,
    category: c.category,
  }));
  session = applyBrewSessionActionV42(session, {
    type: "SYNC_COUNCIL_ASSEMBLY",
    councilState,
    deckList,
    deckListRevealCount: deckList.length,
  });
  session = applyBrewSessionActionV42(session, {
    type: "APPEND_PROFESSOR_LINE",
    body: `Mana base locked — ${councilState.selectedCards.length} library cards (${councilState.selectedCards.filter((c) => c.category === "land").length} lands). Provisional 100 complete — Head Professor review is next.${canonical.manaBaseAdjusted ? " (rebalanced to post-mana canonical state)" : ""}`,
    intent: "CONFIRM",
  });
  session = applyBrewSessionActionV42(session, { type: "SET_LIVE_STATUS", status: null });
  return session;
}

async function maybeRunBracketResearchV4162(session: BrewSessionV42): Promise<BrewSessionV42> {
  if (!professorBrewNeedsBracketResearchV416(session) || !session.councilState || !session.commanderName) {
    return session;
  }
  const catalog = await getDeckResolutionCatalogRuntime();
  const council = session.councilState as ProfessorCouncilStateV47;
  const passCount = council.bracketResearchPassCountV4162 ?? 0;
  if (passCount >= 3) {
    let exhaustedState = markBracketResearchExhaustedV4162(council);
    exhaustedState = recomputeBracketNativeStateV416({
      state: exhaustedState,
      catalog,
      bracket: session.bracket,
      commanderName: session.commanderName,
      theory: session.workingDeckTheory,
      commanderColorIdentity: session.commanderColorIdentity,
      requireFullLibrary: true,
      discoveryExhausted: true,
    });
    const deckList = deckListFromCouncilStateV47({ state: exhaustedState, commanderName: session.commanderName }).map(
      (c) => ({ name: c.name, category: c.category }),
    );
    return applyBrewSessionActionV42(session, {
      type: "SYNC_COUNCIL_ASSEMBLY",
      councilState: exhaustedState,
      deckList,
      deckListRevealCount: deckList.length,
    });
  }

  session = applyBrewSessionActionV42(session, {
    type: "SET_LIVE_STATUS",
    status: "Bracket research — replacing weak slots for B4 target…",
  });
  let nextState = runBracketResearchReplacePassV4162({
    state: { ...council, bracketResearchPassCountV4162: passCount + 1 },
    catalog,
    charter: council.deckCharter!,
    colorIdentity: session.commanderColorIdentity,
    bracket: session.bracket,
    commanderName: session.commanderName,
  });
  const deckList = deckListFromCouncilStateV47({ state: nextState, commanderName: session.commanderName }).map((c) => ({
    name: c.name,
    category: c.category,
  }));
  session = applyBrewSessionActionV42(session, {
    type: "SYNC_COUNCIL_ASSEMBLY",
    councilState: nextState,
    deckList,
    deckListRevealCount: deckList.length,
  });
  session = applyBrewSessionActionV42(session, {
    type: "APPEND_PROFESSOR_LINE",
    body: nextState.bracketReadinessV416?.canEnterFinalization
      ? "Bracket research resolved readiness gaps — Head Professor review can proceed."
      : `Bracket research pass ${passCount + 1} complete — ${nextState.bracketReadinessV416?.message ?? "continuing research"}.`,
    intent: "CONFIRM",
  });
  session = applyBrewSessionActionV42(session, { type: "SET_LIVE_STATUS", status: null });
  return session;
}

async function maybeRunFinalReviewV48(session: BrewSessionV42): Promise<BrewSessionV42> {
  if (!professorBrewNeedsFinalReviewV48(session) && session.finalDeckDoctor?.status !== "RUNNING") {
    return session;
  }
  if (!session.councilState || !session.commanderName || !session.workingDeckTheory) return session;

  if (session.finalDeckDoctor?.status === "FAILED") {
    session = {
      ...session,
      finalDeckDoctor: null,
      deckGrade: null,
      finalReport: null,
    };
  }

  session = applyBrewSessionActionV42(session, {
    type: "SET_LIVE_STATUS",
    status: "GPT-5.6 Sol final review in progress (target ~3 min for live brews)…",
  });

  const catalog = await getDeckResolutionCatalogRuntime();
  const council = session.councilState as ProfessorCouncilStateV47;

  try {
    const result = await runProfessorFinalizationPipelineV414({
      commanderName: session.commanderName,
      commanderOracleId: session.commanderOracleId,
      commanderColorIdentity: session.commanderColorIdentity,
      bracket: session.bracket,
      userIntent: session.userIntent,
      relationshipLens: session.relationshipLens,
      charter: council.deckCharter,
      theory: session.workingDeckTheory,
      councilState: council,
      catalog,
      liveUiMode: session.mode === "live" && !session.fixtureCase,
      onProgress: (progress) => {
        const live = sessions.get(session.sessionId);
        if (!live) return;
        sessions.set(
          session.sessionId,
          applyBrewSessionActionV42(live, {
            type: "SET_LIVE_STATUS",
            status: progress.message,
          }),
        );
      },
    });

    session = applyBrewSessionActionV42(session, {
      type: "SET_FINALIZATION_V48",
      finalReport: result.finalReport,
      deckGrade: result.deckGrade,
      finalDeckDoctor: result.finalDeckDoctor,
      councilState: result.councilState,
      deckList: result.deckList,
    });

    const topImprovement = result.finalDeckDoctor.summary?.keyImprovements[0];
    const bracketNote =
      "draftReadyForRequestedBracket" in result && !result.draftReadyForRequestedBracket
        ? ` Requested B${session.bracket}, effective B${result.deckGrade.bracketAlignment?.effectiveBracket ?? "?"}.`
        : "";
    session = applyBrewSessionActionV42(session, {
      type: "APPEND_PROFESSOR_LINE",
      body: topImprovement
        ? `GPT-5.6 Sol Head Professor completed — Final grade: ${result.deckGrade.overallLetter}.${bracketNote} Key focus: ${topImprovement}. Open the deck report for the full play guide.`
        : `GPT-5.6 Sol Head Professor completed — Final grade: ${result.deckGrade.overallLetter}.${bracketNote} Open the deck report for the full play guide.`,
      intent: "CONFIRM",
    });
  } catch (err) {
    const message =
      err instanceof FinalizationPipelineFailedError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Final review failed";
    console.error("[professor-brew] Head Professor finalization failed:", message, err);

    if (err instanceof FinalizationPipelineFailedError) {
      session = applyBrewSessionActionV42(session, {
        type: "SET_FINALIZATION_FAILED_V48",
        finalDeckDoctor: err.finalDeckDoctor,
        councilState: err.councilState,
        error: message,
      });
    } else {
      session = applyBrewSessionActionV42(session, {
        type: "SET_FINALIZATION_FAILED_V48",
        finalDeckDoctor: {
          ...emptyFinalDeckDoctorSessionV48(),
          status: "FAILED",
          headProfessorModel: HEAD_PROFESSOR_PRODUCT_NAME,
          headProfessorError: message,
        },
        councilState: council,
        error: message,
      });
    }
    sessions.set(session.sessionId, session);
    session = applyBrewSessionActionV42(session, {
      type: "APPEND_PROFESSOR_LINE",
      body: `Final review failed — ${message}. The provisional deck was preserved; no grade was issued.`,
      intent: "CHALLENGE",
    });
  }

  session = applyBrewSessionActionV42(session, { type: "SET_LIVE_STATUS", status: null });
  return session;
}

function startFinalReviewJobV48(sessionId: string, session: BrewSessionV42): BrewSessionV42 {
  if (finalReviewJobs.has(sessionId) || session.finalDeckDoctor?.status === "RUNNING") {
    return session;
  }
  if (!professorBrewNeedsFinalReviewV48(session)) {
    return session;
  }

  session = {
    ...session,
    finalReport: null,
    deckGrade: null,
    finalDeckDoctor: {
      ...emptyFinalDeckDoctorSessionV48(),
      status: "RUNNING",
      headProfessorModel: HEAD_PROFESSOR_PRODUCT_NAME,
    },
    liveStatus: "GPT-5.6 Sol final review in progress (target ~3 min for live brews)…",
    councilState: session.councilState
      ? { ...session.councilState, buildPhase: "HEAD_PROFESSOR_REVIEW" }
      : session.councilState,
  };

  finalReviewJobs.add(sessionId);
  const reviewStartedAt = Date.now();
  const reviewWatchdogMs = 6 * 60 * 1000;
  const watchdog = setInterval(() => {
    const working = sessions.get(sessionId);
    if (!working || working.finalDeckDoctor?.status !== "RUNNING") return;
    if (Date.now() - reviewStartedAt < reviewWatchdogMs) return;
    console.error("[professor-brew] Final review watchdog fired — marking FAILED:", sessionId);
    sessions.set(sessionId, {
      ...working,
      liveStatus: null,
      finalDeckDoctor: {
        ...emptyFinalDeckDoctorSessionV48(),
        status: "FAILED",
        headProfessorModel: HEAD_PROFESSOR_PRODUCT_NAME,
        headProfessorError:
          "Head Professor review exceeded 6 minutes. Refresh and retry, or start a new brew.",
      },
    });
    finalReviewJobs.delete(sessionId);
  }, 30_000);

  void (async () => {
    try {
      let working = sessions.get(sessionId);
      if (!working) return;
      working = await maybeRunFinalReviewV48(working);
      sessions.set(sessionId, working);
      working = await ensureSessionCardImages(working);
      working = await ensureSessionInStockNames(working);
      sessions.set(sessionId, working);
    } catch (err) {
      console.error("[professor-brew] Final review background job crashed:", sessionId, err);
      const working = sessions.get(sessionId);
      if (working && working.finalDeckDoctor?.status !== "FAILED") {
        sessions.set(sessionId, {
          ...working,
          liveStatus: null,
          finalDeckDoctor: {
            ...emptyFinalDeckDoctorSessionV48(),
            status: "FAILED",
            headProfessorModel: HEAD_PROFESSOR_PRODUCT_NAME,
            headProfessorError: err instanceof Error ? err.message : "Final review job crashed",
          },
        });
      }
    } finally {
      clearInterval(watchdog);
      finalReviewJobs.delete(sessionId);
    }
  })();

  return session;
}

async function catalogEntryForSessionV44(session: BrewSessionV42): Promise<ImplementedMechanismCatalogEntry> {
  let entry: ImplementedMechanismCatalogEntry | null = null;
  if (session.commanderName) {
    const adjudicated = findAdjudicatedMechanismEntry(session.commanderName);
    if (adjudicated) entry = adjudicated;
  }
  if (!entry && session.commanderOracleId) {
    const catalog = await getDeckResolutionCatalogRuntime();
    const card = catalog.byOracleId.get(session.commanderOracleId);
    if (card) {
      entry = buildProspectiveMechanismCatalogEntry({
        card,
        caseId: session.mechanismTruthCaseId ?? undefined,
        bracket: session.bracket,
      });
    }
  }
  if (!entry) throw new Error("Commander catalog entry missing from session");
  return withCatalogEntryBracket(entry, session.bracket);
}

export async function tryResolveCommanderSelection(
  commanderName: string,
  commanderSlug: string,
  bracket?: CommanderBracket,
) {
  const resolved = await resolveProfessorBrewCommanderV44(commanderName);
  if (!resolved.ok) {
    return { ok: false as const, message: resolved.message };
  }
  const { commander } = resolved;
  const commanderImageUrl = scryfallNamedImageUrl(commander.canonicalName);
  return {
    ok: true as const,
    action: {
      type: "SELECT_COMMANDER" as const,
      commanderName: commander.canonicalName,
      commanderSlug,
      oracleId: commander.oracleId,
      colorIdentity: commander.colorIdentity,
      mechanismTruthCaseId: commander.mechanismTruthCaseId,
      fixtureCase: commander.fixtureCase,
      openingLine: commander.openingLine,
      archetypeChoices: commander.archetypeChoices,
      commanderImageUrl,
      bracket,
    },
  };
}

export function listSupportedCommanderFixturesV42() {
  return BREW_COMMANDER_FIXTURES_V42;
}

function pass1CommanderFallback(session: BrewSessionV42): string {
  return session.commanderName ?? "Unknown Commander";
}

/** Test helper — reset in-memory sessions. */
export function clearProfessorBrewSessionsForTestV42() {
  sessions.clear();
}
